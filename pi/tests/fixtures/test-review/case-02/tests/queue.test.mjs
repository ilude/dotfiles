import test from "node:test";
import assert from "node:assert/strict";
import { take } from "../queue.mjs";

test("takes the first item", () => {
  const queue = ["first", "second"];
  assert.equal(take(queue), "first");
  assert.deepEqual(queue, ["second"]);
});
