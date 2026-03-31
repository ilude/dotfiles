/**
 * Workflow Commands Extension
 *
 * Registers slash commands that load skill template files and dispatch
 * them via sendUserMessage():
 *
 *   /commit        — smart git commit with secret scanning
 *   /plan-it       — crystallize conversation context into an executable plan
 *   /review-plan   — adversarial review of a plan file
 *   /do-this       — smart task routing by complexity
 *   /research      — parallel multi-angle research on a topic
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SKILLS_DIR = path.join(os.homedir(), ".dotfiles", "pi", "skills", "workflow");

function loadSkill(name: string): string {
	const skillPath = path.join(SKILLS_DIR, name);
	try {
		return fs.readFileSync(skillPath, "utf-8");
	} catch (err) {
		throw new Error(`Failed to load skill ${name} from ${skillPath}: ${err}`);
	}
}

export default function (pi: ExtensionAPI) {
	// ── Command: /commit ────────────────────────────────────────────────────────
	pi.registerCommand("commit", {
		description: "Smart git commit with secret scanning",
		handler: async (args, ctx) => {
			const template = loadSkill("commit.md");
			await pi.sendUserMessage(template + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});

	// ── Command: /plan-it ───────────────────────────────────────────────────────
	pi.registerCommand("plan-it", {
		description: "Crystallize conversation context into an executable plan document",
		handler: async (args, ctx) => {
			const template = loadSkill("plan-it.md");
			await pi.sendUserMessage(template + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});

	// ── Command: /review-plan ───────────────────────────────────────────────────
	pi.registerCommand("review-plan", {
		description: "Adversarial review of a plan file — finds bugs, gaps, and failure modes",
		handler: async (args, ctx) => {
			const template = loadSkill("review-plan.md");
			await pi.sendUserMessage(template.replace("$ARGUMENTS", args.trim()) + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});

	// ── Command: /do-this ───────────────────────────────────────────────────────
	pi.registerCommand("do-this", {
		description: "Smart task routing — implements directly, delegates, or plans based on complexity",
		handler: async (args, ctx) => {
			const template = loadSkill("do-this.md");
			await pi.sendUserMessage(template.replace("$ARGUMENTS", args.trim()) + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});

	// ── Command: /research ──────────────────────────────────────────────────────
	pi.registerCommand("research", {
		description: "Parallel multi-angle research — primary sources, practical guidance, and alternatives",
		handler: async (args, ctx) => {
			const template = loadSkill("research.md");
			await pi.sendUserMessage(template.replace("$ARGUMENTS", args.trim()) + (args.trim() ? `\n\nArgs: ${args}` : ""));
		},
	});
}
