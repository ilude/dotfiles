// One-shot script (NOT a test) used during Phase 2 setup to capture the
// canonical describeConfiguredProviders output against the redacted
// auth-baseline.json fixture, BEFORE any T4 refactor of provider.ts begins.
//
// Run via: cd pi/tests && bun fixtures/_capture-baseline.mjs > fixtures/auth-baseline-parsed.json
//
// After capture, this script's output is committed and never regenerated;
// the T4 parity test must deep-equal against that committed file.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "auth-baseline.json");
const auth = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

const mod = await import("../../extensions/provider.ts");
const storage = {
	list: () => Object.keys(auth),
	get: (id) => auth[id],
};

const parsed = {
	round_trip: auth,
	describe: mod.describeConfiguredProviders(storage),
	per_provider: Object.fromEntries(Object.keys(auth).map((id) => [id, storage.get(id)])),
};

console.log(JSON.stringify(parsed, null, 2));
