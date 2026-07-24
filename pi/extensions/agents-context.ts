import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PRIMARY_INSTRUCTION_NAME = "AGENTS.md";
const FALLBACK_INSTRUCTION_NAME = "CLAUDE.md";
const MUTATING_TOOLS = new Set([
	"edit",
	"write",
	"text_edit",
	"structured_edit",
]);
const CONTEXT_TOOLS = new Set(["read", "grep", "find", "ls"]);
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
const MAX_CACHED_FILES = 128;
const REPORT_TYPE = "agents-context-report";

type ToolCallResult = { block: true; reason: string } | undefined;

type LoadedInstruction = {
	path: string;
	bytes: number;
	reason: string;
	truncated: boolean;
	content: string;
};

type State = {
	loaded: Map<string, LoadedInstruction>;
	skipped: string[];
	skippedOnce: Set<string>;
	projectRoots: Map<string, string>;
	totalBytes: number;
	cwd?: string;
	basePaths: Set<string>;
	baseFingerprints: Set<string>;
	loadedFingerprints: Set<string>;
	deliveredInstructionFingerprints: Map<string, string>;
	deferredCallFingerprints: Set<string>;
	activeInstructionScope?: string;
	activeInstructionFingerprint?: string;
	retryRequestedFor?: string;
};

const instructionContentCache = new Map<
	string,
	{ mtimeMs: number; ctimeMs: number; size: number; content: string }
>();

const state: State = {
	loaded: new Map(),
	skipped: [],
	skippedOnce: new Set(),
	projectRoots: new Map(),
	totalBytes: 0,
	basePaths: new Set(),
	baseFingerprints: new Set(),
	loadedFingerprints: new Set(),
	deliveredInstructionFingerprints: new Map(),
	deferredCallFingerprints: new Set(),
};

