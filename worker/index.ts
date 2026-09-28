/**
 * SCTS UI worker.
 *
 * The SCTS API sends no CORS headers and answers preflight `OPTIONS` with 405,
 * so a browser can never call it directly with an `Authorization` header. This
 * worker serves the static app and proxies its API calls under `/api/*`.
 *
 * The caller's API key rides through in the `Authorization` header. It is never
 * stored, cached, or logged here.
 */

const UPSTREAM = "https://scts.dev.splunk.com";

const STACK_ID = "[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?";

/**
 * Exact allowlist of upstream routes, so this can't be used as an open proxy
 * against anything else the upstream host happens to serve.
 */
const ROUTES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: "GET", path: /^\/v1\/stacks$/ },
  { method: "POST", path: /^\/v1\/stacks$/ },
  { method: "GET", path: /^\/v1\/stacks\/versions$/ },
  { method: "GET", path: new RegExp(`^/v1/stacks/${STACK_ID}$`) },
  { method: "DELETE", path: new RegExp(`^/v1/stacks/${STACK_ID}$`) },
];

/** True when the upstream route is one SCTS actually exposes. */
export function isAllowedRoute(method: string, path: string): boolean {
  return ROUTES.some((route) => route.method === method && route.path.test(path));
}

/** Request headers worth forwarding upstream. Everything else is dropped. */
const FORWARD_HEADERS = ["authorization", "content-type", "accept"];

function json(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Reject cross-site browser calls. The app is same-origin, so a mismatched
 * `Origin` means another site is driving the proxy.
 */
function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true; // non-browser client, or a same-origin GET
  return origin === new URL(request.url).origin;
}

async function proxy(request: Request, path: string): Promise<Response> {
  if (!originAllowed(request)) {
    return json(403, "Forbidden", "Cross-origin requests are not allowed.");
  }

  if (!isAllowedRoute(request.method, path)) {
    return json(404, "NotFound", `No SCTS route for ${request.method} ${path}.`);
  }

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}${path}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "DELETE" ? null : request.body,
      redirect: "manual",
    });
  } catch {
    return json(502, "UpstreamUnavailable", "Could not reach the SCTS API.");
  }

  // Rebuild the response so no upstream caching or cookie headers leak through.
  const out = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType !== null) out.set("content-type", contentType);
  out.set("cache-control", "no-store");

  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

/**
 * `POST /v1/stacks/{id}/token` is this worker's own route, not an SCTS one. It
 * signs in to the stack with the credentials SCTS hands back, turns on token
 * authentication, and returns an auth token for the stack's user.
 *
 * The browser only names a stack. The host and credentials come from SCTS
 * itself, so this can't be pointed at an arbitrary server.
 */
const TOKEN_ROUTE = new RegExp(`^/v1/stacks/(${STACK_ID})/token$`);

/** The stack id when this is the token route, otherwise null. */
export function tokenRouteStackId(method: string, path: string): string | null {
  if (method !== "POST") return null;
  return TOKEN_ROUTE.exec(path)?.[1] ?? null;
}

/** Stacks live under this domain; anything else SCTS returns is refused. */
const STACK_DOMAIN = ".splunkcloud.com";

/** Splunk Cloud serves its REST API on the management port of the web host. */
const MANAGEMENT_PORT = 8089;

/** Where the token is kept on the stack itself, so a reload can pull it back. */
const TOKEN_REALM = "scts-ui";
const TOKEN_NAME = "auth-token";
const TOKEN_AUDIENCE = "scts.ba.au";

const SPLUNK_TIMEOUT_MS = 15_000;

/** The stack's REST base, derived from its web URL, or null if it isn't a stack. */
export function managementBase(webUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(webUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(STACK_DOMAIN)) return null;
  return `https://${url.hostname}:${MANAGEMENT_PORT}`;
}

