// Onclave v2 adapter loader: the implementation lives in the Onclave
// submodule, which is the source of truth. Resolve the primary repository so
// the loader works from both the primary checkout and nested Git worktrees.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function resolveOnclaveAdapter(): string {
	let current = path.dirname(fileURLToPath(import.meta.url));
	for (;;) {
		const candidate = path.join(
			current,
			"modules",
			"onclave",
			"extensions",
			"onclave-pi",
			"src",
			"onclave-pi.ts",
		);
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) throw new Error("Onclave adapter source was not found.");
		current = parent;
	}
}

const implementation = await import(pathToFileURL(resolveOnclaveAdapter()).href);
export default implementation.default;
