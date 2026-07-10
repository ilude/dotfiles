/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { findSkillByName } from "../../lib/skill-discovery.js";

export type AgentScope = "user" | "project" | "both";

/**
 * Agent execution configuration. The subagent launcher enforces tools, model,
 * effort, and skills. Isolation and memory remain advisory metadata.
 */
export type AgentIsolation = "none" | "worktree";
export type AgentMemory = "user" | "project" | "session";
export type AgentEffort =
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| "max";
export type AgentRoleType =
	| "orchestrator"
	| "lead"
	| "worker"
	| "specialist"
	| "tier";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
	isolation?: AgentIsolation;
	memory?: AgentMemory;
	effort?: AgentEffort;
	skills?: string[];
	roleType?: AgentRoleType;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

function readDirEntries(dir: string): fs.Dirent[] {
	try {
		return fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

const VALID_ISOLATION = new Set<AgentIsolation>(["none", "worktree"]);
const VALID_MEMORY = new Set<AgentMemory>(["user", "project", "session"]);
const VALID_EFFORT = new Set<AgentEffort>([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);
const VALID_ROLE_TYPE = new Set<AgentRoleType>([
	"orchestrator",
	"lead",
	"worker",
	"specialist",
	"tier",
]);

function asIsolation(value: string | undefined): AgentIsolation | undefined {
	if (!value) return undefined;
	return VALID_ISOLATION.has(value as AgentIsolation)
		? (value as AgentIsolation)
		: undefined;
}
function asMemory(value: string | undefined): AgentMemory | undefined {
	if (!value) return undefined;
	return VALID_MEMORY.has(value as AgentMemory)
		? (value as AgentMemory)
		: undefined;
}
function asEffort(value: string | undefined): AgentEffort | undefined {
	if (!value) return undefined;
	return VALID_EFFORT.has(value as AgentEffort)
		? (value as AgentEffort)
		: undefined;
}
function asRoleType(value: string | undefined): AgentRoleType | undefined {
	if (!value) return undefined;
	return VALID_ROLE_TYPE.has(value as AgentRoleType)
		? (value as AgentRoleType)
		: undefined;
}
function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const values = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
	return values.length > 0 ? values : undefined;
}

function parseAgentFile(
	filePath: string,
	source: "user" | "project",
): AgentConfig | null {
	let content: string;
	try {
		content = fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}

	const { frontmatter, body } =
		parseFrontmatter<Record<string, unknown>>(content);
	const name = asString(frontmatter.name);
	const description = asString(frontmatter.description);
	if (!name || !description) return null;

	const tools = asString(frontmatter.tools)
		?.split(",")
		.map((t: string) => t.trim())
		.filter(Boolean);

	const config: AgentConfig = {
		name,
		description,
		tools: tools && tools.length > 0 ? tools : undefined,
		model: asString(frontmatter.model),
		systemPrompt: body,
		source,
		filePath,
	};

	const isolation = asIsolation(asString(frontmatter.isolation));
	if (isolation) config.isolation = isolation;
	const memory = asMemory(asString(frontmatter.memory));
	if (memory) config.memory = memory;
	const effort = asEffort(asString(frontmatter.effort));
	if (effort) config.effort = effort;
	const skills = asStringArray(frontmatter.skills);
	if (skills) config.skills = skills;
	const roleType = asRoleType(asString(frontmatter.roleType));
	if (roleType) config.roleType = roleType;

	return config;
}

export function resolveAgentSkillPaths(agent: AgentConfig): string[] {
	return (agent.skills ?? []).map((skill) => {
		const isPath =
			skill.includes("/") || skill.includes("\\") || skill.endsWith(".md");
		if (isPath) {
			const resolved = path.resolve(path.dirname(agent.filePath), skill);
			if (!fs.existsSync(resolved)) {
				throw new Error(
					`Agent ${agent.name} references missing skill: ${skill}`,
				);
			}
			return resolved;
		}

		const record = findSkillByName(skill);
		if (!record)
			throw new Error(`Agent ${agent.name} references unknown skill: ${skill}`);
		return record.filePath;
	});
}

export function loadAgentsFromDir(
	dir: string,
	source: "user" | "project",
): AgentConfig[] {
	if (!fs.existsSync(dir)) return [];

	const agents: AgentConfig[] = [];
	for (const entry of readDirEntries(dir)) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const agent = parseAgentFile(path.join(dir, entry.name), source);
		if (agent) agents.push(agent);
	}
	return agents;
}

export function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

export function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".pi", "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function buildAgentMap(
	userAgents: AgentConfig[],
	projectAgents: AgentConfig[],
	scope: AgentScope,
): Map<string, AgentConfig> {
	const agentMap = new Map<string, AgentConfig>();
	if (scope === "both" || scope === "user") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
	}
	if (scope === "both" || scope === "project") {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}
	return agentMap;
}

export function discoverAgents(
	cwd: string,
	scope: AgentScope,
): AgentDiscoveryResult {
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const userAgents =
		scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents =
		scope === "user" || !projectAgentsDir
			? []
			: loadAgentsFromDir(projectAgentsDir, "project");

	const agentMap = buildAgentMap(userAgents, projectAgents, scope);
	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function formatAgentList(
	agents: AgentConfig[],
	maxItems: number,
): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed
			.map((a) => `${a.name} (${a.source}): ${a.description}`)
			.join("; "),
		remaining,
	};
}
