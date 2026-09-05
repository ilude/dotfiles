import test from "node:test";
import assert from "node:assert/strict";
import { loadOptional } from "../index.mjs";

test("documents the optional integration boundary", async () => {
  await assert.rejects(loadOptional(), /intentionally-unavailable-runner/);
});
