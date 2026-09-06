import test from "node:test";
import assert from "node:assert/strict";
import { formatName } from "../format.mjs";

test("formats the canonical full name", () => assert.equal(formatName("Ada", "Lovelace"), "Ada Lovelace"));
test("formats the same canonical full name again", () => assert.equal(formatName("Ada", "Lovelace"), "Ada Lovelace"));
