import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  findStoredToken,
  isAllowedRoute,
  managementBase,
  readCreatedToken,
  tokenRouteStackId,
} from "../worker/index.ts";

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

test("the token route is recognised only as a POST on a valid stack id", () => {
  assert.equal(tokenRouteStackId("POST", "/v1/stacks/scts-stack-123/token"), "scts-stack-123");
  assert.equal(tokenRouteStackId("GET", "/v1/stacks/scts-stack-123/token"), null);
  assert.equal(tokenRouteStackId("POST", "/v1/stacks/../token"), null);
  assert.equal(tokenRouteStackId("POST", "/v1/stacks/a/b/token"), null);
  assert.ok(!isAllowedRoute("POST", "/v1/stacks/scts-stack-123/token"));
});

test("only Splunk Cloud hosts are contacted, on the management port", () => {
  assert.equal(
    managementBase("https://scts-example.splunkcloud.com/en-US/app/launcher"),
    "https://scts-example.splunkcloud.com:8089",
  );
  assert.equal(managementBase("http://scts-example.splunkcloud.com"), null);
  assert.equal(managementBase("https://evil.example.com"), null);
  assert.equal(managementBase("https://splunkcloud.com.evil.example"), null);
  assert.equal(managementBase("not a url"), null);
});

test("token replies are read defensively", () => {
  assert.equal(readCreatedToken({ entry: [{ content: { token: "eyJabc" } }] }), "eyJabc");
  assert.equal(readCreatedToken({ entry: [] }), null);
  assert.equal(readCreatedToken(null), null);

  const listing = {
    entry: [
      { content: { realm: "other", username: "auth-token", clear_password: "nope" } },
      { content: { realm: "scts-ui", username: "auth-token", clear_password: "eyJkept" } },
    ],
  };
  assert.equal(findStoredToken(listing), "eyJkept");
  assert.equal(findStoredToken({ entry: [] }), null);
  assert.equal(findStoredToken(null), null);
});
