/** Types mirroring https://scts.dev.splunk.com/openapi.json (SCTS API v1.0). */

export type StackState = "CREATING" | "RUNNING" | "STOPPING" | "ERROR";

export interface StackSummary {
  id: string;
  name: string;
  state: StackState;
  /** ISO-8601 timestamp of stack creation. */
  createdAt: string;
  /** ISO-8601 timestamp when the stack will be terminated. */
  terminationDate: string;
  splunkVersion: string;
}

export interface StackAccessDetails {
  url: string;
  username: string;
  password: string;
}

export interface StackDetail extends StackSummary {
  /** Present only once the stack has access details available. */
  stackAccessDetails?: StackAccessDetails;
}

export interface SplunkVersion {
  buildVersion: string;
  releaseName: string;
  status: "released" | "unreleased";
}

export interface StackListResponse {
  stacks: StackSummary[];
}

export interface StackVersionsResponse {
  versions: SplunkVersion[];
}

export interface CreateStackRequest {
  /** Omit to use the default latest released version. */
  splunkVersion?: string;
}

/** The API's error envelope. `code` is extensible, so unknown values are expected. */
export interface ServiceError {
  code: string;
  message: string;
}
