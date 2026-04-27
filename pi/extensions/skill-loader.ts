/**
 * Skill Loader Extension
 *
 * Auto-discovers SKILL.md-style skills at session_start and registers them
 * as slash commands. Owned by .specs/pi-platform-alignment/plan.md (Phase 3
 * T8). Additive over the existing hardcoded loaders in workflow-commands.ts:
 *
 *   - workflow-commands.ts continues to register /commit, /plan-it, etc.
 *     because those handlers carry custom logic (state machines, secret
 *     scanners) beyond just inlining a template.
 *   - skill-loader.ts picks up everything else: pi-skills/<name>/SKILL.md
 *     entries, ~/.pi/agent/skills/<name>/SKILL.md user skills, and any new
 *     workflow-style template that has not yet been wired into a hand-rolled
 *     command.
 *
 * Collision handling: if a skill name conflicts with a command already
 * registered by another extension (e.g., the hardcoded /commit), the
 * skill-loader silently skips it. This keeps the loader safe to add to any
 * existing pi profile.
 *
 * Each registered command pastes the skill body into a sendUserMessage with
 * the user's `/skillname <args>` arguments substituted into `${args}`. This
 * is the same pattern the existing workflow templates use; we just lift the
 * registration step.
 */

import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { discoverSkills, type SkillRecord } from "../lib/skill-discovery.js";

/**
 * Substitute ${args} placeholders in the skill body with the runtime args.
 * Falls back to appending the args at the end of the body when no
 * placeholder is present, so any skill that forgets to declare ${args}
 * still receives the user input.
 */
export function renderSkillBody(body: string, args: string): string {
	if (body.includes("${args}")) return body.replaceAll("${args}", args.trim());
	const trimmed = args.trim();
	if (!trimmed) return body;
	return `${body}\n\nArgs: ${trimmed}`;
}

interface LoaderState {
	registered: Set<string>;
	skills: SkillRecord[];
}

const HARDCODED_COMMAND_NAMES = new Set([
	// workflow-commands.ts ships these with custom logic; do not override.
	"commit",
	"plan-it",
	"review-it",
	"do-it",
	"research",
	"gitlab-ticket",
]);

function isReservedName(name: string): boolean {
	return HARDCODED_COMMAND_NAMES.has(name);
}

export default function (pi: ExtensionAPI) {
	const state: LoaderState = { registered: new Set(), skills: [] };

	pi.on("session_start", async (_event, ctx) => {
		try {
			state.skills = discoverSkills({ cwd: ctx.cwd });
		} catch {
			// Discovery should never break startup; fall through to empty state.
			state.skills = [];
		}

		for (const skill of state.skills) {
			if (state.registered.has(skill.name)) continue;
			if (isReservedName(skill.name)) continue;
			try {
				pi.registerCommand(skill.name, {
					description:
						skill.description ||
						`Auto-discovered skill from ${skill.filePath} (${skill.source}).`,
					handler: async (args, handlerCtx) => {
						const message = renderSkillBody(skill.body, args);
						await pi.sendUserMessage(message);
						handlerCtx.ui.notify(`Loaded skill ${skill.name}`, "info");
					},
				});
				state.registered.add(skill.name);
			} catch {
				// Already-registered or invalid command name; skip silently.
			}
		}
	});

	pi.registerCommand("skills", {
		description: "List auto-discovered skills (excludes hardcoded workflow commands).",
		handler: async (_args, ctx) => {
			if (state.skills.length === 0) {
				ctx.ui.notify(
					"No skills discovered. Add SKILL.md files under pi/skills/ or ~/.pi/agent/skills/.",
					"info",
				);
				return;
			}
			const lines: string[] = ["Discovered skills:"];
			for (const s of state.skills) {
				const tag = isReservedName(s.name) ? " (overridden by hardcoded command)" : "";
				const desc = s.description ? ` -- ${s.description.slice(0, 80)}` : "";
				lines.push(`  /${s.name} [${s.source}]${desc}${tag}`);
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
