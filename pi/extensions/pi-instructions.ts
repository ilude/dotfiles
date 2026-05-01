/**
 * pi-instructions: append Pi-specific architecture/conventions to the system
 * prompt on every Pi session.
 *
 * The shared rules (KISS, POLA, error handling, certainty calibration, etc.)
 * live in claude/CLAUDE.md and are loaded by Pi automatically as the global
 * context file at ~/.pi/agent/AGENTS.md (which is a symlink to
 * claude/CLAUDE.md). This extension adds the Pi-only architectural context
 * (orchestrator/leads/workers, frontmatter schema, knowledge compounding)
 * that does not belong in the cross-runtime CLAUDE.md.
 *
 * Source file: pi/PI-INSTRUCTIONS.md (sibling of pi/extensions/).
 *
 * On read failure, the extension logs a warning via ctx.ui and skips the
 * append. Pi should still start with the shared rules from CLAUDE.md;
 * losing the architectural context is degraded but not broken.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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
