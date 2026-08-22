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
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	defineTool,
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
	getMarkdownTheme,
	ProjectTrustStore,
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
	ADVISORY_SUBAGENT_ROUTING_POLICY_VERSION,
	type AdvisorySubagentTaskClass,
	classifyAdvisorySubagentRoute,
	type ModelLike,
	type ModelPolicy,
	type ModelSize,
	parseProviderModelString,
	preferredEffortForSize,
	resolveAdvisorySubagentRouting,
	resolveDynamicModel,
	type RoutingOutcomeAssignment,
	resolveSampledDynamicModelFromRegistry,
} from "../../lib/model-routing.js";
import { TimingSpan } from "../../lib/observability.js";
import {
	assignReadOnlyFanoutExperiment,
	buildOrchestrationExperimentAssignmentEvent,
	buildOrchestrationExperimentOutcomeEvent,
	buildOrchestrationRunEvent,
	buildSubagentInterventionEvent,
	type CoordinatorBudgetOutcome,
	type LegacyAdapterBranch,
	type OrchestrationExecutionKind,
	type OrchestrationOutcomeCode,
	type OrchestrationWorker,
	type ReadOnlyFanoutAssignment,
	type TaskLinkSource,
	type WorkspaceRootSource,
} from "../../lib/orchestration-telemetry.js";
import {
	getTask,
	type NormalizedTaskUsage,
	normalizeTaskUsage,
	resolveTaskWorkspace,
} from "../../lib/task-registry.js";
import { registerOrchestrationInvocation } from "../../lib/workflow-friction.js";
import { isSubscriptionOrchestratorModel } from "../fable.js";
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
	coordinatorBudgetFor,
	READ_TOOL_ALLOWLIST,
	SubagentCoordinateSchema,
	SubagentReadSchema,
	SubagentWriteSchema,
	type CoordinatorRequest,
	type ReadRequest,
	type SubagentExecutionRequest,
	type WriteRequest,
	prepareSubagentExecution,
} from "./contracts.js";
import { HISTORICAL_SUBAGENT_TOOL_NAMES } from "./legacy-adapter.js";
import {
	modernRequestToExecutorInput,
	type ModernExecutorInput,
} from "./modern-adapter.js";
import { createSubagentControlFacade } from "./control.js";
import {
	executeInterruptedRecovery,
	INTERRUPTED_TOOL_RECOVERY_MESSAGE,
	prepareInterruptedRecovery,
} from "./recovery.js";
import {
	subagentRunManager,
	type SubagentRunMode,
	type SubagentRunSnapshot,
	type SubagentRunUsage,
} from "./run-manager.js";
import {
	assertDisjointScopes,
	COMMAND_MUTATION_TOOLS,
	DIRECT_FILE_MUTATION_TOOLS,
	normalizeRepositoryScopes,
} from "./scope-policy.js";
import {
	formatSubagentStatus,
	formatSubagentStatusGroup,
	formatSubagentStatusList,
	inspectSubagentStatus,
} from "./status.js";
import {
	checkWorkspaceTool,
	type WorkspacePolicy,
} from "./workspace-policy.js";
import {
	disposeInstalledSubagentTreeBroker,
	getSubagentTreeBroker,
	SubagentTreeRootClient,
	treeClientFromEnvironment,
	type SubagentTreeBroker,
	type SubagentTreeController,
	type SubagentTreePermit,
} from "./tree-runtime.js";
import {
	getSubagentWorkflowRuntime,
	WorkflowLeafOutputSchema,
	WorkflowReductionOutputSchema,
	WorkflowSpecificationSchema,
	WorkflowVerificationOutputSchema,
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

const LEGACY_ADAPTER_BRANCH_KEY = "__legacyAdapterBranch" as const;
type InternalExecutorInput = Partial<ModernExecutorInput> & {
	readonly [LEGACY_ADAPTER_BRANCH_KEY]?: LegacyAdapterBranch;
};

function recordSubagentIntervention(input: {
	orchestrationId?: string;
	runId?: string;
	code: Parameters<typeof buildSubagentInterventionEvent>[0]["code"];
	outcome: Parameters<typeof buildSubagentInterventionEvent>[0]["outcome"];
	acknowledged: boolean;
	session?: string;
}): void {
	if (!input.orchestrationId || !input.runId) return;
	const event = buildSubagentInterventionEvent({
		orchestrationId: input.orchestrationId,
		runId: input.runId,
		code: input.code,
		outcome: input.outcome,
		acknowledged: input.acknowledged,
		...(input.session ? { session: input.session } : {}),
	});
	if (event)
		recordEvent(event as unknown as Parameters<typeof recordEvent>[0]);
}

function legacyBranchForInput(params: Record<string, unknown>): LegacyAdapterBranch {
	if (params.readOnlyFanout !== undefined) return "fanout";
	if (params.continue !== undefined) return "continue";
	if (Array.isArray(params.chain) && params.chain.length > 0) return "chain";
	if (Array.isArray(params.tasks) && params.tasks.length > 0) return "parallel";
	return "single";
}

function outcomeCodeForResult(
	result: Pick<SingleResult, "exitCode" | "stopReason" | "errorMessage">,
): OrchestrationOutcomeCode {
	const classification = classifySubagentResult(result);
	if (classification === "completed") return "completed";
	if (classification === "cancelled") {
		return /budget|deadline|wall-clock|turn/i.test(
			`${result.stopReason ?? ""} ${result.errorMessage ?? ""}`,
		)
			? "timeout"
			: "interrupted";
	}
	return "failed";
}

function coordinatorBudgetOutcomeForResult(
	result: Pick<SingleResult, "usage" | "stopReason" | "errorMessage">,
	budget: { maxTurns: number; softDeadlineMs: number } | undefined,
): CoordinatorBudgetOutcome {
	if (!budget) return "not_applicable";
	const reason = `${result.stopReason ?? ""} ${result.errorMessage ?? ""}`;
	if (/soft deadline|wall-clock budget/i.test(reason)) return "soft_deadline";
	if (result.usage.turns >= budget.maxTurns || /turn budget/i.test(reason))
		return "max_turns";
	return "within_budget";
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

interface SubagentActivityStats {
	toolCalls: number;
	distinctTools: number;
	commandsRun: number;
	filesRead: number;
	filesWritten: number;
	subagentsStarted: number;
}

function formatElapsedDuration(durationMs: number | undefined): string | undefined {
	if (durationMs === undefined || !Number.isFinite(durationMs)) return undefined;
	const seconds = Math.max(0, Math.round(durationMs / 1000));
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return minutes > 0
		? `${minutes}m${String(remainder).padStart(2, "0")}s`
		: `${seconds}s`;
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
	durationMs?: number,
	activity?: SubagentActivityStats,
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
	const elapsed = formatElapsedDuration(durationMs);
	if (elapsed) parts.push(`time:${elapsed}`);
	if (activity) {
		parts.push(`files:r${activity.filesRead}/w${activity.filesWritten}`);
		parts.push(`commands:${activity.commandsRun}`);
		parts.push(`tools:${activity.toolCalls}`);
		parts.push(`subagents:${activity.subagentsStarted}`);
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

function advisoryTaskClassForAgent(agent: AgentConfig): AdvisorySubagentTaskClass {
	if (agent.name === "planner") return "planning";
	if (agent.name === "teamlead") return "coordination";
	if (agent.name === "explorer") return "exploration";
	if (agent.name === "summarizer") return "summarization";
	if (agent.name === "validator") return "validation";
	if (agent.name.includes("review")) return "review";
	return "implementation";
}

function advisorySelection(
	agent: AgentConfig,
	model: string | undefined,
	effort: AgentConfig["effort"] | "default" | undefined,
	role: SubagentRole,
): Pick<SingleResult, "advisoryPolicyVersion" | "advisoryTaskClass" | "advisoryRecommendedRoute" | "advisoryClassification" | "advisoryTopologyMismatch"> {
	const taskClass = advisoryTaskClassForAgent(agent);
	const recommendation = resolveAdvisorySubagentRouting(taskClass);
	const parsed = model ? parseProviderModelString(modelSelectionBase(model)) : undefined;
	const routableEffort = effort === "low" || effort === "medium" || effort === "high" ? effort : undefined;
	const classification = parsed && routableEffort
		? classifyAdvisorySubagentRoute(taskClass, { provider: parsed.provider, modelId: parsed.id, effort: routableEffort })
		: "mismatch";
	return {
		advisoryPolicyVersion: ADVISORY_SUBAGENT_ROUTING_POLICY_VERSION,
		advisoryTaskClass: taskClass,
		advisoryRecommendedRoute: recommendation.accepted.map((choice) => `${choice.provider}/${choice.modelId}:${choice.effort}`).join(" or "),
		advisoryClassification: classification,
		advisoryTopologyMismatch: recommendation.preferredTopology !== role,
	};
}

function formatAgentExecutionLabel(
	r: Pick<SingleResult, "model" | "effort" | "advisoryClassification" | "advisoryTopologyMismatch" | "advisoryRecommendedRoute">,
	themeFg: (color: "muted" | "warning", text: string) => string,
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

interface SubagentTelemetryMetadata {
	executionKind: OrchestrationExecutionKind;
	workspaceRootSource: WorkspaceRootSource;
	markerCount: number;
	boundaryCount: number;
	searchCount: number;
	watchdogCount: number;
	pingCount: number;
	interruptionCount: number;
	recoveryCount: number;
	coordinatorBudgetOutcome: CoordinatorBudgetOutcome;
	legacyAdapterUse: boolean;
	legacyAdapterBranch?: LegacyAdapterBranch;
	taskLinkSource: TaskLinkSource;
	onclaveEligible: false;
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
	/** Advisory marker supplied by the parent; never an admission lease. */
	workPaths?: readonly string[];
	/** Advisory coordinator marker supplied by the parent. */
	workBoundary?: readonly string[];
	durationMs?: number;
	activity?: SubagentActivityStats;
	sessionPath?: string;
	structuredOutput?: unknown;
	outputAttempts?: number;
	routingExperiment?: RoutingOutcomeAssignment;
	advisoryPolicyVersion?: string;
	advisoryTaskClass?: AdvisorySubagentTaskClass;
	advisoryRecommendedRoute?: string;
	advisoryClassification?: "preferred" | "accepted-alternative" | "mismatch";
	advisoryTopologyMismatch?: boolean;
	treeId?: string;
	parentRunId?: string;
	depth?: number;
	role?: SubagentRole;
	workflowPhase?: "map" | "retry" | "verify" | "reduce";
	taskKey?: string;
	attempt?: number;
	retryOrigin?: string;
	coordinatorTaskId?: string;
	/** Internal metadata used only when constructing the content-free closeout event. */
	telemetry?: SubagentTelemetryMetadata;
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
		if (msg.role !== "assistant") continue;
		return msg.content
			.flatMap((part) => (part.type === "text" ? [part.text] : []))
			.join("\n");
	}
	return "";
}

export type SubagentResultClassification =
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export function classifySubagentResult(
	result: Pick<SingleResult, "exitCode" | "stopReason" | "errorMessage">,
): SubagentResultClassification {
	if (result.exitCode === -1) return "running";
	if (result.stopReason === "aborted") return "cancelled";
	if (
		result.exitCode !== 0 ||
		result.stopReason === "error" ||
		Boolean(result.errorMessage)
	)
		return "failed";
	return "completed";
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

function boundProviderVisibleResult<
	T extends { content: Array<{ type: string; text?: string }> },
>(result: T, label: string, boundary: "subscription" | "provider-visible"): T {
	const fullOutput = result.content
		.filter(
			(item): item is { type: string; text: string } =>
				item.type === "text" && typeof item.text === "string",
		)
		.map((item) => item.text)
		.join("\n");
	const initial = truncateTail(fullOutput, {
		maxBytes: DEFAULT_MAX_BYTES,
		maxLines: DEFAULT_MAX_LINES,
	});
	if (!initial.truncated) return result;

	const saved = saveOutputArtifact(
		getDefaultArtifactPath(
			`${boundary === "subscription" ? "subscription" : "foreground"}-${label}-${randomUUID()}`,
			0,
		),
		fullOutput,
	);
	const reference = saved.reference?.message ??
		`Full result artifact could not be saved: ${saved.error ?? "unknown error"}`;
	const visible = truncateTail(
		`${fullOutput}\n\n[Result truncated at the ${boundary} foreground boundary. ${reference}]`,
		{ maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES },
	);
	result.content = [{ type: "text", text: visible.content }];
	return result;
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
		classifySubagentResult(result) === "completed"
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
			const classification = classifySubagentResult(r);
			const isModelError =
				r.stopReason === "error" ||
				(Boolean(r.errorMessage) && r.exitCode === 0);
			const status =
				classification === "cancelled"
					? `FAILED (cancelled)${r.errorMessage ? `: ${r.errorMessage}` : ""}`
					: classification === "failed"
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

function addActivityPath(paths: Set<string>, value: unknown): void {
	if (typeof value === "string" && value.trim()) paths.add(value.trim());
	else if (Array.isArray(value))
		for (const entry of value) addActivityPath(paths, entry);
}

function collectSubagentActivity(
	messages: Message[],
	subagentsStarted: number,
): SubagentActivityStats {
	const toolCalls = getDisplayItems(messages).filter(
		(item): item is Extract<DisplayItem, { type: "toolCall" }> =>
			item.type === "toolCall",
	);
	const tools = new Set<string>();
	const filesRead = new Set<string>();
	const filesWritten = new Set<string>();
	let commandsRun = 0;
	for (const call of toolCalls) {
		tools.add(call.name);
		if (call.name === "read")
			addActivityPath(filesRead, call.args.path ?? call.args.file_path);
		if (["write", "edit", "structured_edit"].includes(call.name))
			addActivityPath(filesWritten, call.args.path ?? call.args.file_path);
		if (call.name === "text_edit")
			addActivityPath(filesWritten, call.args.paths);
		if (["bash", "pwsh", "bg_start"].includes(call.name)) commandsRun++;
	}
	return {
		toolCalls: toolCalls.length,
		distinctTools: tools.size,
		commandsRun,
		filesRead: filesRead.size,
		filesWritten: filesWritten.size,
		subagentsStarted,
	};
}

function collectSubagentSearchCount(messages: Message[]): number {
	return getDisplayItems(messages).filter(
		(item) =>
			item.type === "toolCall" &&
			["grep", "find", "ls"].includes(item.name),
	).length;
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
	executionKind?: "read" | "write" | "coordinator";
	maxTurns?: number;
	timeoutMs?: number;
	role?: SubagentRole;
	depth?: number;
	parentRunId?: string;
	parentSessionId?: string;
	workspaceId?: string;
	treeId?: string;
	repositoryRoot?: string;
	scopes?: string[];
	workPaths?: readonly string[];
	workBoundary?: readonly string[];
	coordinatorTaskId?: string;
	workflowPhase?: "map" | "retry" | "verify" | "reduce";
	taskKey?: string;
	attempt?: number;
	retryOrigin?: string;
	workflowCapabilities?: readonly string[];
	workspaceRoot?: string;
	treeClient?: SubagentTreeController;
	telemetryExecutionKind?: OrchestrationExecutionKind;
	workspaceRootSource?: WorkspaceRootSource;
	markerCount?: number;
	boundaryCount?: number;
	searchCount?: number;
	watchdogCount?: number;
	pingCount?: number;
	interruptionCount?: number;
	recoveryCount?: number;
	coordinatorBudgetOutcome?: CoordinatorBudgetOutcome;
	legacyAdapterUse?: boolean;
	legacyAdapterBranch?: LegacyAdapterBranch;
	taskLinkSource?: TaskLinkSource;
	onclaveEligible?: false;
	telemetryWorkspaceRootSource?: WorkspaceRootSource;
	telemetryTaskLinkSource?: TaskLinkSource;
	telemetryMarkerCount?: number;
	telemetryBoundaryCount?: number;
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
	capabilities: readonly string[];
	readOnly: boolean;
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

function canonicalAgentName(agentName: string): string {
	return agentName === "orchestrator" ? "teamlead" : agentName;
}

function resolveChildRole(
	requestedRole: SubagentRole | undefined,
	agentName: string,
): { role: SubagentRole; depth: number } {
	const current = currentSubagentIdentity();
	if (current.role === "leaf" || current.depth >= 2)
		throw new Error("Leaf and depth-two subagents cannot delegate.");
	const profileName = canonicalAgentName(agentName);
	const role =
		requestedRole ??
		(current.role === "root" && profileName === "teamlead" ? "coordinator" : "leaf");
	if (current.role === "coordinator" && role !== "leaf")
		throw new Error("A coordinator may invoke leaf workers only.");
	const depth = current.depth + 1;
	if (role === "coordinator" && depth !== 1)
		throw new Error("A coordinator may run only at depth one.");
	return { role, depth };
}

const THINKING_SUFFIX_RE =
	/:(off|minimal|low|medium|high|xhigh|max)$/;
function normalizeModelSelection(selection: string): string {
	return selection.trim();
}

function modelSelectionBase(selection: string): string {
	return normalizeModelSelection(selection).replace(THINKING_SUFFIX_RE, "");
}

function isMaxEffortModelSelection(selection: string): boolean {
	return normalizeModelSelection(selection).endsWith(":max");
}

function containsMaxEffortSelection(value: unknown, agents: readonly AgentConfig[]): boolean {
	if (Array.isArray(value)) return value.some((item) => containsMaxEffortSelection(item, agents));
	if (value === null || typeof value !== "object") return false;
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (key === "effort" && item === "max") return true;
		if (key === "model" && typeof item === "string" && isMaxEffortModelSelection(item)) return true;
		if (key === "agent" && typeof item === "string") {
			const profileName = canonicalAgentName(item);
			const agent = agents.find((candidate) => candidate.name === profileName);
			if (agent?.effort === "max" || (agent?.model !== undefined && isMaxEffortModelSelection(agent.model))) return true;
		}
		if (containsMaxEffortSelection(item, agents)) return true;
	}
	return false;
}

function resolveSubscriptionChildModel(
	availableModels: readonly ModelLike[],
	currentModel: ModelLike | undefined,
	agent: AgentConfig,
	explicitModel: string | undefined,
	modelSize: ModelSize | undefined,
): string {
	const requested = explicitModel ?? (modelSize ? undefined : agent.model);
	if (requested) {
		const parsed = parseProviderModelString(modelSelectionBase(requested));
		if (!parsed || parsed.provider !== "openai-codex")
			throw new Error(
				`Bedrock Claude subscription-only orchestration requires openai-codex child models; ${agent.name} resolved to ${requested}.`,
			);
		if (
			!availableModels.some(
				(model) =>
					model.provider === parsed.provider && model.id === parsed.id,
			)
		)
			throw new Error(
				`Bedrock Claude subscription-only orchestration model is unavailable: ${requested}.`,
			);
		return requested;
	}

	const subscriptionModels = availableModels.filter(
		(model) => model.provider === "openai-codex",
	);
	const resolved = resolveDynamicModel(
		subscriptionModels,
		currentModel,
		modelSize ?? "medium",
		"same-provider",
	);
	if (!resolved)
		throw new Error(
			"Bedrock Claude subscription-only orchestration requires an available openai-codex model, but none was found.",
		);
	return `${resolved.provider}/${resolved.id}`;
}

interface ChildToolAuthority {
	tools: string[];
	canDirectlyMutate: boolean;
}

interface ChildToolAuthorityOptions {
	role: SubagentRole;
	hasScopeLease: boolean;
	readOnly?: boolean;
	executionKind?: "read" | "write" | "coordinator";
	workflowCapabilities?: readonly string[];
}

export function resolveChildToolAuthority(
	agent: AgentConfig,
	options: ChildToolAuthorityOptions,
): ChildToolAuthority {
	if (options.executionKind === "read") {
		return {
			tools: [...READ_TOOL_ALLOWLIST],
			canDirectlyMutate: false,
		};
	}
	const defaults =
		options.executionKind === "coordinator" || options.role === "coordinator"
			? ["read", "grep", "find", "ls", "subagent_read", "subagent_write"]
			: ["read", "bash"];
	let tools = [...(agent.tools ?? defaults)];
	if (options.executionKind === "coordinator") {
		tools = ["read", "grep", "find", "ls", "subagent_read", "subagent_write"];
	}
	if (options.role === "coordinator") {
		const coordinatorTools = new Set([
			"read",
			"grep",
			"find",
			"ls",
			"subagent",
			"subagent_read",
			"subagent_write",
		]);
		tools = tools.filter((tool) => coordinatorTools.has(tool));
	} else {
		tools = tools.filter(
			(tool) =>
				tool !== "task" && !DELEGATION_AND_WORKFLOW_TOOLS.has(tool),
		);
	}
	if (options.workflowCapabilities) {
		const admitted = new Set(options.workflowCapabilities);
		tools = tools.filter((tool) => admitted.has(tool));
	}
	if (options.readOnly) {
		tools = tools.filter(
			(tool) =>
				!COMMAND_MUTATION_TOOLS.has(tool) &&
				!DIRECT_FILE_MUTATION_TOOLS.has(tool) &&
				!DELEGATION_AND_WORKFLOW_TOOLS.has(tool),
		);
	}
	// workPaths and workBoundary are advisory markers. They do not remove
	// command tools, acquire a lease, or reject overlap.
	tools = [...new Set(tools)];
	return {
		tools,
		canDirectlyMutate: tools.some((tool) =>
			DIRECT_FILE_MUTATION_TOOLS.has(tool),
		),
	};
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
	const profileName = canonicalAgentName(agentName);
	const agent = agents.find((a) => a.name === profileName);

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
	const authority = resolveChildToolAuthority(agent, {
		role: resolvedChild.role,
		hasScopeLease: false,
		readOnly: runContext?.readOnly,
		executionKind: runContext?.executionKind,
		workflowCapabilities: runContext?.workflowCapabilities,
	});
	if (
		resolvedChild.role === "coordinator" &&
		!authority.tools.includes("subagent") &&
		!authority.tools.includes("subagent_write")
	)
		throw new Error(
			`Coordinator agent ${agent.name} must have a leaf delegation capability.`,
		);
	// Modifying leaves may omit workPaths. Markers are advisory and do not
	// grant or remove mutation authority.
	const args: string[] = ["--mode", "json", "-p", "--no-skills"];
	if (modelOverride) args.push("--model", modelOverride);
	else if (agent.model) args.push("--model", agent.model);
	const effectiveEffort = effortOverride ?? agent.effort;
	if (effectiveEffort) args.push("--thinking", effectiveEffort);
	if (authority.tools.length > 0)
		args.push("--tools", authority.tools.join(","));
	else args.push("--no-tools");
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
		...(runContext?.workPaths ? { workPaths: [...runContext.workPaths] } : {}),
		...(runContext?.workBoundary
			? { workBoundary: [...runContext.workBoundary] }
			: {}),
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
		...(runContext?.telemetryExecutionKind
			? {
					telemetry: {
						executionKind: runContext.telemetryExecutionKind,
						workspaceRootSource: runContext.workspaceRootSource ?? "default",
						markerCount: runContext.markerCount ?? 0,
						boundaryCount: runContext.boundaryCount ?? 0,
						searchCount: runContext.searchCount ?? 0,
						watchdogCount: runContext.watchdogCount ?? 0,
						pingCount: runContext.pingCount ?? 0,
						interruptionCount: runContext.interruptionCount ?? 0,
						recoveryCount: runContext.recoveryCount ?? 0,
						coordinatorBudgetOutcome:
							runContext.coordinatorBudgetOutcome ?? "not_applicable",
						legacyAdapterUse: runContext.legacyAdapterUse ?? false,
						...(runContext.legacyAdapterBranch
							? { legacyAdapterBranch: runContext.legacyAdapterBranch }
							: {}),
						taskLinkSource: runContext.taskLinkSource ?? "none",
						onclaveEligible: false,
					},
			  }
			: {}),
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
			...(runContext?.parentSessionId
				? { parentSessionId: runContext.parentSessionId }
				: {}),
			...(runContext?.workspaceId
				? { workspaceId: runContext.workspaceId }
				: {}),
			...(runContext?.workPaths
				? { workPaths: [...runContext.workPaths] }
				: {}),
			...(runContext?.workBoundary
				? { workBoundary: [...runContext.workBoundary] }
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
			const {
				PI_ONCLAVE_ROOT_CAPABILITY: _onclaveRootCapability,
				...inheritedChildEnv
			} = process.env;
			const childEnv = {
				...inheritedChildEnv,
				PI_ONCLAVE_INELIGIBLE: "1",
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
				PI_SUBAGENT_WORKSPACE_ROOT:
					runContext?.workspaceRoot ?? path.resolve(cwd ?? defaultCwd),
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
			if (proc.pid) subagentRunManager.registerProcess?.(runId, proc.pid);
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
			if (runContext?.readOnly || runContext?.timeoutMs !== undefined) {
				readOnlyTimeoutTimer = setTimeout(
					() =>
						stopForBudget(
							runContext?.executionKind === "coordinator"
								? "Coordinator stopped at its soft deadline; output and gaps may be partial."
								: "Read-only subagent stopped at its wall-clock budget; output may be partial.",
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
		const classification = classifySubagentResult(currentResult);
		if (classification === "completed") {
			timingSpan.finish("ok", { exitCode, workflow, phase: "run", planPath });
		} else {
			const errorReason =
				currentResult.errorMessage ||
				currentResult.stderr.slice(-500) ||
				(currentResult.stopReason === "error"
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
		removeTreeCancelListener?.();
		try {
			await treePermit?.release();
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			currentResult.stopReason = "error";
			currentResult.errorMessage = `Subagent process settled but broker cleanup failed: ${detail}`;
			currentResult.exitCode = currentResult.exitCode || 1;
		}
		currentResult.durationMs = Date.now() - runStartedAt;
		const cleanupFailed = currentResult.errorMessage?.startsWith(
			"Subagent process settled but broker cleanup failed:",
		);
		const classification = cleanupFailed
			? "failed"
			: runController.signal.aborted
				? "cancelled"
				: classifySubagentResult(currentResult);
		subagentRunManager.settle(runId, {
			status:
				classification === "cancelled"
					? "cancelled"
					: classification === "failed"
						? "failed"
						: "completed",
			model: currentResult.model,
			exitCode: currentResult.exitCode,
			stopReason: currentResult.stopReason,
			errorMessage: currentResult.errorMessage,
			sessionPath: currentResult.sessionPath,
			usage: runUsageSnapshot(currentResult.usage),
			finalText: getFinalOutput(currentResult.messages),
			durationMs: currentResult.durationMs,
		});
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
	resolvedModel?: string;
	resolvedEffort?: AgentEffort;
	normalizedScopes?: string[];
	repositoryRoot?: string;
	telemetryWorkspaceRootSource?: WorkspaceRootSource;
	telemetryTaskLinkSource?: TaskLinkSource;
	telemetryMarkerCount?: number;
	telemetryBoundaryCount?: number;
};

type ChainParams = TaskParams;

type DirectInvocationInput = {
	agent?: string;
	task?: string;
	taskId?: string;
	role?: SubagentRole;
	scope?: string[];
	cwd?: string;
	output?: string | boolean;
	outputMode?: OutputMode;
	tasks?: TaskParams[];
};

type NormalizedDirectInvocation =
	| { mode: "single"; items: [TaskParams] }
	| { mode: "parallel"; items: TaskParams[] };

function normalizeDirectInvocation(
	input: DirectInvocationInput,
): NormalizedDirectInvocation | undefined {
	const hasSingle = Boolean(input.agent && input.task);
	const hasParallel = (input.tasks?.length ?? 0) > 0;
	if (hasSingle === hasParallel) return undefined;
	if (hasParallel)
		return { mode: "parallel", items: [...(input.tasks ?? [])] };
	return {
		mode: "single",
		items: [
			{
				agent: input.agent ?? "",
				task: input.task ?? "",
				taskId: input.taskId,
				role: input.role,
				scope: input.scope,
				cwd: input.cwd,
				output: input.output,
				outputMode: input.outputMode,
			},
		],
	};
}

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
		"Dynamic model size override. Resolves against the current session model/provider and available registry models. Without an explicit effort, small uses high, medium uses medium, and large uses low.",
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

const AdvertisedOutputSchema = Type.Boolean({
	description:
		"Save full output to a runtime-generated private artifact. Set false to disable optional artifact saving.",
});

const LegacyOutputSchema = Type.Union([Type.String(), Type.Boolean()], {
	description:
		"Legacy output artifact selector. String paths remain executable for resumed and direct calls but are not advertised.",
});

function createSubagentSchemas(agentNames?: readonly string[]) {
	const agentName = (description: string) =>
		agentNames && agentNames.length > 0
			? StringEnum(agentNames, {
					description: `${description}. Trusted catalog; project agents require agentScope project or both.`,
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
		output: Type.Optional(AdvertisedOutputSchema),
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
		output: Type.Optional(AdvertisedOutputSchema),
		outputMode: Type.Optional(OutputModeSchema),
	});
	const legacyTaskItem = Type.Object({
		...taskItem.properties,
		output: Type.Optional(LegacyOutputSchema),
	});
	const legacyChainItem = Type.Object({
		...chainItem.properties,
		output: Type.Optional(LegacyOutputSchema),
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
				output: Type.Optional(LegacyOutputSchema),
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
			Type.Array(legacyTaskItem, {
				minItems: 1,
				maxItems: MAX_SUBAGENT_WORKERS_PER_WAVE,
				description: "Parallel {agent, task} workers",
			}),
		),
		chain: Type.Optional(
			Type.Array(legacyChainItem, {
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
		modelOverrideReason: Type.Optional(
			Type.String({
				description:
					"Operator-approved reason for selecting a non-Sol coordinator model.",
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
		output: Type.Optional(LegacyOutputSchema),
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
		modelOverrideReason: legacy.properties.modelOverrideReason,
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
			tasks: Type.Optional(
				Type.Array(taskItem, {
					minItems: 1,
					maxItems: MAX_SUBAGENT_WORKERS_PER_WAVE,
					description: "Parallel {agent, task} workers",
				}),
			),
			...common,
			cwd: legacy.properties.cwd,
			output: Type.Optional(AdvertisedOutputSchema),
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
			output: Type.Optional(AdvertisedOutputSchema),
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
	projectTrusted: boolean;
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
		new Set(both.agents.map((agent) => agent.name)),
	).sort();
	return {
		cwd,
		projectTrusted,
		byScope: { user, project, both },
		agentNames,
	};
}

function resolveSessionAgentCatalog(
	catalog: SessionAgentCatalog | undefined,
	ctx: Pick<ExtensionContext, "cwd" | "isProjectTrusted">,
): SessionAgentCatalog {
	const projectTrusted = ctx.isProjectTrusted();
	if (
		catalog?.cwd === ctx.cwd &&
		catalog.projectTrusted === projectTrusted
	)
		return catalog;
	return createSessionAgentCatalog(ctx.cwd, projectTrusted);
}

const acknowledgedFailureRunIds = new Set<string>();

export default function (pi: ExtensionAPI) {
	let sessionOpen = false;
	let sessionAgentCatalog: SessionAgentCatalog | undefined;
	let statusContext: ExtensionContext | undefined;
	let unsubscribeStatus: (() => void) | undefined;
	let unsubscribeBackgroundCompletion: (() => void) | undefined;
	let runtimePingTimer: ReturnType<typeof setInterval> | undefined;
	let renderedStatus: string | undefined;
	let refreshAgentTools: (agentNames: readonly string[]) => void = () => {};
	let deliveryScheduled = false;
	let resumeInterruptedSession:
		| ((
				run: SubagentRunSnapshot,
				sessionPath: string,
				toolCallId: string,
				signal: AbortSignal | undefined,
				onUpdate: OnUpdateCallback | undefined,
				ctx: ExtensionContext,
			) => Promise<AgentToolResult<SubagentDetails>>)
		| undefined;
	const assignedWorkspaceRoot = process.env.PI_SUBAGENT_WORKSPACE_ROOT;
	const activeWorkspacePolicy: WorkspacePolicy | undefined = assignedWorkspaceRoot
		? Object.freeze({ workspaceRoot: assignedWorkspaceRoot })
		: undefined;

	const agentDiscoveryFor = (
		ctx: Pick<ExtensionContext, "cwd" | "isProjectTrusted">,
		scope: AgentScope,
	): AgentDiscoveryResult => {
		const previousCatalog = sessionAgentCatalog;
		sessionAgentCatalog = resolveSessionAgentCatalog(previousCatalog, ctx);
		if (sessionAgentCatalog !== previousCatalog)
			refreshAgentTools(sessionAgentCatalog.agentNames);
		return sessionAgentCatalog.byScope[scope];
	};

	const updateStatus = () => {
		if (!statusContext) return;
		const visibleRuns = subagentRunManager
			.list()
			.filter(
				(run) =>
					run.status !== "failed" ||
					!acknowledgedFailureRunIds.has(run.runId),
			);
		const rawStatus = formatSubagentActivityStatus(visibleRuns);
		const hasFailure = visibleRuns.some((run) => run.status === "failed");
		const nextStatus =
			rawStatus && hasFailure
				? statusContext.ui.theme.fg("error", rawStatus)
				: rawStatus;
		if (nextStatus === renderedStatus) return;
		renderedStatus = nextStatus;
		statusContext.ui.setStatus("subagents", nextStatus);
	};

	const flushPendingBackgroundCompletions = () => {
		deliveryScheduled = false;
		if (!sessionOpen) return;
		const activeSessionId = statusContext?.sessionManager?.getSessionId?.();
		const activeWorkspaceId = statusContext
			? process.platform === "win32"
				? path.resolve(statusContext.cwd).toLowerCase()
				: path.resolve(statusContext.cwd)
			: undefined;
		for (const completion of subagentRunManager.pendingBackgroundCompletions()) {
			if (
				completion.parentSessionId !== activeSessionId ||
				completion.workspaceId !== activeWorkspaceId
			)
				continue;
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
		origin: { parentSessionId?: string; workspaceId: string },
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
					(worker) => classifySubagentResult(worker) !== "completed",
				),
			);
		const truncationNote = bounded.truncated
			? "\n\n[Result truncated. Inspect the recent run with /subagents.]"
			: "";
		subagentRunManager.queueBackgroundCompletion({
			orchestrationId,
			mode,
			...origin,
			content: `Background subagent ${mode} ${orchestrationId} ${failed ? "finished with failures" : "finished"}.\n\n${bounded.content}${truncationNote}`,
			failed,
			taskIds:
				result?.details?.results.flatMap((worker) =>
					worker.taskId ? [worker.taskId] : [],
				) ?? [],
		});
	};

	const inspectTrackedRun = (
		run: SubagentRunSnapshot,
		options: { readonly sinceActivityVersion?: number } = {},
	) => {
		const brokerRun = getSubagentTreeBroker()
			.list()
			.find((candidate) => candidate.runId === run.runId);
		return inspectSubagentStatus(run, {
			...options,
			...(brokerRun?.runtimePingAt === undefined
				? {}
				: { runtimePingAt: brokerRun.runtimePingAt }),
		});
	};

	pi.registerTool({
		name: "subagent_status",
		label: "Subagent Status",
		description:
			"Inspect process liveness, observable activity, and usage for process-local subagent runs. A returned background orchestration ID groups all matching child runs. Pass a prior activity version only with an exact run ID.",
		promptSnippet:
			"Inspect subagent process liveness, observable progress, and usage",
		promptGuidelines: [
			"Use subagent_status only when current evidence is needed for a background run; completion arrives automatically, so do not poll it in a loop.",
			"Treat subagent_status process liveness and observable activity as evidence, not proof of CPU work; a quiet live child may be waiting on a provider or a silent long-running tool.",
		],
		parameters: Type.Object({
			runId: Type.Optional(
				Type.String({
					description:
						"Exact run ID or returned background orchestration ID. Omit to list tracked runs.",
				}),
			),
			sinceActivityVersion: Type.Optional(
				Type.Integer({
					minimum: 0,
					description:
						"Activity version returned by a previous check of this run.",
				}),
			),
		}),
		execute: async (
			_toolCallId,
			params,
		): Promise<AgentToolResult<Record<string, unknown>>> => {
			if (currentSubagentIdentity().role !== "root")
				throw new Error("Only the root agent can inspect subagent status.");
			if (!params.runId) {
				if (params.sinceActivityVersion !== undefined)
					throw new Error(
						"runId is required when sinceActivityVersion is provided.",
					);
				const inspections = subagentRunManager
					.list()
					.map((run) => inspectTrackedRun(run));
				const trackedIds = new Set(
					inspections.map((inspection) => inspection.run.runId),
				);
				const brokerOnly = getSubagentTreeBroker()
					.list()
					.filter(
						(run) =>
							run.role !== "root" &&
							!trackedIds.has(run.runId) &&
							(run.state !== "settled" || Boolean(run.scopeLease)),
					);
				const brokerText = brokerOnly.length
					? `\nBroker-only boundaries:\n${brokerOnly
							.map(
								(run) =>
									`${run.runId} | ${run.state}${run.pid ? ` | pid ${run.pid}` : ""}${run.scopeLease ? ` | scopes ${run.scopeLease.scopes.join(", ")}` : ""}`,
							)
							.join("\n")}`
					: "";
				return {
					content: [
						{
							type: "text",
							text: `${formatSubagentStatusList(inspections)}${brokerText}`,
						},
					],
					details: {
						runs: inspections.map((inspection) => ({
							runId: inspection.run.runId,
							status: inspection.run.status,
							pid: inspection.run.pid,
							processState: inspection.processState,
							activityVersion: inspection.activityVersion,
							lastActivityAt: inspection.lastActivityAt,
							lastActivityKind: inspection.lastActivityKind,
							quietForMs: inspection.quietForMs,
						})),
						brokerOnly,
					},
				};
			}
			const run = subagentRunManager.get(params.runId);
			if (!run) {
				const brokerRun = getSubagentTreeBroker()
					.list()
					.find((candidate) => candidate.runId === params.runId);
				if (brokerRun)
					return {
						content: [
							{
								type: "text",
								text: `Broker boundary ${brokerRun.runId} is ${brokerRun.state}${brokerRun.pid ? ` with pid ${brokerRun.pid}` : ""}${brokerRun.scopeLease ? ` and holds scopes ${brokerRun.scopeLease.scopes.join(", ")}` : ""}. Use subagent_control reconcile only when the process is terminal or proven absent.`,
							},
						],
						details: { found: true, brokerOnly: true, run: brokerRun },
					};
				const groupedRuns = subagentRunManager.getByOrchestrationId(
					params.runId,
				);
				if (groupedRuns.length === 0)
					return {
						content: [
							{
								type: "text",
								text: `Subagent run or orchestration not found: ${params.runId}`,
							},
						],
						details: { runId: params.runId, found: false },
					};
				if (params.sinceActivityVersion !== undefined)
					throw new Error(
						"sinceActivityVersion requires an exact run ID, not an orchestration ID.",
					);
				const inspections = groupedRuns.map((groupedRun) =>
					inspectTrackedRun(groupedRun),
				);
				return {
					content: [
						{
							type: "text",
							text: formatSubagentStatusGroup(params.runId, inspections),
						},
					],
					details: {
						orchestrationId: params.runId,
						found: true,
						runs: inspections.map((grouped) => ({
							runId: grouped.run.runId,
							status: grouped.run.status,
							pid: grouped.run.pid,
							processState: grouped.processState,
							activityVersion: grouped.activityVersion,
						})),
					},
				};
			}
			const inspection = inspectTrackedRun(run, {
				sinceActivityVersion: params.sinceActivityVersion,
			});
			return {
				content: [{ type: "text", text: formatSubagentStatus(inspection) }],
				details: {
					runId: run.runId,
					found: true,
					status: run.status,
					pid: run.pid,
					processState: inspection.processState,
					processAlive: inspection.processAlive,
					activityVersion: inspection.activityVersion,
					lastActivityAt: inspection.lastActivityAt,
					lastActivityKind: inspection.lastActivityKind,
					quietForMs: inspection.quietForMs,
					watchdogState: inspection.watchdogState,
					runtimePingAt: inspection.runtimePingAt,
					runtimePingAgeMs: inspection.runtimePingAgeMs,
					activeToolDurationMs: inspection.activeToolDurationMs,
					activeToolOutputAgeMs: inspection.activeToolOutputAgeMs,
					progressedSince: inspection.progressedSince,
					usage: run.usage,
					liveTools: run.liveTools.map((tool) => tool.name),
				},
			};
		},
	});

	const subagentControl = createSubagentControlFacade(
		getSubagentTreeBroker(),
		subagentRunManager,
	);

	pi.registerTool({
		name: "subagent_control",
		label: "Subagent Control",
		description:
			"Cancel, force-terminate, recover an interrupted tool from its persisted child session, or safely reconcile an exact live broker boundary.",
		promptSnippet: "Control an exact subagent broker boundary",
		promptGuidelines: [
			"Use exact complete run or tree IDs. Prefixes and wildcard selectors are rejected.",
			"Reconcile only terminal or proven-absent process boundaries; live or ambiguous boundaries are rejected.",
		],
		parameters: Type.Object({
			action: StringEnum([
				"cancel",
				"force_terminate",
				"interrupt_tool",
				"reconcile",
			] as const),
			selector: Type.Object({
				type: StringEnum(["run", "tree"] as const),
				id: Type.String({ minLength: 1 }),
			}),
			toolCallId: Type.Optional(Type.String({ minLength: 1 })),
			activityVersion: Type.Optional(Type.Integer({ minimum: 0 })),
		}),
		execute: async (controlToolCallId, params, signal, onUpdate, ctx) => {
			if (currentSubagentIdentity().role !== "root")
				throw new Error("Only the root agent can control subagent boundaries.");
			if (params.action === "interrupt_tool") {
				if (params.selector.type !== "run")
					throw new Error("interrupt_tool requires one exact run selector.");
				if (!params.toolCallId || params.activityVersion === undefined)
					throw new Error(
						"interrupt_tool requires the active toolCallId and current activityVersion from subagent_status.",
					);
				const recovery = prepareInterruptedRecovery(
					subagentRunManager.get(params.selector.id),
					{
						runId: params.selector.id,
						toolCallId: params.toolCallId,
						activityVersion: params.activityVersion,
						parentSessionId: ctx.sessionManager?.getSessionId?.(),
					},
					(runId) => findDelegatedSession(getDelegatedSessionDir(), runId),
				);
				const { run, sessionPath } = recovery;
				recordSubagentIntervention({
					orchestrationId: run.orchestrationId,
					runId: run.runId,
					code: "interruption",
					outcome: "interrupted",
					acknowledged: true,
					session: ctx.sessionManager?.getSessionId?.(),
				});
				const resumeSession = resumeInterruptedSession;
				if (!resumeSession)
					throw new Error("Subagent recovery is unavailable.");
				let resumed: AgentToolResult<SubagentDetails>;
				try {
					resumed = await executeInterruptedRecovery(recovery, {
					terminate: async () => {
						const termination = await subagentControl.execute({
							action: "force_terminate",
							selector: params.selector,
						});
						return termination.finalState === "terminated";
					},
					waitForSettlement: (runId) =>
						subagentRunManager.waitForSettlement(runId),
					resume: () =>
						resumeSession(
							run,
							sessionPath,
							controlToolCallId,
							signal,
							onUpdate,
							ctx,
						),
					});
				} catch (error) {
					recordSubagentIntervention({
						orchestrationId: run.orchestrationId,
						runId: run.runId,
						code: "recovery",
						outcome: "failed",
						acknowledged: false,
						session: ctx.sessionManager?.getSessionId?.(),
					});
					throw error;
				}
				recordSubagentIntervention({
					orchestrationId: run.orchestrationId,
					runId: run.runId,
					code: "recovery",
					outcome: "continued",
					acknowledged: true,
					session: ctx.sessionManager?.getSessionId?.(),
				});
				return {
					...resumed,
					content: [
						{
							type: "text",
							text: `Interrupted ${params.toolCallId}, settled run ${run.runId}, and resumed ${sessionPath}. The interrupted tool outcome remains unknown.\n\n${resumed.content
								.filter((item) => item.type === "text")
								.map((item) => item.text)
								.join("\n")}`,
						},
					],
				};
			}
			const action =
				params.action === "cancel"
					? "cancel"
					: params.action === "force_terminate"
						? "force_terminate"
						: "reconcile";
			const selectedRuns = getSubagentTreeBroker()
				.list()
				.filter((run) =>
					params.selector.type === "run"
						? run.runId === params.selector.id
						: run.treeId === params.selector.id,
				);
			const result = await subagentControl.execute({
				action,
				selector: params.selector,
			});
			for (const outcome of result.outcomes) {
				const run = selectedRuns.find((candidate) => candidate.runId === outcome.runId);
				if (!run) continue;
				const failed = outcome.outcome === "failed";
				recordSubagentIntervention({
					orchestrationId: run.treeId,
					runId: run.runId,
					code:
						action === "cancel"
							? "interruption"
							: action === "force_terminate"
								? "containment"
								: "boundary",
					outcome: failed
						? "failed"
						: action === "cancel"
							? "interrupted"
							: action === "force_terminate"
								? "contained"
								: "completed",
					acknowledged: !failed,
					session: ctx.sessionManager?.getSessionId?.(),
				});
			}
			return {
				content: [{ type: "text", text: JSON.stringify(result) }],
				details: result,
			};
		},
	});

	pi.registerCommand("subagents", {
		description:
			"Inspect process-local runs. Filters: --session <id>, --workspace <path>, --orchestration <id>, --task <id>, --state <state>, --all.",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/subagents requires TUI mode.", "warning");
				return;
			}
			const tokens = args.trim() ? args.trim().split(/\s+/) : [];
			const filters = new Map<string, string>();
			let all = false;
			for (let index = 0; index < tokens.length; index += 1) {
				const token = tokens[index];
				if (token === "--all") {
					all = true;
					continue;
				}
				if (!token?.startsWith("--") || !tokens[index + 1]) {
					ctx.ui.notify(`Invalid /subagents filter near ${token ?? "(empty)"}.`, "warning");
					return;
				}
				filters.set(token.slice(2), tokens[index + 1] as string);
				index += 1;
			}
			const known = new Set(["session", "workspace", "orchestration", "task", "state"]);
			for (const key of filters.keys())
				if (!known.has(key)) {
					ctx.ui.notify(`Unknown /subagents filter --${key}.`, "warning");
					return;
				}
			const currentSession = ctx.sessionManager?.getSessionId?.();
			const currentWorkspace =
				process.platform === "win32"
					? path.resolve(ctx.cwd).toLowerCase()
					: path.resolve(ctx.cwd);
			const session = filters.get("session") ?? (all ? undefined : currentSession);
			const workspace = filters.get("workspace") ?? (all ? undefined : currentWorkspace);
			await openSubagentDashboard(
				ctx,
				subagentRunManager,
				(run) => {
					if (session && run.parentSessionId !== session) return false;
					if (workspace && run.workspaceId !== workspace) return false;
					if (filters.get("orchestration") && run.orchestrationId !== filters.get("orchestration")) return false;
					if (filters.get("task") && run.taskId !== filters.get("task") && run.coordinatorTaskId !== filters.get("task")) return false;
					if (filters.get("state") && run.status !== filters.get("state")) return false;
					return true;
				},
				subagentControl,
			);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		sessionAgentCatalog = resolveSessionAgentCatalog(undefined, ctx);
		refreshAgentTools(sessionAgentCatalog.agentNames);
		const identity = currentSubagentIdentity();
		if (identity.role !== "root") {
			deactivateTools(pi, ["subagent_status", "subagent_control"]);
			const runtimeTreeClient = treeClientFromEnvironment(process.env);
			if (runtimeTreeClient) {
				let pingFailureReported = false;
				const sendRuntimePing = () => {
					void runtimeTreeClient.ping().catch((error: unknown) => {
						if (pingFailureReported) return;
						pingFailureReported = true;
						process.stderr.write(
							`Subagent runtime ping failed: ${error instanceof Error ? error.message : String(error)}\n`,
						);
					});
				};
				sendRuntimePing();
				runtimePingTimer = setInterval(sendRuntimePing, 5_000);
				runtimePingTimer.unref();
			}
		}
		const historicalTools = [...HISTORICAL_SUBAGENT_TOOL_NAMES];
		const unavailableModernTools =
			identity.role === "leaf" || identity.depth >= 2
				? ["subagent_read", "subagent_write", "subagent_coordinate"]
				: identity.role === "coordinator"
					? ["subagent_coordinate"]
					: [];
		deactivateTools(pi, [...historicalTools, ...unavailableModernTools]);
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

	pi.on("tool_call", (event, ctx) => {
		if (!activeWorkspacePolicy) return undefined;
		const result = checkWorkspaceTool(
			activeWorkspacePolicy,
			String(event.toolName ?? ""),
			event.input,
			ctx.cwd,
		);
		if (result.outcome === "deny")
			return { block: true, reason: `${result.code}: ${result.reason}` };
		if (
			result.governed &&
			(event.toolName === "bash" || event.toolName === "pwsh") &&
			event.input &&
			typeof event.input === "object"
		) {
			const shellInput = event.input as { timeout?: unknown };
			if (shellInput.timeout === undefined) shellInput.timeout = 120;
		}
		return undefined;
	});

	pi.on("agent_settled", () => {
		if (subagentRunManager.pendingBackgroundCompletions().length > 0)
			scheduleBackgroundCompletionDelivery();
	});

	pi.on("input", (event) => {
		if (event.source !== "interactive") return;
		for (const run of subagentRunManager.list()) {
			if (run.status === "failed") acknowledgedFailureRunIds.add(run.runId);
		}
		updateStatus();
	});

	pi.on("session_shutdown", async (event) => {
		sessionOpen = false;
		if (runtimePingTimer) clearInterval(runtimePingTimer);
		runtimePingTimer = undefined;
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
				await disposeInstalledSubagentTreeBroker();
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
			"workPaths and workBoundary are advisory markers; overlap is reported but never rejects or queues a worker.",
			"Foreground execution waits; background=true returns immediately and delivers a follow-up result.",
			"Use taskId only to correlate an existing root-owned task with one direct child. The root remains responsible for every task transition. Advanced chain, continuation, fanout, and typed workflow tools are deferred.",
		].join(" "),
		promptSnippet:
			"Delegate foreground or background work to isolated specialist agents",
		promptGuidelines: [
			"Delegate one narrow, single-phase deliverable per leaf. Use role=coordinator only for one independently verifiable work package's bounded decomposition and reduction; the root retains program-level orchestration.",
			"Routing guidance is advisory: prefer Luna low for tool-heavy inspection and summarization, Sol low or Luna high for bounded planning, Sol low for coordinators and subagent team managers, Luna medium or high for implementation, and Sol low for review. Useful overrides remain allowed and are tracked; max effort requires operator approval.",
			"A coordinator may invoke leaves; leaves and every depth-two child cannot invoke delegation or workflow tools.",
			"Each child is capped at 64 turns; explicitly read-only fanout leaves are also capped at eight minutes.",
			"Add workPaths or workBoundary markers when they help coordinate parallel work; modifying workers do not require a path declaration.",
			"Use subagent with background=true for independent work, continue useful parent work, and consume the delivered follow-up instead of polling.",
			"Use tool_search for deferred chain, continuation, fanout, and subagent_workflow capabilities.",
			"For durable work, start a root-owned task, pass its taskId to the direct leaf or coordinator, validate the result, and close the task. The child never changes task state.",
		],
		parameters: InitialSubagentSchemas.legacy,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const modernInput = params as typeof params & Partial<ModernExecutorInput>;
			const internalParams = modernInput as typeof modernInput & InternalExecutorInput;
			const prepared = internalParams.__modernPrepared;
			const legacyAdapterBranch =
				internalParams[LEGACY_ADAPTER_BRANCH_KEY] ??
				(prepared
					? undefined
					: legacyBranchForInput(params as unknown as Record<string, unknown>));
			const legacyAdapterUse = legacyAdapterBranch !== undefined;
			const currentIdentity = currentSubagentIdentity();
			const subscriptionRoot = isSubscriptionOrchestratorModel(ctx.model);
			const internalWorkflowContext = internalWorkflowRuns.get(_toolCallId);
			if (currentIdentity.role === "leaf" || currentIdentity.depth >= 2)
				throw new Error("Leaf and depth-two subagents cannot delegate.");
			const invocationCwd = prepared?.workspaceRoot ?? ctx.cwd;
			const invocationTelemetryExecutionKind: OrchestrationExecutionKind =
				internalParams.__modernRequest?.kind ??
				(legacyAdapterUse ? "legacy" : "write");
			const invocationWorkspaceRootSource: WorkspaceRootSource =
				prepared?.request.workspaceRoot !== undefined ||
				(!prepared && params.cwd !== undefined)
					? "override"
					: "default";
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
			const background = params.background ?? false;
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
			const directInvocation = normalizeDirectInvocation({
				agent: params.agent,
				task: params.task,
				taskId: params.taskId,
				role: params.role,
				scope: params.scope,
				cwd: params.cwd,
				output: params.output,
				outputMode: params.outputMode,
				tasks: params.tasks as unknown as TaskParams[] | undefined,
			});
			const sampledResolution =
				!subscriptionRoot && !explicitModel && modelSize
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
			const routedEffort =
				effort ??
				routingExperiment?.effort ??
				(!explicitModel && modelSize
					? preferredEffortForSize(modelSize)
					: undefined);
			const resolvedModelId =
				explicitModel ??
				(resolvedModel
					? `${resolvedModel.provider}/${resolvedModel.id}`
					: undefined);
			const discovery = prepared?.discovery ?? agentDiscoveryFor(ctx, agentScope);
			const agents = discovery.agents;
			if (containsMaxEffortSelection(params, agents) && process.env.PI_SUBAGENT_ALLOW_MAX !== "1") {
				if (!ctx.hasUI) throw new Error("Subagent max effort requires explicit operator approval or PI_SUBAGENT_ALLOW_MAX=1.");
				const approved = await ctx.ui.confirm(
					"Approve max subagent effort",
					"This dispatch requests max reasoning effort. Allow it for this invocation?",
				);
				if (!approved) throw new Error("Subagent max effort was not approved.");
			}
			const availableModels = subscriptionRoot
				? (ctx.modelRegistry.getAvailable() as ModelLike[])
				: [];
			const confirmProjectAgents = params.confirmProjectAgents ?? false;
			const modeCount =
				Number(hasReadOnlyFanout) +
				Number(hasChain) +
				Number(hasTasks) +
				Number(hasSingle) +
				Number(hasContinue);

			const orchestrationId = randomUUID();
			const interactionId = registerOrchestrationInvocation(orchestrationId);
			let invocationTreeClientPromise: Promise<SubagentTreeController> | undefined;
			let invocationBroker: SubagentTreeBroker | undefined;
			let invocationRootRunId: string | undefined;
			const getInvocationTreeClient = (): Promise<SubagentTreeController> => {
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
					invocationBroker = broker;
					const root = broker.createTree({ treeId: orchestrationId });
					invocationRootRunId = root.rootRunId;
					return new SubagentTreeRootClient(broker, root);
				})();
				return invocationTreeClientPromise;
			};
			const settleInvocationTree = async (): Promise<void> => {
				if (!invocationRootRunId) return;
				const rootRunId = invocationRootRunId;
				invocationRootRunId = undefined;
				await invocationBroker?.release(rootRunId);
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
			const selectedDirectInvocation: NormalizedDirectInvocation | undefined =
				fanoutAssignment
					? fanoutAssignment.arm === "parallel-specialists"
						? {
								mode: "parallel",
								items: [...(fanoutPlan?.parallel ?? [])],
							}
						: fanoutPlan?.single
							? { mode: "single", items: [fanoutPlan.single] }
							: undefined
					: directInvocation;
			const selectedTasks =
				selectedDirectInvocation?.mode === "parallel"
					? selectedDirectInvocation.items
					: undefined;
			const selectedSingle =
				selectedDirectInvocation?.mode === "single"
					? selectedDirectInvocation.items[0]
					: undefined;
			const continueChild = params.continue
				? ({
						...(params.continue as ContinueParams),
						role: "leaf",
					} as TaskParams & ContinueParams)
				: undefined;
			const originalMode = hasChain
				? "chain"
				: selectedDirectInvocation?.mode ?? "single";
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
			const coordinatorBudget =
				internalParams.__modernRequest?.kind === "coordinator"
					? coordinatorBudgetFor(internalParams.__modernRequest)
					: undefined;
			let orchestrationEmitted = false;
			let experimentAssignmentEmitted = false;
			const complete = <T extends AgentToolResult<SubagentDetails>>(
				result: T,
			): T => {
				if (orchestrationEmitted) return result;
				orchestrationEmitted = true;
				const details = result.details;
				const results = details?.results ?? [];
				for (const worker of results)
					worker.activity = collectSubagentActivity(worker.messages, 1);
				const parentText = result.content.find(
					(item) => item.type === "text",
				)?.text;
				const parentVisibleBytes = Buffer.byteLength(parentText ?? "", "utf-8");
				const workers: OrchestrationWorker[] = results.map((worker, index) => {
					const classification = classifySubagentResult(worker);
					const outcomeCode = outcomeCodeForResult(worker);
					const fallbackTelemetry: SubagentTelemetryMetadata = {
						executionKind: invocationTelemetryExecutionKind,
						workspaceRootSource: invocationWorkspaceRootSource,
						markerCount: worker.workPaths?.length ?? 0,
						boundaryCount: worker.workBoundary?.length ?? 0,
						searchCount: collectSubagentSearchCount(worker.messages),
						watchdogCount: outcomeCode === "timeout" ? 1 : 0,
						pingCount: 0,
						interruptionCount: outcomeCode === "interrupted" ? 1 : 0,
						recoveryCount: 0,
						coordinatorBudgetOutcome: coordinatorBudget
							? coordinatorBudgetOutcomeForResult(worker, coordinatorBudget)
							: "not_applicable",
						legacyAdapterUse,
						...(legacyAdapterBranch ? { legacyAdapterBranch } : {}),
						taskLinkSource: worker.taskId ? "explicit" : "none",
						onclaveEligible: false,
					};
					const telemetry = worker.telemetry ?? fallbackTelemetry;
					const workerBudgetOutcome = coordinatorBudget
						? coordinatorBudgetOutcomeForResult(worker, coordinatorBudget)
						: "not_applicable";
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
						...(worker.effort ? { selectedEffort: worker.effort } : {}),
						...(worker.advisoryPolicyVersion ? { advisoryPolicyVersion: worker.advisoryPolicyVersion } : {}),
						...(worker.advisoryTaskClass ? { advisoryTaskClass: worker.advisoryTaskClass } : {}),
						...(worker.advisoryRecommendedRoute ? { advisoryRecommendedRoute: worker.advisoryRecommendedRoute } : {}),
						...(worker.advisoryClassification ? { advisoryClassification: worker.advisoryClassification } : {}),
						...(worker.advisoryTopologyMismatch === undefined ? {} : { advisoryTopologyMismatch: worker.advisoryTopologyMismatch }),
						executionKind: telemetry.executionKind,
						outcomeCode,
						workspaceRootSource: telemetry.workspaceRootSource,
						markerCount: telemetry.markerCount,
						boundaryCount: telemetry.boundaryCount,
						searchCount: collectSubagentSearchCount(worker.messages) || telemetry.searchCount,
						watchdogCount: telemetry.watchdogCount || (outcomeCode === "timeout" ? 1 : 0),
						pingCount: telemetry.pingCount,
						interruptionCount:
							telemetry.interruptionCount || (outcomeCode === "interrupted" ? 1 : 0),
						recoveryCount: telemetry.recoveryCount,
						coordinatorBudgetOutcome: workerBudgetOutcome,
						legacyAdapterUse: telemetry.legacyAdapterUse,
						...(telemetry.legacyAdapterBranch
							? { legacyAdapterBranch: telemetry.legacyAdapterBranch }
							: {}),
						taskLinkSource: telemetry.taskLinkSource,
						onclaveEligible: false,
						...(worker.routingExperiment
							? {
									experimentId: worker.routingExperiment.experimentId,
									experimentArm: worker.routingExperiment.id,
									experimentTaskClass: worker.routingExperiment.taskClass,
									validationOutcome: outputSchema
										? classification === "completed"
											? ("passed" as const)
											: ("failed" as const)
										: ("unavailable" as const),
								}
							: {}),
						status:
							classification === "cancelled"
								? "cancelled"
								: classification === "failed"
									? "failed"
									: "completed",
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
				const runStatus = allCompleted
					? "completed" as const
					: anyCancelled
						? "cancelled" as const
						: results.length === 0
							? "rejected" as const
							: "failed" as const;
				const runOutcomeCode: OrchestrationOutcomeCode =
					runStatus === "completed"
						? "completed"
						: runStatus === "rejected"
							? "rejected"
							: anyCancelled
								? workers.some((worker) => worker.outcomeCode === "timeout")
									? "timeout"
									: "interrupted"
								: workers.some((worker) => worker.status === "completed")
									? "partial"
									: "failed";
				const runBudgetOutcome: CoordinatorBudgetOutcome = coordinatorBudget
					? workers.length > coordinatorBudget.maxWorkers
						? "max_workers"
						: workers.some((worker) => worker.coordinatorBudgetOutcome === "soft_deadline")
							? "soft_deadline"
							: workers.some((worker) => worker.coordinatorBudgetOutcome === "max_turns")
								? "max_turns"
								: "within_budget"
					: "not_applicable";
				const taskLinkSources = workers.map((worker) => worker.taskLinkSource);
				const runTaskLinkSource: TaskLinkSource = taskLinkSources.includes("invalid")
					? "invalid"
					: taskLinkSources.includes("auto")
						? "auto"
						: taskLinkSources.includes("explicit")
							? "explicit"
							: "none";
				const event = buildOrchestrationRunEvent({
					executionKind: invocationTelemetryExecutionKind,
					outcomeCode: runOutcomeCode,
					workspaceRootSource: invocationWorkspaceRootSource,
					markerCount: workers.reduce((sum, worker) => sum + (worker.markerCount ?? 0), 0),
					boundaryCount: workers.reduce((sum, worker) => sum + (worker.boundaryCount ?? 0), 0),
					searchCount: workers.reduce((sum, worker) => sum + (worker.searchCount ?? 0), 0),
					watchdogCount: workers.reduce((sum, worker) => sum + (worker.watchdogCount ?? 0), 0),
					pingCount: 0,
					interruptionCount: workers.reduce((sum, worker) => sum + (worker.interruptionCount ?? 0), 0),
					recoveryCount: workers.reduce((sum, worker) => sum + (worker.recoveryCount ?? 0), 0),
					coordinatorBudgetOutcome: runBudgetOutcome,
					legacyAdapterUse,
					...(legacyAdapterBranch ? { legacyAdapterBranch } : {}),
					taskLinkSource: runTaskLinkSource,
					onclaveEligible: false,
					orchestrationId,
					...(interactionId ? { interactionId } : {}),
					...(parentSessionId ? { parentSessionId } : {}),
					mode: originalMode,
					fanOut: results.length,
					status: runStatus,
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
							classifySubagentResult(worker) === "completed" &&
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
						args[13] ?? currentIdentity.coordinatorTaskId;
					args[16] = {
						owner: args[13] ? "task" : "direct",
						orchestrationId,
						mode: executionMode,
						background,
						treeId: currentIdentity.treeId ?? orchestrationId,
						parentRunId: currentIdentity.runId,
						parentSessionId,
						workspaceId:
							process.platform === "win32"
								? path.resolve(invocationCwd).toLowerCase()
								: path.resolve(invocationCwd),
						repositoryRoot: invocationCwd,
						workspaceRoot: prepared?.workspaceRoot ?? invocationCwd,
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
									workflowCapabilities:
										internalWorkflowContext.capabilities,
									readOnly: internalWorkflowContext.readOnly,
								}
							: {}),
						...suppliedContext,
						telemetryExecutionKind: invocationTelemetryExecutionKind,
						workspaceRootSource:
							suppliedContext.telemetryWorkspaceRootSource ??
							invocationWorkspaceRootSource,
						markerCount: suppliedContext.telemetryMarkerCount ?? 0,
						boundaryCount: suppliedContext.telemetryBoundaryCount ?? 0,
						searchCount: suppliedContext.searchCount ?? 0,
						watchdogCount: suppliedContext.watchdogCount ?? 0,
						pingCount: 0,
						interruptionCount: suppliedContext.interruptionCount ?? 0,
						recoveryCount:
							legacyAdapterBranch === "continue"
								? 1
								: suppliedContext.recoveryCount ?? 0,
						coordinatorBudgetOutcome:
							suppliedContext.coordinatorBudgetOutcome ??
							(coordinatorBudget ? "within_budget" : "not_applicable"),
						legacyAdapterUse,
						...(legacyAdapterBranch ? { legacyAdapterBranch } : {}),
						taskLinkSource: suppliedContext.telemetryTaskLinkSource ?? "none",
						onclaveEligible: false,
						...(internalParams.__modernRequest
							? { executionKind: internalParams.__modernRequest.kind }
							: {}),
						...(coordinatorBudget
							? {
									maxTurns: coordinatorBudget.maxTurns,
									timeoutMs: coordinatorBudget.softDeadlineMs,
								}
							: {}),
					};
					if (outputSchema) {
						args[3] = `${args[3]}\n\n${schemaOutputInstruction(outputSchema)}`;
						args[15] = { ...(args[15] ?? {}), continuable: true };
					}
					result = await runSingleAgent(...args);
					if (routingExperiment) result.routingExperiment = routingExperiment;
					if (
						!outputSchema ||
						classifySubagentResult(result) !== "completed"
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
			if (availableAgentNames.has("teamlead"))
				availableAgentNames.add("orchestrator");
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

			if (subscriptionRoot && hasContinue)
				throw new Error(
					"Bedrock Claude subscription-only orchestration does not allow saved-session continuation.",
				);

			let preparedItemCursor = 0;
			const prepareChild = (item: TaskParams, forcedRole?: SubagentRole) => {
				const executionKind = internalParams.__modernRequest?.kind;
				const preparedItem = prepared?.items[preparedItemCursor++];
				const taskLinkSource: TaskLinkSource =
					preparedItem?.taskLink.outcome ??
					(item.taskId !== undefined ? "explicit" : "none");
				item.telemetryTaskLinkSource = taskLinkSource;
				item.telemetryWorkspaceRootSource =
					prepared?.request.workspaceRoot !== undefined ||
					preparedItem?.request.cwd !== undefined ||
					(!prepared && item.cwd !== undefined)
						? "override"
						: "default";
				item.telemetryMarkerCount = item.scope?.length ?? 0;
				item.telemetryBoundaryCount = internalParams.workBoundary?.length ?? 0;
				const requestedRole = forcedRole ?? item.role;
				if (subscriptionRoot && requestedRole === "coordinator")
					throw new Error(
						"Bedrock Claude subscription-only orchestration keeps the selected Claude model as the root and does not allow coordinators.",
					);
				if (subscriptionRoot && typeof item.output === "string")
					throw new Error(
						"Bedrock Claude subscription-only orchestration does not allow caller-supplied output paths.",
					);
				const resolved = resolveChildRole(requestedRole, item.agent);
				item.resolvedRole = resolved.role;
				item.resolvedDepth = resolved.depth;
				const effectiveCwd = path.resolve(invocationCwd, item.cwd ?? ".");
				item.cwd = effectiveCwd;
				item.repositoryRoot = effectiveCwd;
				// Historical scope values are now advisory work markers. Preserve
				// them for status/results without turning them into admission or
				// authority checks; governed tool containment is a separate boundary.
				item.normalizedScopes = item.scope ? [...item.scope] : [];
				const profileName = canonicalAgentName(item.agent);
				const agent = agents.find((candidate) => candidate.name === profileName);
				if (!agent) throw new Error(`Unknown agent: ${item.agent}`);
				const authority = resolveChildToolAuthority(agent, {
					role: resolved.role,
					hasScopeLease: false,
					executionKind,
					readOnly:
						executionKind === "read"
							? true
							: fanoutAssignment
								? true
								: internalWorkflowContext?.readOnly,
					workflowCapabilities: internalWorkflowContext?.capabilities,
				});
				if (
					resolved.role === "coordinator" &&
					!authority.tools.includes("subagent_write") &&
					!authority.tools.includes("subagent")
				)
					throw new Error(
						`Coordinator agent ${item.agent} must have a leaf delegation capability.`,
					);
				// workPaths are advisory markers and are not required for writes.
				if (subscriptionRoot) {
					item.resolvedModel = resolveSubscriptionChildModel(
						availableModels,
						ctx.model as ModelLike | undefined,
						agent,
						explicitModel,
						modelSize,
					);
				}
			};
			const chain = params.chain as unknown as TaskParams[] | undefined;
			if (fanoutPlan) {
				prepareChild(fanoutPlan.single as TaskParams, "leaf");
				for (const item of fanoutPlan.parallel as TaskParams[])
					prepareChild(item, "leaf");
			} else {
				if (selectedSingle) prepareChild(selectedSingle);
				for (const item of (selectedTasks ?? []) as TaskParams[])
					prepareChild(item);
			}
			for (const item of chain ?? []) prepareChild(item);
			if (continueChild) prepareChild(continueChild, "leaf");

			// Work markers are reported for coordination only. Overlap never rejects
			// or queues modifying workers.

			if (
				(agentScope === "project" || agentScope === "both") &&
				confirmProjectAgents
			) {
				const projectAgentsRequested = Array.from(requestedAgentNames)
					.map((name) => canonicalAgentName(name))
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
					followUp.resolvedModel ?? resolvedModelId,
					modelSize,
					modelPolicy,
					followUp.effort ?? routedEffort,
					undefined,
					undefined,
					{ continuable: true, sessionPath: followUp.session },
					{
						role: followUp.resolvedRole,
						depth: followUp.resolvedDepth,
						scopes: followUp.normalizedScopes,
						telemetryWorkspaceRootSource: followUp.telemetryWorkspaceRootSource,
						telemetryTaskLinkSource: followUp.telemetryTaskLinkSource,
						telemetryMarkerCount: followUp.telemetryMarkerCount,
						telemetryBoundaryCount: followUp.telemetryBoundaryCount,
					},
				);
				finalizeOutput(
					result,
					subscriptionRoot ? true : followUp.output,
					followUp.outputMode,
					invocationCwd,
					followUp.cwd,
					0,
					false,
				);
				const isError = classifySubagentResult(result) !== "completed";
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
						step.resolvedModel ?? resolvedModelId,
						modelSize,
						modelPolicy,
						step.resolvedEffort ?? step.effort ?? routedEffort,
						undefined,
						undefined,
						{ continuable: params.continuable === true },
						{
							role: step.resolvedRole,
							depth: step.resolvedDepth,
							scopes: step.normalizedScopes,
							workPaths: step.scope,
							repositoryRoot: step.repositoryRoot,
							telemetryWorkspaceRootSource: step.telemetryWorkspaceRootSource,
							telemetryTaskLinkSource: step.telemetryTaskLinkSource,
							telemetryMarkerCount: step.telemetryMarkerCount,
							telemetryBoundaryCount: step.telemetryBoundaryCount,
						},
					);
					finalizeOutput(
						result,
						subscriptionRoot ? true : step.output,
						step.outputMode,
						invocationCwd,
						step.cwd,
						i,
						structuredOutputIsBulky(result),
					);
					results.push(result);

					const isError = classifySubagentResult(result) !== "completed";
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
						model: tasks[i].resolvedModel ?? resolvedModelId ?? agent?.model,
						effort:
							tasks[i].resolvedEffort ??
							tasks[i].effort ??
							routedEffort ??
							agent?.effort ??
							"default",
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
								t.resolvedModel ?? resolvedModelId,
								modelSize,
								modelPolicy,
								t.resolvedEffort ?? t.effort ?? routedEffort,
								t.taskId,
								undefined,
								{ continuable: params.continuable === true },
								{
									role: t.resolvedRole,
									depth: t.resolvedDepth,
									scopes: t.normalizedScopes,
									workPaths: t.scope,
									repositoryRoot: t.repositoryRoot,
									workBoundary: internalParams.workBoundary,
									telemetryWorkspaceRootSource: t.telemetryWorkspaceRootSource,
									telemetryTaskLinkSource: t.telemetryTaskLinkSource,
									telemetryMarkerCount: t.telemetryMarkerCount,
									telemetryBoundaryCount: t.telemetryBoundaryCount,
								},
							);
							finalizeOutput(
								result,
								subscriptionRoot ? true : t.output,
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

				const successCount = results.filter(
					(result) => classifySubagentResult(result) === "completed",
				).length;
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
					selectedSingle.resolvedModel ?? resolvedModelId,
					modelSize,
					modelPolicy,
					selectedSingle.resolvedEffort ?? routedEffort,
					selectedSingle.taskId,
					undefined,
					{ continuable: params.continuable === true },
					{
						role: selectedSingle.resolvedRole,
						depth: selectedSingle.resolvedDepth,
						scopes: selectedSingle.normalizedScopes,
						workPaths: selectedSingle.scope,
						workBoundary: internalParams.workBoundary,
						repositoryRoot: selectedSingle.repositoryRoot,
						telemetryWorkspaceRootSource: selectedSingle.telemetryWorkspaceRootSource,
						telemetryTaskLinkSource: selectedSingle.telemetryTaskLinkSource,
						telemetryMarkerCount: selectedSingle.telemetryMarkerCount,
						telemetryBoundaryCount: selectedSingle.telemetryBoundaryCount,
					},
				);
				finalizeOutput(
					result,
					subscriptionRoot ? true : selectedSingle.output,
					selectedSingle.outputMode,
					invocationCwd,
					selectedSingle.cwd,
					0,
					false,
				);
				const isError = classifySubagentResult(result) !== "completed";
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
					const result = await executeSelectedMode();
					return background
						? result
						: boundProviderVisibleResult(
								result,
								orchestrationId,
								subscriptionRoot ? "subscription" : "provider-visible",
							);
				} finally {
					await settleInvocationTree();
				}
			};
			if (!background) return executeWithTreeSettlement();
			const backgroundOrigin = {
				parentSessionId,
				workspaceId:
					process.platform === "win32"
						? path.resolve(invocationCwd).toLowerCase()
						: path.resolve(invocationCwd),
			};
			void executeWithTreeSettlement()
				.then((result) =>
					queueBackgroundResult(
						orchestrationId,
						executionMode,
						backgroundOrigin,
						result,
					),
				)
				.catch((error) =>
					queueBackgroundResult(
						orchestrationId,
						executionMode,
						backgroundOrigin,
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
			const configuredAgent = args.agent
				? sessionAgentCatalog?.byScope[scope].agents.find((agent) => agent.name === args.agent)
				: undefined;
			const displayedModel = args.model ?? (args.modelSize ? undefined : configuredAgent?.model);
			const modelEffort = displayedModel?.match(THINKING_SUFFIX_RE)?.[1];
			const displayedEffort = args.effort ?? modelEffort ?? configuredAgent?.effort ?? (args.modelSize ? preferredEffortForSize(args.modelSize as ModelSize) : undefined);
			const effortHint = displayedEffort ? `, effort: ${displayedEffort}` : "";
			const modelHint = displayedModel
				? ` ${theme.fg("muted", `(model: ${displayedModel}${effortHint})`)}`
				: args.modelSize
					? ` ${theme.fg("muted", `(${args.modelSize}${args.modelPolicy ? `, ${args.modelPolicy}` : ""}${effortHint})`)}`
					: displayedEffort
						? ` ${theme.fg("muted", `(effort: ${displayedEffort})`)}`
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
				const isError = classifySubagentResult(r) !== "completed";
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
					const usageStr = formatUsageStats(
						r.usage,
						r.model,
						r.durationMs,
						r.activity ?? collectSubagentActivity(r.messages, 1),
					);
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
				const usageStr = formatUsageStats(
					r.usage,
					r.model,
					r.durationMs,
					r.activity ?? collectSubagentActivity(r.messages, 1),
				);
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
			const aggregateDuration = (
				results: SingleResult[],
				mode: "chain" | "parallel",
			): number => {
				const durations = results.map((result) => result.durationMs ?? 0);
				return mode === "chain"
					? durations.reduce((total, duration) => total + duration, 0)
					: Math.max(0, ...durations);
			};
			const aggregateActivity = (results: SingleResult[]) =>
				collectSubagentActivity(
					results.flatMap((result) => result.messages),
					results.length,
				);

			if (details.mode === "chain") {
				const successCount = details.results.filter(
					(result) => classifySubagentResult(result) === "completed",
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
							classifySubagentResult(r) === "completed"
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

						const stepUsage = formatUsageStats(
							r.usage,
							r.model,
							r.durationMs,
							r.activity ?? collectSubagentActivity(r.messages, 1),
						);
						if (stepUsage)
							container.addChild(new Text(theme.fg("dim", stepUsage), 0, 0));
					}

					const usageStr = formatUsageStats(
						aggregateUsage(details.results),
						undefined,
						aggregateDuration(details.results, "chain"),
						aggregateActivity(details.results),
					);
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
						classifySubagentResult(r) === "completed"
							? theme.fg("success", "✓")
							: theme.fg("error", "✗");
					const displayItems = getDisplayItems(r.messages);
					text += `\n\n${theme.fg("muted", `--- Step ${r.step}: `)}${theme.fg("accent", r.agent)}${formatAgentExecutionLabel(r, theme.fg.bind(theme))} ${rIcon}`;
					if (displayItems.length === 0)
						text += `\n${theme.fg("muted", "(no output)")}`;
					else text += `\n${renderDisplayItems(displayItems, 5)}`;
				}
				const usageStr = formatUsageStats(
					aggregateUsage(details.results),
					undefined,
					aggregateDuration(details.results, "chain"),
					aggregateActivity(details.results),
				);
				if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
				text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			if (details.mode === "parallel") {
				const running = details.results.filter(
					(result) => classifySubagentResult(result) === "running",
				).length;
				const successCount = details.results.filter(
					(result) => classifySubagentResult(result) === "completed",
				).length;
				const failCount = details.results.length - running - successCount;
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
							classifySubagentResult(r) === "completed"
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

						const taskUsage = formatUsageStats(
							r.usage,
							r.model,
							r.durationMs,
							r.activity ?? collectSubagentActivity(r.messages, 1),
						);
						if (taskUsage)
							container.addChild(new Text(theme.fg("dim", taskUsage), 0, 0));
					}

					const usageStr = formatUsageStats(
						aggregateUsage(details.results),
						undefined,
						aggregateDuration(details.results, "parallel"),
						aggregateActivity(details.results),
					);
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
					const classification = classifySubagentResult(r);
					const rIcon =
						classification === "running"
							? theme.fg("warning", "⏳")
							: classification === "completed"
								? theme.fg("success", "✓")
								: theme.fg("error", "✗");
					const displayItems = getDisplayItems(r.messages);
					text += `\n\n${theme.fg("muted", "--- ")}${theme.fg("accent", r.agent)}${formatAgentExecutionLabel(r, theme.fg.bind(theme))} ${rIcon}`;
					if (displayItems.length === 0)
						text += `\n${theme.fg("muted", classification === "running" ? "(running...)" : "(no output)")}`;
					else text += `\n${renderDisplayItems(displayItems, 5)}`;
				}
				if (!isRunning) {
					const usageStr = formatUsageStats(
						aggregateUsage(details.results),
						undefined,
						aggregateDuration(details.results, "parallel"),
						aggregateActivity(details.results),
					);
					if (usageStr) text += `\n\n${theme.fg("dim", `Total: ${usageStr}`)}`;
				}
				if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
				return new Text(text, 0, 0);
			}

			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
		},
	});

	resumeInterruptedSession = (
		run,
		sessionPath,
		toolCallId,
		signal,
		onUpdate,
		ctx,
	) =>
		subagentExecutor.execute(
			`${toolCallId}-resume`,
			{
				continue: {
					agent: run.agent,
					session: sessionPath,
					task: INTERRUPTED_TOOL_RECOVERY_MESSAGE,
					cwd: run.cwd,
					...(run.effort ? { effort: run.effort } : {}),
				},
				agentScope: "both",
				confirmProjectAgents: true,
			},
			signal,
			onUpdate,
			ctx,
		);

	const registerSubagentTools = (
		schemas: ReturnType<typeof createSubagentSchemas>,
	) => {
		const withLegacyBranch = <T extends object>(
			params: T,
			branch: LegacyAdapterBranch,
		): T & { readonly [LEGACY_ADAPTER_BRANCH_KEY]: LegacyAdapterBranch } => ({
			...params,
			[LEGACY_ADAPTER_BRANCH_KEY]: branch,
		});

		const executeModern = async (
			toolCallId: string,
			kind: "read" | "write" | "coordinator",
			params: unknown,
			signal: AbortSignal | undefined,
			onUpdate: OnUpdateCallback | undefined,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<SubagentDetails>> => {
			const request = { kind, ...(params as Record<string, unknown>) } as unknown as SubagentExecutionRequest;
			const prepared = prepareSubagentExecution(request, {
				parentCwd: ctx.cwd,
				parentSessionId: ctx.sessionManager?.getSessionId?.(),
				allowExternalWorkspace: currentSubagentIdentity().role === "root",
				isWorkspaceTrusted: (workspaceRoot) =>
					path.resolve(workspaceRoot) === path.resolve(ctx.cwd)
						? ctx.isProjectTrusted()
						: new ProjectTrustStore(getAgentDir()).get(workspaceRoot) === true,
			});
			const executorInput = modernRequestToExecutorInput(request, prepared);
			return subagentExecutor.execute(
				toolCallId,
				executorInput,
				signal,
				onUpdate,
				ctx,
			);
		};

		pi.registerTool({
			name: "subagent_read",
			label: "Subagent Read",
			description: "Run one or more read-only subagent items using a closed positive read authority.",
			parameters: SubagentReadSchema,
			renderResult: subagentExecutor.renderResult,
			execute(toolCallId, params, signal, onUpdate, ctx) {
				return executeModern(toolCallId, "read", params, signal, onUpdate, ctx);
			},
		});
		pi.registerTool({
			name: "subagent_write",
			label: "Subagent Write",
			description: "Run one or more modifying subagent items. workPaths are advisory markers only.",
			parameters: SubagentWriteSchema,
			renderResult: subagentExecutor.renderResult,
			execute(toolCallId, params, signal, onUpdate, ctx) {
				return executeModern(toolCallId, "write", params, signal, onUpdate, ctx);
			},
		});
		pi.registerTool({
			name: "subagent_coordinate",
			label: "Subagent Coordinate",
			description: "Run coordinator items that may delegate only to leaf workers. workBoundary is advisory.",
			parameters: SubagentCoordinateSchema,
			renderResult: subagentExecutor.renderResult,
			execute(toolCallId, params, signal, onUpdate, ctx) {
				return executeModern(toolCallId, "coordinator", params, signal, onUpdate, ctx);
			},
		});

		const {
			parameters: _legacyParameters,
			prepareArguments: _legacyPrepareArguments,
			...subagentTool
		} = subagentExecutor;
		pi.registerTool({
			...subagentTool,
			parameters: schemas.subagent,
			execute(toolCallId, params, signal, onUpdate, ctx) {
				return subagentExecutor.execute(
					toolCallId,
					withLegacyBranch(
						params,
						legacyBranchForInput(params as unknown as Record<string, unknown>),
					),
					signal,
					onUpdate,
					ctx,
				);
			},
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
					withLegacyBranch({ ...common, chain: steps }, "chain"),
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
					withLegacyBranch(
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
						"continue",
					),
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
					withLegacyBranch(
						{ ...common, readOnlyFanout: { single, parallel } },
						"fanout",
					),
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
				const discovery = agentDiscoveryFor(ctx, agentScope);
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
				const subscriptionRoot = isSubscriptionOrchestratorModel(ctx.model);
				if (subscriptionRoot) {
					const availableModels = ctx.modelRegistry.getAvailable() as ModelLike[];
					for (const name of requestedNames) {
						const agent = agents.find((candidate) => candidate.name === name);
						if (!agent)
							throw new Error(
								`Unknown workflow agent for agentScope "${agentScope}": ${name}`,
							);
						resolveSubscriptionChildModel(
							availableModels,
							ctx.model as ModelLike | undefined,
							agent,
							params.model,
							params.modelSize,
						);
					}
				}
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
					options: {
						scope?: readonly string[];
						capabilities?: readonly string[];
						readOnly?: boolean;
					} = {},
				) => {
					const agent = agents.find((candidate) => candidate.name === agentName);
					if (!agent) return undefined;
					const authority = resolveChildToolAuthority(agent, {
						role: "leaf",
						hasScopeLease: (options.scope?.length ?? 0) > 0,
						workflowCapabilities: options.capabilities,
						readOnly: options.readOnly,
					});
					return {
						name: agent.name,
						effectiveTools: authority.tools,
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
					const agent = effectiveAgent(agentName, {
						capabilities,
						readOnly: true,
					});
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
					capabilities: readonly string[];
					readOnly: boolean;
					outputSchema: TSchema;
					phaseSignal: AbortSignal;
				}) => {
					const internalCallId = `${toolCallId}-${randomUUID()}`;
					internalWorkflowRuns.set(internalCallId, {
						workflowPhase: options.phase,
						taskKey: options.key,
						attempt: options.attempt,
						retryOrigin: options.retryOrigin,
						capabilities: options.capabilities,
						readOnly: options.readOnly,
					});
					try {
						const result = await subagentExecutor.execute(
							internalCallId,
							withLegacyBranch({
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
							}, "workflow"),
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
							effectiveAgent(agentName, {
								scope: item?.scope,
								capabilities: item?.capabilities,
							}),
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
								capabilities:
									normalizedItems.find(
										(item) => item.key === request.key,
									)?.capabilities ?? [],
								readOnly: false,
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
										capabilities: params.verify?.capabilities ?? [],
										readOnly: true,
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
										capabilities: params.reduce?.capabilities ?? [],
										readOnly: true,
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
				const toolResult = {
					content: [
						{
							type: "text" as const,
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
				return boundProviderVisibleResult(
					toolResult,
					toolCallId,
					subscriptionRoot ? "subscription" : "provider-visible",
				);
			},
		});
	};

	registerSubagentTools(InitialSubagentSchemas);
	refreshAgentTools = (agentNames) =>
		registerSubagentTools(createSubagentSchemas(agentNames));
}
