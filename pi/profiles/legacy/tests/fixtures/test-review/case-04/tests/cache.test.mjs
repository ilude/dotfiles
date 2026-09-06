import test from "node:test";
import assert from "node:assert/strict";
import { cached } from "../cache.mjs";

test("coalesces concurrent loads and expires them at the integration boundary", async () => {
  let calls = 0;
  let now = 10;
  const cache = {};
  const fetcher = async () => { calls += 1; return `live-${calls}`; };
  const first = await Promise.all([
    cached(fetcher, cache, () => now, 5),
    cached(fetcher, cache, () => now, 5),
  ]);
  assert.deepEqual(first, ["live-1", "live-1"]);
  now = 16;
  assert.equal(await cached(fetcher, cache, () => now, 5), "live-2");
  assert.equal(calls, 2);
});
