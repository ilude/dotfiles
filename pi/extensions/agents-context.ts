import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EXPERTISE_TOOLS = new Set(["read_expertise", "append_expertise"]);
const INSTRUCTION_NAMES = ["AGENTS.md", "AGENT.md", path.join(".pi", "AGENTS.md"), "CLAUDE.md", path.join(".claude", "CLAUDE.md")];
const MUTATING_TOOLS = new Set(["edit", "write", "text_edit", "structured_edit"]);
const PATH_TOOLS = new Set(["read", "edit", "write", "text_edit", "structured_edit", "grep", "find", "ls"]);
const MAX_FILES = 32;
const MAX_BYTES_PER_FILE = 24 * 1024;
const MAX_TOTAL_BYTES = 96 * 1024;
const MAX_IMPORT_DEPTH = 3;
const REPORT_TYPE = "agents-context-report";

type ToolCallResult = { block: true; reason: string } | undefined;

type LoadedInstruction = {
	path: string;
	bytes: number;
	reason: string;
	truncated: boolean;
};

type State = {
	loaded: Map<string, LoadedInstruction>;
	blockedOnce: Set<string>;
	skipped: string[];
	totalBytes: number;
	expertiseDisabled: boolean;
};

const state: State = {
	loaded: new Map(),
	blockedOnce: new Set(),
	skipped: [],
	totalBytes: 0,
	expertiseDisabled: false,
};

