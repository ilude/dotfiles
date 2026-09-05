import test from "node:test";
import assert from "node:assert/strict";

const parse = (value) => JSON.parse(value);

test("parser behavior cluster", () => {
  assert.equal(parse('{"ok":true}').ok, true);
});

test("formatter behavior cluster", () => {
  assert.deepEqual(Object.keys(parse('{"ok":true}')), ["ok"]);
});
