import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isAllowedRoute } from "../worker/index.ts";

test("the five SCTS routes are allowed", () => {
  assert.ok(isAllowedRoute("GET", "/v1/stacks"));
  assert.ok(isAllowedRoute("POST", "/v1/stacks"));
  assert.ok(isAllowedRoute("GET", "/v1/stacks/versions"));
  assert.ok(isAllowedRoute("GET", "/v1/stacks/scts-stack-123"));
  assert.ok(isAllowedRoute("DELETE", "/v1/stacks/scts-stack-123"));
});

test("methods the API does not expose are refused", () => {
  assert.ok(!isAllowedRoute("PUT", "/v1/stacks"));
  assert.ok(!isAllowedRoute("PATCH", "/v1/stacks/scts-stack-123"));
  assert.ok(!isAllowedRoute("DELETE", "/v1/stacks"));
  assert.ok(!isAllowedRoute("POST", "/v1/stacks/scts-stack-123"));
});

test("the proxy cannot be steered off the SCTS routes", () => {
  for (const path of [
    "/",
    "/openapi.json",
    "/v1/stacks/",
    "/v1/stacks/abc/secrets",
    "/v2/stacks",
    "/v1/stacksXY",
    "/v1/stacks/../../admin",
    "/v1/stacks/a b",
    "/v1/stacks/a?x=1",
    "/v1/stacks/-leading-dash",
    `/v1/stacks/${"a".repeat(200)}`,
  ]) {
    assert.ok(!isAllowedRoute("GET", path), `should refuse GET ${path}`);
  }
});
