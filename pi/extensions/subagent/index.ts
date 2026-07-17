/**
 * Subagent Tool - Delegate tasks to specialized agents
 *
 * Spawns a separate `pi` process for each subagent invocation,
 * giving it an isolated context window.
 *
 * Supports three modes:
 *   - Single: { agent: "name", task: "..." }
 *   - Parallel: { tasks: [{ agent: "name", task: "..." }, ...] }
 *   - Chain: { chain: [{ agent: "name", task: "... {previous} ..." }, ...] }
 *
 * Uses JSON mode to capture structured output from subagents.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	getMarkdownTheme,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { emitTerminalBell } from "../../lib/extension-utils.js";
import { recordEvent } from "../../lib/metrics.js";
import {
	type ModelPolicy,
	type ModelSize,
	resolveDynamicModelFromRegistry,
} from "../../lib/model-routing.js";
import { TimingSpan } from "../../lib/observability.js";
import {
	buildOrchestrationRunEvent,
	type OrchestrationWorker,
} from "../../lib/orchestration-telemetry.js";
import {
	createTask,
	type NormalizedTaskUsage,
	normalizeTaskUsage,
	resolveTaskWorkspace,
	transitionTask,
	updateTask,
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
	type AgentEffort,
	type AgentScope,
	discoverAgents,
	resolveAgentSkillPaths,
} from "./agents.js";

/**
 * Operator task registry integration -- defensive wrappers.
 *
 * Subagent execution must never crash because the operator-layer registry
 * fails to write (disk full, permission error, etc.). All registry calls go
 * through these helpers; failures are silently dropped.
 */
function safeCreateSubagentTask(
	agentName: string,
	task: string,
	cwd: string,
	step: number | undefined,
	agentConfig?: AgentConfig,
	model?: string,
	effort?: AgentEffort,
): string | undefined {
	try {
		const snippet = task.length > 200 ? `${task.slice(0, 200)}...` : task;
		const summary = step ? `${agentName} step ${step}` : agentName;
		const metadata: Record<string, unknown> = { cwd };
		metadata.model = model ?? agentConfig?.model ?? "default";
		metadata.effort = effort ?? agentConfig?.effort ?? "default";
		if (agentConfig?.skills) metadata.skills = agentConfig.skills;
		if (agentConfig?.isolation) metadata.isolation = agentConfig.isolation;
		if (agentConfig?.memory) metadata.memory = agentConfig.memory;
		const record = createTask({
			origin: "subagent",
			summary,
			agentName,
			prompt: snippet,
			workspace: resolveTaskWorkspace(cwd),
			metadata,
		});
		// T14: structured metrics event mirrors the registry write so
		// downstream analytics can stream events without polling registry
		// state. Recording errors are silently dropped by recordEvent.
		recordEvent({
			event: "task_status_change",
			data: {
				taskId: record.id,
				origin: "subagent",
				agentName,
				from: null,
				to: "pending",
				step,
			},
		});
		return record.id;
	} catch {
		return undefined;
	}
}

function safeTransitionTask(
	id: string | undefined,
	target: "running" | "completed" | "failed" | "cancelled",
	opts: {
		errorReason?: string;
		usage?: NormalizedTaskUsage;
	} = {},
): void {
	if (!id) return;
	try {
		const before = transitionTask(id, target, opts);
		recordEvent({
			event: "task_status_change",
			data: {
				taskId: id,
				to: target,
				retryCount: before.retryCount,
				errorReason: opts.errorReason,
				usage: opts.usage,
			},
		});
	} catch {
		// ignore -- registry should never block subagent flow
	}
}

function safeUpdateTaskSnippet(id: string | undefined, snippet: string): void {
	if (!id) return;
	try {
		updateTask(id, { ["pre" + "view"]: snippet.slice(0, 200) });
	} catch {
		// ignore
	}
}

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

const MAX_CONCURRENCY = 8;
const COLLAPSED_ITEM_COUNT = 10;

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
}

export interface SubagentDetails {
	mode: "single" | "parallel" | "chain";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	results: SingleResult[];
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
			getFinalOutput(result.messages),
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
	const output = getFinalOutput(result.messages);
	if (result.outputMode !== "file-only") return output;
	if (result.outputReference) return result.outputReference.message;
	const fallbackMessage = getArtifactFallbackMessage(result);
	return fallbackMessage ? `${output}\n\n${fallbackMessage}`.trim() : output;
}

