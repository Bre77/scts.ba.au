import { strict as assert } from "node:assert";
import { test } from "node:test";
import { newlyReady } from "../src/lib/notify.ts";
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

test("newlyReady reports stacks that went from creating to running", () => {
  const before = new Map<string, StackState>([
    ["a", "CREATING"],
    ["b", "CREATING"],
    ["c", "RUNNING"],
  ]);
  const after = [stack("a", "RUNNING"), stack("b", "CREATING"), stack("c", "RUNNING")];
  assert.deepEqual(
    newlyReady(before, after).map((s) => s.id),
    ["a"],
  );
});

test("newlyReady stays quiet on a first load", () => {
  assert.deepEqual(newlyReady(new Map(), [stack("a", "RUNNING")]), []);
});

test("newlyReady ignores failed builds", () => {
  const before = new Map<string, StackState>([["a", "CREATING"]]);
  assert.deepEqual(newlyReady(before, [stack("a", "ERROR")]), []);
});
