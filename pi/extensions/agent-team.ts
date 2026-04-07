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

export function getAgentDir(): string {
	return path.join(os.homedir(), ".pi", "agent");
}

export function getTeamsConfigPath(): string {
	return path.join(getAgentDir(), "agents", "teams.yaml");
}

// ── Minimal YAML parser ──────────────────────────────────────────────────────
// Sufficient for teams.yaml structure: top-level keys, name/file/description,
// and team arrays. No external dependencies required.

class TeamsYamlParser {
	private result: TeamsConfig = {};
	private currentKey: string | null = null;
	private inTeamArray = false;
	private currentMember: Partial<TeamMember> | null = null;

	private parseKV(line: string): [string, string] | null {
		const idx = line.indexOf(":");
		if (idx === -1) return null;
		return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
	}

	private applyMemberField(k: string, v: string): void {
		if (!this.currentMember) return;
		if (k === "name") this.currentMember.name = v;
		else if (k === "file") this.currentMember.file = v;
	}

	private flushMember(): void {
		if (!this.currentKey || !this.currentMember?.name) return;
		this.result[this.currentKey].team = this.result[this.currentKey].team ?? [];
		this.result[this.currentKey].team!.push(this.currentMember as TeamMember);
		this.currentMember = null;
	}

	private processTopLevel(line: string): void {
		if (!line.endsWith(":")) return;
		this.flushMember();
		this.currentKey = line.slice(0, -1);
		this.result[this.currentKey] = { name: "", file: "" };
		this.inTeamArray = false;
	}

	private processEntry(line: string): void {
		this.flushMember();
		if (line === "team:") {
			this.inTeamArray = true;
			return;
		}
		this.inTeamArray = false;
		const kv = this.parseKV(line);
		if (!kv) return;
		const [k, v] = kv;
		const entry = this.result[this.currentKey!];
		if (k === "name") entry.name = v;
		else if (k === "file") entry.file = v;
		else if (k === "description") entry.description = v;
	}

	private processTeamLine(line: string): void {
		if (line.startsWith("- ")) {
			this.flushMember();
			this.currentMember = {};
			const kv = this.parseKV(line.slice(2).trim());
			if (kv) this.applyMemberField(kv[0], kv[1]);
			return;
		}
		const kv = this.parseKV(line);
		if (kv) this.applyMemberField(kv[0], kv[1]);
	}

	private processLine(rawLine: string): void {
		if (rawLine.trimStart().startsWith("#") || rawLine.trim() === "") return;
		const indent = rawLine.length - rawLine.trimStart().length;
		const line = rawLine.trim();
		if (indent === 0) {
			this.processTopLevel(line);
		} else if (indent === 2 && this.currentKey) {
			this.processEntry(line);
		} else if ((indent === 4 || indent === 6) && this.currentKey && this.inTeamArray) {
			this.processTeamLine(line);
		}
	}

	parse(content: string): TeamsConfig {
		for (const rawLine of content.split("\n")) {
			this.processLine(rawLine);
		}
		this.flushMember();
		return this.result;
	}
}

export function parseYaml(content: string): TeamsConfig {
	return new TeamsYamlParser().parse(content);
}

export function loadTeamsConfig(): TeamsConfig | null {
	try {
		return parseYaml(fs.readFileSync(getTeamsConfigPath(), "utf-8"));
	} catch {
		return null;
	}
}

// Find a team entry by key or by lead name
export function resolveTeam(teams: TeamsConfig, target: string): [string, TeamEntry] | null {
	if (teams[target]) return [target, teams[target]];
	for (const [key, entry] of Object.entries(teams)) {
		if (entry.name === target) return [key, entry];
	}
	return null;
}

export function formatTeamList(teams: TeamsConfig): string {
	const lines: string[] = ["Available teams:"];
	for (const [key, entry] of Object.entries(teams)) {
		const workers = entry.team?.map((m) => m.name).join(", ");
		const workerStr = workers ? ` [workers: ${workers}]` : "";
		lines.push(`  ${key} → ${entry.name}${workerStr}`);
	}
	return lines.join("\n");
}

export function resolveAgentPath(filePath: string, agentDir: string): string {
	return filePath.startsWith(".pi/")
		? path.join(agentDir, filePath.slice(".pi/".length))
		: path.join(agentDir, filePath);
}

export function buildWorkerPaths(team: TeamMember[] | undefined, agentDir: string): string {
	if (!team) return "  (no direct reports configured)";
	return team.map((m) => `  - ${m.name}: ${resolveAgentPath(m.file, agentDir)}`).join("\n");
}

export function buildDispatchMessage(teamEntry: TeamEntry, agentFilePath: string, task: string): string {
	const agentDir = getAgentDir();
	return [
		`Use the subagent tool to dispatch this task to the ${teamEntry.name} at ${agentFilePath}.`,
		"",
		"The lead has the following workers available (delegate to them sequentially via subagent):",
		buildWorkerPaths(teamEntry.team, agentDir),
		"",
		`Task for ${teamEntry.name}:`,
		task,
	].join("\n");
}

const USAGE_MSG =
	"Usage: /team <team-key|lead-name> <task description>\nRun /team list to see available teams.";

export function parseTeamArgs(trimmed: string): { target: string; task: string } | null {
	const spaceIdx = trimmed.indexOf(" ");
	if (spaceIdx === -1) return null;
	const task = trimmed.slice(spaceIdx + 1).trim();
	if (!task) return null;
	return { target: trimmed.slice(0, spaceIdx), task };
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

			const parsed = parseTeamArgs(trimmed);
			if (!parsed) {
				ctx.ui.notify(USAGE_MSG, "warning");
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

			const resolved = resolveTeam(teams, parsed.target);
			if (!resolved) {
				ctx.ui.notify(`Team "${parsed.target}" not found.\n\n${formatTeamList(teams)}`, "warning");
				return;
			}

			const [, teamEntry] = resolved;
			const agentFilePath = resolveAgentPath(teamEntry.file, getAgentDir());

			if (!fs.existsSync(agentFilePath)) {
				ctx.ui.notify(
					`Agent file not found: ${agentFilePath}\nCheck that the agent persona file exists.`,
					"warning",
				);
				return;
			}

			await pi.sendUserMessage(buildDispatchMessage(teamEntry, agentFilePath, parsed.task));
		},
	});
}
