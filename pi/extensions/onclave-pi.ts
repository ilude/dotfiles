// Onclave v2 adapter loader: the implementation lives in the Onclave
// submodule, which is the source of truth. Resolve the primary repository so
// the loader works from both the primary checkout and nested Git worktrees.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { recordEvent } from "../lib/metrics.js";
import { onSessionStart } from "../lib/session-start-metrics.js";

function resolveOnclaveAdapter(): string {
	let current = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
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

export default function registerOnclaveLoader(pi: ExtensionAPI): void {
	implementation.default(pi, {
		registerSessionStart: (
			handler: (event: SessionStartEvent, ctx: ExtensionContext) => void | Promise<void>,
		) => onSessionStart(pi, import.meta.url, handler),
		recordStartup: (measurement: {
			reason: string;
			durationMs: number;
			status: "ok" | "error" | "cancelled";
		}) => {
			recordEvent({
				event: "onclave_session_start",
				data: measurement,
			});
		},
	});
}
