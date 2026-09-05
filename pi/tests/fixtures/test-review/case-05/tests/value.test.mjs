import test from "node:test";
import assert from "node:assert/strict";
import { present } from "../value.mjs";

test("recognizes a value", () => assert.equal(present("ok"), true));
