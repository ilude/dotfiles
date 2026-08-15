/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * The active subagent tool supports single and parallel modes. Deferred tools
 * provide dependent chains, saved-session continuation, and the read-only
 * fan-out experiment. The shared executor retains legacy advanced arguments
 * for resumed sessions.
 *
 * Uses JSON mode to capture structured output from subagents.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { StringEnum, type Message } from "@earendil-works/pi-ai";
import {
	defineTool,
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
	getMarkdownTheme,
	truncateTail,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { type TSchema, Type } from "typebox";
import { emitTerminalBell } from "../../lib/extension-utils.js";
import { getPiInvocation } from "../../lib/pi-invocation.js";
import { recordEvent } from "../../lib/metrics.js";
import { signalProcessTree } from "../../lib/process-tree.js";
import { deactivateTools } from "../../lib/tool-activation.js";
import {
	decodeSchemaOutput,
	schemaOutputInstruction,
} from "../../lib/typed-agent.js";
import {
	type ModelPolicy,
	type ModelSize,
	type RoutingOutcomeAssignment,
	resolveSampledDynamicModelFromRegistry,
} from "../../lib/model-routing.js";
import { TimingSpan } from "../../lib/observability.js";
import {
	assignReadOnlyFanoutExperiment,
	buildOrchestrationExperimentAssignmentEvent,
	buildOrchestrationExperimentOutcomeEvent,
	buildOrchestrationRunEvent,
	type OrchestrationWorker,
	type ReadOnlyFanoutAssignment,
} from "../../lib/orchestration-telemetry.js";
import {
	getTask,
	type NormalizedTaskUsage,
	normalizeTaskUsage,
	resolveTaskWorkspace,
} from "../../lib/task-registry.js";
import { registerOrchestrationInvocation } from "../../lib/workflow-friction.js";
import {
	formatTraceparent,
	getTraceId,
	newSpanId,
	newTraceId,
} from "../transcript-runtime.js";
import {
	type AgentConfig,
	type AgentDiscoveryResult,
	type AgentEffort,
	type AgentScope,
	discoverAgents,
	resolveAgentSkillPaths,
} from "./agents.js";
import {
	subagentRunManager,
	type SubagentRunMode,
	type SubagentRunUsage,
} from "./run-manager.js";
import {
	assertDisjointScopes,
	decodeScopePolicyEnvironment,
	directMutationViolation,
	DIRECT_FILE_MUTATION_TOOLS,
	encodeScopePolicyEnvironment,
	normalizeRepositoryScopes,
	toolsForScopedModifier,
} from "./scope-policy.js";
import {
	getSubagentTreeBroker,
	SubagentTreeClient,
	treeClientFromEnvironment,
	type SubagentTreePermit,
} from "./tree-runtime.js";
import {
	getSubagentWorkflowRuntime,
	WorkflowSpecificationSchema,
	type WorkflowExecutionRequest,
	type WorkflowInput,
	type WorkflowReductionRequest,
	type WorkflowResultEnvelope,
	type WorkflowSpecification,
} from "./workflow-runtime.js";
import {
	formatSubagentActivityStatus,
	openSubagentDashboard,
} from "./ui.js";

/**
 * Build a W3C `TRACEPARENT` value for a child subagent process. The parent
 * span id is freshly generated for each subagent invocation so parallel
 * children do not share spans. When the parent has no active trace (tracing
 * disabled), a new trace id is fabricated so a child that opts in still
 * records consistent W3C-shaped ids on its own side.
 */
function buildSubagentTraceparent(): string {
	const parentTraceId = getTraceId() || newTraceId();
	return formatTraceparent(parentTraceId, newSpanId());
}

export const MAX_SUBAGENT_WORKERS_PER_WAVE = 8;
export const MAX_READ_ONLY_FANOUT_TASKS = 8;
export const MAX_SUBAGENT_TURNS = 64;
export const READ_ONLY_SUBAGENT_TIMEOUT_MS = 8 * 60 * 1000;
const COLLAPSED_ITEM_COUNT = 10;
const STRUCTURED_CHAIN_ARTIFACT_BYTES = 8_000;
const DELEGATED_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const BACKGROUND_RESULT_MAX_BYTES = 48 * 1024;
const BACKGROUND_RESULT_MAX_LINES = 1000;
export const SUBAGENT_TERMINATION_GRACE_MS = 5_000;
export const SUBAGENT_TERMINATION_DEADLINE_MS = 10_000;
const READ_ONLY_EXPERIMENT_TOOLS = new Set([
	"read",
	"grep",
	"find",
	"ls",
	"bash",
]);
const READ_ONLY_EXPERIMENT_INSTRUCTION =
	"This is a read-only experiment. Do not edit files or run mutating commands.";

function getDelegatedSessionDir(): string {
	return path.join(getAgentDir(), "sessions", "subagents");
}

export async function compressDelegatedSessions(
	options: { dir?: string; now?: number; dryRun?: boolean } = {},
): Promise<string[]> {
	const dir = options.dir ?? getDelegatedSessionDir();
	const cutoff = (options.now ?? Date.now()) - DELEGATED_SESSION_MAX_AGE_MS;
	let entries: fs.Dirent[];
	try {
		entries = await fs.promises.readdir(dir, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const candidates: string[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
		const source = path.join(dir, entry.name);
		const stat = await fs.promises.stat(source);
		if (stat.mtimeMs >= cutoff) continue;
		candidates.push(source);
		if (options.dryRun) continue;
		const target = `${source}.gz`;
		const temp = `${target}.${process.pid}.tmp`;
		const compressed = zlib.gzipSync(await fs.promises.readFile(source));
		await fs.promises.writeFile(temp, compressed, { mode: 0o600 });
		await fs.promises.rename(temp, target);
		await fs.promises.unlink(source);
	}
	return candidates;
}

async function ensureDelegatedSessionReadable(
	sessionPath: string,
): Promise<string> {
	const source = sessionPath.endsWith(".gz")
		? sessionPath
		: `${sessionPath}.gz`;
	const target = sessionPath.endsWith(".gz")
		? sessionPath.slice(0, -3)
		: sessionPath;
	if (fs.existsSync(target)) return target;
	if (!fs.existsSync(source))
		throw new Error(`Subagent session not found: ${sessionPath}`);
	const temp = `${target}.${process.pid}.tmp`;
	const content = zlib.gunzipSync(await fs.promises.readFile(source));
	await fs.promises.writeFile(temp, content, { mode: 0o600 });
	await fs.promises.rename(temp, target);
	await fs.promises.unlink(source);
	return target;
}

function findDelegatedSession(
	sessionDir: string,
	sessionId: string,
): string | undefined {
	try {
		const suffix = `_${sessionId}.jsonl`;
		const name = fs
			.readdirSync(sessionDir)
			.find((entry) => entry.endsWith(suffix));
		return name ? path.join(sessionDir, name) : undefined;
	} catch {
		return undefined;
	}
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number | null;
		contextPeakTokens?: number;
		turns?: number;
	},
	model?: string,
): string {
	const parts: string[] = [];
	if (usage.turns)
		parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost !== null) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextPeakTokens && usage.contextPeakTokens > 0) {
		parts.push(`ctx:${formatTokens(usage.contextPeakTokens)}`);
	}
	if (model) parts.push(model);
	return parts.join(" ");
}

function formatModelEffort(
	model: string | undefined,
	effort: AgentConfig["effort"] | "default" | undefined,
): string {
	return `${model ?? "default"}[${effort ?? "default"}]`;
}

function formatAgentExecutionLabel(
	r: Pick<SingleResult, "model" | "effort">,
	themeFg: (color: "muted", text: string) => string,
): string {
	return themeFg("muted", ` ${formatModelEffort(r.model, r.effort)}`);
}

type ToolCallColor = "accent" | "dim" | "muted" | "toolOutput" | "warning";

function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: ToolCallColor, text: string) => string,
): string {
	const shortenPath = (p: string) => {
		const home = os.homedir();
		return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
	};

	switch (toolName) {
		case "bash": {
			const command = (args.command as string) || "...";
			const snippet =
				command.length > 60 ? `${command.slice(0, 60)}...` : command;
			return themeFg("muted", "$ ") + themeFg("toolOutput", snippet);
		}
		case "read": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const offset = args.offset as number | undefined;
			const limit = args.limit as number | undefined;
			let text = themeFg("accent", filePath);
			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : "";
				text += themeFg(
					"warning",
					`:${startLine}${endLine ? `-${endLine}` : ""}`,
				);
			}
			return themeFg("muted", "read ") + text;
		}
		case "write": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const content = (args.content || "") as string;
			const lines = content.split("\n").length;
			let text = themeFg("muted", "write ") + themeFg("accent", filePath);
			if (lines > 1) text += themeFg("dim", ` (${lines} lines)`);
			return text;
		}
		case "edit": {
			const rawPath = (args.file_path || args.path || "...") as string;
			return (
				themeFg("muted", "edit ") + themeFg("accent", shortenPath(rawPath))
			);
		}
		case "ls": {
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "ls ") + themeFg("accent", shortenPath(rawPath));
		}
		case "find": {
			const pattern = (args.pattern || "*") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", "find ") +
				themeFg("accent", pattern) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		case "grep": {
			const pattern = (args.pattern || "") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", "grep ") +
				themeFg("accent", `/${pattern}/`) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		default: {
			const argsStr = JSON.stringify(args);
			const snippet =
				argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
			return themeFg("accent", toolName) + themeFg("dim", ` ${snippet}`);
		}
	}
}

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number | null;
	contextPeakTokens: number;
	turns: number;
}

function taskUsageSnapshot(usage: UsageStats): NormalizedTaskUsage {
	return normalizeTaskUsage({
		inputTokens: usage.input,
		outputTokens: usage.output,
		totalTokens: usage.contextPeakTokens || usage.input + usage.output,
		cacheCreationInputTokens: usage.cacheWrite,
		cacheReadInputTokens: usage.cacheRead,
		contextPeakTokens: usage.contextPeakTokens,
		turns: usage.turns,
		costUsd: usage.cost,
	});
}

function runUsageSnapshot(usage: UsageStats): SubagentRunUsage {
	return {
		input: usage.input,
		output: usage.output,
		cacheRead: usage.cacheRead,
		cacheWrite: usage.cacheWrite,
		contextPeakTokens: usage.contextPeakTokens,
		turns: usage.turns,
		cost: usage.cost,
	};
}

type OutputMode = "inline" | "file-only";

interface SavedOutputReference {
	path: string;
	bytes: number;
	lines: number;
	message: string;
}

export interface SingleResult {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	effort?: AgentConfig["effort"] | "default";
	stopReason?: string;
	errorMessage?: string;
	step?: number;
	outputMode?: OutputMode;
	outputPath?: string;
	outputReference?: SavedOutputReference;
	saveError?: string;
	runId?: string;
	taskId?: string;
	durationMs?: number;
	sessionPath?: string;
	structuredOutput?: unknown;
	outputAttempts?: number;
	routingExperiment?: RoutingOutcomeAssignment;
	treeId?: string;
	parentRunId?: string;
	depth?: number;
	role?: SubagentRole;
	workflowPhase?: "map" | "retry" | "verify" | "reduce";
	taskKey?: string;
	attempt?: number;
	retryOrigin?: string;
	coordinatorTaskId?: string;
}

export interface SubagentDetails {
	mode: "single" | "parallel" | "chain";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	results: SingleResult[];
	experiment?: ReadOnlyFanoutAssignment;
}

export function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

function eventResultText(value: unknown): string {
	if (!value || typeof value !== "object") return "";
	const content = (value as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((item) =>
			item &&
			typeof item === "object" &&
			(item as { type?: unknown }).type === "text" &&
			typeof (item as { text?: unknown }).text === "string"
				? [(item as { text: string }).text]
				: [],
		)
		.join("\n");
}

function getResultOutput(result: SingleResult, pretty = false): string {
	if (
		result.outputAttempts === undefined ||
		result.structuredOutput === undefined
	)
		return getFinalOutput(result.messages);
	return JSON.stringify(result.structuredOutput, null, pretty ? 2 : undefined);
}

function structuredOutputIsBulky(result: SingleResult): boolean {
	return (
		result.outputAttempts !== undefined &&
		Buffer.byteLength(getResultOutput(result), "utf-8") >
			STRUCTURED_CHAIN_ARTIFACT_BYTES
	);
}

function mergeCorrectionResult(
	result: SingleResult,
	correction: SingleResult,
): void {
	result.messages.push(...correction.messages);
	result.exitCode = correction.exitCode;
	result.stderr = [result.stderr, correction.stderr].filter(Boolean).join("\n");
	result.usage.input += correction.usage.input;
	result.usage.output += correction.usage.output;
	result.usage.cacheRead += correction.usage.cacheRead;
	result.usage.cacheWrite += correction.usage.cacheWrite;
	result.usage.cost =
		result.usage.cost === null && correction.usage.cost === null
			? null
			: (result.usage.cost ?? 0) + (correction.usage.cost ?? 0);
	result.usage.contextPeakTokens = Math.max(
		result.usage.contextPeakTokens,
		correction.usage.contextPeakTokens,
	);
	result.usage.turns += correction.usage.turns;
	result.model = correction.model ?? result.model;
	result.stopReason = correction.stopReason;
	result.errorMessage = correction.errorMessage;
	result.durationMs = (result.durationMs ?? 0) + (correction.durationMs ?? 0);
}

function countLines(text: string): number {
	if (!text) return 0;
	const newlineMatches = text.match(/\r\n|\r|\n/g);
	return (newlineMatches?.length ?? 0) + (/[\r\n]$/.test(text) ? 0 : 1);
}

function formatByteSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatSavedOutputReference(
	savedPath: string,
	fullOutput: string,
): SavedOutputReference {
	const absolutePath = path.resolve(savedPath);
	const bytes = Buffer.byteLength(fullOutput, "utf-8");
	const lines = countLines(fullOutput);
	return {
		path: absolutePath,
		bytes,
		lines,
		message: `Output saved to: ${absolutePath} (${formatByteSize(bytes)}, ${lines} ${lines === 1 ? "line" : "lines"}). Read this file if needed.`,
	};
}

function getDefaultArtifactPath(agent: string, index: number): string {
	const dir = path.join(os.tmpdir(), "pi-subagent-artifacts");
	const safeAgent = agent.replace(/[^\w.-]+/g, "_") || "agent";
	return path.join(
		dir,
		`${Date.now()}_${process.pid}_${index + 1}_${safeAgent}_output.md`,
	);
}

function resolveOutputPath(
	output: string | boolean | undefined,
	defaultCwd: string,
	requestedCwd: string | undefined,
	agent: string,
	index: number,
): string | undefined {
	// Some providers/tool-call layers have been observed to coerce JSON boolean
	// false into the string "false". Treat both as the documented sentinel for
	// disabling saved artifacts so reviewer panels never create repo-root files
	// named "false".
	if (output === false || output === "false") return undefined;
	if (typeof output === "string" && output.length > 0) {
		if (path.isAbsolute(output)) return output;
		const baseCwd = requestedCwd
			? path.isAbsolute(requestedCwd)
				? requestedCwd
				: path.resolve(defaultCwd, requestedCwd)
			: defaultCwd;
		return path.resolve(baseCwd, output);
	}
	return getDefaultArtifactPath(agent, index);
}

function saveOutputArtifact(
	outputPath: string,
	fullOutput: string,
): { reference?: SavedOutputReference; error?: string } {
	try {
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, fullOutput, {
			encoding: "utf-8",
			mode: 0o600,
		});
		return { reference: formatSavedOutputReference(outputPath, fullOutput) };
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) };
	}
}

