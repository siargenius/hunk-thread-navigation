import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionDiffFile } from "hunkdiff/extension";
import { nextThread, threadTargets } from "../targets.ts";

const a: ExtensionDiffFile = { id: "a", path: "a.ts", patch: "", metadata: null,
  stats: { additions: 20, deletions: 20 }, hunks: [{ index: 0, header: "@@", newRange: [1, 20], oldRange: [1, 20] }],
  agent: { path: "a.ts", annotations: [
    { id: "first", summary: "First", newRange: [3, 3] },
    { id: "second", summary: "Second", newRange: [16, 16] },
    { id: "deleted", summary: "Deleted", oldRange: [7, 7] },
  ] } };
const b: ExtensionDiffFile = { ...a, id: "b", path: "b.ts", agent: { path: "b.ts", annotations: [{ id: "b-note", summary: "Other file", newRange: [2, 2] }] } };
const files = [a, b];
const none = { fileId: null, hunkIndex: null, line: null };

test("threads follow visible file order and source lines within each hunk", () => {
  assert.deepEqual(threadTargets(files).map(t => [t.fileId, t.side, t.line]), [
    ["a", "new", 3], ["a", "old", 7], ["a", "new", 16], ["b", "new", 2],
  ]);
  assert.deepEqual(threadTargets([b]).map(t => t.fileId), ["b"]);
});

test("nested replies do not become navigation targets", () => {
  const reply = { id: "reply", parentId: "first", summary: "Reply", newRange: [3, 3] as [number, number] };
  const f = { ...a, agent: { path: "a.ts", annotations: [...a.agent!.annotations, reply] } };
  assert.equal(threadTargets([f]).length, 3);
});

test("moves within one hunk, crosses files, and wraps in both directions", () => {
  const targets = threadTargets(files);
  assert.equal(nextThread(targets, files, none, 1)?.line, 3);
  assert.equal(nextThread(targets, files, none, -1)?.fileId, "b");
  const position = { fileId: "a", hunkIndex: 0, line: { side: "new" as const, line: 3 } };
  assert.equal(nextThread(targets, files, position, 1)?.line, 7);
  assert.equal(nextThread(targets, files, position, -1)?.fileId, "b");
  assert.equal(nextThread(targets, files, { ...position, line: null }, 1)?.line, 3);
  assert.equal(nextThread(targets, files, { ...position, line: null }, -1)?.line, 16);
});

test("separate threads at the same line can be traversed independently", () => {
  const f = { ...a, agent: { path: "a.ts", annotations: [a.agent!.annotations[0]!, { id: "same-line", summary: "Separate", newRange: [3, 3] as [number, number] }] } };
  const targets = threadTargets([f]);
  const position = { fileId: "a", hunkIndex: 0, line: { side: "new" as const, line: 3 } };
  assert.equal(nextThread(targets, [f], position, 1, targets[0]!.id)?.id, targets[1]?.id);
  assert.equal(nextThread(targets, [f], position, -1, targets[0]!.id)?.id, targets[1]?.id);
});

test("manual source movement overrides the remembered thread", () => {
  const targets = threadTargets(files);
  const position = { fileId: "a", hunkIndex: 0, line: { side: "new" as const, line: 10 } };
  assert.equal(nextThread(targets, files, position, 1, targets[0]!.id)?.line, 16);
});

test("unanchored and stale notes are skipped; partially visible ranges use a visible line", () => {
  const f = { ...a, hunks: [{ index: 0, header: "@@", newRange: [10, 20] as [number, number] }], agent: { path: "a.ts", annotations: [
    { summary: "Unanchored" }, { summary: "Stale", newRange: [30, 30] as [number, number] },
    { summary: "Overlapping", newRange: [5, 12] as [number, number] },
  ] } };
  assert.deepEqual(threadTargets([f]).map(t => t.line), [10]);
  assert.equal(nextThread([], [], none, 1), null);
});
