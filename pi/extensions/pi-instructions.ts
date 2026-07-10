/**
 * pi-instructions: append Pi-specific architecture/conventions to the system
 * prompt on every Pi session.
 *
 * The shared rules live in the global and project AGENTS context. This
 * extension adds a compact Pi-only safety and reference prompt for
 * orchestration, ownership, runtime-state, commit, agent-config, and
 * expertise boundaries.
 *
 * Source file: pi/PI-INSTRUCTIONS.md (sibling of pi/extensions/).
 *
 * On read failure, the extension logs a warning via ctx.ui and skips the
 * append. Pi should still start with the shared rules from the global/project AGENTS.md context;
 * losing the architectural context is degraded but not broken.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EXTENSION_NAME = "pi-instructions";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTRUCTIONS_PATH = path.resolve(HERE, "..", "PI-INSTRUCTIONS.md");

let cachedContent: string | null = null;
let cacheLoadAttempted = false;

function loadInstructions(): string | null {
	if (cacheLoadAttempted) return cachedContent;
	cacheLoadAttempted = true;
	try {
		cachedContent = fs.readFileSync(INSTRUCTIONS_PATH, "utf-8").trim();
	} catch {
		cachedContent = null;
	}
	return cachedContent;
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		const content = loadInstructions();
		if (!content) {
			if (ctx.hasUI) {
				ctx.ui.notify(
					`${EXTENSION_NAME}: could not read ${INSTRUCTIONS_PATH} -- Pi-specific instructions skipped`,
					"warning",
				);
			}
			return;
		}
		return {
			systemPrompt: `${event.systemPrompt}\n\n${content}`,
		};
	});
}