function canonical(filePath: string): string {
	return path.resolve(filePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function existingFile(filePath: string): string | undefined {
	const candidate = canonical(filePath);
	return fs.existsSync(candidate) && fs.statSync(candidate).isFile()
		? candidate
		: undefined;
}

function noteSkipped(message: string): void {
	if (state.skippedOnce.has(message)) return;
	state.skippedOnce.add(message);
	state.skipped.push(message);
}

function projectRootFor(cwd: string): string {
	let current = canonical(cwd);
	if (fs.existsSync(current) && fs.statSync(current).isFile())
		current = path.dirname(current);
	const cacheKey = current;
	const cached = state.projectRoots.get(cacheKey);
	if (cached) return cached;
	const fallbackRoot = current;
	while (true) {
		if (fs.existsSync(path.join(current, ".git"))) {
			state.projectRoots.set(cacheKey, current);
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			state.projectRoots.set(cacheKey, fallbackRoot);
			return fallbackRoot;
		}
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

function instructionFileForDir(dir: string): string | undefined {
	const primary = existingFile(path.join(dir, PRIMARY_INSTRUCTION_NAME));
	if (primary) {
		const fallback = existingFile(path.join(dir, FALLBACK_INSTRUCTION_NAME));
		if (fallback)
			noteSkipped(
				`${fallback} skipped: ${PRIMARY_INSTRUCTION_NAME} exists in ${canonical(dir)}`,
			);
		return primary;
	}
	return existingFile(path.join(dir, FALLBACK_INSTRUCTION_NAME));
}

function isInstructionFile(filePath: string): boolean {
	const name = path.basename(filePath).toLowerCase();
	return (
		name === PRIMARY_INSTRUCTION_NAME.toLowerCase() ||
		name === FALLBACK_INSTRUCTION_NAME.toLowerCase()
	);
}

function localInstructionFiles(
	cwd: string,
	targetPath: string,
	excludeTargetInstruction = false,
): string[] {
	const target = canonical(
		path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath),
	);
	const targetDir = path.extname(target) ? path.dirname(target) : target;
	const root = projectRootFor(cwd);
	state.projectRoots.set(canonical(cwd), root);
	return ancestorsFromRoot(root, targetDir)
		.map(instructionFileForDir)
		.filter((file): file is string => Boolean(file))
		.filter(
			(file) =>
				!excludeTargetInstruction ||
				!isInstructionFile(target) ||
				canonical(file) !== target,
		);
}

function readCachedInstruction(fullPath: string): string {
	const stat = fs.statSync(fullPath);
	const cached = instructionContentCache.get(fullPath);
	if (
		cached &&
		cached.mtimeMs === stat.mtimeMs &&
		cached.ctimeMs === stat.ctimeMs &&
		cached.size === stat.size
	)
		return cached.content;
	const content = fs.readFileSync(fullPath, "utf8");
	instructionContentCache.delete(fullPath);
	instructionContentCache.set(fullPath, {
		mtimeMs: stat.mtimeMs,
		ctimeMs: stat.ctimeMs,
		size: stat.size,
		content,
	});
	if (instructionContentCache.size > MAX_CACHED_FILES) {
		const oldest = instructionContentCache.keys().next().value;
		if (typeof oldest === "string") instructionContentCache.delete(oldest);
	}
	return content;
}

function contentFingerprint(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function normalizeStructuredValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalizeStructuredValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.keys(value as Record<string, unknown>)
			.sort()
			.map((key) => [
				key,
				normalizeStructuredValue((value as Record<string, unknown>)[key]),
			]),
	);
}

function mutationCallFingerprint(toolName: string, input: unknown): string {
	return contentFingerprint(
		JSON.stringify([toolName.trim().toLowerCase(), normalizeStructuredValue(input)]),
	);
}

function truncateUtf8(value: string, maxBytes: number): string {
	const buffer = Buffer.from(value, "utf8");
	if (buffer.length <= maxBytes) return value;
	let end = Math.max(0, maxBytes);
	while (end > 0 && (buffer[end] & 0xc0) === 0x80) end -= 1;
	return buffer.subarray(0, end).toString("utf8");
}

function readInstruction(
	filePath: string,
	reason: string,
	excludedFingerprints: ReadonlySet<string> = new Set(),
): LoadedInstruction | undefined {
	const fullPath = canonical(filePath);
	if (state.loaded.has(fullPath) || state.basePaths.has(fullPath)) return undefined;
	if (state.loaded.size >= MAX_FILES) {
		noteSkipped(`${fullPath} skipped: file cap reached`);
		return undefined;
	}
	const raw = readCachedInstruction(fullPath);
	const fingerprint = contentFingerprint(raw);
	if (excludedFingerprints.has(fingerprint)) {
		noteSkipped(`${fullPath} skipped: matches read instruction target`);
		return undefined;
	}
	if (
		state.baseFingerprints.has(fingerprint) ||
		state.loadedFingerprints.has(fingerprint)
	) {
		noteSkipped(`${fullPath} skipped: duplicate instruction content`);
		return undefined;
	}
	const remainingBytes = MAX_TOTAL_BYTES - state.totalBytes;
	if (remainingBytes <= 0) {
		noteSkipped(`${fullPath} skipped: total byte cap reached`);
		return undefined;
	}
	const maxBytes = Math.min(MAX_BYTES_PER_FILE, remainingBytes);
	const rawBytes = Buffer.byteLength(raw, "utf8");
	const content = truncateUtf8(raw, maxBytes);
	const loaded: LoadedInstruction = {
		path: fullPath,
		bytes: Buffer.byteLength(content, "utf8"),
		reason,
		truncated: rawBytes > maxBytes,
		content,
	};
	state.loaded.set(fullPath, loaded);
	state.loadedFingerprints.add(fingerprint);
	state.totalBytes += loaded.bytes;
	if (loaded.truncated) noteSkipped(`${fullPath} truncated`);
	return loaded;
}

function instructionPayload(files: LoadedInstruction[]): string {
	const blocks = files.map(
		(file) =>
			`## ${file.path}\nReason: ${file.reason}${file.truncated ? " (truncated)" : ""}\n\n${file.content}`,
	);
	return `# Loaded AGENTS context\n\n${blocks.join("\n\n")}`;
}

function setActiveInstructions(files: LoadedInstruction[]): void {
	if (files.length === 0) {
		state.activeInstructionScope = undefined;
		state.activeInstructionFingerprint = undefined;
		state.retryRequestedFor = undefined;
		return;
	}
	const scope = contentFingerprint(files.map((file) => file.path).join("\n"));
	const fingerprint = contentFingerprint(instructionPayload(files));
	const identity = `${scope}:${fingerprint}`;
	if (state.retryRequestedFor && state.retryRequestedFor !== identity) {
		state.retryRequestedFor = undefined;
	}
	state.activeInstructionScope = scope;
	state.activeInstructionFingerprint = fingerprint;
}

function activeInstructionIdentity(): string | undefined {
	return state.activeInstructionScope && state.activeInstructionFingerprint
		? `${state.activeInstructionScope}:${state.activeInstructionFingerprint}`
		: undefined;
}

function clearLoadedSnapshot(): void {
	state.loaded.clear();
	state.loadedFingerprints.clear();
	state.skipped.length = 0;
	state.skippedOnce.clear();
	state.totalBytes = 0;
}

function recordNativeContextFiles(event: unknown): void {
	state.basePaths.clear();
	state.baseFingerprints.clear();
	if (!isRecord(event) || !isRecord(event.systemPromptOptions)) return;
	const contextFiles = event.systemPromptOptions.contextFiles;
	if (!Array.isArray(contextFiles)) return;
	for (const item of contextFiles) {
		if (!isRecord(item) || typeof item.path !== "string") continue;
		state.basePaths.add(canonical(item.path));
		if (typeof item.content === "string")
			state.baseFingerprints.add(contentFingerprint(item.content));
	}
}

function resolveToolPath(cwd: string, targetPath: string): string {
	return canonical(
		path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath),
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

function instructionReason(file: string): string {
	return path.basename(file).toLowerCase() === "claude.md"
		? "project fallback instruction"
		: "project primary instruction";
}

function clearRequestInstructionState(): void {
	clearLoadedSnapshot();
	state.deliveredInstructionFingerprints.clear();
	state.deferredCallFingerprints.clear();
	state.activeInstructionScope = undefined;
	state.activeInstructionFingerprint = undefined;
	state.retryRequestedFor = undefined;
}

function clearInstructionState(): void {
	clearRequestInstructionState();
	state.projectRoots.clear();
	state.basePaths.clear();
	state.baseFingerprints.clear();
}

function resetForCwd(cwd: string): void {
	const resolvedCwd = canonical(cwd);
	if (state.cwd === resolvedCwd) return;
	clearInstructionState();
	state.cwd = resolvedCwd;
}

function targetInstructionFingerprints(
	cwd: string,
	paths: string[],
): Set<string> {
	const fingerprints = new Set<string>();
	for (const targetPath of paths) {
		const target = canonical(
			path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath),
		);
		if (!isInstructionFile(target)) continue;
		const file = existingFile(target);
		if (!file) continue;
		fingerprints.add(contentFingerprint(readCachedInstruction(file)));
	}
	return fingerprints;
}

function discoverForPaths(
	cwd: string,
	paths: string[],
	excludeTargetInstructions = false,
): LoadedInstruction[] {
	resetForCwd(cwd);
	clearLoadedSnapshot();
	const excludedFingerprints = excludeTargetInstructions
		? targetInstructionFingerprints(cwd, paths)
		: new Set<string>();
	const files = [
		...new Set(
			paths.flatMap((target) =>
				localInstructionFiles(cwd, target, excludeTargetInstructions),
			),
		),
	];
	const loaded = files
		.map((file) =>
			readInstruction(file, instructionReason(file), excludedFingerprints),
		)
		.filter((file): file is LoadedInstruction => Boolean(file));
	setActiveInstructions(loaded);
	return loaded;
}

export function formatAgentsContextStatus(): string {
	const lines = [
		`Native instruction files: ${state.basePaths.size}`,
		`Nested instruction files: ${state.loaded.size}`,
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
	instructionContentCache.clear();
	state.cwd = undefined;
}

export const agentsContextTestApi = {
	projectRootFor,
	localInstructionFiles,
	discoverForPaths,
	formatAgentsContextStatus,
};

export default function (pi: ExtensionAPI) {
	pi.on("input", (event, ctx) => {
		resetForCwd(ctx.cwd);
		if (event.source !== "extension") clearRequestInstructionState();
	});

	pi.on("before_agent_start", async (event, ctx) => {
		resetForCwd(ctx.cwd);
		state.projectRoots.clear();
		recordNativeContextFiles(event);
		return undefined;
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
		const targetFiles = [...state.loaded.values()];
		if (!targetFiles.length) return { messages };
		const payload = instructionPayload(targetFiles);
		const identity = activeInstructionIdentity();
		if (!identity || !state.activeInstructionScope) return { messages };
		const content =
			state.retryRequestedFor === identity
				? `${payload}\n\nApply these instructions, then retry the deferred mutating tool call.`
				: payload;
		state.deliveredInstructionFingerprints.set(
			state.activeInstructionScope,
			state.activeInstructionFingerprint as string,
		);
		if (state.retryRequestedFor === identity) {
			state.retryRequestedFor = undefined;
		}
		return {
			messages: [
				...messages,
				{
					role: "custom" as const,
					customType: REPORT_TYPE,
					display: false,
					content,
					timestamp: Date.now(),
				},
			],
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		clearInstructionState();
		state.cwd = canonical(ctx.cwd);
	});

	pi.on("tool_call", async (event, ctx): Promise<ToolCallResult> => {
		resetForCwd(ctx.cwd);
		const toolName = String(event.toolName ?? "");
		if (!MUTATING_TOOLS.has(toolName)) return undefined;
		const targetPaths = collectToolPaths(toolName, event.input, ctx.cwd);
		if (targetPaths.length === 0) return undefined;
		const resolvedTargets = targetPaths.map((targetPath) =>
			resolveToolPath(ctx.cwd, targetPath),
		);
		const files = discoverForPaths(ctx.cwd, resolvedTargets);
		const identity = activeInstructionIdentity();
		if (
			files.length === 0 ||
			!identity ||
			!state.activeInstructionScope ||
			!state.activeInstructionFingerprint
		) {
			return undefined;
		}
		if (
			state.deliveredInstructionFingerprints.get(
				state.activeInstructionScope,
			) === state.activeInstructionFingerprint
		) {
			return undefined;
		}
		const deferredCall = `${mutationCallFingerprint(toolName, event.input)}:${identity}`;
		if (state.deferredCallFingerprints.has(deferredCall)) return undefined;
		state.deferredCallFingerprints.add(deferredCall);
		state.retryRequestedFor = identity;
		return {
			block: true,
			reason:
				"Deferred while loading path-specific instructions. Apply them, then retry the mutation.",
		};
	});

	pi.on("tool_result", async (event, ctx) => {
		resetForCwd(ctx.cwd);
		if (event.isError) return undefined;
		const toolName = String(event.toolName ?? "");
		if (!CONTEXT_TOOLS.has(toolName)) return undefined;
		const targetPaths = collectToolPaths(toolName, event.input, ctx.cwd);
		if (targetPaths.length === 0) return undefined;
		discoverForPaths(
			ctx.cwd,
			targetPaths.map((targetPath) => resolveToolPath(ctx.cwd, targetPath)),
			toolName === "read",
		);
		return undefined;
	});
}
