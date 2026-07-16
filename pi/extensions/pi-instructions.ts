/**
 * Appends the repository-owned Pi runtime policy from PI-INSTRUCTIONS.md.
 * A read failure is reported and leaves the existing system prompt unchanged.
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
