import { strict as assert } from "node:assert";
import { test } from "node:test";
import { describeFinish, finishedBuilds } from "../src/lib/notify.ts";
import type { StackState, StackSummary } from "../src/types.ts";

function stack(id: string, state: StackState): StackSummary {
  return {
    id,
    name: `stack-${id}`,
    state,
    createdAt: "2026-09-28T00:00:00Z",
    terminationDate: "2026-10-01T00:00:00Z",
    splunkVersion: "10.0.0",
  };
}

test("finishedBuilds reports stacks that went from creating to running", () => {
  const before = new Map<string, StackState>([
    ["a", "CREATING"],
    ["b", "CREATING"],
    ["c", "RUNNING"],
  ]);
  const after = [stack("a", "RUNNING"), stack("b", "CREATING"), stack("c", "RUNNING")];
  assert.deepEqual(
    finishedBuilds(before, after).map((s) => s.id),
    ["a"],
  );
});

test("finishedBuilds stays quiet on a first load", () => {
  assert.deepEqual(finishedBuilds(new Map(), [stack("a", "RUNNING")]), []);
});

test("finishedBuilds reports failed builds too", () => {
  const before = new Map<string, StackState>([
    ["a", "CREATING"],
    ["b", "RUNNING"],
  ]);
  const after = [stack("a", "ERROR"), stack("b", "ERROR")];
  assert.deepEqual(
    finishedBuilds(before, after).map((s) => s.id),
    ["a"],
  );
});

test("describeFinish words success and failure differently", () => {
  assert.equal(describeFinish(stack("a", "RUNNING")).title, "stack-a is ready");
  assert.equal(describeFinish(stack("a", "ERROR")).title, "stack-a failed to build");
});
