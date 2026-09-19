import type {
  CreateStackRequest,
  ServiceError,
  StackDetail,
  StackListResponse,
  StackSummary,
  StackVersionsResponse,
} from "./types";

/** Calls go to the worker, which forwards them to the SCTS API. */
const BASE = "/api/v1";

/**
 * An error carrying the API's own `code` so callers can react to specific
 * conditions, plus a message already written for the person reading it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** True when the key was missing, wrong, or not enabled for SCTS. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Turns an API error into something worth showing a person. */
function humanise(status: number, code: string, message: string): string {
  switch (code) {
    case "Unauthorized":
      return "That API key was rejected. Check it in the Splunk Dev Portal and paste it again.";
    case "Forbidden":
      return "Your account isn't enabled for SCTS. Ask the SCTS team to add you, then try again.";
    case "MaxStacksLimitReached":
      return "You're at your stack limit. Delete a stack before creating another.";
    case "NotFound":
      return "That stack no longer exists. It may have expired or been deleted.";
    case "InternalServerError":
      return "SCTS hit an internal error. Try again in a moment.";
    case "UpstreamUnavailable":
      return "Couldn't reach the SCTS API. Check your network, then try again.";
    default:
      return message || `The request failed (HTTP ${status}).`;
  }
}

async function request<T>(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "NetworkError", "Couldn't reach the server. Check your network and try again.");
  }

  if (!response.ok) {
    let error: ServiceError = { code: `HTTP${response.status}`, message: "" };
    try {
      const body = (await response.json()) as Partial<ServiceError>;
      if (typeof body?.code === "string") error = { code: body.code, message: body.message ?? "" };
    } catch {
      // Non-JSON error body; the defaults above already cover it.
    }
    throw new ApiError(response.status, error.code, humanise(response.status, error.code, error.message));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  async listStacks(apiKey: string): Promise<StackSummary[]> {
    const body = await request<StackListResponse>("/stacks", apiKey);
    return body.stacks ?? [];
  },

  async getStack(apiKey: string, stackId: string): Promise<StackDetail> {
    return request<StackDetail>(`/stacks/${encodeURIComponent(stackId)}`, apiKey);
  },

  async createStack(apiKey: string, body: CreateStackRequest): Promise<StackSummary> {
    return request<StackSummary>("/stacks", apiKey, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async deleteStack(apiKey: string, stackId: string): Promise<void> {
    await request<void>(`/stacks/${encodeURIComponent(stackId)}`, apiKey, { method: "DELETE" });
  },

  async listVersions(apiKey: string): Promise<StackVersionsResponse["versions"]> {
    const body = await request<StackVersionsResponse>("/stacks/versions", apiKey);
    return body.versions ?? [];
  },
};