/** Pulls the token value out of a `POST /services/authorization/tokens` reply. */
export function readCreatedToken(body: unknown): string | null {
  const token = (body as { entry?: Array<{ content?: { token?: unknown } }> })?.entry?.[0]?.content
    ?.token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

/** Finds a token this app stored earlier in a `storage/passwords` listing. */
export function findStoredToken(body: unknown): string | null {
  const entries = (body as { entry?: Array<{ content?: Record<string, unknown> }> })?.entry ?? [];
  for (const entry of entries) {
    const content = entry.content ?? {};
    if (
      content.realm === TOKEN_REALM &&
      content.username === TOKEN_NAME &&
      typeof content.clear_password === "string" &&
      content.clear_password.length > 0
    ) {
      return content.clear_password;
    }
  }
  return null;
}

class SplunkError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Calls the stack's REST API as its admin user and returns the parsed JSON. */
async function splunk(
  base: string,
  auth: string,
  method: "GET" | "POST",
  path: string,
  form?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, base);
  url.searchParams.set("output_mode", "json");

  const headers = new Headers({ authorization: auth, accept: "application/json" });
  let body: string | null = null;
  if (form) {
    headers.set("content-type", "application/x-www-form-urlencoded");
    body = new URLSearchParams(form).toString();
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(SPLUNK_TIMEOUT_MS),
    });
  } catch {
    throw new SplunkError(0, "unreachable");
  }
  if (!response.ok) throw new SplunkError(response.status, `HTTP ${response.status} for ${path}`);
  return response.json();
}

async function createToken(request: Request, stackId: string): Promise<Response> {
  if (!originAllowed(request)) {
    return json(403, "Forbidden", "Cross-origin requests are not allowed.");
  }

  // Ask SCTS for the stack with the caller's own key; its errors pass straight back.
  const authorization = request.headers.get("authorization");
  let detail: Response;
  try {
    detail = await fetch(`${UPSTREAM}/v1/stacks/${stackId}`, {
      headers: authorization ? { authorization, accept: "application/json" } : {},
      redirect: "manual",
    });
  } catch {
    return json(502, "UpstreamUnavailable", "Could not reach the SCTS API.");
  }
  if (!detail.ok) {
    return new Response(detail.body, {
      status: detail.status,
      headers: {
        "content-type": detail.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  }

  const stack = (await detail.json()) as {
    state?: string;
    stackAccessDetails?: { url?: string; username?: string; password?: string };
  };
  const access = stack.stackAccessDetails;
  if (stack.state !== "RUNNING" || !access?.url || !access.username || !access.password) {
    return json(409, "StackNotReady", "The stack has no credentials yet.");
  }

  const base = managementBase(access.url);
  if (base === null) {
    return json(502, "UnexpectedStackUrl", `Refusing to contact ${access.url}.`);
  }
  const auth = `Basic ${btoa(`${access.username}:${access.password}`)}`;

  try {
    // Reuse the token made on an earlier visit, so a reload doesn't mint another.
    const stored = await splunk(
      base,
      auth,
      "GET",
      `/servicesNS/nobody/search/storage/passwords?count=0&search=${encodeURIComponent(`realm=${TOKEN_REALM}`)}`,
    ).catch(() => null);
    const existing = findStoredToken(stored);
    if (existing) return tokenResponse(existing);

    await splunk(base, auth, "POST", "/services/admin/token-auth/tokens_auth", {
      disabled: "false",
    });
    const created = readCreatedToken(
      await splunk(base, auth, "POST", "/services/authorization/tokens", {
        name: access.username,
        audience: TOKEN_AUDIENCE,
      }),
    );
    if (!created) return json(502, "SplunkRejected", "The stack didn't return a token.");

    // Best effort: without it the token still works, a reload just makes a new one.
    await splunk(base, auth, "POST", "/servicesNS/nobody/search/storage/passwords", {
      realm: TOKEN_REALM,
      name: TOKEN_NAME,
      password: created,
    }).catch(() => undefined);

    return tokenResponse(created);
  } catch (cause) {
    if (cause instanceof SplunkError && cause.status === 0) {
      return json(502, "SplunkUnreachable", "Could not reach the stack's management port.");
    }
    const detail = cause instanceof Error ? cause.message : "unknown error";
    return json(502, "SplunkRejected", `The stack refused the token request (${detail}).`);
  }
}

function tokenResponse(token: string): Response {
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const tokenStack = tokenRouteStackId(request.method, url.pathname.replace(/^\/api/, ""));
    if (url.pathname.startsWith("/api/") && tokenStack !== null) {
      return createToken(request, tokenStack);
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return proxy(request, url.pathname.slice("/api".length) || "/");
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
