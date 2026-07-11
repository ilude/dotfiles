import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

const EXPERTISE_TOOLS = new Set(["read_expertise", "append_expertise"]);
const PRIMARY_INSTRUCTION_NAMES = [
	"AGENTS.override.md",
	"AGENTS.md",
	"AGENT.md",
	path.join(".pi", "AGENTS.md"),
];
const FALLBACK_INSTRUCTION_NAMES = [
	"CLAUDE.md",
	path.join(".claude", "CLAUDE.md"),
];
const MUTATING_TOOLS = new Set([
	"edit",
	"write",
	"text_edit",
	"structured_edit",
]);
const PATH_TOOLS = new Set([
	"read",
	"edit",
	"write",
	"text_edit",
	"structured_edit",
	"grep",
	"find",
	"ls",
]);
const MAX_FILES = 32;
const MAX_BYTES_PER_FILE = 24 * 1024;
const MAX_TOTAL_BYTES = 96 * 1024;
const MAX_IMPORT_DEPTH = 3;
const REPORT_TYPE = "agents-context-report";
const MAX_TOOL_FAILURES = 128;
const REPEATED_TOOL_LOOP_REASON =
	"repeated_tool_loop: third identical failed or blocked tool attempt denied before execution";

type ToolCallResult = { block: true; reason: string } | undefined;

type LoadedInstruction = {
	path: string;
	bytes: number;
	reason: string;
	truncated: boolean;
};

type State = {
	loaded: Map<string, LoadedInstruction>;
	skipped: string[];
	skippedOnce: Set<string>;
	projectRoots: Map<string, string>;
	totalBytes: number;
	expertiseDisabled: boolean;
	cwd?: string;
	basePaths: Set<string>;
	injectedTargetFingerprints: Set<string>;
	toolFailures: Map<string, { resultFingerprint: string; count: number }>;
};

const state: State = {
	loaded: new Map(),
	skipped: [],
	skippedOnce: new Set(),
	projectRoots: new Map(),
	totalBytes: 0,
	expertiseDisabled: false,
	basePaths: new Set(),
	injectedTargetFingerprints: new Set(),
	toolFailures: new Map(),
};

function canonical(filePath: string): string {
	return path.resolve(filePath);
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonicalValue(value[key])]),
	);
}

function toolCallFingerprint(toolName: unknown, input: unknown): string {
	return JSON.stringify([
		String(toolName ?? "").trim().toLowerCase(),
		canonicalValue(input),
	]);
}

function normalizeResultValue(value: unknown): unknown {
	if (typeof value === "string")
		return value.replaceAll("\r\n", "\n").trimEnd();
	if (Array.isArray(value)) return value.map(normalizeResultValue);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, normalizeResultValue(value[key])]),
	);
}

function normalizedFailureFingerprint(event: {
	content?: unknown;
	details?: unknown;
	isError?: unknown;
}): string {
	return JSON.stringify(
		normalizeResultValue({
			content: event.content,
			details: event.details,
			isError: Boolean(event.isError),
		}),
	);
}