function canonical(filePath: string): string {
	return path.resolve(filePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function existingFiles(paths: string[]): string[] {
	return paths.map(canonical).filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function globalInstructionFiles(home = os.homedir()): string[] {
	return existingFiles([path.join(home, ".pi", "agent", "AGENTS.md"), path.join(home, ".pi", "AGENTS.md")]);
}

function ancestorsFromRoot(root: string, targetDir: string): string[] {
	const resolvedRoot = canonical(root);
	const resolvedTarget = canonical(targetDir);
	const relative = path.relative(resolvedRoot, resolvedTarget);
	if (relative.startsWith("..") || path.isAbsolute(relative)) return [resolvedTarget];
	const parts = relative ? relative.split(path.sep).filter(Boolean) : [];
	const dirs = [resolvedRoot];
	let current = resolvedRoot;
	for (const part of parts) {
		current = path.join(current, part);
		dirs.push(current);
	}
	return dirs;
}

function localInstructionFiles(cwd: string, targetPath: string): string[] {
	const target = canonical(path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath));
	const targetDir = path.extname(target) ? path.dirname(target) : target;
	const candidates = ancestorsFromRoot(cwd, targetDir).flatMap((dir) => INSTRUCTION_NAMES.map((name) => path.join(dir, name)));
	return existingFiles(candidates);
}

function parseImports(content: string): string[] {
	const imports: string[] = [];
	for (const line of content.split(/\r?\n/)) {
		const match = line.match(/^\s*@([^\s#][^\r\n]*)\s*$/);
		if (match) imports.push(match[1].trim());
	}
	return imports;
}

function readInstruction(filePath: string, reason: string, depth = 0): LoadedInstruction[] {
	const fullPath = canonical(filePath);
	if (state.loaded.has(fullPath)) return [];
	if (state.loaded.size >= MAX_FILES) {
		state.skipped.push(`${fullPath} skipped: file cap reached`);
		return [];
	}
	const raw = fs.readFileSync(fullPath, "utf8");
	const remaining = MAX_TOTAL_BYTES - state.totalBytes;
	if (remaining <= 0) {
		state.skipped.push(`${fullPath} skipped: total byte cap reached`);
		return [];
	}
	const truncated = raw.length > MAX_BYTES_PER_FILE || raw.length > remaining;
	const content = raw.slice(0, Math.min(raw.length, MAX_BYTES_PER_FILE, remaining));
	const loaded: LoadedInstruction = { path: fullPath, bytes: Buffer.byteLength(content), reason, truncated };
	state.loaded.set(fullPath, loaded);
	state.totalBytes += loaded.bytes;
	const result = [loaded];
	if (truncated) state.skipped.push(`${fullPath} truncated`);
	if (depth >= MAX_IMPORT_DEPTH) return result;
	for (const imported of parseImports(content)) {
		const importPath = canonical(path.resolve(path.dirname(fullPath), imported));
		if (fs.existsSync(importPath) && fs.statSync(importPath).isFile()) {
			result.push(...readInstruction(importPath, `imported by ${fullPath}`, depth + 1));
		} else {
			state.skipped.push(`${importPath} skipped: import not found`);
		}
	}
	return result;
}

function instructionPayload(files: LoadedInstruction[]): string {
	const blocks = files.map((file) => {
		const text = fs.readFileSync(file.path, "utf8").slice(0, file.bytes);
		return `## ${file.path}\nReason: ${file.reason}${file.truncated ? " (truncated)" : ""}\n\n${text}`;
	});
	return `# Loaded AGENTS context\n\n${blocks.join("\n\n")}`;
}

function removeExpertiseTools(event: unknown): void {
	if (!isRecord(event) || !Array.isArray(event.tools)) return;
	event.tools = event.tools.filter((tool) => !isRecord(tool) || !EXPERTISE_TOOLS.has(String(tool.name)));
}

function collectToolPaths(toolName: string, input: unknown, cwd: string): string[] {
	if (!PATH_TOOLS.has(toolName) || !isRecord(input)) return [];
	const paths: string[] = [];
	for (const key of ["path", "file", "cwd"] as const) {
		if (typeof input[key] === "string") paths.push(input[key]);
	}
	if (Array.isArray(input.paths)) paths.push(...input.paths.filter((item): item is string => typeof item === "string"));
	return paths.length ? paths : [cwd];
}

function discoverForPaths(cwd: string, paths: string[]): LoadedInstruction[] {
	const files = [...globalInstructionFiles(), ...paths.flatMap((target) => localInstructionFiles(cwd, target))];
	return files.flatMap((file) => readInstruction(file, file.includes(`${path.sep}.pi${path.sep}`) ? "global/user or .pi instruction" : "project instruction"));
}

function publishReport(pi: ExtensionAPI, files: LoadedInstruction[]): void {
	if (!files.length || typeof pi.sendMessage !== "function") return;
	pi.sendMessage({ customType: REPORT_TYPE, display: false, content: instructionPayload(files) }, { triggerTurn: false });
}

export function formatAgentsContextStatus(): string {
	const lines = [
		`Expertise tools disabled: ${state.expertiseDisabled ? "yes" : "no"}`,
		`Loaded instruction files: ${state.loaded.size}`,
		`Loaded bytes: ${state.totalBytes}`,
	];
	for (const file of state.loaded.values()) lines.push(`- ${file.path} (${file.bytes} bytes; ${file.reason})`);
	for (const item of state.skipped) lines.push(`- ${item}`);
	return lines.join("\n");
}

export function resetAgentsContextStateForTests(): void {
	state.loaded.clear();
	state.blockedOnce.clear();
	state.skipped.length = 0;
	state.totalBytes = 0;
	state.expertiseDisabled = false;
}

export const agentsContextTestApi = { globalInstructionFiles, localInstructionFiles, parseImports, discoverForPaths, formatAgentsContextStatus };

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		removeExpertiseTools(event);
		state.expertiseDisabled = true;
		const files = discoverForPaths(ctx.cwd, [ctx.cwd]);
		if (!files.length) return undefined;
		return { systemPrompt: `${event.systemPrompt}\n\n${instructionPayload(files)}` };
	});

	pi.on("session_start", async (event) => {
		removeExpertiseTools(event);
		state.expertiseDisabled = true;
	});

	pi.on("tool_call", async (event, ctx): Promise<ToolCallResult> => {
		const toolName = String(event.toolName ?? "");
		if (EXPERTISE_TOOLS.has(toolName)) {
			return { block: true, reason: "Expertise tools are disabled; use AGENTS.md, project .pi/skills, or user/global skills instead." };
		}
		const targetPaths = collectToolPaths(toolName, event.input, ctx.cwd);
		const files = discoverForPaths(ctx.cwd, targetPaths);
		publishReport(pi, files);
		if (files.length && MUTATING_TOOLS.has(toolName)) {
			const key = `${toolName}:${JSON.stringify(event.input ?? {})}`;
			if (!state.blockedOnce.has(key)) {
				state.blockedOnce.add(key);
				return { block: true, reason: `Loaded ${files.length} AGENTS context file(s). Retry this ${toolName} call now that instructions are available.` };
			}
		}
		return undefined;
	});

	pi.registerCommand("agents-context", {
		description: "Show AGENTS/CLAUDE instruction files loaded by the agents-context extension.",
		handler: async (_args: string, ctx: any) => {
			const report = formatAgentsContextStatus();
			if (ctx?.hasUI) ctx.ui.notify(report, "info");
			else if (typeof pi.sendMessage === "function") pi.sendMessage({ customType: REPORT_TYPE, display: true, content: report }, { triggerTurn: false });
		},
	});
}