export function aggregateParallelOutputs(results: SingleResult[]): string {
	return results
		.map((r, i) => {
			const header = `=== Parallel Task ${i + 1} (${r.agent}) ===`;
			const output = getFinalOutput(r.messages);
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

function terminateProcessTree(proc: ReturnType<typeof spawn>): void {
	const pid = proc.pid;
	if (!pid) return;
	if (process.platform === "win32") {
		spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
			stdio: "ignore",
			windowsHide: true,
		});
		return;
	}
	try {
		process.kill(-pid, "SIGTERM");
	} catch {
		proc.kill("SIGTERM");
	}
	setTimeout(() => {
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			if (!proc.killed) proc.kill("SIGKILL");
		}
	}, 5000);
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

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
): Promise<SingleResult> {
	const runStartedAt = Date.now();
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

	const args: string[] = [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"--no-skills",
	];
	if (modelOverride) args.push("--model", modelOverride);
	else if (agent.model) args.push("--model", agent.model);
	const effectiveEffort = effortOverride ?? agent.effort;
	if (effectiveEffort) args.push("--thinking", effectiveEffort);
	if (agent.tools && agent.tools.length > 0)
		args.push("--tools", agent.tools.join(","));
	for (const skillPath of resolveAgentSkillPaths(agent))
		args.push("--skill", skillPath);

	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;

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
		runId: executionAttemptRunId,
	};

	const emitUpdate = () => {
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

	// Operator task registry: track this subagent invocation as durable work.
	// Lifecycle: pending -> running (before spawn) -> completed/failed/cancelled.
	const taskId =
		existingTaskId ??
		safeCreateSubagentTask(
			agentName,
			task,
			cwd ?? defaultCwd,
			step,
			agent,
			currentResult.model,
			effectiveEffort,
		);
	const runId = executionAttemptRunId ?? taskId ?? randomUUID();
	currentResult.runId = runId;
	currentResult.taskId = taskId;
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
	safeTransitionTask(taskId, "running");
	let taskFinalized = false;
	let timingFinished = false;

	try {
		if (agent.systemPrompt.trim()) {
			const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
			args.push("--append-system-prompt", tmpPromptPath);
		}

		args.push(`Task: ${task}`);
		let wasAborted = false;

		const subagentStartedAt = new Date().toISOString();
		const exitCode = await new Promise<number>((resolve) => {
			let resolved = false;
			let proc: ReturnType<typeof spawn> | undefined;
			const finish = (code: number) => {
				if (resolved) return;
				resolved = true;
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
			};
			proc = spawn(invocation.command, invocation.args, {
				cwd: cwd ?? defaultCwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: childEnv,
				windowsHide: true,
				detached: process.platform !== "win32",
			});
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: {
					type?: string;
					message?: Message;
					messages?: Message[];
				};
				try {
					event = JSON.parse(line) as typeof event;
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					currentResult.messages.push(msg);

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
					currentResult.messages.push(event.message as Message);
					emitUpdate();
				}

				if (event.type === "agent_end") {
					if (
						Array.isArray(event.messages) &&
						currentResult.messages.length === 0
					) {
						currentResult.messages = event.messages as Message[];
						emitUpdate();
					}
					finish(0);
					proc?.kill("SIGTERM");
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

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				finish(code ?? 0);
			});

			proc.on("error", () => {
				finish(1);
			});

			if (signal) {
				const killProc = () => {
					wasAborted = true;
					terminateProcessTree(proc);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		currentResult.exitCode = exitCode;
		const taskUsage = taskUsageSnapshot(currentResult.usage);
		if (wasAborted) {
			safeTransitionTask(taskId, "cancelled", { usage: taskUsage });
			taskFinalized = true;
			timingSpan.finish("cancelled", {
				exitCode,
				workflow,
				phase: "run",
				planPath,
			});
			timingFinished = true;
			throw new Error("Subagent was aborted");
		}
		const isModelError = currentResult.stopReason === "error";
		if (exitCode === 0 && !isModelError) {
			safeUpdateTaskSnippet(taskId, getFinalOutput(currentResult.messages));
			safeTransitionTask(taskId, "completed", { usage: taskUsage });
			timingSpan.finish("ok", { exitCode, workflow, phase: "run", planPath });
		} else {
			const errorReason =
				currentResult.errorMessage ||
				currentResult.stderr.slice(-500) ||
				(isModelError
					? "model returned stopReason=error"
					: `exit code ${exitCode}`);
			safeTransitionTask(taskId, "failed", { errorReason, usage: taskUsage });
			timingSpan.finish("error", {
				exitCode,
				workflow,
				phase: "run",
				planPath,
				failureReason: errorReason,
			});
		}
		timingFinished = true;
		taskFinalized = true;
		return currentResult;
	} catch (err) {
		// Aborts already record cancelled above and set taskFinalized; this
		// catches unexpected runtime errors only.
		if (!taskFinalized) {
			const errorReason = err instanceof Error ? err.message : String(err);
			safeTransitionTask(taskId, "failed", {
				errorReason,
				usage: taskUsageSnapshot(currentResult.usage),
			});
		}
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
	effort?: AgentEffort;
	cwd?: string;
	output?: string | boolean;
	outputMode?: OutputMode;
};

type ChainParams = TaskParams;

const OutputModeSchema = Type.Union(
	[Type.Literal("inline"), Type.Literal("file-only")],
	{
		description:
			'Output preservation policy. "inline" returns full child output in the parent result. "file-only" saves full output to an artifact and returns an explicit file reference.',
		default: "inline",
	},
);

const EffortSchema = Type.Union([
	Type.Literal("off"),
	Type.Literal("minimal"),
	Type.Literal("low"),
	Type.Literal("medium"),
	Type.Literal("high"),
	Type.Literal("xhigh"),
	Type.Literal("max"),
]);

const TaskItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	task: Type.String({ description: "Task to delegate to the agent" }),
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

const ChainItem = Type.Object({
	agent: Type.String({ description: "Name of the agent to invoke" }),
	effort: Type.Optional(EffortSchema),
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

const AgentScopeSchema = Type.Union(
	[Type.Literal("user"), Type.Literal("project"), Type.Literal("both")],
	{
		description:
			'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
		default: "user",
	},
);

const ModelSizeSchema = Type.Union(
	[Type.Literal("small"), Type.Literal("medium"), Type.Literal("large")],
	{
		description:
			"Dynamic model size override. Resolves against the current session model/provider and available registry models.",
	},
);

const ModelPolicySchema = Type.Union(
	[Type.Literal("same-provider"), Type.Literal("same-family")],
	{
		description:
			"How to resolve dynamic model sizes. same-provider prefers the current provider; same-family prefers the current series first, then the provider.",
		default: "same-provider",
	},
);

const SubagentParams = Type.Object({
	agent: Type.Optional(
		Type.String({
			description: "Name of the agent to invoke (for single mode)",
		}),
	),
	task: Type.Optional(
		Type.String({
			description: "Task to delegate (for single mode)",
		}),
	),
	tasks: Type.Optional(
		Type.Array(TaskItem, {
			description: "Array of {agent, task} for parallel execution",
		}),
	),
	chain: Type.Optional(
		Type.Array(ChainItem, {
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

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate tasks to specialized subagents with isolated context.",
			"Modes: single (agent + task), parallel (tasks array), chain (sequential with {previous} placeholder).",
			'Default agent scope is "user" (from ~/.pi/agent/agents).',
			'To enable project-local agents in .pi/agents, set agentScope: "both" (or "project").',
			"Optional model overrides the agent frontmatter model. Optional modelSize/modelPolicy parameters dynamically map subagents onto the current provider/model ladder.",
		].join(" "),
		parameters: SubagentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
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
			const resolvedModel =
				!explicitModel && modelSize
					? resolveDynamicModelFromRegistry(
							ctx.modelRegistry,
							ctx,
							modelSize,
							modelPolicy,
						)
					: undefined;
			const resolvedModelId =
				explicitModel ??
				(resolvedModel
					? `${resolvedModel.provider}/${resolvedModel.id}`
					: undefined);
			const discovery = discoverAgents(ctx.cwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = params.confirmProjectAgents ?? false;

			const hasChain = (params.chain?.length ?? 0) > 0;
			const hasTasks = (params.tasks?.length ?? 0) > 0;
			const hasSingle = Boolean(params.agent && params.task);
			const modeCount = Number(hasChain) + Number(hasTasks) + Number(hasSingle);

			const makeDetails =
				(mode: "single" | "parallel" | "chain") =>
				(results: SingleResult[]): SubagentDetails => ({
					mode,
					agentScope,
					projectAgentsDir: discovery.projectAgentsDir,
					results,
				});
			const orchestrationId = randomUUID();
			const interactionId = registerOrchestrationInvocation(orchestrationId);
			const invocationStartedAt = Date.now();
			const originalMode = hasChain
				? "chain"
				: hasTasks
					? "parallel"
					: "single";
			let orchestrationEmitted = false;
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
					const childText = getFinalOutput(worker.messages);
					const forwarded =
						originalMode === "chain" && !isFinalChainWorker
							? worker.outputMode === "file-only" && worker.outputReference
								? worker.outputReference.message
								: childText
							: undefined;
					return {
						runId: worker.runId ?? randomUUID(),
						...(worker.taskId ? { taskId: worker.taskId } : {}),
						agent: worker.agent,
						...(worker.model ? { resolvedModel: worker.model } : {}),
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
					...(ctx.sessionManager?.getSessionId?.()
						? { parentSessionId: ctx.sessionManager.getSessionId() }
						: {}),
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
					session: ctx.sessionManager?.getSessionId?.(),
				});
				if (event)
					recordEvent(event as unknown as Parameters<typeof recordEvent>[0]);
				return result;
			};
			const run = async (
				...args: Parameters<typeof runSingleAgent>
			): Promise<SingleResult> => {
				try {
					return await runSingleAgent(...args);
				} catch (error) {
					const failedResult =
						error instanceof Error
							? (error as Error & { subagentResult?: SingleResult })
									.subagentResult
							: undefined;
					complete({
						content: [],
						details: makeDetails(
							originalMode === "parallel" || originalMode === "chain"
								? originalMode
								: "single",
						)(failedResult ? [failedResult] : []),
						isError: true,
					});
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
				(agentScope === "project" || agentScope === "both") &&
				confirmProjectAgents &&
				ctx.hasUI
			) {
				const requestedAgentNames = new Set<string>();
				if (params.chain)
					for (const step of params.chain) requestedAgentNames.add(step.agent);
				if (params.tasks)
					for (const t of params.tasks) requestedAgentNames.add(t.agent);
				if (params.agent) requestedAgentNames.add(params.agent);

				const projectAgentsRequested = Array.from(requestedAgentNames)
					.map((name) => agents.find((a) => a.name === name))
					.filter((a): a is AgentConfig => a?.source === "project");

				if (projectAgentsRequested.length > 0) {
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
							details: makeDetails(
								hasChain ? "chain" : hasTasks ? "parallel" : "single",
							)([]),
						});
				}
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
					const chainUpdate: OnUpdateCallback | undefined = onUpdate
						? (partial) => {
								// Combine completed results with current streaming result
								const currentResult = partial.details?.results[0];
								if (currentResult) {
									const allResults = [...results, currentResult];
									onUpdate({
										content: partial.content,
										details: makeDetails("chain")(allResults),
									});
								}
							}
						: undefined;

					const result = await run(
						ctx.cwd,
						agents,
						step.agent,
						taskWithContext,
						step.cwd,
						i + 1,
						signal,
						chainUpdate,
						makeDetails("chain"),
						resolvedModelId,
						modelSize,
						modelPolicy,
						step.effort ?? effort,
					);
					finalizeOutput(
						result,
						step.output,
						step.outputMode,
						ctx.cwd,
						step.cwd,
						i,
						false,
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
						result.outputMode === "file-only" && result.outputReference
							? result.outputReference.message
							: getFinalOutput(result.messages);
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

			if (params.tasks && params.tasks.length > 0) {
				const tasks = params.tasks as TaskParams[];

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
					if (onUpdate) {
						const running = allResults.filter((r) => r.exitCode === -1).length;
						const done = allResults.filter((r) => r.exitCode !== -1).length;
						onUpdate({
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
					MAX_CONCURRENCY,
					async (t, index) => {
						const result = await run(
							ctx.cwd,
							agents,
							t.agent,
							t.task,
							t.cwd,
							undefined,
							signal,
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
						);
						finalizeOutput(
							result,
							t.output,
							t.outputMode,
							ctx.cwd,
							t.cwd,
							index,
							true,
						);
						allResults[index] = result;
						emitParallelUpdate();
						return result;
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

			if (params.agent && params.task) {
				const result = await run(
					ctx.cwd,
					agents,
					params.agent,
					params.task,
					params.cwd,
					undefined,
					signal,
					onUpdate,
					makeDetails("single"),
					resolvedModelId,
					modelSize,
					modelPolicy,
					effort,
				);
				finalizeOutput(
					result,
					params.output,
					params.outputMode,
					ctx.cwd,
					params.cwd,
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
		},

		renderCall(args, theme, _context) {
			const scope: AgentScope = args.agentScope ?? "user";
			const modelHint = args.model
				? ` ${theme.fg("muted", `(model: ${args.model})`)}`
				: args.modelSize
					? ` ${theme.fg("muted", `(${args.modelSize}${args.modelPolicy ? `, ${args.modelPolicy}` : ""})`)}`
					: "";
			if (args.chain && args.chain.length > 0) {
				let text =
					theme.fg("toolTitle", theme.bold("subagent ")) +
					theme.fg("accent", `chain (${args.chain.length} steps)`) +
					theme.fg("muted", ` [${scope}]`) +
					modelHint;
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
					modelHint;
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
			const snippet = args.task
				? args.task.length > 60
					? `${args.task.slice(0, 60)}...`
					: args.task
				: "...";
			let text =
				theme.fg("toolTitle", theme.bold("subagent ")) +
				theme.fg("accent", agentName) +
				theme.fg("muted", ` [${scope}]`) +
				modelHint;
			text += `\n  ${theme.fg("dim", snippet)}`;
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
}
