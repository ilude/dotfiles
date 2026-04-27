/**
 * Agent Team Extension
 *
 * Implements the dispatcher pattern -- routes work to specialist team leads
 * based on named team routing. Loads team config from teams.yaml using the
 * shared TS-native yaml-mini loader.
 *
 * Registers:
 *   - /team command: dispatch task to a named team lead
 *     Usage: /team <lead-name|team-key> <task>
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "../lib/extension-utils.js";
import { createTask, transitionTask } from "../lib/task-registry.js";
import { parseYamlMini } from "../lib/yaml-mini.js";

/**
 * Operator task registry integration -- record team dispatches as durable
 * work. The dispatch action itself is what is recorded; child subagent
 * invocations register their own tasks. Failures are silently dropped so
 * registry I/O never breaks the /team flow.
 */
function safeRecordTeamDispatch(teamName: string, task: string): void {
	try {
		const preview = task.length > 200 ? `${task.slice(0, 200)}...` : task;
		const record = createTask({
			origin: "team",
			summary: `Dispatched to ${teamName}`,
			agentName: teamName,
			prompt: preview,
			state: "running",
		});
		// The dispatch itself completes once sendUserMessage returns; child
		// subagent runs are tracked as separate task records.
		transitionTask(record.id, "completed");
	} catch {
		// ignore -- registry should never block /team
	}
}

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

export function parseYaml(content: string): TeamsConfig {
	const root = parseYamlMini(content);
	const out: TeamsConfig = {};
	if (!root || typeof root !== "object" || Array.isArray(root)) return out;
	for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
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
		lines.push(`  ${key} -> ${entry.name}${workerStr}`);
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

			safeRecordTeamDispatch(teamEntry.name, parsed.task);
			await pi.sendUserMessage(buildDispatchMessage(teamEntry, agentFilePath, parsed.task));
		},
	});
}
