/**
 * Agent Team Shared Helpers
 *
 * Legacy /team registration has been retired. This module keeps the pure
 * team-config helpers used by subagent dispatch and tests, but intentionally
 * does not register an active /team command.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "../lib/extension-utils.js";
import { parseYamlMini } from "../lib/yaml-mini.js";

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

export { getAgentDir };

export function getTeamsConfigPath(): string {
	return path.join(getAgentDir(), "agents", "teams.yaml");
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asTeamMember(value: unknown): TeamMember | null {
	if (!value || typeof value !== "object") return null;
	const obj = value as Record<string, unknown>;
	const name = asString(obj.name);
	if (!name) return null;
	return { name, file: asString(obj.file) };
}

function asTeamEntry(value: unknown): TeamEntry {
	if (!value || typeof value !== "object") {
		return { name: "", file: "" };
	}
	const obj = value as Record<string, unknown>;
	const entry: TeamEntry = {
		name: asString(obj.name),
		file: asString(obj.file),
	};
	if (typeof obj.description === "string") entry.description = obj.description;
	if (Array.isArray(obj.team)) {
		const members: TeamMember[] = [];
		for (const raw of obj.team) {
			const m = asTeamMember(raw);
			if (m) members.push(m);
		}
		if (members.length > 0) entry.team = members;
	}
	return entry;
}

function agentFile(name: string): string {
	return `.pi/agents/${name}.md`;
}

export function parseYaml(content: string): TeamsConfig {
	const root = parseYamlMini(content);
	const out: TeamsConfig = {};
	if (!root || typeof root !== "object" || Array.isArray(root)) return out;
	const obj = root as Record<string, unknown>;
	const nestedTeams = obj.teams;
	if (nestedTeams && typeof nestedTeams === "object" && !Array.isArray(nestedTeams)) {
		for (const [key, value] of Object.entries(nestedTeams as Record<string, unknown>)) {
			if (!value || typeof value !== "object" || Array.isArray(value)) continue;
			const teamObj = value as Record<string, unknown>;
			const lead = asString(teamObj.lead);
			const workers = Array.isArray(teamObj.workers)
				? teamObj.workers
						.map((worker) => asString(worker))
						.filter(Boolean)
				: [];
			out[key] = {
				name: lead,
				file: agentFile(lead),
				team: workers.map((name) => ({ name, file: agentFile(name) })),
			};
		}
		return out;
	}
	for (const [key, value] of Object.entries(obj)) {
		out[key] = asTeamEntry(value);
	}
	return out;
}

export function loadTeamsConfig(): TeamsConfig | null {
	try {
		return parseYaml(fs.readFileSync(getTeamsConfigPath(), "utf-8"));
	} catch {
		return null;
	}
}

export function resolveTeam(
	teams: TeamsConfig,
	target: string,
): [string, TeamEntry] | null {
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
		lines.push(`  ${key} -> ${entry.name}${workerStr}`);
	}
	return lines.join("\n");
}

export function resolveAgentPath(filePath: string, agentDir: string): string {
	return filePath.startsWith(".pi/")
		? path.join(agentDir, filePath.slice(".pi/".length))
		: path.join(agentDir, filePath);
}

export function buildWorkerPaths(
	team: TeamMember[] | undefined,
	agentDir: string,
): string {
	if (!team) return "  (no direct reports configured)";
	return team
		.map((m) => `  - ${m.name}: ${resolveAgentPath(m.file, agentDir)}`)
		.join("\n");
}

export function buildDispatchMessage(
	teamEntry: TeamEntry,
	agentFilePath: string,
	task: string,
): string {
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

export function parseTeamArgs(
	trimmed: string,
): { target: string; task: string } | null {
	const spaceIdx = trimmed.indexOf(" ");
	if (spaceIdx === -1) return null;
	const task = trimmed.slice(spaceIdx + 1).trim();
	if (!task) return null;
	return { target: trimmed.slice(0, spaceIdx), task };
}

export default function () {
	// Intentionally empty: /team is no longer an active command. Use the
	// subagent tool with { team: "<team-key>", task: "..." } instead.
}