function finalizeOutput(
	result: SingleResult,
	output: string | boolean | undefined,
	outputMode: OutputMode | undefined,
	defaultCwd: string,
	requestedCwd: string | undefined,
	index: number,
	saveByDefault: boolean,
): SingleResult {
	result.outputMode = outputMode ?? "inline";
	const shouldSave =
		saveByDefault || output !== undefined || result.outputMode === "file-only";
	result.outputPath = shouldSave
		? resolveOutputPath(output, defaultCwd, requestedCwd, result.agent, index)
		: undefined;
	if (
		result.outputPath &&
		result.exitCode === 0 &&
		result.stopReason !== "error"
	) {
		const saved = saveOutputArtifact(
			result.outputPath,
			getResultOutput(result, result.outputAttempts !== undefined),
		);
		result.outputReference = saved.reference;
		result.saveError = saved.error;
	}
	return result;
}

function getArtifactFallbackMessage(result: SingleResult): string | undefined {
	if (result.saveError && result.outputPath) {
		return `Output file error: ${result.outputPath}\n${result.saveError}`;
	}
	if (result.outputPath === undefined) {
		return "Output artifact disabled by output: false. Returning child output inline.";
	}
	return undefined;
}

function getOutputForParent(result: SingleResult): string {
	const output = getResultOutput(result);
	let visible = output;
	if (result.outputMode === "file-only") {
		if (result.outputReference) visible = result.outputReference.message;
		else {
			const fallbackMessage = getArtifactFallbackMessage(result);
			visible = fallbackMessage
				? `${output}\n\n${fallbackMessage}`.trim()
				: output;
		}
	}
	return result.sessionPath
		? `${visible}\n\nContinuable session: ${result.sessionPath}`.trim()
		: visible;
}

export function aggregateParallelOutputs(results: SingleResult[]): string {
	return results
		.map((r, i) => {
			const header = `=== Parallel Task ${i + 1} (${r.agent}) ===`;
			const output = getResultOutput(r);
			const hasOutput = Boolean(output.trim());
			const isModelError = r.stopReason === "error" || Boolean(r.errorMessage);
			const status =
				r.exitCode !== 0 || isModelError
					? `FAILED (${isModelError ? "model error" : `exit code ${r.exitCode}`})${r.errorMessage ? `: ${r.errorMessage}` : ""}`
					: !hasOutput
						? "EMPTY OUTPUT (no textual response returned)"
						: "";
			let body = status
				? hasOutput
					? `${status}\n${output}`
					: status
				: output;
			if (r.outputReference) {
				body =
					r.outputMode === "file-only"
						? r.outputReference.message
						: `${body}\n\n${r.outputReference.message}`;
			} else if (r.outputMode === "file-only" || r.saveError) {
				const fallbackMessage = getArtifactFallbackMessage(r);
				if (fallbackMessage) body = `${body}\n\n${fallbackMessage}`;
			}
			if (r.sessionPath)
				body = `${body}\n\nContinuable session: ${r.sessionPath}`;
			return `${header}\n${body}`;
		})
		.join("\n\n");
}

type DisplayItem =
	| { type: "text"; text: string }
	| { type: "toolCall"; name: string; args: Record<string, unknown> };

function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const msg of messages) {
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") items.push({ type: "text", text: part.text });
				else if (part.type === "toolCall")
					items.push({
						type: "toolCall",
						name: part.name,
						args: part.arguments,
					});
			}
		}
	}
	return items;
}

async function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current], current);
		}
	});
	await Promise.all(workers);
	return results;
}

async function writePromptToTempFile(
	agentName: string,
	prompt: string,
): Promise<{ dir: string; filePath: string }> {
	const tmpDir = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), "pi-subagent-"),
	);
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	await withFileMutationQueue(filePath, async () => {
		await fs.promises.writeFile(filePath, prompt, {
			encoding: "utf-8",
			mode: 0o600,
		});
	});
	return { dir: tmpDir, filePath };
}

export const subagentTestApi = { getPiInvocation };

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

function extractPlanPath(task: string): string | undefined {
	const match = task.match(/(\.specs\/[A-Za-z0-9._/-]+\/plan\.md)/);
	return match?.[1];
}

function inferWorkflow(task: string): string | undefined {
	const normalized = task.toLowerCase();
	if (
		normalized.includes("/review-it") ||
		(normalized.includes("review") && normalized.includes("plan.md"))
	) {
		return "review-it";
	}
	if (
		normalized.includes("/plan-it") ||
		normalized.includes("plan crystallizer")
	)
		return "plan-it";
	if (normalized.includes("/do-it") || normalized.includes("execute plan file"))
		return "do-it";
	if (normalized.includes("/commit") || normalized.includes("commit workflow"))
		return "commit";
	return undefined;
}

export type SubagentRole = "coordinator" | "leaf";

interface SubagentRunContext {
	owner?: "direct" | "task";
	orchestrationId?: string;
	mode?: SubagentRunMode;
	background?: boolean;
	readOnly?: boolean;
	maxTurns?: number;
	timeoutMs?: number;
	role?: SubagentRole;
	depth?: number;
	parentRunId?: string;
	treeId?: string;
	repositoryRoot?: string;
	scopes?: string[];
	coordinatorTaskId?: string;
	workflowPhase?: "map" | "retry" | "verify" | "reduce";
	taskKey?: string;
	attempt?: number;
	retryOrigin?: string;
	treeClient?: SubagentTreeClient;
}

type CurrentSubagentRole = "root" | SubagentRole;

interface SubagentExecutionIdentity {
	role: CurrentSubagentRole;
	depth: number;
	runId?: string;
	treeId?: string;
	coordinatorTaskId?: string;
}

const DELEGATION_AND_WORKFLOW_TOOLS = new Set([
	"subagent",
	"subagent_chain",
	"subagent_continue",
	"subagent_fanout",
	"subagent_workflow",
]);

type WorkflowPhase = "map" | "retry" | "verify" | "reduce";

interface InternalWorkflowRunContext {
	workflowPhase: WorkflowPhase;
	taskKey: string;
	attempt: number;
	retryOrigin?: string;
	modifying: boolean;
}

const internalWorkflowRuns = new Map<string, InternalWorkflowRunContext>();

function currentSubagentIdentity(): SubagentExecutionIdentity {
	const treeRunId = process.env.PI_SUBAGENT_TREE_RUN_ID?.trim() || undefined;
	const legacyRunId = process.env.PI_SUBAGENT_RUN_ID?.trim() || undefined;
	const runId = treeRunId ?? legacyRunId;
	if (!runId) return { role: "root", depth: 0 };
	const configuredRole = treeRunId
		? process.env.PI_SUBAGENT_TREE_ROLE
		: process.env.PI_SUBAGENT_ROLE;
	const configuredDepth = treeRunId
		? process.env.PI_SUBAGENT_TREE_DEPTH
		: process.env.PI_SUBAGENT_DEPTH;
	if (!treeRunId && !configuredRole && !configuredDepth)
		return { role: "leaf", depth: 1, runId };
	if (configuredRole !== "coordinator" && configuredRole !== "leaf")
		throw new Error("Nested subagent process is missing a valid role.");
	const depth = Number.parseInt(configuredDepth ?? "", 10);
	if (!Number.isInteger(depth) || depth < 1 || depth > 2)
		throw new Error("Nested subagent process has an invalid depth.");
	return {
		role: configuredRole,
		depth,
		runId,
		treeId: process.env.PI_SUBAGENT_TREE_ID?.trim() || undefined,
		coordinatorTaskId:
			process.env.PI_SUBAGENT_COORDINATOR_TASK_ID?.trim() || undefined,
	};
}

function resolveChildRole(
	requestedRole: SubagentRole | undefined,
	agentName: string,
): { role: SubagentRole; depth: number } {
	const current = currentSubagentIdentity();
	if (current.role === "leaf" || current.depth >= 2)
		throw new Error("Leaf and depth-two subagents cannot delegate.");
	const role =
		requestedRole ??
		(current.role === "root" && agentName === "orchestrator"
			? "coordinator"
			: "leaf");
	if (current.role === "coordinator" && role !== "leaf")
		throw new Error("A coordinator may invoke leaf workers only.");
	const depth = current.depth + 1;
	if (role === "coordinator" && depth !== 1)
		throw new Error("A coordinator may run only at depth one.");
	return { role, depth };
}

function agentCanModify(agent: AgentConfig | undefined): boolean {
	return Boolean(
		agent?.tools?.some((tool) => DIRECT_FILE_MUTATION_TOOLS.has(tool)),
	);
}

function childTools(
	agent: AgentConfig,
	role: SubagentRole,
	hasScopeLease: boolean,
): string[] | undefined {
	let tools = agent.tools ? [...agent.tools] : undefined;
	if (role === "coordinator") {
		tools = (tools ?? ["read", "grep", "find", "ls", "subagent"]).filter(
			(tool) => !DIRECT_FILE_MUTATION_TOOLS.has(tool),
		);
	}
	if (role === "leaf") {
		tools = (tools ?? ["read", "bash"]).filter(
			(tool) => !DELEGATION_AND_WORKFLOW_TOOLS.has(tool),
		);
	}
	if (hasScopeLease)
		tools = toolsForScopedModifier(tools ?? ["read", "edit", "write"]);
	return tools;
}

export class SubagentAbortError extends Error {
	constructor() {
		super("Subagent was aborted");
		this.name = "SubagentAbortError";
	}
}

