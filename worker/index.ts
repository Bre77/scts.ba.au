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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return proxy(request, url.pathname.slice("/api".length) || "/");
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
