/**
 * Agent Team Extension
 *
 * Implements the dispatcher pattern — routes work to specialist team leads
 * based on named team routing. Loads team config from teams.yaml.
 *
 * Registers:
 *   - /team command: dispatch task to a named team lead
 *     Usage: /team <lead-name|team-key> <task>
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface TeamMember {
	name: string;
	file: string;
}

interface TeamEntry {
	name: string;
	file: string;
	description?: string;
	team?: TeamMember[];
}

type TeamsConfig = Record<string, TeamEntry>;

function getAgentDir(): string {
	return path.join(os.homedir(), ".pi", "agent");
}

function getTeamsConfigPath(): string {
	return path.join(getAgentDir(), "agents", "teams.yaml");
}

function parseYaml(content: string): TeamsConfig {
	// Minimal YAML parser sufficient for teams.yaml structure (no deps required).
	// Handles top-level keys, nested name/file/description, and team arrays.
	const result: TeamsConfig = {};
	const lines = content.split("\n");

	let currentKey: string | null = null;
	let inTeamArray = false;
	let currentTeamMember: Partial<TeamMember> | null = null;

	for (const rawLine of lines) {
		// Skip comments and blank lines
		if (rawLine.trimStart().startsWith("#") || rawLine.trim() === "") {
			continue;
		}

		const indent = rawLine.length - rawLine.trimStart().length;
		const line = rawLine.trim();

		if (indent === 0 && line.endsWith(":")) {
			// Flush pending team member
			if (currentKey && currentTeamMember?.name) {
				result[currentKey].team = result[currentKey].team ?? [];
				result[currentKey].team!.push(currentTeamMember as TeamMember);
				currentTeamMember = null;
			}
			currentKey = line.slice(0, -1);
			result[currentKey] = { name: "", file: "" };
			inTeamArray = false;
		} else if (indent === 2 && currentKey) {
			// Flush pending team member before next sibling key
			if (currentTeamMember?.name) {
				result[currentKey].team = result[currentKey].team ?? [];
				result[currentKey].team!.push(currentTeamMember as TeamMember);
				currentTeamMember = null;
			}

			if (line === "team:") {
				inTeamArray = true;
			} else {
				inTeamArray = false;
				const colonIdx = line.indexOf(":");
				if (colonIdx !== -1) {
					const k = line.slice(0, colonIdx).trim();
					const v = line.slice(colonIdx + 1).trim();
					if (k === "name") result[currentKey].name = v;
					else if (k === "file") result[currentKey].file = v;
					else if (k === "description") result[currentKey].description = v;
				}
			}
		} else if (indent === 4 && currentKey && inTeamArray) {
			// Team array entries start with "- " at indent 4
			if (line.startsWith("- ")) {
				// Flush previous member
				if (currentTeamMember?.name) {
					result[currentKey].team = result[currentKey].team ?? [];
					result[currentKey].team!.push(currentTeamMember as TeamMember);
				}
				currentTeamMember = {};
				const rest = line.slice(2).trim();
				const colonIdx = rest.indexOf(":");
				if (colonIdx !== -1) {
					const k = rest.slice(0, colonIdx).trim();
					const v = rest.slice(colonIdx + 1).trim();
					if (k === "name") currentTeamMember.name = v;
					else if (k === "file") currentTeamMember.file = v;
				}
			} else {
				// Continuation key/value inside team member (indent 6)
				const colonIdx = line.indexOf(":");
				if (colonIdx !== -1 && currentTeamMember) {
					const k = line.slice(0, colonIdx).trim();
					const v = line.slice(colonIdx + 1).trim();
					if (k === "name") currentTeamMember.name = v;
					else if (k === "file") currentTeamMember.file = v;
				}
			}
		} else if (indent === 6 && currentKey && inTeamArray && currentTeamMember) {
			// name/file continuation inside a "- " block
			const colonIdx = line.indexOf(":");
			if (colonIdx !== -1) {
				const k = line.slice(0, colonIdx).trim();
				const v = line.slice(colonIdx + 1).trim();
				if (k === "name") currentTeamMember.name = v;
				else if (k === "file") currentTeamMember.file = v;
			}
		}
	}

	// Flush final pending team member
	if (currentKey && currentTeamMember?.name) {
		result[currentKey].team = result[currentKey].team ?? [];
		result[currentKey].team!.push(currentTeamMember as TeamMember);
	}

	return result;
}

function loadTeamsConfig(): TeamsConfig | null {
	const configPath = getTeamsConfigPath();
	try {
		const content = fs.readFileSync(configPath, "utf-8");
		return parseYaml(content);
	} catch {
		return null;
	}
}

// Find a team entry by key or by lead name
function resolveTeam(teams: TeamsConfig, target: string): [string, TeamEntry] | null {
	// Try direct key match first (e.g. "engineering")
	if (teams[target]) return [target, teams[target]];

	// Try matching by lead name (e.g. "engineering-lead")
	for (const [key, entry] of Object.entries(teams)) {
		if (entry.name === target) return [key, entry];
	}

	return null;
}

function formatTeamList(teams: TeamsConfig): string {
	const lines: string[] = ["Available teams:"];
	for (const [key, entry] of Object.entries(teams)) {
		const workers = entry.team?.map((m) => m.name).join(", ");
		const workerStr = workers ? ` [workers: ${workers}]` : "";
		lines.push(`  ${key} → ${entry.name}${workerStr}`);
	}
	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	// ── Command: /team ──────────────────────────────────────────────────────────
	// Dispatches a task to a named team lead. The lead can then use the subagent
	// tool to delegate to workers in their team.
	pi.registerCommand("team", {
		description:
			"Dispatch a task to a specialist team lead. Usage: /team <team-key|lead-name> <task>. " +
			"Run /team list to see available teams.",
		handler: async (args, ctx) => {
			const trimmed = args.trim();

			if (!trimmed || trimmed === "list") {
				const teams = loadTeamsConfig();
				if (!teams) {
					ctx.ui.notify(
						`Could not load teams config from ${getTeamsConfigPath()}. Ensure the file exists.`,
						"warning",
					);
					return;
				}
				ctx.ui.notify(formatTeamList(teams), "info");
				return;
			}

			// Split into: /team <target> <task...>
			const spaceIdx = trimmed.indexOf(" ");
			if (spaceIdx === -1) {
				ctx.ui.notify(
					"Usage: /team <team-key|lead-name> <task description>\nRun /team list to see available teams.",
					"warning",
				);
				return;
			}

			const target = trimmed.slice(0, spaceIdx);
			const task = trimmed.slice(spaceIdx + 1).trim();

			if (!task) {
				ctx.ui.notify(
					"Usage: /team <team-key|lead-name> <task description>\nRun /team list to see available teams.",
					"warning",
				);
				return;
			}

			const teams = loadTeamsConfig();
			if (!teams) {
				ctx.ui.notify(
					`Could not load teams config from ${getTeamsConfigPath()}. Ensure the file exists.`,
					"warning",
				);
				return;
			}

			const resolved = resolveTeam(teams, target);
			if (!resolved) {
				ctx.ui.notify(
					`Team "${target}" not found.\n\n${formatTeamList(teams)}`,
					"warning",
				);
				return;
			}

			const [teamKey, teamEntry] = resolved;
			const agentDir = getAgentDir();

			// Resolve agent file path: strip leading ".pi/" and join from agentDir
			const agentFilePath = teamEntry.file.startsWith(".pi/")
				? path.join(agentDir, teamEntry.file.slice(".pi/".length))
				: path.join(agentDir, teamEntry.file);

			const agentFileExists = fs.existsSync(agentFilePath);

			// Build worker context for the lead
			const workerList = teamEntry.team
				? teamEntry.team.map((m) => `  - ${m.name}`).join("\n")
				: "  (no direct reports configured)";

			const dispatchInstructions = [
				`Dispatching task to team: ${teamKey} (lead: ${teamEntry.name})`,
				`Lead agent file: ${agentFilePath}${agentFileExists ? "" : " [FILE NOT FOUND]"}`,
				"",
				"Workers in this team:",
				workerList,
				"",
				"Task:",
				task,
				"",
				"To dispatch this task, use the subagent tool:",
				`  subagent({ agent: "${agentFilePath}", prompt: "<your task instructions>" })`,
				"",
				"The lead should delegate to workers sequentially using their own subagent calls.",
			].join("\n");

			ctx.ui.notify(dispatchInstructions, "info");
		},
	});
}