export async function runSingleAgent(
	defaultCwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	cwd: string | undefined,
	step: number | undefined,
	signal: AbortSignal | undefined,
	onUpdate: OnUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	modelOverride: string | undefined,
	modelSizeHint: ModelSize | undefined,
	modelPolicyHint: ModelPolicy | undefined,
	effortOverride: AgentEffort | undefined,
	existingTaskId?: string,
	executionAttemptRunId?: string,
	sessionOptions?: { continuable?: boolean; sessionPath?: string },
	runContext?: SubagentRunContext,
): Promise<SingleResult> {
	const runStartedAt = Date.now();
	const turnLimit = runContext?.maxTurns ?? MAX_SUBAGENT_TURNS;
	const readOnlyTimeoutMs =
		runContext?.timeoutMs ?? READ_ONLY_SUBAGENT_TIMEOUT_MS;
	const agent = agents.find((a) => a.name === agentName);

	if (!agent) {
		const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
		return {
			agent: agentName,
			agentSource: "unknown",
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				cost: null,
				contextPeakTokens: 0,
				turns: 0,
			},
			step,
			runId: executionAttemptRunId ?? randomUUID(),
			durationMs: Date.now() - runStartedAt,
		};
	}

	const resolvedChild =
		runContext?.role && runContext.depth
			? { role: runContext.role, depth: runContext.depth }
			: resolveChildRole(runContext?.role, agentName);
	const normalizedScopes = normalizeRepositoryScopes(
		runContext?.scopes ?? [],
		runContext?.repositoryRoot ?? defaultCwd,
	);
	const args: string[] = ["--mode", "json", "-p", "--no-skills"];
	if (modelOverride) args.push("--model", modelOverride);
	else if (agent.model) args.push("--model", agent.model);
	const effectiveEffort = effortOverride ?? agent.effort;
	if (effectiveEffort) args.push("--thinking", effectiveEffort);
	if (runContext?.readOnly) {
		const tools = (agent.tools ?? ["read", "bash"])
			.filter((tool) => READ_ONLY_EXPERIMENT_TOOLS.has(tool))
			.filter((tool) => !DELEGATION_AND_WORKFLOW_TOOLS.has(tool));
		args.push("--tools", (tools.length > 0 ? tools : ["read"]).join(","));
	} else {
		const tools = childTools(
			agent,
			resolvedChild.role,
			normalizedScopes.length > 0,
		);
		if (tools && tools.length > 0) args.push("--tools", tools.join(","));
	}
	for (const skillPath of resolveAgentSkillPaths(agent))
		args.push("--skill", skillPath);

	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;

	const taskId = existingTaskId;
	const runId = executionAttemptRunId ?? randomUUID();
	const currentResult: SingleResult = {
		agent: agentName,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: null,
			contextPeakTokens: 0,
			turns: 0,
		},
		model: modelOverride || agent.model,
		effort: effectiveEffort ?? "default",
		step,
		runId,
		...(taskId ? { taskId } : {}),
	};

	const emitUpdate = () => {
		subagentRunManager.update(runId, {
			model: currentResult.model,
			exitCode: currentResult.exitCode,
			stopReason: currentResult.stopReason,
			errorMessage: currentResult.errorMessage,
			sessionPath: currentResult.sessionPath,
			usage: runUsageSnapshot(currentResult.usage),
			finalText: getFinalOutput(currentResult.messages),
		});
		if (onUpdate) {
			onUpdate({
				content: [
					{
						type: "text",
						text: getFinalOutput(currentResult.messages) || "(running...)",
					},
				],
				details: makeDetails([currentResult]),
			});
		}
	};
	const continuable = sessionOptions?.continuable === true;
	const delegatedSessionDir = getDelegatedSessionDir();
	let resumedSessionPath: string | undefined;
	if (sessionOptions?.sessionPath) {
		resumedSessionPath = await ensureDelegatedSessionReadable(
			sessionOptions.sessionPath,
		);
		args.push(
			"--session-dir",
			path.dirname(resumedSessionPath),
			"--session",
			resumedSessionPath,
		);
	} else if (continuable) {
		await fs.promises.mkdir(delegatedSessionDir, { recursive: true });
		args.push("--session-dir", delegatedSessionDir, "--session-id", runId);
	} else {
		args.push("--no-session");
	}
	const runController = new AbortController();
	let treePermit: SubagentTreePermit | undefined;
	let removeTreeCancelListener: (() => void) | undefined;
	const forwardAbort = () => runController.abort(signal?.reason);
	if (signal?.aborted) forwardAbort();
	else signal?.addEventListener("abort", forwardAbort, { once: true });
	subagentRunManager.begin(
		{
			runId,
			...(taskId ? { taskId } : {}),
			...(runContext?.orchestrationId
				? { orchestrationId: runContext.orchestrationId }
				: {}),
			...(runContext?.treeClient?.parent.treeId || runContext?.treeId
				? {
						treeId:
							runContext?.treeClient?.parent.treeId ?? runContext?.treeId,
					}
				: {}),
			...(runContext?.treeClient?.parent.runId || runContext?.parentRunId
				? {
						parentRunId:
							runContext?.treeClient?.parent.runId ??
							runContext?.parentRunId,
					}
				: {}),
			role: resolvedChild.role,
			depth: resolvedChild.depth,
			...(runContext?.coordinatorTaskId
				? { coordinatorTaskId: runContext.coordinatorTaskId }
				: {}),
			...(runContext?.workflowPhase
				? { workflowPhase: runContext.workflowPhase }
				: {}),
			...(runContext?.taskKey ? { taskKey: runContext.taskKey } : {}),
			...(runContext?.attempt ? { attempt: runContext.attempt } : {}),
			...(runContext?.retryOrigin
				? { retryOrigin: runContext.retryOrigin }
				: {}),
			owner: runContext?.owner ?? (taskId ? "task" : "direct"),
			mode: runContext?.mode ?? (taskId ? "task-execute" : "single"),
			agent: agentName,
			task,
			cwd: cwd ?? defaultCwd,
			model: currentResult.model,
			effort: currentResult.effort,
			background: runContext?.background,
		},
		runController,
	);
	const planPath = extractPlanPath(task);
	const workflow = inferWorkflow(task);
	const timingSpan = new TimingSpan({
		name: "subagent.run",
		category: "subagent",
		metadata: {
			agent: agentName,
			agentSource: agent.source,
			step,
			modelSize: modelSizeHint,
			modelPolicy: modelPolicyHint,
			resolvedModel: modelOverride || agent.model,
			effort: effectiveEffort ?? "default",
			workflow,
			phase: step ? "chain-step" : "run",
			planPath,
			reviewer: workflow === "review-it" ? agentName : undefined,
		},
	});
	let timingFinished = false;
	let wasAborted = false;
	let budgetLimitReason: string | undefined;

	try {
		if (runController.signal.aborted) throw new SubagentAbortError();
		if (runContext?.treeClient) {
			try {
				treePermit = await runContext.treeClient.acquire(
					{
						runId,
						role: resolvedChild.role,
						depth: resolvedChild.depth,
						coordinatorTaskId: runContext.coordinatorTaskId,
						workflowPhase: runContext.workflowPhase,
						taskKey: runContext.taskKey,
						attempt: runContext.attempt,
						retryOrigin: runContext.retryOrigin,
						...(normalizedScopes.length > 0
							? {
									scopeLease: {
										repositoryRoot:
											runContext.repositoryRoot ?? defaultCwd,
										scopes: normalizedScopes,
									},
								}
							: {}),
					},
					runController.signal,
				);
			} catch (error) {
				if (runController.signal.aborted) throw new SubagentAbortError();
				throw error;
			}
			const cancelTree = () => {
				void runContext.treeClient?.cancel(runId).catch(() => []);
			};
			runController.signal.addEventListener("abort", cancelTree, {
				once: true,
			});
			removeTreeCancelListener = () =>
				runController.signal.removeEventListener("abort", cancelTree);
			Object.assign(currentResult, {
				treeId: treePermit.metadata.treeId,
				parentRunId: treePermit.metadata.parentRunId,
				depth: treePermit.metadata.depth,
				role: treePermit.metadata.role,
				workflowPhase: treePermit.metadata.workflowPhase,
				taskKey: treePermit.metadata.taskKey,
				attempt: treePermit.metadata.attempt,
				retryOrigin: treePermit.metadata.retryOrigin,
				coordinatorTaskId: treePermit.metadata.coordinatorTaskId,
			});
		}
		if (agent.systemPrompt.trim()) {
			const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
			args.push("--append-system-prompt", tmpPromptPath);
		}
		if (runController.signal.aborted) throw new SubagentAbortError();

		args.push(
			`Task: ${runContext?.readOnly ? `${READ_ONLY_EXPERIMENT_INSTRUCTION}\n\n${task}` : task}`,
		);
		let unparsedStdout = "";

		const subagentStartedAt = new Date().toISOString();
		const exitCode = await new Promise<number>((resolve) => {
			let resolved = false;
			let agentEnded = false;
			let terminationRequested = false;
			let terminationError: string | undefined;
			let turnBudgetReached = false;
			let graceTimer: ReturnType<typeof setTimeout> | undefined;
			let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
			let readOnlyTimeoutTimer: ReturnType<typeof setTimeout> | undefined;
			let proc: ReturnType<typeof spawn> | undefined;
			let removeAbortListener: (() => void) | undefined;
			let stopForBudget: (reason: string) => void = () => {};
			const clearTerminationTimers = () => {
				if (graceTimer) clearTimeout(graceTimer);
				if (deadlineTimer) clearTimeout(deadlineTimer);
				if (readOnlyTimeoutTimer) clearTimeout(readOnlyTimeoutTimer);
			};
			const finish = (code: number) => {
				if (resolved) return;
				resolved = true;
				clearTerminationTimers();
				removeAbortListener?.();
				resolve(code);
			};
			const invocation = getPiInvocation(args);
			// W3C Trace Context propagation: inject TRACEPARENT so the spawned
			// child Pi process carries the parent's trace and treats this
			// subagent's span as its parent. Spread process.env first so all
			// existing env vars (PATH, HOME, OAUTH tokens, etc.) are preserved.
			const childEnv = {
				...process.env,
				TRACEPARENT: buildSubagentTraceparent(),
				PI_SUBAGENT_RUN_ID: runId,
				PI_SUBAGENT_STARTED_AT: subagentStartedAt,
				PI_SUBAGENT_ROLE: resolvedChild.role,
				PI_SUBAGENT_DEPTH: String(resolvedChild.depth),
				...(runContext?.treeId
					? { PI_SUBAGENT_TREE_ID: runContext.treeId }
					: {}),
				...(runContext?.parentRunId
					? { PI_SUBAGENT_PARENT_RUN_ID: runContext.parentRunId }
					: {}),
				...(runContext?.coordinatorTaskId
					? {
							PI_SUBAGENT_COORDINATOR_TASK_ID:
								runContext.coordinatorTaskId,
						}
					: {}),
				...(normalizedScopes.length > 0
					? {
							PI_SUBAGENT_SCOPE_POLICY: encodeScopePolicyEnvironment({
								repositoryRoot:
									runContext?.repositoryRoot ?? defaultCwd,
								scopes: normalizedScopes,
							}),
						}
					: {}),
				...(runContext?.treeClient && treePermit
					? runContext.treeClient.childEnvironment(treePermit)
					: {}),
			};
			proc = spawn(invocation.command, invocation.args, {
				cwd: cwd ?? defaultCwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: childEnv,
				windowsHide: true,
				detached: process.platform !== "win32",
			});
			if (treePermit && proc.pid) {
				void treePermit
					.registerProcess({ pid: proc.pid })
					.catch((error: unknown) => runController.abort(error));
			}
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: {
					type?: string;
					message?: Message;
					messages?: Message[];
					toolCallId?: string;
					toolName?: string;
					args?: unknown;
					partialResult?: unknown;
					result?: unknown;
					assistantMessageEvent?: {
						type?: string;
						delta?: string;
					};
				};
				try {
					event = JSON.parse(line) as typeof event;
				} catch {
					unparsedStdout += `${line}\n`;
					return;
				}

				if (
					event.type === "message_update" &&
					typeof event.assistantMessageEvent?.delta === "string" &&
					(event.assistantMessageEvent.type === "text_delta" ||
						event.assistantMessageEvent.type === "thinking_delta")
				) {
					subagentRunManager.appendLiveText(
						runId,
						event.assistantMessageEvent.delta,
					);
				}

				if (event.type === "tool_execution_start" && event.toolCallId) {
					subagentRunManager.startTool(runId, {
						id: event.toolCallId,
						name: event.toolName ?? "tool",
						input:
							event.args === undefined ? undefined : JSON.stringify(event.args),
					});
				}

				if (event.type === "tool_execution_update" && event.toolCallId) {
					subagentRunManager.updateTool(
						runId,
						event.toolCallId,
						eventResultText(event.partialResult),
					);
				}

				if (event.type === "tool_execution_end" && event.toolCallId) {
					subagentRunManager.endTool(runId, event.toolCallId);
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					currentResult.messages.push(msg);
					subagentRunManager.appendMessage(runId, msg);

					if (msg.role === "assistant") {
						currentResult.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							currentResult.usage.input += usage.input ?? 0;
							currentResult.usage.output += usage.output ?? 0;
							currentResult.usage.cacheRead += usage.cacheRead ?? 0;
							currentResult.usage.cacheWrite += usage.cacheWrite ?? 0;
							if (typeof usage.cost?.total === "number") {
								currentResult.usage.cost =
									(currentResult.usage.cost ?? 0) + usage.cost.total;
							}
							currentResult.usage.contextPeakTokens = Math.max(
								currentResult.usage.contextPeakTokens,
								usage.totalTokens ?? 0,
							);
						}
						if (!currentResult.model && msg.model)
							currentResult.model = msg.model;
						if (msg.stopReason) currentResult.stopReason = msg.stopReason;
						if (msg.errorMessage) currentResult.errorMessage = msg.errorMessage;
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					const message = event.message as Message;
					currentResult.messages.push(message);
					subagentRunManager.appendMessage(runId, message);
					emitUpdate();
				}

				if (
					event.type === "turn_end" &&
					currentResult.usage.turns >= turnLimit
				) {
					turnBudgetReached = true;
					if (currentResult.stopReason === "toolUse") {
						stopForBudget(
							`Subagent stopped after the ${turnLimit}-turn budget; output may be partial.`,
						);
					}
				}
				if (event.type === "turn_start" && turnBudgetReached) {
					stopForBudget(
						`Subagent stopped after the ${turnLimit}-turn budget; output may be partial.`,
					);
				}

				if (event.type === "agent_end") {
					if (
						Array.isArray(event.messages) &&
						currentResult.messages.length === 0
					) {
						currentResult.messages = event.messages as Message[];
						for (const message of currentResult.messages)
							subagentRunManager.appendMessage(runId, message);
						emitUpdate();
					}
					agentEnded = true;
					requestTermination();
				}
			};

			proc.stdout?.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr?.on("data", (data) => {
				currentResult.stderr += data.toString();
			});

			const reportTerminationError = (phase: "graceful" | "forced", error: unknown) => {
				if (terminationError) return;
				const detail = error instanceof Error ? error.message : String(error);
				terminationError = `${phase} process-tree termination failed: ${detail}`;
			};
			const forceTermination = () => {
				if (resolved || !proc) return;
				void signalProcessTree(proc, true).catch((error: unknown) =>
					reportTerminationError("forced", error),
				);
			};
			const requestTermination = () => {
				if (terminationRequested || resolved || !proc) return;
				terminationRequested = true;
				const forceImmediately = process.platform === "win32";
				void signalProcessTree(proc, forceImmediately).catch((error: unknown) =>
					reportTerminationError(forceImmediately ? "forced" : "graceful", error),
				);
				graceTimer = setTimeout(
					forceTermination,
					SUBAGENT_TERMINATION_GRACE_MS,
				);
				graceTimer.unref();
				deadlineTimer = setTimeout(() => {
					if (resolved) return;
					forceTermination();
					currentResult.errorMessage = [
						`Subagent process did not close within ${SUBAGENT_TERMINATION_DEADLINE_MS}ms after termination was requested.`,
						terminationError,
					]
						.filter(Boolean)
						.join(" ");
					if (budgetLimitReason) currentResult.stopReason = "error";
					finish(1);
				}, SUBAGENT_TERMINATION_DEADLINE_MS);
				deadlineTimer.unref();
			};
			stopForBudget = (reason: string) => {
				if (budgetLimitReason || resolved) return;
				budgetLimitReason = reason;
				currentResult.stopReason = "aborted";
				currentResult.errorMessage = reason;
				emitUpdate();
				requestTermination();
			};

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				finish(agentEnded && !wasAborted ? 0 : (code ?? 0));
			});

			proc.on("error", (error: Error) => {
				if (resolved) return;
				currentResult.errorMessage = `Failed to start subagent process (${invocation.command}): ${error.message}`;
				finish(1);
			});

			const killProc = () => {
				wasAborted = true;
				requestTermination();
			};
			if (runController.signal.aborted) killProc();
			else {
				runController.signal.addEventListener("abort", killProc, {
					once: true,
				});
				removeAbortListener = () =>
					runController.signal.removeEventListener("abort", killProc);
			}
			if (runContext?.readOnly) {
				readOnlyTimeoutTimer = setTimeout(
					() =>
						stopForBudget(
							"Read-only subagent stopped at its wall-clock budget; output may be partial.",
						),
					readOnlyTimeoutMs,
				);
				readOnlyTimeoutTimer.unref();
			}
		});

		currentResult.exitCode = exitCode;
		if (exitCode !== 0 && unparsedStdout.trim()) {
			const childStdout = `Child stdout:\n${unparsedStdout.trimEnd()}`;
			currentResult.stderr = currentResult.stderr.trim()
				? `${currentResult.stderr.trimEnd()}\n${childStdout}`
				: childStdout;
		}
		currentResult.sessionPath =
			resumedSessionPath ??
			(continuable
				? findDelegatedSession(delegatedSessionDir, runId)
				: undefined);
		if (budgetLimitReason && currentResult.stopReason !== "error") {
			currentResult.stopReason = "aborted";
			currentResult.errorMessage = budgetLimitReason;
			timingSpan.finish("cancelled", {
				exitCode,
				workflow,
				phase: "run",
				planPath,
				failureReason: budgetLimitReason,
			});
			timingFinished = true;
			return currentResult;
		}
		if (wasAborted) {
			currentResult.stopReason = "aborted";
			timingSpan.finish("cancelled", {
				exitCode,
				workflow,
				phase: "run",
				planPath,
			});
			timingFinished = true;
			throw new SubagentAbortError();
		}
		const isModelError = currentResult.stopReason === "error";
		if (exitCode === 0 && !isModelError) {
			timingSpan.finish("ok", { exitCode, workflow, phase: "run", planPath });
		} else {
			const errorReason =
				currentResult.errorMessage ||
				currentResult.stderr.slice(-500) ||
				(isModelError
					? "model returned stopReason=error"
					: `exit code ${exitCode}`);
			currentResult.errorMessage ??= errorReason;
			timingSpan.finish("error", {
				exitCode,
				workflow,
				phase: "run",
				planPath,
				failureReason: errorReason,
			});
		}
		timingFinished = true;
		return currentResult;
	} catch (err) {
		if (!currentResult.errorMessage)
			currentResult.errorMessage =
				err instanceof Error ? err.message : String(err);
		if (err instanceof SubagentAbortError)
			currentResult.stopReason = "aborted";
		if (!timingFinished) {
			const status =
				err instanceof Error && /abort|cancel/i.test(err.message)
					? "cancelled"
					: "error";
			const failureReason = err instanceof Error ? err.message : String(err);
			timingSpan.finish(
				status,
				{ workflow, phase: "run", planPath, failureReason },
				err,
			);
			timingFinished = true;
		}
		if (err instanceof Error)
			Object.assign(err, { subagentResult: currentResult });
		throw err;
	} finally {
		currentResult.durationMs = Date.now() - runStartedAt;
		const cancelled =
			currentResult.stopReason === "aborted" || runController.signal.aborted;
		const failed =
			!cancelled &&
			(currentResult.exitCode !== 0 ||
				currentResult.stopReason === "error" ||
				Boolean(currentResult.errorMessage));
		subagentRunManager.settle(runId, {
			status: cancelled ? "cancelled" : failed ? "failed" : "completed",
			model: currentResult.model,
			exitCode: currentResult.exitCode,
			stopReason: currentResult.stopReason,
			errorMessage: currentResult.errorMessage,
			sessionPath: currentResult.sessionPath,
			usage: runUsageSnapshot(currentResult.usage),
			finalText: getFinalOutput(currentResult.messages),
			durationMs: currentResult.durationMs,
		});
		removeTreeCancelListener?.();
		await treePermit?.release();
		signal?.removeEventListener("abort", forwardAbort);
		if (tmpPromptPath)
			try {
				fs.unlinkSync(tmpPromptPath);
			} catch {
				/* ignore */
			}
		if (tmpPromptDir)
			try {
				fs.rmdirSync(tmpPromptDir);
			} catch {
				/* ignore */
			}
	}
}

type TaskParams = {
	agent: string;
	task: string;
	taskId?: string;
	role?: SubagentRole;
	scope?: string[];
	effort?: AgentEffort;
	cwd?: string;
	output?: string | boolean;
	outputMode?: OutputMode;
	resolvedRole?: SubagentRole;
	resolvedDepth?: number;
	normalizedScopes?: string[];
};