function recordToolFailure(callFingerprint: string, resultFingerprint: string): void {
	const previous = state.toolFailures.get(callFingerprint);
	state.toolFailures.delete(callFingerprint);
	state.toolFailures.set(callFingerprint, {
		resultFingerprint,
		count:
			previous?.resultFingerprint === resultFingerprint
				? previous.count + 1
				: 1,
	});
	if (state.toolFailures.size > MAX_TOOL_FAILURES) {
		const oldest = state.toolFailures.keys().next().value;
		if (typeof oldest === "string") state.toolFailures.delete(oldest);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function existingFiles(paths: string[]): string[] {
	return paths
		.map(canonical)
		.filter(
			(candidate) =>
				fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
		);
}

function noteSkipped(message: string): void {
	if (state.skippedOnce.has(message)) return;
	state.skippedOnce.add(message);
	state.skipped.push(message);
}

function globalInstructionFiles(home = os.homedir()): string[] {
	return existingFiles([
		path.join(home, ".pi", "agent", "AGENTS.md"),
		path.join(home, ".pi", "AGENTS.md"),
	]);
}

function projectRootFor(cwd: string): string {
	let current = canonical(cwd);
	if (fs.existsSync(current) && fs.statSync(current).isFile())
		current = path.dirname(current);
	const fallbackRoot = current;
	while (true) {
		const gitMarker = path.join(current, ".git");
		if (fs.existsSync(gitMarker)) return current;
		const parent = path.dirname(current);
		if (parent === current) return fallbackRoot;
		current = parent;
	}
}

function ancestorsFromRoot(root: string, targetDir: string): string[] {
	const resolvedRoot = canonical(root);
	const resolvedTarget = canonical(targetDir);
	const relative = path.relative(resolvedRoot, resolvedTarget);
	if (relative.startsWith("..") || path.isAbsolute(relative))
		return ancestorsFromRoot(projectRootFor(targetDir), targetDir);
	const parts = relative ? relative.split(path.sep).filter(Boolean) : [];
	const dirs = [resolvedRoot];
	let current = resolvedRoot;
	for (const part of parts) {
		current = path.join(current, part);
		dirs.push(current);
	}
	return dirs;
}

function instructionFilesForDir(dir: string): string[] {
	const primary = existingFiles(
		PRIMARY_INSTRUCTION_NAMES.map((name) => path.join(dir, name)),
	);
	const fallback = existingFiles(
		FALLBACK_INSTRUCTION_NAMES.map((name) => path.join(dir, name)),
	);
	if (primary.length) {
		for (const file of fallback)
			noteSkipped(
				`${file} skipped: AGENTS-style instruction exists in ${canonical(dir)}`,
			);
		return [primary[0]];
	}
	return fallback.slice(0, 1);
}

function localInstructionFiles(cwd: string, targetPath: string): string[] {
	const target = canonical(
		path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath),
	);
	const targetDir = path.extname(target) ? path.dirname(target) : target;
	const root = projectRootFor(cwd);
	state.projectRoots.set(canonical(cwd), root);
	return ancestorsFromRoot(root, targetDir).flatMap(instructionFilesForDir);
}

function parseImports(content: string): string[] {
	const imports: string[] = [];
	for (const line of content.split(/\r?\n/)) {
		const match = line.match(/^\s*@([^\s#][^\r\n]*)\s*$/);
		if (match) imports.push(match[1].trim());
	}
	return imports;
}

function isPathInside(candidate: string, root: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		Boolean(relative) &&
		!relative.startsWith("..") &&
		!path.isAbsolute(relative)
	);
}

function isSensitiveImportPath(imported: string): boolean {
	const normalized = imported.split(/[\\/]+/).filter(Boolean);
	const lower = normalized.map((part) => part.toLowerCase());
	if (lower.some((part) => part === ".ssh")) return true;
	return lower.some(
		(part) =>
			part === ".env" ||
			part.startsWith(".env.") ||
			part.endsWith(".pem") ||
			part.endsWith(".key") ||
			part === "id_rsa" ||
			part === "id_ed25519" ||
			part === "known_hosts" ||
			part === "ssh_config",
	);
}

function validateImportSpec(imported: string) {
	if (path.isAbsolute(imported) || imported.startsWith("~"))
		return "absolute imports are not allowed";
	const parts = imported.split(/[\\/]+/).filter(Boolean);
	if (parts.includes("..")) return "parent-directory imports are not allowed";
	if (isSensitiveImportPath(imported))
		return "sensitive file imports are not allowed";
	return undefined;
}

function existingImportPath(imported: string, importerPath: string) {
	const importPath = canonical(
		path.resolve(path.dirname(importerPath), imported),
	);
	if (fs.existsSync(importPath) && fs.statSync(importPath).isFile())
		return importPath;
	noteSkipped(`${importPath} skipped: import not found`);
	return undefined;
}

function realPathInsideRoot(importPath: string, importRoot: string) {
	const rootReal = fs.realpathSync(importRoot);
	const importReal = fs.realpathSync(importPath);
	if (importReal === rootReal || isPathInside(importReal, rootReal))
		return importPath;
	noteSkipped(`${importPath} skipped: import escapes instruction root`);
	return undefined;
}

function resolveSafeImport(
	imported: string,
	importerPath: string,
	importRoot: string,
) {
	const validationError = validateImportSpec(imported);
	if (validationError) {
		noteSkipped(`${imported} skipped: ${validationError}`);
		return undefined;
	}
	const importPath = existingImportPath(imported, importerPath);
	return importPath ? realPathInsideRoot(importPath, importRoot) : undefined;
}

function readInstruction(
	filePath: string,
	reason: string,
	importRoot: string,
	depth = 0,
): LoadedInstruction[] {
	const fullPath = canonical(filePath);
	if (state.loaded.has(fullPath)) return [];
	if (state.loaded.size >= MAX_FILES) {
		noteSkipped(`${fullPath} skipped: file cap reached`);
		return [];
	}
	const raw = fs.readFileSync(fullPath, "utf8");
	const remaining = MAX_TOTAL_BYTES - state.totalBytes;
	if (remaining <= 0) {
		noteSkipped(`${fullPath} skipped: total byte cap reached`);
		return [];
	}
	const truncated = raw.length > MAX_BYTES_PER_FILE || raw.length > remaining;
	const content = raw.slice(
		0,
		Math.min(raw.length, MAX_BYTES_PER_FILE, remaining),
	);
	const loaded: LoadedInstruction = {
		path: fullPath,
		bytes: Buffer.byteLength(content),
		reason,
		truncated,
	};
	state.loaded.set(fullPath, loaded);
	state.totalBytes += loaded.bytes;
	const result = [loaded];
	if (truncated) noteSkipped(`${fullPath} truncated`);
	if (depth >= MAX_IMPORT_DEPTH) return result;
	for (const imported of parseImports(content)) {
		const importPath = resolveSafeImport(imported, fullPath, importRoot);
		if (!importPath) continue;
		result.push(
			...readInstruction(
				importPath,
				`imported by ${fullPath}`,
				importRoot,
				depth + 1,
			),
		);
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
	event.tools = event.tools.filter(
		(tool) => !isRecord(tool) || !EXPERTISE_TOOLS.has(String(tool.name)),
	);
}

function collectToolPaths(
	toolName: string,
	input: unknown,
	cwd: string,
): string[] {
	if (!PATH_TOOLS.has(toolName) || !isRecord(input)) return [];
	const paths: string[] = [];
	for (const key of ["path", "file", "cwd"] as const) {
		if (typeof input[key] === "string") paths.push(input[key]);
	}
	if (Array.isArray(input.paths))
		paths.push(
			...input.paths.filter((item): item is string => typeof item === "string"),
		);
	return paths.length ? paths : [cwd];
}

function instructionReason(file: string, globalFiles: Set<string>): string {
	if (globalFiles.has(file)) return "global/user instruction";
	const normalized = file.split(path.sep).join("/");
	if (
		normalized.endsWith("/CLAUDE.md") ||
		normalized.endsWith("/.claude/CLAUDE.md")
	)
		return "project fallback instruction";
	return "project primary instruction";
}

function clearLoadedSnapshot(): void {
	state.loaded.clear();
	state.skipped.length = 0;
	state.skippedOnce.clear();
	state.projectRoots.clear();
	state.totalBytes = 0;
}

function clearInstructionState(): void {
	clearLoadedSnapshot();
	state.basePaths.clear();
	state.injectedTargetFingerprints.clear();
	state.toolFailures.clear();
}

function resetForCwd(cwd: string): void {
	const resolvedCwd = canonical(cwd);
	if (state.cwd === resolvedCwd) return;
	clearInstructionState();
	state.cwd = resolvedCwd;
}

function discoverForPaths(cwd: string, paths: string[]): LoadedInstruction[] {
	resetForCwd(cwd);
	clearLoadedSnapshot();
	const globalFiles = globalInstructionFiles();
	const globalFileSet = new Set(globalFiles);
	const projectRoot = projectRootFor(cwd);
	const files = [
		...globalFiles,
		...paths.flatMap((target) => localInstructionFiles(cwd, target)),
	];
	return files.flatMap((file) =>
		readInstruction(
			file,
			instructionReason(file, globalFileSet),
			globalFileSet.has(file) ? path.dirname(file) : projectRoot,
		),
	);
}

export function formatAgentsContextStatus(): string {
	const lines = [
		`Expertise tools disabled: ${state.expertiseDisabled ? "yes" : "no"}`,
		`Loaded instruction files: ${state.loaded.size}`,
		`Loaded bytes: ${state.totalBytes}/${MAX_TOTAL_BYTES}`,
	];
	for (const [cwd, root] of state.projectRoots)
		lines.push(`Project root for ${cwd}: ${root}`);
	for (const file of state.loaded.values())
		lines.push(`- ${file.path} (${file.bytes} bytes; ${file.reason})`);
	for (const item of state.skipped) lines.push(`- ${item}`);
	return lines.join("\n");
}

export function resetAgentsContextStateForTests(): void {
	clearInstructionState();
	state.expertiseDisabled = false;
	state.cwd = undefined;
}

export const agentsContextTestApi = {
	globalInstructionFiles,
	projectRootFor,
	localInstructionFiles,
	parseImports,
	discoverForPaths,
	formatAgentsContextStatus,
};

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		removeExpertiseTools(event);
		state.expertiseDisabled = true;
		const files = discoverForPaths(ctx.cwd, [ctx.cwd]);
		state.basePaths = new Set(files.map((file) => file.path));
		state.injectedTargetFingerprints.clear();
		state.toolFailures.clear();
		if (!files.length) return undefined;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${instructionPayload(files)}`,
		};
	});

	type ContextHook = (
		event: { messages: Array<Record<string, unknown>> },
		ctx: { cwd: string },
	) => Promise<{ messages: Array<Record<string, unknown>> }>;
	const registerContextHook = pi.on as unknown as (
		event: "context",
		handler: ContextHook,
	) => void;
	registerContextHook("context", async (event, ctx) => {
		resetForCwd(ctx.cwd);
		const messages = event.messages.filter(
			(message) =>
				!(message.role === "custom" && message.customType === REPORT_TYPE),
		);
		const targetFiles = [...state.loaded.values()].filter(
			(file) => !state.basePaths.has(file.path),
		);
		if (!targetFiles.length) return { messages };
		const payload = instructionPayload(targetFiles);
		return {
			messages: [
				...messages,
				{
					role: "custom" as const,
					customType: REPORT_TYPE,
					display: false,
					content: payload,
					timestamp: Date.now(),
				},
			],
		};
	});

	pi.on("session_start", async (event, ctx) => {
		clearInstructionState();
		state.cwd = canonical(ctx.cwd);
		removeExpertiseTools(event);
		state.expertiseDisabled = true;
	});

	pi.on("tool_call", async (event, ctx): Promise<ToolCallResult> => {
		const toolName = String(event.toolName ?? "");
		const callFingerprint = toolCallFingerprint(toolName, event.input);
		if ((state.toolFailures.get(callFingerprint)?.count ?? 0) >= 2) {
			return { block: true, reason: REPEATED_TOOL_LOOP_REASON };
		}
		if (EXPERTISE_TOOLS.has(toolName)) {
			const reason =
				"Expertise tools are disabled; use AGENTS.md, project .pi/skills, or user/global skills instead.";
			recordToolFailure(callFingerprint, reason);
			return { block: true, reason };
		}
		const targetPaths = collectToolPaths(toolName, event.input, ctx.cwd);
		const files = discoverForPaths(ctx.cwd, targetPaths);
		const targetFiles = files.filter((file) => !state.basePaths.has(file.path));
		const targetPayload = targetFiles.length
			? instructionPayload(targetFiles)
			: undefined;
		if (targetPayload && MUTATING_TOOLS.has(toolName)) {
			const contextFingerprint = targetPayload;
			if (!state.injectedTargetFingerprints.has(contextFingerprint)) {
				state.injectedTargetFingerprints.add(contextFingerprint);
				const reason = `Loaded ${targetFiles.length} target-specific AGENTS context file(s). Retry this ${toolName} call after the next model request applies them.`;
				recordToolFailure(callFingerprint, reason);
				return { block: true, reason };
			}
		}
		return undefined;
	});

	pi.on("tool_result", async (event) => {
		const callFingerprint = toolCallFingerprint(event.toolName, event.input);
		if (event.isError) {
			recordToolFailure(
				callFingerprint,
				normalizedFailureFingerprint(event),
			);
		} else {
			state.toolFailures.delete(callFingerprint);
		}
	});

	pi.registerCommand("agents-context", {
		description:
			"Show AGENTS/CLAUDE instruction files loaded by the agents-context extension.",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const report = formatAgentsContextStatus();
			if (ctx?.hasUI) ctx.ui.notify(report, "info");
			else if (typeof pi.sendMessage === "function")
				pi.sendMessage(
					{ customType: REPORT_TYPE, display: true, content: report },
					{ triggerTurn: false },
				);
		},
	});
}
