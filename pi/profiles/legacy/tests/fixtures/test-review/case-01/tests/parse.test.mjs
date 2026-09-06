import test from "node:test";
import assert from "node:assert/strict";
import { parsePort } from "../index.mjs";

test("accepts a configured port", () => {
  assert.ok(parsePort("8080"));
});