type ChainParams = TaskParams;

type ReadOnlyFanoutTaskParams = TaskParams & {
	output?: undefined;
	outputMode?: undefined;
};

type ReadOnlyFanoutParams = {
	single: ReadOnlyFanoutTaskParams;
	parallel: ReadOnlyFanoutTaskParams[];
};

type ContinueParams = {
	agent: string;
	session: string;
	task: string;
	cwd?: string;
	output?: string | boolean;
	outputMode?: OutputMode;
	effort?: AgentEffort;
};

function validateLinkedTask(
	taskId: string | undefined,
	runCwd: string | undefined,
	defaultCwd: string,
): void {
	if (taskId === undefined) return;
	const task = getTask(taskId);
	if (!task || task.deletedAt) throw new Error(`Task not found: ${taskId}`);
	const workspace = resolveTaskWorkspace(runCwd ?? defaultCwd);
	if (task.workspace !== workspace)
		throw new Error(`Task ${taskId} belongs to a different workspace.`);
	if (task.state !== "running")
		throw new Error(`Task ${taskId} must be running before delegation.`);
}

const OutputModeSchema = StringEnum(["inline", "file-only"] as const, {
	description:
		'Output preservation policy. "inline" returns full child output in the parent result. "file-only" saves full output to an artifact and returns an explicit file reference.',
	default: "inline",
});

const EffortSchema = StringEnum(
	["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const,
);

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description:
		'Agent directories. Default: "user". Project-local names require "project" or "both".',
	default: "user",
});

const ModelSizeSchema = StringEnum(["small", "medium", "large"] as const, {
	description:
		"Dynamic model size override. Resolves against the current session model/provider and available registry models.",
});

const ModelPolicySchema = StringEnum(
	["same-provider", "same-family"] as const,
	{
		description:
			"How to resolve dynamic model sizes. same-provider prefers the current provider; same-family prefers the current series first, then the provider.",
		default: "same-provider",
	},
);

const StructuredOutputSchema = Type.Record(Type.String(), Type.Unknown(), {
	description:
		"JSON Schema for validated child output. Invalid output receives at most one continuation correction.",
});

const WorkflowTextListSchema = Type.Array(Type.String({ maxLength: 500 }), {
	maxItems: 32,
});
const WorkflowLeafOutputSchema = Type.Object(
	{
		status: StringEnum(
			["found", "not_found", "inconclusive", "error"] as const,
		),
		evidence: Type.Optional(WorkflowTextListSchema),
		changedFiles: Type.Optional(WorkflowTextListSchema),
		validation: Type.Optional(WorkflowTextListSchema),
		gaps: Type.Optional(WorkflowTextListSchema),
	},
	{ additionalProperties: false },
);
const WorkflowVerificationOutputSchema = Type.Object(
	{
		contradicted: Type.Boolean(),
		evidence: Type.Optional(WorkflowTextListSchema),
		gaps: Type.Optional(WorkflowTextListSchema),
	},
	{ additionalProperties: false },
);
const WorkflowReductionOutputSchema = Type.Object(
	{
		summary: Type.String({ maxLength: 500 }),
		evidence: Type.Optional(WorkflowTextListSchema),
		gaps: Type.Optional(WorkflowTextListSchema),
	},
	{ additionalProperties: false },
);

function workflowInputInstruction(input: WorkflowInput): string {
	if (input.kind === "none") return "";
	if (input.kind === "extract")
		return `\n\nBounded workflow extract:\n${input.content}`;
	return `\n\nInspect repository-relative path ${input.path}, lines ${input.startLine}-${input.endLine}. Keep evidence compact and do not copy the complete range into the result.`;
}

const SubagentRoleSchema = StringEnum(["coordinator", "leaf"] as const, {
	description:
		"Execution role. Root may start a coordinator or leaf; coordinators may start leaves only.",
	default: "leaf",
});

const ModificationScopeSchema = Type.Array(Type.String(), {
	minItems: 1,
	description:
		"Normalized repository-relative paths leased to a modifying leaf.",
});

function createSubagentSchemas(agentNames?: readonly string[]) {
	const agentName = (description: string) =>
		agentNames && agentNames.length > 0
			? StringEnum(agentNames, {
					description: `${description}. Default user agents; project agents require agentScope.`,
				})
			: Type.String({ description });
	const taskItem = Type.Object({
		agent: agentName("Name of the agent to invoke"),
		task: Type.String({ description: "Task to delegate to the agent" }),
		taskId: Type.Optional(
			Type.String({ description: "Existing running durable task ID" }),
		),
		role: Type.Optional(SubagentRoleSchema),
		scope: Type.Optional(ModificationScopeSchema),
		effort: Type.Optional(EffortSchema),
		cwd: Type.Optional(
			Type.String({ description: "Working directory for the agent process" }),
		),
		output: Type.Optional(
			Type.Union([Type.String(), Type.Boolean()], {
				description:
					"Optional artifact path for full output. Set false to disable saved artifacts. Relative paths resolve from the task cwd or current cwd.",
			}),
		),
		outputMode: Type.Optional(OutputModeSchema),
	});
	const readOnlyFanoutTaskItem = Type.Object(
		{
			agent: agentName("Name of the agent to invoke"),
			task: Type.String({ description: "Read-only task to delegate" }),
			effort: Type.Optional(EffortSchema),
			cwd: Type.Optional(
				Type.String({ description: "Working directory for the agent process" }),
			),
		},
		{ additionalProperties: false },
	);
	const readOnlyFanoutSchema = Type.Object(
		{
			single: readOnlyFanoutTaskItem,
			parallel: Type.Array(readOnlyFanoutTaskItem, {
				minItems: 2,
				maxItems: MAX_READ_ONLY_FANOUT_TASKS,
			}),
		},
		{
			description:
				"Opt-in read-only experiment with equivalent single-generalist and parallel-specialist plans. One arm is assigned deterministically. Requires outputSchema.",
		},
	);
	const chainItem = Type.Object({
		agent: agentName("Name of the agent to invoke"),
		effort: Type.Optional(EffortSchema),
		role: Type.Optional(SubagentRoleSchema),
		scope: Type.Optional(ModificationScopeSchema),
		task: Type.String({
			description: "Task with optional {previous} placeholder for prior output",
		}),
		cwd: Type.Optional(
			Type.String({ description: "Working directory for the agent process" }),
		),
		output: Type.Optional(
			Type.Union([Type.String(), Type.Boolean()], {
				description:
					"Optional artifact path for full output. Set false to disable saved artifacts. Relative paths resolve from the step cwd or current cwd.",
			}),
		),
		outputMode: Type.Optional(OutputModeSchema),
	});
	const legacy = Type.Object({
		readOnlyFanout: Type.Optional(readOnlyFanoutSchema),
		continue: Type.Optional(
			Type.Object({
				agent: agentName("Agent used to create the session"),
				session: Type.String({ description: "Saved child session path" }),
				task: Type.String({ description: "Follow-up message" }),
				effort: Type.Optional(EffortSchema),
				cwd: Type.Optional(Type.String({ description: "Working directory" })),
				output: Type.Optional(Type.Union([Type.String(), Type.Boolean()])),
				outputMode: Type.Optional(OutputModeSchema),
			}),
		),
		agent: Type.Optional(
			agentName("Name of the agent to invoke (for single mode)"),
		),
		task: Type.Optional(
			Type.String({
				description: "Task to delegate (for single mode)",
			}),
		),
		taskId: Type.Optional(
			Type.String({ description: "Existing running durable task ID" }),
		),
		role: Type.Optional(SubagentRoleSchema),
		scope: Type.Optional(ModificationScopeSchema),
		tasks: Type.Optional(
			Type.Array(taskItem, {
				minItems: 1,
				maxItems: MAX_SUBAGENT_WORKERS_PER_WAVE,
				description: "Parallel {agent, task} workers",
			}),
		),
		chain: Type.Optional(
			Type.Array(chainItem, {
				minItems: 1,
				maxItems: MAX_SUBAGENT_WORKERS_PER_WAVE,
				description: "Array of {agent, task} for sequential execution",
			}),
		),
		agentScope: Type.Optional(AgentScopeSchema),
		model: Type.Optional(
			Type.String({
				description:
					"Exact provider/model override for spawned subagents, e.g. openai-codex/gpt-5.6-terra. Takes precedence over modelSize and agent frontmatter.",
			}),
		),
		modelSize: Type.Optional(ModelSizeSchema),
		modelPolicy: Type.Optional(ModelPolicySchema),
		effort: Type.Optional(EffortSchema),
		outputSchema: Type.Optional(StructuredOutputSchema),
		continuable: Type.Optional(
			Type.Boolean({
				description: "Persist child sessions so they can be continued later.",
				default: false,
			}),
		),
		background: Type.Optional(
			Type.Boolean({
				description:
					"Run transiently in the background and return immediately. Completion is delivered as a follow-up message. Direct runs do not create durable task records.",
				default: false,
			}),
		),
		confirmProjectAgents: Type.Optional(
			Type.Boolean({
				description:
					"Prompt before running project-local agents. Default: false.",
				default: false,
			}),
		),
		cwd: Type.Optional(
			Type.String({
				description: "Working directory for the agent process (single mode)",
			}),
		),
		output: Type.Optional(
			Type.Union([Type.String(), Type.Boolean()], {
				description:
					"Optional artifact path for full output in single mode. Set false to disable saved artifacts.",
			}),
		),
		outputMode: Type.Optional(OutputModeSchema),
	});
	const common = {
		agentScope: legacy.properties.agentScope,
		model: legacy.properties.model,
		modelSize: legacy.properties.modelSize,
		modelPolicy: legacy.properties.modelPolicy,
		effort: legacy.properties.effort,
		outputSchema: legacy.properties.outputSchema,
		continuable: legacy.properties.continuable,
		background: legacy.properties.background,
		confirmProjectAgents: legacy.properties.confirmProjectAgents,
	};
	return {
		legacy,
		subagent: Type.Object({
			agent: legacy.properties.agent,
			task: legacy.properties.task,
			taskId: legacy.properties.taskId,
			role: legacy.properties.role,
			scope: legacy.properties.scope,
			tasks: legacy.properties.tasks,
			...common,
			cwd: legacy.properties.cwd,
			output: legacy.properties.output,
			outputMode: legacy.properties.outputMode,
		}),
		chain: Type.Object({
			steps: Type.Array(chainItem, {
				minItems: 1,
				maxItems: MAX_SUBAGENT_WORKERS_PER_WAVE,
				description:
					"Sequential steps; each task may use {previous} from the prior result.",
			}),
			...common,
		}),
		continue: Type.Object({
			agent: agentName("Agent used to create the saved session"),
			session: Type.String({ description: "Saved child session path" }),
			task: Type.String({ description: "Follow-up message" }),
			effort: Type.Optional(EffortSchema),
			cwd: Type.Optional(Type.String({ description: "Working directory" })),
			output: Type.Optional(Type.Union([Type.String(), Type.Boolean()])),
			outputMode: Type.Optional(OutputModeSchema),
			agentScope: legacy.properties.agentScope,
			model: legacy.properties.model,
			modelSize: legacy.properties.modelSize,
			modelPolicy: legacy.properties.modelPolicy,
			outputSchema: legacy.properties.outputSchema,
			background: legacy.properties.background,
			confirmProjectAgents: legacy.properties.confirmProjectAgents,
		}),
		fanout: Type.Object({
			single: readOnlyFanoutTaskItem,
			parallel: Type.Array(readOnlyFanoutTaskItem, {
				minItems: 2,
				maxItems: MAX_READ_ONLY_FANOUT_TASKS,
			}),
			outputSchema: StructuredOutputSchema,
			agentScope: legacy.properties.agentScope,
			model: legacy.properties.model,
			modelSize: legacy.properties.modelSize,
			modelPolicy: legacy.properties.modelPolicy,
			effort: legacy.properties.effort,
			continuable: legacy.properties.continuable,
			background: legacy.properties.background,
			confirmProjectAgents: legacy.properties.confirmProjectAgents,
		}),
	};
}

const InitialSubagentSchemas = createSubagentSchemas();
const WorkflowToolSchema = Type.Object(
	{
		...WorkflowSpecificationSchema.properties,
		agentScope: Type.Optional(AgentScopeSchema),
		model: Type.Optional(
			Type.String({ description: "Exact provider/model override for workflow leaves" }),
		),
		modelSize: Type.Optional(ModelSizeSchema),
		modelPolicy: Type.Optional(ModelPolicySchema),
		effort: Type.Optional(EffortSchema),
		confirmProjectAgents: Type.Optional(
			Type.Boolean({
				description: "Prompt before running project-local agents. Default: false.",
				default: false,
			}),
		),
	},
	{ additionalProperties: false },
);

type SessionAgentCatalog = {
	cwd: string;
	byScope: Record<AgentScope, AgentDiscoveryResult>;
	agentNames: string[];
};

function createSessionAgentCatalog(
	cwd: string,
	projectTrusted: boolean,
): SessionAgentCatalog {
	const user = discoverAgents(cwd, "user");
	const project = projectTrusted
		? discoverAgents(cwd, "project")
		: { agents: [], projectAgentsDir: user.projectAgentsDir };
	const both = projectTrusted
		? discoverAgents(cwd, "both")
		: { agents: user.agents, projectAgentsDir: user.projectAgentsDir };
	const agentNames = Array.from(
		new Set(user.agents.map((agent) => agent.name)),
	).sort();
	return {
		cwd,
		byScope: { user, project, both },
		agentNames,
	};
}

const ADVANCED_SUBAGENT_TOOL_NAMES = [
	"subagent_chain",
	"subagent_continue",
	"subagent_fanout",
] as const;

export default function (pi: ExtensionAPI) {
	let sessionOpen = false;
	let sessionAgentCatalog: SessionAgentCatalog | undefined;
	let statusContext: ExtensionContext | undefined;
	let unsubscribeStatus: (() => void) | undefined;
	let unsubscribeBackgroundCompletion: (() => void) | undefined;
	let renderedStatus: string | undefined;
	let refreshAgentTools: (agentNames: readonly string[]) => void = () => {};
	let deliveryScheduled = false;
	let activeScopePolicy = decodeScopePolicyEnvironment(
		process.env.PI_SUBAGENT_SCOPE_POLICY,
	);

	const updateStatus = () => {
		if (!statusContext) return;
		const nextStatus = formatSubagentActivityStatus(subagentRunManager.list());
		if (nextStatus === renderedStatus) return;
		renderedStatus = nextStatus;
		statusContext.ui.setStatus("subagents", nextStatus);
	};

	const flushPendingBackgroundCompletions = () => {
		deliveryScheduled = false;
		if (!sessionOpen) return;
		for (const completion of subagentRunManager.pendingBackgroundCompletions()) {
			try {
				pi.sendMessage(
					{
						customType: "subagent-result",
						content: completion.content,
						display: true,
						details: {
							orchestrationId: completion.orchestrationId,
							mode: completion.mode,
							failed: completion.failed,
							taskIds: completion.taskIds,
						},
					},
					{ deliverAs: "followUp", triggerTurn: true },
				);
				subagentRunManager.consumeBackgroundCompletion(
					completion.orchestrationId,
				);
			} catch {
				// Keep the result pending and retry after the next settled agent turn.
			}
		}
	};

	const scheduleBackgroundCompletionDelivery = () => {
		if (deliveryScheduled) return;
		deliveryScheduled = true;
		queueMicrotask(flushPendingBackgroundCompletions);
	};

	const queueBackgroundResult = (
		orchestrationId: string,
		mode: Exclude<SubagentRunMode, "task-execute">,
		result?: AgentToolResult<SubagentDetails>,
		error?: unknown,
	) => {
		const rawText = result
			? result.content
					.filter((item) => item.type === "text")
					.map((item) => item.text)
					.join("\n")
			: error instanceof Error
				? error.message
				: String(error ?? "Background subagent failed without an error message.");
		const bounded = truncateTail(rawText, {
			maxBytes: BACKGROUND_RESULT_MAX_BYTES,
			maxLines: BACKGROUND_RESULT_MAX_LINES,
		});
		const failed =
			Boolean(error) ||
			Boolean(
				result?.details?.results.some(
					(worker) =>
						worker.exitCode !== 0 ||
						worker.stopReason === "error" ||
						worker.stopReason === "aborted",
				),
			);
		const truncationNote = bounded.truncated
			? "\n\n[Result truncated. Inspect the recent run with /subagents.]"
			: "";
		subagentRunManager.queueBackgroundCompletion({
			orchestrationId,
			mode,
			content: `Background subagent ${mode} ${orchestrationId} ${failed ? "finished with failures" : "finished"}.\n\n${bounded.content}${truncationNote}`,
			failed,
			taskIds:
				result?.details?.results.flatMap((worker) =>
					worker.taskId ? [worker.taskId] : [],
				) ?? [],
		});
	};

	pi.registerCommand("subagents", {
		description: "Inspect and manage process-local subagent runs",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/subagents requires TUI mode.", "warning");
				return;
			}
			await openSubagentDashboard(ctx, subagentRunManager);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		sessionAgentCatalog = createSessionAgentCatalog(
			ctx.cwd,
			ctx.isProjectTrusted(),
		);
		refreshAgentTools(sessionAgentCatalog.agentNames);
		activeScopePolicy = decodeScopePolicyEnvironment(
			process.env.PI_SUBAGENT_SCOPE_POLICY,
		);
		const identity = currentSubagentIdentity();
		deactivateTools(
			pi,
			identity.role === "leaf" || identity.depth >= 2
				? [
						"subagent",
						...ADVANCED_SUBAGENT_TOOL_NAMES,
						"subagent_workflow",
					]
				: [...ADVANCED_SUBAGENT_TOOL_NAMES, "subagent_workflow"],
		);
		sessionOpen = true;
		statusContext = ctx;
		renderedStatus = undefined;
		unsubscribeStatus?.();
		unsubscribeStatus = subagentRunManager.subscribe(updateStatus);
		unsubscribeBackgroundCompletion?.();
		unsubscribeBackgroundCompletion = subagentRunManager.onBackgroundCompletion(
			scheduleBackgroundCompletionDelivery,
		);
		updateStatus();
		scheduleBackgroundCompletionDelivery();
	});

	pi.on("agent_settled", () => {
		if (subagentRunManager.pendingBackgroundCompletions().length > 0)
			scheduleBackgroundCompletionDelivery();
	});

	pi.on("tool_call", (event, ctx) => {
		if (!activeScopePolicy) return undefined;
		const violation = directMutationViolation(
			String(event.toolName ?? ""),
			event.input,
			ctx.cwd,
			activeScopePolicy,
		);
		return violation ? { block: true, reason: violation } : undefined;
	});

	pi.on("session_shutdown", async (event) => {
		sessionOpen = false;
		unsubscribeStatus?.();
		unsubscribeStatus = undefined;
		unsubscribeBackgroundCompletion?.();
		unsubscribeBackgroundCompletion = undefined;
		statusContext?.ui.setStatus("subagents", undefined);
		statusContext = undefined;
		renderedStatus = undefined;
		if (event.reason === "quit") {
			if (currentSubagentIdentity().role === "root") {
				await subagentRunManager.dispose();
				await getSubagentTreeBroker().dispose();
			} else await subagentRunManager.dispose();
		} else subagentRunManager.cancelForeground();
		sessionAgentCatalog = undefined;
	});

	const subagentExecutor = defineTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate work to isolated specialist agents.",
			"Root may launch a leaf or a coordinator; coordinators may launch leaves only.",
			"Use agent and task for one worker or tasks for bounded parallel workers.",
			"Modifying leaves require repository-relative scopes; active descendants share the root scheduler.",
			"Foreground execution waits; background=true returns immediately and delivers a follow-up result.",
			"Use taskId only to correlate a root-owned coordinator task. Advanced chain, continuation, fanout, and typed workflow tools are deferred.",
		].join(" "),
		promptSnippet:
			"Delegate foreground or background work to isolated specialist agents",
		promptGuidelines: [
			"Delegate one narrow, single-phase deliverable per leaf. Use role=coordinator only for bounded decomposition and reduction.",
			"A coordinator may invoke leaves; leaves and every depth-two child cannot invoke delegation or workflow tools.",
			"Each child is capped at 64 turns; explicitly read-only fanout leaves are also capped at eight minutes.",
			"Give every modifying leaf a normalized repository-relative scope and keep concurrent scopes disjoint.",
			"Use subagent with background=true for independent work, continue useful parent work, and consume the delivered follow-up instead of polling.",
			"Use tool_search for deferred chain, continuation, fanout, and subagent_workflow capabilities.",
			"For durable coordinated work, start a root-owned task, pass its taskId to the coordinator, validate the result, and close the task. Leaves remain transient.",
		],
		parameters: InitialSubagentSchemas.legacy,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const currentIdentity = currentSubagentIdentity();
			const internalWorkflowContext = internalWorkflowRuns.get(_toolCallId);
			if (currentIdentity.role === "leaf" || currentIdentity.depth >= 2)
				throw new Error("Leaf and depth-two subagents cannot delegate.");
			const invocationCwd = ctx.cwd;
			const parentSessionId = ctx.sessionManager?.getSessionId?.();
			await compressDelegatedSessions().catch(() => []);
			const agentScope =
				(params.agentScope as unknown as AgentScope | undefined) ?? "user";
			const explicitModel =
				typeof params.model === "string" && params.model.trim()
					? params.model.trim()
					: undefined;
			const modelSize = params.modelSize as unknown as ModelSize | undefined;
			const modelPolicy =
				(params.modelPolicy as unknown as ModelPolicy | undefined) ??
				"same-provider";
			const effort = params.effort as unknown as AgentEffort | undefined;
			const outputSchema = params.outputSchema as unknown as
				| TSchema
				| undefined;
			const background = params.background === true;
			const executionSignal = background ? undefined : signal;
			const visibleUpdate = background ? undefined : onUpdate;
			const fanoutPlan = params.readOnlyFanout as unknown as
				| ReadOnlyFanoutParams
				| undefined;
			const hasReadOnlyFanout = fanoutPlan !== undefined;
			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const hasContinue = Boolean(params.continue);
			const sampledResolution =
				!explicitModel && modelSize
					? resolveSampledDynamicModelFromRegistry(
							ctx.modelRegistry,
							ctx,
							modelSize,
							modelPolicy,
							_toolCallId,
							hasReadOnlyFanout
								? "subagent-read-only-fanout"
								: hasChain
									? "subagent-chain"
									: hasTasks
										? "subagent-parallel"
										: "subagent-single",
							hasReadOnlyFanout || effort || hasContinue ? 0 : undefined,
						)
					: undefined;
			const resolvedModel = sampledResolution?.model;
			const routingExperiment = sampledResolution?.experiment;
			const resolvedModelId =
				explicitModel ??
				(resolvedModel
					? `${resolvedModel.provider}/${resolvedModel.id}`
					: undefined);
			const discovery =
				sessionAgentCatalog?.cwd === invocationCwd
					? sessionAgentCatalog.byScope[agentScope]
					: discoverAgents(invocationCwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = params.confirmProjectAgents ?? false;
			const modeCount =
				Number(hasReadOnlyFanout) +
				Number(hasChain) +
				Number(hasTasks) +
				Number(hasSingle) +
				Number(hasContinue);

			const orchestrationId = randomUUID();
			const interactionId = registerOrchestrationInvocation(orchestrationId);
			let invocationTreeClientPromise: Promise<SubagentTreeClient> | undefined;
			let invocationRootRunId: string | undefined;
			const getInvocationTreeClient = (): Promise<SubagentTreeClient> => {
				if (invocationTreeClientPromise) return invocationTreeClientPromise;
				invocationTreeClientPromise = (async () => {
					if (currentIdentity.role !== "root") {
						const client = treeClientFromEnvironment();
						if (!client)
							throw new Error(
								"Coordinator process is missing tree broker credentials.",
							);
						return client;
					}
					const broker = getSubagentTreeBroker();
					const root = broker.createTree({ treeId: orchestrationId });
					invocationRootRunId = root.rootRunId;
					const credentials = await broker.listen();
					return new SubagentTreeClient(
						credentials,
						{
							treeId: root.treeId,
							runId: root.rootRunId,
							role: "root",
							depth: 0,
						},
						root.ownerToken,
					);
				})();
				return invocationTreeClientPromise;
			};
			const settleInvocationTree = async (): Promise<void> => {
				if (!invocationRootRunId) return;
				const rootRunId = invocationRootRunId;
				invocationRootRunId = undefined;
				await getSubagentTreeBroker().release(rootRunId);
			};
			const fanoutPlanValid =
				fanoutPlan !== undefined &&
				typeof fanoutPlan.single?.agent === "string" &&
				fanoutPlan.single.agent.trim().length > 0 &&
				typeof fanoutPlan.single.task === "string" &&
				fanoutPlan.single.task.trim().length > 0 &&
				params.cwd === undefined &&
				params.output === undefined &&
				params.outputMode === undefined &&
				fanoutPlan.single.output === undefined &&
				fanoutPlan.single.outputMode === undefined &&
				Array.isArray(fanoutPlan.parallel) &&
				fanoutPlan.parallel.length >= 2 &&
				fanoutPlan.parallel.length <= MAX_READ_ONLY_FANOUT_TASKS &&
				fanoutPlan.parallel.every(
					(item) =>
						typeof item?.agent === "string" &&
						item.agent.trim().length > 0 &&
						typeof item.task === "string" &&
						item.task.trim().length > 0 &&
						item.output === undefined &&
						item.outputMode === undefined,
				);
			const fanoutAssignment = fanoutPlanValid
				? assignReadOnlyFanoutExperiment(
						interactionId ?? _toolCallId,
						fanoutPlan.parallel.length,
					)
				: undefined;
			const selectedTasks = fanoutAssignment
				? fanoutAssignment.arm === "parallel-specialists"
					? fanoutPlan?.parallel
					: undefined
				: (params.tasks as unknown as TaskParams[] | undefined);
			const selectedSingle = fanoutAssignment
				? fanoutAssignment.arm === "single-generalist"
					? (fanoutPlan?.single as TaskParams | undefined)
					: undefined
				: hasSingle
					? ({
							agent: params.agent,
							task: params.task,
							taskId: params.taskId,
							role: params.role,
							scope: params.scope,
							cwd: params.cwd,
							output: params.output,
							outputMode: params.outputMode,
						} as TaskParams)
					: undefined;
			const continueChild = params.continue
				? ({
						...(params.continue as ContinueParams),
						role: "leaf",
					} as TaskParams & ContinueParams)
				: undefined;
			const originalMode = hasChain
				? "chain"
				: selectedTasks
					? "parallel"
					: "single";
			const executionMode: Exclude<SubagentRunMode, "task-execute"> =
				hasContinue ? "continue" : originalMode;
			const makeDetails =
				(mode: "single" | "parallel" | "chain") =>
				(results: SingleResult[]): SubagentDetails => ({
					mode,
					agentScope,
					projectAgentsDir: discovery.projectAgentsDir,
					results,
					...(fanoutAssignment ? { experiment: fanoutAssignment } : {}),
				});
			const invocationStartedAt = Date.now();
			let orchestrationEmitted = false;
			let experimentAssignmentEmitted = false;
			const complete = <T extends AgentToolResult<SubagentDetails>>(
				result: T,
			): T => {
				if (orchestrationEmitted) return result;
				orchestrationEmitted = true;
				const details = result.details;
				const results = details?.results ?? [];
				const parentText = result.content.find(
					(item) => item.type === "text",
				)?.text;
				const parentVisibleBytes = Buffer.byteLength(parentText ?? "", "utf-8");
				const workers: OrchestrationWorker[] = results.map((worker, index) => {
					const isCancelled = worker.stopReason === "aborted";
					const failed =
						worker.exitCode !== 0 ||
						worker.stopReason === "error" ||
						isCancelled;
					const isFinalChainWorker =
						originalMode === "chain" && index === results.length - 1;
					const childText = getResultOutput(worker);
					const forwarded =
						originalMode === "chain" && !isFinalChainWorker
							? worker.outputReference &&
								(worker.outputMode === "file-only" ||
									structuredOutputIsBulky(worker))
								? worker.outputReference.message
								: childText
							: undefined;
					return {
						runId: worker.runId ?? randomUUID(),
						...(worker.treeId ? { treeId: worker.treeId } : {}),
						...(worker.parentRunId
							? { parentRunId: worker.parentRunId }
							: {}),
						...(worker.depth === undefined ? {} : { depth: worker.depth }),
						...(worker.role ? { role: worker.role } : {}),
						...(worker.workflowPhase
							? { workflowPhase: worker.workflowPhase }
							: {}),
						...(worker.taskKey ? { taskKey: worker.taskKey } : {}),
						...(worker.attempt === undefined
							? {}
							: { attempt: worker.attempt }),
						...(worker.retryOrigin
							? { retryOrigin: worker.retryOrigin }
							: {}),
						...(worker.coordinatorTaskId
							? { coordinatorTaskId: worker.coordinatorTaskId }
							: {}),
						...(worker.taskId ? { taskId: worker.taskId } : {}),
						agent: worker.agent,
						...(worker.model ? { resolvedModel: worker.model } : {}),
						...(worker.routingExperiment
							? {
									experimentId: worker.routingExperiment.experimentId,
									experimentArm: worker.routingExperiment.id,
									experimentTaskClass: worker.routingExperiment.taskClass,
									validationOutcome: outputSchema
										? failed
											? ("failed" as const)
											: ("passed" as const)
										: ("unavailable" as const),
								}
							: {}),
						status: isCancelled ? "cancelled" : failed ? "failed" : "completed",
						exitCode: Math.max(0, worker.exitCode),
						durationMs: worker.durationMs ?? 0,
						outputMode:
							worker.outputMode === "file-only"
								? "artifact"
								: worker.outputMode === "inline"
									? "inline"
									: "none",
						childTextBytes: Buffer.byteLength(childText, "utf-8"),
						parentVisibleBytes:
							originalMode === "parallel" ||
							(originalMode === "chain" && !isFinalChainWorker)
								? 0
								: parentVisibleBytes,
						...(worker.outputReference
							? { artifactBytes: worker.outputReference.bytes }
							: {}),
						...(forwarded === undefined
							? {}
							: { chainTransferBytes: Buffer.byteLength(forwarded, "utf-8") }),
						usage: taskUsageSnapshot(worker.usage),
						turns: worker.usage.turns,
					};
				});
				const allCompleted =
					workers.length > 0 &&
					workers.every((worker) => worker.status === "completed");
				const anyCancelled = workers.some(
					(worker) => worker.status === "cancelled",
				);
				const event = buildOrchestrationRunEvent({
					orchestrationId,
					...(interactionId ? { interactionId } : {}),
					...(parentSessionId ? { parentSessionId } : {}),
					mode: originalMode,
					fanOut: results.length,
					status: allCompleted
						? "completed"
						: anyCancelled
							? "cancelled"
							: results.length === 0
								? "rejected"
								: "failed",
					durationMs: Date.now() - invocationStartedAt,
					childWorkMs: workers.reduce(
						(sum, worker) => sum + (worker.durationMs ?? 0),
						0,
					),
					parentVisibleBytes,
					workers,
					session: parentSessionId,
				});
				if (event)
					recordEvent(event as unknown as Parameters<typeof recordEvent>[0]);
				if (fanoutAssignment && experimentAssignmentEmitted) {
					const checksPassed = results.filter(
						(worker) =>
							worker.exitCode === 0 &&
							worker.stopReason !== "error" &&
							worker.stopReason !== "aborted" &&
							Object.hasOwn(worker, "structuredOutput"),
					).length;
					const outcome = buildOrchestrationExperimentOutcomeEvent({
						experimentId: fanoutAssignment.experimentId,
						experimentVersion: fanoutAssignment.experimentVersion,
						assignmentId: fanoutAssignment.assignmentId,
						orchestrationId,
						validationKind: "output-schema",
						validationOutcome:
							results.length === 0
								? "not_run"
								: checksPassed === results.length
									? "passed"
									: "failed",
						checksTotal: results.length,
						checksPassed,
						session: parentSessionId,
					});
					if (outcome)
						recordEvent(
							outcome as unknown as Parameters<typeof recordEvent>[0],
						);
				}
				return result;
			};
			const run = async (
				...args: Parameters<typeof runSingleAgent>
			): Promise<SingleResult> => {
				let result: SingleResult | undefined;
				try {
					if (routingExperiment && args[12] === undefined)
						args[12] = routingExperiment.effort;
					const suppliedContext = args[16] ?? {};
					const treeClient = await getInvocationTreeClient();
					const coordinatorTaskId =
						suppliedContext.role === "coordinator"
							? args[13]
							: currentIdentity.coordinatorTaskId;
					args[16] = {
						owner: args[13] ? "task" : "direct",
						orchestrationId,
						mode: executionMode,
						background,
						treeId: currentIdentity.treeId ?? orchestrationId,
						parentRunId: currentIdentity.runId,
						repositoryRoot: invocationCwd,
						treeClient,
						...(coordinatorTaskId ? { coordinatorTaskId } : {}),
						...(fanoutAssignment ? { readOnly: true } : {}),
						...(internalWorkflowContext
							? {
									workflowPhase:
										internalWorkflowContext.workflowPhase,
									taskKey: internalWorkflowContext.taskKey,
									attempt: internalWorkflowContext.attempt,
									retryOrigin: internalWorkflowContext.retryOrigin,
								}
							: {}),
						...suppliedContext,
					};
					if (outputSchema) {
						args[3] = `${args[3]}\n\n${schemaOutputInstruction(outputSchema)}`;
						args[15] = { ...(args[15] ?? {}), continuable: true };
					}
					result = await runSingleAgent(...args);
					if (routingExperiment) result.routingExperiment = routingExperiment;
					if (
						!outputSchema ||
						result.exitCode !== 0 ||
						result.stopReason === "error" ||
						result.stopReason === "aborted"
					)
						return result;
					try {
						result.structuredOutput = decodeSchemaOutput(
							outputSchema,
							getFinalOutput(result.messages),
						);
						result.outputAttempts = 1;
						return result;
					} catch (firstError) {
						result.outputAttempts = 1;
						if (result.usage.turns >= MAX_SUBAGENT_TURNS)
							throw new Error(
								`Structured output validation failed at the ${MAX_SUBAGENT_TURNS}-turn budget; correction was not attempted: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
							);
						if (!result.sessionPath)
							throw new Error(
								`Structured output validation failed and no continuable session is available: ${firstError instanceof Error ? firstError.message : String(firstError)}`,
							);
						const correctionArgs = [...args] as Parameters<
							typeof runSingleAgent
						>;
						const remainingTurns = MAX_SUBAGENT_TURNS - result.usage.turns;
						const priorRunContext = correctionArgs[16];
						const remainingReadOnlyTimeoutMs = priorRunContext?.readOnly
							? READ_ONLY_SUBAGENT_TIMEOUT_MS - (result.durationMs ?? 0)
							: undefined;
						const validationError =
							firstError instanceof Error
								? firstError.message
								: String(firstError);
						correctionArgs[3] = `Your previous response failed output validation: ${validationError.slice(0, 500)}. ${schemaOutputInstruction(outputSchema)}`;
						correctionArgs[13] = undefined;
						correctionArgs[14] = undefined;
						correctionArgs[15] = {
							continuable: true,
							sessionPath: result.sessionPath,
						};
						correctionArgs[16] = {
							...priorRunContext,
							maxTurns: remainingTurns,
							...(remainingReadOnlyTimeoutMs === undefined
								? {}
								: { timeoutMs: Math.max(1, remainingReadOnlyTimeoutMs) }),
						};
						const correction = await runSingleAgent(...correctionArgs);
						mergeCorrectionResult(result, correction);
						result.outputAttempts = 2;
						try {
							result.structuredOutput = decodeSchemaOutput(
								outputSchema,
								getFinalOutput(correction.messages),
							);
							return result;
						} catch (secondError) {
							throw new Error(
								`Structured output validation failed after one correction: ${secondError instanceof Error ? secondError.message : String(secondError)}`,
							);
						}
					}
				} catch (error) {
					const failedResult =
						result ??
						(error instanceof Error
							? (error as Error & { subagentResult?: SingleResult })
									.subagentResult
							: undefined);
					if (failedResult && outputSchema) {
						failedResult.stopReason = "error";
						failedResult.errorMessage =
							error instanceof Error ? error.message : String(error);
					}
					if (originalMode !== "parallel")
						complete({
							content: [],
							details: makeDetails(
								originalMode === "chain" ? "chain" : "single",
							)(failedResult ? [failedResult] : []),
							isError: true,
						});
					if (error instanceof Error && failedResult)
						Object.assign(error, { subagentResult: failedResult });
					throw error;
				}
			};

			if (modeCount !== 1) {
				const available =
					agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				return complete({
					content: [
						{
							type: "text",
							text: `Invalid parameters. Provide exactly one mode.\nAvailable agents: ${available}`,
						},
					],
					details: makeDetails("single")([]),
				});
			}
			if (
				(params.tasks?.length ?? 0) > MAX_SUBAGENT_WORKERS_PER_WAVE ||
				(params.chain?.length ?? 0) > MAX_SUBAGENT_WORKERS_PER_WAVE
			) {
				return complete({
					content: [
						{
							type: "text",
							text: `Invalid parameters. A delegation wave may contain at most ${MAX_SUBAGENT_WORKERS_PER_WAVE} workers.`,
						},
					],
					details: makeDetails(originalMode)([]),
					isError: true,
				});
			}
			if (hasReadOnlyFanout && (!fanoutPlanValid || !fanoutAssignment)) {
				return complete({
					content: [
						{
							type: "text",
							text: `Invalid readOnlyFanout parameters. Provide one single plan and 2-${MAX_READ_ONLY_FANOUT_TASKS} parallel plans.`,
						},
					],
					details: makeDetails("single")([]),
				});
			}
			if (hasReadOnlyFanout && !outputSchema) {
				return complete({
					content: [
						{
							type: "text",
							text: "Invalid readOnlyFanout parameters. outputSchema is required for structural validation.",
						},
					],
					details: makeDetails("single")([]),
				});
			}

			const requestedAgentNames = new Set<string>();
			if (fanoutPlan) {
				requestedAgentNames.add(fanoutPlan.single.agent);
				for (const task of fanoutPlan.parallel)
					requestedAgentNames.add(task.agent);
			} else {
				if (params.chain)
					for (const step of params.chain)
						requestedAgentNames.add(step.agent);
				if (selectedTasks)
					for (const task of selectedTasks)
						requestedAgentNames.add(task.agent);
				if (selectedSingle) requestedAgentNames.add(selectedSingle.agent);
				if (params.continue) requestedAgentNames.add(params.continue.agent);
			}
			const availableAgentNames = new Set(agents.map((agent) => agent.name));
			if (params.taskId !== undefined && !selectedSingle)
				throw new Error("taskId is only valid for single mode.");
			if (selectedTasks)
				for (const task of selectedTasks)
					validateLinkedTask(task.taskId, task.cwd, invocationCwd);
			if (selectedSingle)
				validateLinkedTask(
					selectedSingle.taskId,
					selectedSingle.cwd,
					invocationCwd,
				);

			const unknownAgentNames = Array.from(requestedAgentNames).filter(
				(name) => !availableAgentNames.has(name),
			);
			if (unknownAgentNames.length > 0) {
				complete({
					content: [],
					details: makeDetails(originalMode)([]),
					isError: true,
				});
				const unknown = unknownAgentNames
					.map((name) => `"${name}"`)
					.join(", ");
				const available =
					agents.map((agent) => `"${agent.name}"`).join(", ") || "none";
				throw new Error(
					`Unknown agent${unknownAgentNames.length === 1 ? "" : "s"}: ${unknown} for agentScope "${agentScope}". Available agents: ${available}.`,
				);
			}

			const prepareChild = (item: TaskParams, forcedRole?: SubagentRole) => {
				const resolved = resolveChildRole(forcedRole ?? item.role, item.agent);
				item.resolvedRole = resolved.role;
				item.resolvedDepth = resolved.depth;
				item.normalizedScopes = normalizeRepositoryScopes(
					item.scope ?? [],
					invocationCwd,
				);
				if (item.taskId && resolved.role !== "coordinator")
					throw new Error(
						"taskId may correlate a root-owned coordinator invocation only.",
					);
			};
			const chain = params.chain as unknown as TaskParams[] | undefined;
			if (fanoutAssignment) {
				if (selectedSingle) prepareChild(selectedSingle, "leaf");
				for (const item of (selectedTasks ?? []) as TaskParams[])
					prepareChild(item, "leaf");
			} else {
				if (selectedSingle) prepareChild(selectedSingle);
				for (const item of (selectedTasks ?? []) as TaskParams[])
					prepareChild(item);
			}
			for (const item of chain ?? []) prepareChild(item);
			if (continueChild) prepareChild(continueChild, "leaf");

			const scopedCandidates = fanoutAssignment
				? []
				: [
						...(selectedSingle ? [selectedSingle] : []),
						...((selectedTasks ?? []) as TaskParams[]),
						...(chain ?? []),
						...(continueChild ? [continueChild] : []),
					];
			for (const item of scopedCandidates) {
				const modifying = internalWorkflowContext
					? internalWorkflowContext.modifying
					: agentCanModify(
							agents.find((agent) => agent.name === item.agent),
						);
				if (
					item.resolvedRole === "leaf" &&
					modifying &&
					(item.normalizedScopes?.length ?? 0) === 0
				)
					throw new Error(
						`Modifying leaf ${item.agent} must declare a repository-relative scope.`,
					);
			}

			if (!fanoutAssignment && selectedTasks) {
				const modifiers = (selectedTasks as TaskParams[]).filter((item) =>
					agentCanModify(agents.find((agent) => agent.name === item.agent)),
				);
				if (modifiers.length > 1) {
					assertDisjointScopes(
						modifiers.map((item, index) => ({
							key: `${item.agent}[${index}]`,
							scopes: item.normalizedScopes ?? [],
						})),
						invocationCwd,
					);
				}
			}

			if (
				(agentScope === "project" || agentScope === "both") &&
				confirmProjectAgents
			) {
				const projectAgentsRequested = Array.from(requestedAgentNames)
					.map((name) => agents.find((a) => a.name === name))
					.filter((a): a is AgentConfig => a?.source === "project");

				if (projectAgentsRequested.length > 0) {
					if (!ctx.hasUI)
						return complete({
							content: [
								{
									type: "text",
									text: "Canceled: project-local agent approval requires an interactive UI.",
								},
							],
							details: makeDetails(originalMode)([]),
							isError: true,
						});
					const names = projectAgentsRequested.map((a) => a.name).join(", ");
					const dir = discovery.projectAgentsDir ?? "(unknown)";
					emitTerminalBell();
					const ok = await ctx.ui.confirm(
						"Run project-local agents?",
						`Agents: ${names}\nSource: ${dir}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
					);
					if (!ok)
						return complete({
							content: [
								{
									type: "text",
									text: "Canceled: project-local agents not approved.",
								},
							],
							details: makeDetails(originalMode)([]),
						});
				}
			}

			if (fanoutAssignment) {
				const assignmentEvent = buildOrchestrationExperimentAssignmentEvent({
					...fanoutAssignment,
					orchestrationId,
					...(interactionId ? { interactionId } : {}),
					session: parentSessionId,
				});
				if (assignmentEvent)
					experimentAssignmentEmitted = Boolean(
						recordEvent(
							assignmentEvent as unknown as Parameters<typeof recordEvent>[0],
						),
					);
			}

			const linkedTaskCount =
				(selectedTasks?.filter((task) => task.taskId).length ?? 0) +
				(selectedSingle?.taskId ? 1 : 0);
			const executeSelectedMode = async (): Promise<
				AgentToolResult<SubagentDetails>
			> => {
			if (continueChild) {
				const followUp = continueChild;
				const result = await run(
					invocationCwd,
					agents,
					followUp.agent,
					followUp.task,
					followUp.cwd,
					undefined,
					executionSignal,
					visibleUpdate,
					makeDetails("single"),
					resolvedModelId,
					modelSize,
					modelPolicy,
					followUp.effort ?? effort,
					undefined,
					undefined,
					{ continuable: true, sessionPath: followUp.session },
					{
						role: followUp.resolvedRole,
						depth: followUp.resolvedDepth,
						scopes: followUp.normalizedScopes,
					},
				);
				finalizeOutput(
					result,
					followUp.output,
					followUp.outputMode,
					invocationCwd,
					followUp.cwd,
					0,
					false,
				);
				const isError =
					result.exitCode !== 0 ||
					result.stopReason === "error" ||
					result.stopReason === "aborted";
				return complete({
					content: [
						{
							type: "text",
							text: isError
								? `Agent ${result.stopReason || "failed"}: ${result.errorMessage || result.stderr || "(no output)"}`
								: getOutputForParent(result) || "(no output)",
						},
					],
					details: makeDetails("single")([result]),
					...(isError ? { isError: true } : {}),
				});
			}

			if (params.chain && params.chain.length > 0) {
				const chain = params.chain as ChainParams[];
				const results: SingleResult[] = [];
				let previousOutput = "";

				for (let i = 0; i < chain.length; i++) {
					const step = chain[i];
					const taskWithContext = step.task.replace(
						/\{previous\}/g,
						previousOutput,
					);

					// Create update callback that includes all previous results
					const chainUpdate: OnUpdateCallback | undefined = visibleUpdate
						? (partial) => {
								// Combine completed results with current streaming result
								const currentResult = partial.details?.results[0];
								if (currentResult) {
									const allResults = [...results, currentResult];
									visibleUpdate({
										content: partial.content,
										details: makeDetails("chain")(allResults),
									});
								}
							}
						: undefined;

					const result = await run(
						invocationCwd,
						agents,
						step.agent,
						taskWithContext,
						step.cwd,
						i + 1,
						executionSignal,
						chainUpdate,
						makeDetails("chain"),
						resolvedModelId,
						modelSize,
						modelPolicy,
						step.effort ?? effort,
						undefined,
						undefined,
						{ continuable: params.continuable === true },
						{
							role: step.resolvedRole,
							depth: step.resolvedDepth,
							scopes: step.normalizedScopes,
						},
					);
					finalizeOutput(
						result,
						step.output,
						step.outputMode,
						invocationCwd,
						step.cwd,
						i,
						structuredOutputIsBulky(result),
					);
					results.push(result);

					const isError =
						result.exitCode !== 0 ||
						result.stopReason === "error" ||
						result.stopReason === "aborted";
					if (isError) {
						const errorMsg =
							result.errorMessage ||
							result.stderr ||
							getFinalOutput(result.messages) ||
							"(no output)";
						return complete({
							content: [
								{
									type: "text",
									text: `Chain stopped at step ${i + 1} (${step.agent}): ${errorMsg}`,
								},
							],
							details: makeDetails("chain")(results),
							isError: true,
						});
					}
					previousOutput =
						result.outputReference &&
						(result.outputMode === "file-only" ||
							structuredOutputIsBulky(result))
							? result.outputReference.message
							: getResultOutput(result);
				}
				const finalResult = results[results.length - 1];
				return complete({
					content: [
						{
							type: "text",
							text: getOutputForParent(finalResult) || "(no output)",
						},
					],
					details: makeDetails("chain")(results),
				});
			}

			if (selectedTasks && selectedTasks.length > 0) {
				const tasks = selectedTasks;

				// Track all results for streaming updates
				const allResults: SingleResult[] = new Array(tasks.length);

				// Initialize placeholder results
				for (let i = 0; i < tasks.length; i++) {
					const agent = agents.find((a) => a.name === tasks[i].agent);
					allResults[i] = {
						agent: tasks[i].agent,
						agentSource: agent?.source ?? "unknown",
						task: tasks[i].task,
						exitCode: -1, // -1 = still running
						messages: [],
						stderr: "",
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							cost: null,
							contextPeakTokens: 0,
							turns: 0,
						},
						model: resolvedModelId || agent?.model,
						effort: tasks[i].effort ?? effort ?? agent?.effort ?? "default",
					};
				}

				const emitParallelUpdate = () => {
					if (visibleUpdate) {
						const running = allResults.filter((r) => r.exitCode === -1).length;
						const done = allResults.filter((r) => r.exitCode !== -1).length;
						visibleUpdate({
							content: [
								{
									type: "text",
									text: `Parallel: ${done}/${allResults.length} done, ${running} running...`,
								},
							],
							details: makeDetails("parallel")([...allResults]),
						});
					}
				};

				emitParallelUpdate();

				const results = await mapWithConcurrencyLimit(
					tasks,
					MAX_SUBAGENT_WORKERS_PER_WAVE,
					async (t, index) => {
						try {
							const result = await run(
								invocationCwd,
								agents,
								t.agent,
								t.task,
								t.cwd,
								undefined,
								executionSignal,
								// Per-task update callback
								(partial) => {
									if (partial.details?.results[0]) {
										allResults[index] = partial.details.results[0];
										emitParallelUpdate();
									}
								},
								makeDetails("parallel"),
								resolvedModelId,
								modelSize,
								modelPolicy,
								t.effort ?? effort,
								t.taskId,
								undefined,
								{ continuable: params.continuable === true },
								{
									role: t.resolvedRole,
									depth: t.resolvedDepth,
									scopes: t.normalizedScopes,
								},
							);
							finalizeOutput(
								result,
								t.output,
								t.outputMode,
								invocationCwd,
								t.cwd,
								index,
								true,
							);
							allResults[index] = result;
							emitParallelUpdate();
							return result;
						} catch (error) {
							if (executionSignal?.aborted) throw error;
							const failedResult =
								error instanceof Error
									? (error as Error & { subagentResult?: SingleResult })
										.subagentResult
									: undefined;
							const result: SingleResult = failedResult ?? {
								...allResults[index],
								exitCode: 1,
								errorMessage:
									error instanceof Error ? error.message : String(error),
							};
							allResults[index] = result;
							emitParallelUpdate();
							return result;
						}
					},
				);

				const isSuccessfulResult = (r: SingleResult) =>
					r.exitCode === 0 &&
					r.stopReason !== "error" &&
					r.stopReason !== "aborted";
				const successCount = results.filter(isSuccessfulResult).length;
				return complete({
					content: [
						{
							type: "text",
							text: `Parallel: ${successCount}/${results.length} succeeded\n\n${aggregateParallelOutputs(results)}`,
						},
					],
					details: makeDetails("parallel")(results),
				});
			}

			if (selectedSingle) {
				const result = await run(
					invocationCwd,
					agents,
					selectedSingle.agent,
					selectedSingle.task,
					selectedSingle.cwd,
					undefined,
					executionSignal,
					visibleUpdate,
					makeDetails("single"),
					resolvedModelId,
					modelSize,
					modelPolicy,
					effort,
					selectedSingle.taskId,
					undefined,
					{ continuable: params.continuable === true },
					{
						role: selectedSingle.resolvedRole,
						depth: selectedSingle.resolvedDepth,
						scopes: selectedSingle.normalizedScopes,
					},
				);
				finalizeOutput(
					result,
					selectedSingle.output,
					selectedSingle.outputMode,
					invocationCwd,
					selectedSingle.cwd,
					0,
					false,
				);
				const isError =
					result.exitCode !== 0 ||
					result.stopReason === "error" ||
					result.stopReason === "aborted";
				if (isError) {
					const errorMsg =
						result.errorMessage ||
						result.stderr ||
						getFinalOutput(result.messages) ||
						"(no output)";
					return complete({
						content: [
							{
								type: "text",
								text: `Agent ${result.stopReason || "failed"}: ${errorMsg}`,
							},
						],
						details: makeDetails("single")([result]),
						isError: true,
					});
				}
				return complete({
					content: [
						{
							type: "text",
							text: getOutputForParent(result) || "(no output)",
						},
					],
					details: makeDetails("single")([result]),
				});
			}

			const available =
				agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
			return complete({
				content: [
					{
						type: "text",
						text: `Invalid parameters. Available agents: ${available}`,
					},
				],
				details: makeDetails("single")([]),
			});
			};

			const executeWithTreeSettlement = async () => {
				try {
					return await executeSelectedMode();
				} finally {
					await settleInvocationTree();
				}
			};
			if (!background) return executeWithTreeSettlement();
			void executeWithTreeSettlement()
				.then((result) =>
					queueBackgroundResult(orchestrationId, executionMode, result),
				)
				.catch((error) =>
					queueBackgroundResult(
						orchestrationId,
						executionMode,
						undefined,
						error,
					),
				);
			return {
				content: [
					{
						type: "text",
						text: `Started ${linkedTaskCount > 0 ? "task-linked" : "transient"} background ${executionMode} ${orchestrationId}. Continue parent work; completion will arrive as a follow-up. Use /subagents to inspect or cancel it.`,
					},
				],
				details: makeDetails(originalMode)([]),
			};
		},

		renderCall(args, theme, _context) {
			const scope: AgentScope = args.agentScope ?? "user";
			const modelHint = args.model
				? ` ${theme.fg("muted", `(model: ${args.model})`)}`
				: args.modelSize
					? ` ${theme.fg("muted", `(${args.modelSize}${args.modelPolicy ? `, ${args.modelPolicy}` : ""})`)}`
					: "";
			const backgroundHint = args.background
				? ` ${theme.fg("warning", "(background)")}`
				: "";
			if (args.readOnlyFanout) {
				const itemCount = args.readOnlyFanout.parallel.length;
				return new Text(
					theme.fg("toolTitle", theme.bold("subagent ")) +
						theme.fg("accent", `read-only fan-out (${itemCount} items)`) +
						theme.fg("muted", ` [${scope}]`) +
						modelHint +
						backgroundHint,
					0,
					0,
				);
			}
			if (args.continue) {
				return new Text(
					theme.fg("toolTitle", theme.bold("subagent ")) +
						theme.fg("accent", `continue ${args.continue.agent}`) +
						theme.fg("muted", ` [${scope}]`) +
						backgroundHint +
						`\n  ${theme.fg("dim", args.continue.task)}`,
					0,
					0,
				);
			}
			if (args.chain && args.chain.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("subagent ")) +
					theme.fg("accent", `chain (${args.chain.length} steps)`) +
					theme.fg("muted", ` [${scope}]`) +
					modelHint +
					backgroundHint;
				for (let i = 0; i < Math.min(args.chain.length, 3); i++) {
					const step = args.chain[i];
					// Clean up {previous} placeholder for display
					const cleanTask = step.task.replace(/\{previous\}/g, "").trim();
					const snippet =
						cleanTask.length > 40 ? `${cleanTask.slice(0, 40)}...` : cleanTask;
					text +=
						"\n  " +
						theme.fg("muted", `${i + 1}.`) +
						" " +
						theme.fg("accent", step.agent) +
						theme.fg("dim", ` ${snippet}`);
				}
				if (args.chain.length > 3)
					text += `\n  ${theme.fg("muted", `... +${args.chain.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}
			if (args.tasks && args.tasks.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("subagent ")) +
					theme.fg("accent", `parallel (${args.tasks.length} tasks)`) +
					theme.fg("muted", ` [${scope}]`) +
					modelHint +
					backgroundHint;
				for (const t of args.tasks.slice(0, 3)) {
					const snippet =
						t.task.length > 40 ? `${t.task.slice(0, 40)}...` : t.task;
					text += `\n  ${theme.fg("accent", t.agent)}${theme.fg("dim", ` ${snippet}`)}`;
				}
				if (args.tasks.length > 3)
					text += `\n  ${theme.fg("muted", `... +${args.tasks.length - 3} more`)}`;
				return new Text(text, 0, 0);
			}
			const agentName = args.agent || "...";
			const task = args.task || "...";
			let text =
				theme.fg("toolTitle", theme.bold("subagent ")) +
				theme.fg("accent", agentName) +
				theme.fg("muted", ` [${scope}]`) +
				modelHint +
				backgroundHint;
			text += `\n  ${theme.fg("dim", task)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as SubagentDetails | undefined;
			if (!details || details.results.length === 0) {
				const text = result.content[0];
				return new Text(
					text?.type === "text" ? text.text : "(no output)",
					0,
					0,
				);
			}

			const mdTheme = getMarkdownTheme();

			const renderDisplayItems = (items: DisplayItem[], limit?: number) => {
				const toShow = limit ? items.slice(-limit) : items;
				const skipped =
					limit && items.length > limit ? items.length - limit : 0;
				let text = "";
				if (skipped > 0)
					text += theme.fg("muted", `... ${skipped} earlier items\n`);
				for (const item of toShow) {
					if (item.type === "text") {
						const snippet = expanded
							? item.text
							: item.text.split("\n").slice(0, 3).join("\n");
						text += `${theme.fg("toolOutput", snippet)}\n`;
					} else {
						text += `${theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
					}
				}
				return text.trimEnd();
			};

			if (details.mode === "single" && details.results.length === 1) {
				const r = details.results[0];
				const isError =
					r.exitCode !== 0 ||
					r.stopReason === "error" ||
					r.stopReason === "aborted";
				const icon = isError
					? theme.fg("error", "✗")
					: theme.fg("success", "✓");
				const displayItems = getDisplayItems(r.messages);
				const finalOutput = getFinalOutput(r.messages);

				if (expanded) {
					const container = new Container();
					let header = `${icon}  ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}${formatAgentExecutionLabel(r, theme.fg.bind(theme))}`;
					if (isError && r.stopReason)
						header += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
					container.addChild(new Text(header, 0, 0));
					if (isError && r.errorMessage)
						container.addChild(
							new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0),
						);
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
					container.addChild(new Text(theme.fg("dim", r.task), 0, 0));
					container.addChild(new Spacer(1));
					container.addChild(
						new Text(theme.fg("muted", "─── Output ───"), 0, 0),
					);
					if (displayItems.length === 0 && !finalOutput) {
						container.addChild(
							new Text(theme.fg("muted", "(no output)"), 0, 0),
						);
					} else {
						for (const item of displayItems) {
							if (item.type === "toolCall")
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") +
											formatToolCall(
												item.name,
												item.args,
												theme.fg.bind(theme),
											),
										0,
										0,
									),
								);
						}
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(
								new Markdown(finalOutput.trim(), 0, 0, mdTheme),
							);
						}
					}
					const usageStr = formatUsageStats(r.usage, r.model);
					if (usageStr) {
						container.addChild(new Spacer(1));
						container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
					}
					return container;
				}

				let text = `${icon}  ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource})`)}${formatAgentExecutionLabel(r, theme.fg.bind(theme))}`;
				if (isError && r.stopReason)
					text += ` ${theme.fg("error", `[${r.stopReason}]`)}`;
				if (isError && r.errorMessage)
					text += `\n${theme.fg("error", `Error: ${r.errorMessage}`)}`;
				else if (displayItems.length === 0)
					text += `\n${theme.fg("muted", "(no output)")}`;
				else {
					text += `\n${renderDisplayItems(displayItems, COLLAPSED_ITEM_COUNT)}`;
					if (displayItems.length > COLLAPSED_ITEM_COUNT)
						text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				}
				const usageStr = formatUsageStats(r.usage, r.model);
				if (usageStr) text += `\n${theme.fg("dim", usageStr)}`;
				return new Text(text, 0, 0);
			}

			const aggregateUsage = (results: SingleResult[]) => {
				const total = {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					cost: null as number | null,
					turns: 0,
				};
				for (const r of results) {
					total.input += r.usage.input;
					total.output += r.usage.output;
					total.cacheRead += r.usage.cacheRead;
					total.cacheWrite += r.usage.cacheWrite;
					if (r.usage.cost !== null)
						total.cost = (total.cost ?? 0) + r.usage.cost;
					total.turns += r.usage.turns;
				}
				return total;
			};

			if (details.mode === "chain") {
				const successCount = details.results.filter(
					(r) => r.exitCode === 0,
				).length;
				const icon =
					successCount === details.results.length
						? theme.fg("success", "✓")
						: theme.fg("error", "✗");

				if (expanded) {
					const container = new Container();
					container.addChild(
						new Text(
							icon +
								"  " +
								theme.fg("toolTitle", theme.bold("chain ")) +
								theme.fg(
									"accent",
									`${successCount}/${details.results.length} steps`,
								),
							0,
							0,
						),
					);

					for (const r of details.results) {
						const rIcon =
							r.exitCode === 0
								? theme.fg("success", "✓")
								: theme.fg("error", "✗");
						const displayItems = getDisplayItems(r.messages);
						const finalOutput = getFinalOutput(r.messages);

						container.addChild(new Spacer(1));
						container.addChild(
							new Text(
								`${theme.fg("muted", `--- Step ${r.step}: `) + theme.fg("accent", r.agent)}${formatAgentExecutionLabel(r, theme.fg.bind(theme))} ${rIcon}`,
								0,
								0,
							),
						);
						container.addChild(
							new Text(
								theme.fg("muted", "Task: ") + theme.fg("dim", r.task),
								0,
								0,
							),
						);

						// Show tool calls
						for (const item of displayItems) {
							if (item.type === "toolCall") {
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") +
											formatToolCall(
												item.name,
												item.args,
												theme.fg.bind(theme),
											),
										0,
										0,
									),
								);
							}
						}

						// Show final output as markdown
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(
								new Markdown(finalOutput.trim(), 0, 0, mdTheme),
							);
						}

						const stepUsage = formatUsageStats(r.usage, r.model);
						if (stepUsage)
							container.addChild(new Text(theme.fg("dim", stepUsage), 0, 0));
					}

					const usageStr = formatUsageStats(aggregateUsage(details.results));
					if (usageStr) {
						container.addChild(new Spacer(1));
						container.addChild(
							new Text(theme.fg("dim", `Total: ${usageStr}`), 0, 0),
						);
					}
					return container;
				}

				// Collapsed view
				let text =
					icon +
					"  " +
					theme.fg("toolTitle", theme.bold("chain ")) +
					theme.fg("accent", `${successCount}/${details.results.length} steps`);
				for (const r of details.results) {
					const rIcon =
						r.exitCode === 0
							? theme.fg("success", "✓")
							: theme.fg("error", "✗");
					const displayItems = getDisplayItems(r.messages);
					text += `\n\n${theme.fg("muted", `--- Step ${r.step}: `)}${theme.fg("accent", r.agent)}${formatAgentExecutionLabel(r, theme.fg.bind(theme))} ${rIcon}`;
					if (displayItems.length === 0)
						text += `\n${theme.fg("muted", "(no output)")}`;
					else text += `\n${renderDisplayItems(displayItems, 5)}`;
				}
				const usageStr = formatUsageStats(aggregateUsage(details.results));
				if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
				text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			if (details.mode === "parallel") {
				const running = details.results.filter((r) => r.exitCode === -1).length;
				const successCount = details.results.filter(
					(r) => r.exitCode === 0,
				).length;
				const failCount = details.results.filter((r) => r.exitCode > 0).length;
				const isRunning = running > 0;
				const icon = isRunning
					? theme.fg("warning", "⏳")
					: failCount > 0
						? theme.fg("warning", "◐")
						: theme.fg("success", "✓");
				const status = isRunning
					? `${successCount + failCount}/${details.results.length} done, ${running} running`
					: `${successCount}/${details.results.length} tasks`;

				if (expanded && !isRunning) {
					const container = new Container();
					container.addChild(
						new Text(
							`${icon}  ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`,
							0,
							0,
						),
					);

					for (const r of details.results) {
						const rIcon =
							r.exitCode === 0
								? theme.fg("success", "✓")
								: theme.fg("error", "✗");
						const displayItems = getDisplayItems(r.messages);
						const finalOutput = getFinalOutput(r.messages);

						container.addChild(new Spacer(1));
						container.addChild(
							new Text(
								`${theme.fg("muted", "--- ") + theme.fg("accent", r.agent)}${formatAgentExecutionLabel(r, theme.fg.bind(theme))} ${rIcon}`,
								0,
								0,
							),
						);
						container.addChild(
							new Text(
								theme.fg("muted", "Task: ") + theme.fg("dim", r.task),
								0,
								0,
							),
						);

						// Show tool calls
						for (const item of displayItems) {
							if (item.type === "toolCall") {
								container.addChild(
									new Text(
										theme.fg("muted", "→ ") +
											formatToolCall(
												item.name,
												item.args,
												theme.fg.bind(theme),
											),
										0,
										0,
									),
								);
							}
						}

						// Show final output as markdown
						if (finalOutput) {
							container.addChild(new Spacer(1));
							container.addChild(
								new Markdown(finalOutput.trim(), 0, 0, mdTheme),
							);
						}

						const taskUsage = formatUsageStats(r.usage, r.model);
						if (taskUsage)
							container.addChild(new Text(theme.fg("dim", taskUsage), 0, 0));
					}

					const usageStr = formatUsageStats(aggregateUsage(details.results));
					if (usageStr) {
						container.addChild(new Spacer(1));
						container.addChild(
							new Text(theme.fg("dim", `Total: ${usageStr}`), 0, 0),
						);
					}
					return container;
				}

				// Collapsed view (or still running)
				let text = `${icon}  ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`;
				for (const r of details.results) {
					const rIcon =
						r.exitCode === -1
							? theme.fg("warning", "⏳")
							: r.exitCode === 0
								? theme.fg("success", "✓")
								: theme.fg("error", "✗");
					const displayItems = getDisplayItems(r.messages);
					text += `\n\n${theme.fg("muted", "--- ")}${theme.fg("accent", r.agent)}${formatAgentExecutionLabel(r, theme.fg.bind(theme))} ${rIcon}`;
					if (displayItems.length === 0)
						text += `\n${theme.fg("muted", r.exitCode === -1 ? "(running...)" : "(no output)")}`;
					else text += `\n${renderDisplayItems(displayItems, 5)}`;
				}
				if (!isRunning) {
					const usageStr = formatUsageStats(aggregateUsage(details.results));
					if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
				}
				if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
		},
	});

	const registerSubagentTools = (
		schemas: ReturnType<typeof createSubagentSchemas>,
	) => {
		pi.registerTool({
			...subagentExecutor,
			parameters: schemas.subagent,
		});

		pi.registerTool({
			name: "subagent_chain",
			label: "Subagent Chain",
			description:
				"Run dependent subagents sequentially. Each step task may include {previous}, which is replaced with the prior step output. This tool is deferred; use it only when later work depends on earlier output.",
			parameters: schemas.chain,
			renderResult: subagentExecutor.renderResult,
			execute(toolCallId, params, signal, onUpdate, ctx) {
				const { steps, ...common } = params;
				return subagentExecutor.execute(
					toolCallId,
					{ ...common, chain: steps },
					signal,
					onUpdate,
					ctx,
				);
			},
		});

		pi.registerTool({
			name: "subagent_continue",
			label: "Subagent Continue",
			description:
				"Continue a saved child-agent session with a follow-up task. This tool is deferred and requires the original agent name and saved session path.",
			parameters: schemas.continue,
			renderResult: subagentExecutor.renderResult,
			execute(toolCallId, params, signal, onUpdate, ctx) {
				const {
					agent,
					session,
					task,
					effort,
					cwd,
					output,
					outputMode,
					...common
				} = params;
				return subagentExecutor.execute(
					toolCallId,
					{
						...common,
						effort,
						continue: {
							agent,
							session,
							task,
							effort,
							cwd,
							output,
							outputMode,
						},
					},
					signal,
					onUpdate,
					ctx,
				);
			},
		});

		pi.registerTool({
			name: "subagent_fanout",
			label: "Subagent Read-only Fanout",
			description:
				"Run the opt-in read-only fanout experiment with equivalent single-generalist and parallel-specialist plans. Requires at least two parallel tasks and a shared outputSchema; one arm is assigned deterministically.",
			parameters: schemas.fanout,
			renderResult: subagentExecutor.renderResult,
			execute(toolCallId, params, signal, onUpdate, ctx) {
				const { single, parallel, ...common } = params;
				return subagentExecutor.execute(
					toolCallId,
					{ ...common, readOnlyFanout: { single, parallel } },
					signal,
					onUpdate,
					ctx,
				);
			},
		});

		pi.registerTool({
			name: "subagent_workflow",
			label: "Subagent Workflow",
			description:
				"Run a bounded typed map, targeted retry, optional verification, and grouped reduction workflow. Every item declares required tools and bounded input. Modifying items require disjoint repository-relative scopes.",
			parameters: WorkflowToolSchema,
			async execute(toolCallId, rawParams, signal, onUpdate, ctx) {
				const identity = currentSubagentIdentity();
				if (identity.role === "leaf" || identity.depth >= 2)
					throw new Error(
						"Leaf and depth-two subagents cannot run subagent workflows.",
					);
				const params = rawParams as unknown as WorkflowSpecification & {
					agentScope?: AgentScope;
					model?: string;
					modelSize?: ModelSize;
					modelPolicy?: ModelPolicy;
					effort?: AgentEffort;
					confirmProjectAgents?: boolean;
				};
				const agentScope = params.agentScope ?? "user";
				const discovery =
					sessionAgentCatalog?.cwd === ctx.cwd
						? sessionAgentCatalog.byScope[agentScope]
						: discoverAgents(ctx.cwd, agentScope);
				const agents = discovery.agents;
				const normalizedItems = params.items.map((item) => ({
					...item,
					scope: item.scope
						? normalizeRepositoryScopes(item.scope, ctx.cwd)
						: undefined,
				}));
				const modifyingItems = normalizedItems.filter((item) =>
					item.capabilities.some((tool) =>
						DIRECT_FILE_MUTATION_TOOLS.has(tool),
					),
				);
				for (const item of modifyingItems) {
					if ((item.scope?.length ?? 0) === 0)
						throw new Error(
							`Modifying workflow item ${item.key} must declare a repository-relative scope.`,
						);
				}
				assertDisjointScopes(
					modifyingItems.map((item) => ({
						key: item.key,
						scopes: item.scope ?? [],
					})),
					ctx.cwd,
				);

				const requestedNames = new Set(normalizedItems.map((item) => item.agent));
				if (params.verify?.agent) requestedNames.add(params.verify.agent);
				if (params.reduce?.agent) requestedNames.add(params.reduce.agent);
				if (
					(agentScope === "project" || agentScope === "both") &&
					params.confirmProjectAgents
				) {
					const projectNames = [...requestedNames].filter(
						(name) =>
							agents.find((agent) => agent.name === name)?.source ===
							"project",
					);
					if (projectNames.length > 0) {
						if (!ctx.hasUI)
							throw new Error(
								"Project-local workflow agent approval requires an interactive UI.",
							);
						const approved = await ctx.ui.confirm(
							"Run project-local workflow agents?",
							`Agents: ${projectNames.join(", ")}\nSource: ${discovery.projectAgentsDir ?? "(unknown)"}`,
						);
						if (!approved)
							throw new Error("Project-local workflow agents were not approved.");
					}
				}

				const effectiveAgent = (
					agentName: string,
					scope: readonly string[] = [],
				) => {
					const agent = agents.find((candidate) => candidate.name === agentName);
					if (!agent) return undefined;
					return {
						name: agent.name,
						effectiveTools:
							childTools(agent, "leaf", scope.length > 0) ?? ["read", "bash"],
					};
				};
				const assertPhaseCapabilities = (
					phase: "verification" | "reduction",
					agentName: string | undefined,
					capabilities: readonly string[] | undefined,
				) => {
					if (!agentName || !capabilities)
						throw new Error(
							`Workflow ${phase} requires agent, task, and capabilities.`,
						);
					const agent = effectiveAgent(agentName);
					if (!agent) throw new Error(`Unknown workflow agent: ${agentName}`);
					const tools = new Set(agent.effectiveTools);
					const missing = capabilities.filter((tool) => !tools.has(tool));
					if (missing.length > 0)
						throw new Error(
							`Workflow ${phase} capability preflight rejected; missing tools: ${missing.join(", ")}.`,
						);
				};
				if (params.verify) {
					if (!params.verify.task)
						throw new Error(
							"Workflow verification requires agent, task, and capabilities.",
						);
					assertPhaseCapabilities(
						"verification",
						params.verify.agent,
						params.verify.capabilities,
					);
				}
				if (params.reduce) {
					if (!params.reduce.task)
						throw new Error(
							"Workflow reduction requires agent, task, and capabilities.",
						);
					assertPhaseCapabilities(
						"reduction",
						params.reduce.agent,
						params.reduce.capabilities,
					);
				}

				const runPhase = async (options: {
					agent: string;
					task: string;
					scope?: readonly string[];
					phase: WorkflowPhase;
					key: string;
					attempt: number;
					retryOrigin?: string;
					modifying: boolean;
					outputSchema: TSchema;
					phaseSignal: AbortSignal;
				}) => {
					const internalCallId = `${toolCallId}-${randomUUID()}`;
					internalWorkflowRuns.set(internalCallId, {
						workflowPhase: options.phase,
						taskKey: options.key,
						attempt: options.attempt,
						retryOrigin: options.retryOrigin,
						modifying: options.modifying,
					});
					try {
						const result = await subagentExecutor.execute(
							internalCallId,
							{
								agent: options.agent,
								task: options.task,
								role: "leaf",
								scope: options.scope ? [...options.scope] : undefined,
								agentScope,
								model: params.model,
								modelSize: params.modelSize,
								modelPolicy: params.modelPolicy,
								effort: params.effort,
								outputSchema: options.outputSchema,
								continuable: true,
								confirmProjectAgents: false,
							},
							options.phaseSignal,
							onUpdate,
							ctx,
						);
						const worker = result.details?.results.at(-1);
						if (!worker?.structuredOutput)
							throw new Error(
								worker?.errorMessage ||
									"Workflow leaf returned no structured result.",
							);
						return worker.structuredOutput;
					} finally {
						internalWorkflowRuns.delete(internalCallId);
					}
				};

				const specification: WorkflowSpecification = {
					id: params.id,
					items: normalizedItems,
					attempts: params.attempts,
					concurrency: params.concurrency,
					verify: params.verify,
					reduce: params.reduce,
				};
				const result = await getSubagentWorkflowRuntime().run(
					specification,
					{
						resolveAgent: (agentName, item) =>
							effectiveAgent(agentName, item?.scope),
						execute: (request: WorkflowExecutionRequest) =>
							runPhase({
								agent: request.agent,
								task:
									request.task + workflowInputInstruction(request.input),
								scope: normalizedItems.find(
									(item) => item.key === request.key,
								)?.scope,
								phase: request.attempt === 1 ? "map" : "retry",
								key: request.key,
								attempt: request.attempt,
								retryOrigin:
									request.attempt > 1
										? `${request.key}-attempt-${request.attempt - 1}`
										: undefined,
								modifying: normalizedItems
									.find((item) => item.key === request.key)
									?.capabilities.some((tool) =>
										DIRECT_FILE_MUTATION_TOOLS.has(tool),
									) ?? false,
								outputSchema: WorkflowLeafOutputSchema,
								phaseSignal: request.signal,
							}),
						verify: params.verify
							? (envelope: WorkflowResultEnvelope, phaseSignal) =>
									runPhase({
										agent: params.verify?.agent ?? "",
										task: `${params.verify?.task ?? ""}\n\nVerify this bounded item envelope and report only contradiction metadata:\n${JSON.stringify(envelope)}`,
										phase: "verify",
										key: envelope.key,
										attempt: 1,
										modifying: false,
										outputSchema: WorkflowVerificationOutputSchema,
										phaseSignal,
									})
							: undefined,
						reduce: params.reduce
							? (request: WorkflowReductionRequest) =>
									runPhase({
										agent: params.reduce?.agent ?? "",
										task: `${params.reduce?.task ?? ""}\n\nReduce this bounded group of at most eight envelopes:\n${JSON.stringify(request.entries)}`,
										phase: "reduce",
										key: `reduce-${request.level}`,
										attempt: 1,
										modifying: false,
										outputSchema: WorkflowReductionOutputSchema,
										phaseSignal: request.signal,
									})
							: undefined,
					},
					signal,
				);
				const counts = Object.fromEntries(
					["found", "not_found", "inconclusive", "error"].map((status) => [
						status,
						result.items.filter((item) => item.status === status).length,
					]),
				);
				const visibleItems = result.items.slice(0, 16).map((item) => ({
					key: item.key,
					status: item.status,
					attempts: item.attempts,
					evidence: item.evidence?.slice(0, 2),
					validation: item.validation?.slice(0, 2),
					gaps: item.gaps?.slice(0, 2),
					verification: item.verification,
				}));
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								id: result.id,
								counts,
								reduction: result.reductions.at(-1),
								items: visibleItems,
								omittedItems: Math.max(0, result.items.length - visibleItems.length),
							}),
						},
					],
					details: { workflow: result },
				};
			},
		});
	};

	registerSubagentTools(InitialSubagentSchemas);
	refreshAgentTools = (agentNames) =>
		registerSubagentTools(createSubagentSchemas(agentNames));
}
