import type { Message } from "@earendil-works/pi-ai";
import type { SubagentTreeRole } from "./tree-runtime.js";

/**
 * Retained for callers that display the default tree capacity. Admission is
 * owned by the root tree broker rather than this process-local run manager.
 */
export const MAX_ACTIVE_SUBAGENT_RUNS = 8;
export const MAX_TRACKED_SUBAGENT_RUNS = 64;
export const MAX_SUBAGENT_TRANSCRIPT_ITEMS = 512;
export const MAX_SUBAGENT_TRANSCRIPT_BYTES = 512 * 1024;
export const MAX_SUBAGENT_LIVE_TOOLS = 32;
const MAX_TRANSCRIPT_TEXT_BYTES = 64 * 1024;
const MAX_LIVE_TEXT_BYTES = 128 * 1024;
const MAX_TASK_TEXT_BYTES = 32 * 1024;
const MAX_METADATA_TEXT_BYTES = 8 * 1024;

export type SubagentRunOwner = "direct" | "task";
export type SubagentRunMode =
	| "single"
	| "parallel"
	| "chain"
	| "continue"
	| "task-execute";
export type SubagentRunStatus =
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export interface SubagentBackgroundCompletion {
	readonly orchestrationId: string;
	readonly mode: Exclude<SubagentRunMode, "task-execute">;
	readonly content: string;
	readonly failed: boolean;
	readonly taskIds: ReadonlyArray<string>;
}

export interface SubagentTranscriptItem {
	readonly kind: "assistant" | "thinking" | "tool" | "tool-result";
	readonly text: string;
	readonly toolName?: string;
	readonly isError?: boolean;
}

export interface SubagentLiveTool {
	readonly id: string;
	readonly name: string;
	readonly input?: string;
	readonly output?: string;
}

export interface SubagentRunUsage {
	readonly input: number;
	readonly output: number;
	readonly cacheRead: number;
	readonly cacheWrite: number;
	readonly contextPeakTokens: number;
	readonly turns: number;
	readonly cost: number | null;
}

export interface SubagentRunSnapshot {
	readonly runId: string;
	readonly taskId?: string;
	readonly orchestrationId?: string;
	readonly treeId?: string;
	readonly parentRunId?: string;
	readonly depth?: number;
	readonly role?: SubagentTreeRole;
	readonly workflowPhase?: string;
	readonly taskKey?: string;
	readonly attempt?: number;
	readonly retryOrigin?: string;
	readonly coordinatorTaskId?: string;
	readonly owner: SubagentRunOwner;
	readonly mode: SubagentRunMode;
	readonly agent: string;
	readonly task: string;
	readonly cwd: string;
	readonly model?: string;
	readonly effort?: string;
	readonly background: boolean;
	readonly status: SubagentRunStatus;
	readonly startedAt: number;
	readonly settledAt?: number;
	readonly durationMs?: number;
	readonly exitCode?: number;
	readonly stopReason?: string;
	readonly errorMessage?: string;
	readonly sessionPath?: string;
	readonly usage: SubagentRunUsage;
	readonly transcript: ReadonlyArray<SubagentTranscriptItem>;
	readonly liveText: string;
	readonly liveTools: ReadonlyArray<SubagentLiveTool>;
	readonly finalText: string;
}

interface MutableSubagentRunSnapshot {
	runId: string;
	taskId?: string;
	orchestrationId?: string;
	treeId?: string;
	parentRunId?: string;
	depth?: number;
	role?: SubagentTreeRole;
	workflowPhase?: string;
	taskKey?: string;
	attempt?: number;
	retryOrigin?: string;
	coordinatorTaskId?: string;
	owner: SubagentRunOwner;
	mode: SubagentRunMode;
	agent: string;
	task: string;
	cwd: string;
	model?: string;
	effort?: string;
	background: boolean;
	status: SubagentRunStatus;
	startedAt: number;
	settledAt?: number;
	durationMs?: number;
	exitCode?: number;
	stopReason?: string;
	errorMessage?: string;
	sessionPath?: string;
	usage: SubagentRunUsage;
	transcript: SubagentTranscriptItem[];
	transcriptBytes: number;
	liveText: string;
	liveTools: SubagentLiveTool[];
	finalText: string;
}

export interface BeginSubagentRun {
	runId: string;
	taskId?: string;
	orchestrationId?: string;
	treeId?: string;
	parentRunId?: string;
	depth?: number;
	role?: SubagentTreeRole;
	workflowPhase?: string;
	taskKey?: string;
	attempt?: number;
	retryOrigin?: string;
	coordinatorTaskId?: string;
	owner: SubagentRunOwner;
	mode: SubagentRunMode;
	agent: string;
	task: string;
	cwd: string;
	model?: string;
	effort?: string;
	background?: boolean;
}

export interface UpdateSubagentRun {
	model?: string;
	exitCode?: number;
	stopReason?: string;
	errorMessage?: string;
	sessionPath?: string;
	usage?: SubagentRunUsage;
	finalText?: string;
	durationMs?: number;
}

export interface SettleSubagentRun extends UpdateSubagentRun {
	status: Exclude<SubagentRunStatus, "running">;
}

interface RunSettlement {
	promise: Promise<void>;
	resolve: () => void;
}

function boundedTail(value: string, maxBytes: number): string {
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
	let bytes = 0;
	let result = "";
	const characters = Array.from(value);
	for (let index = characters.length - 1; index >= 0; index--) {
		const character = characters[index];
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes > maxBytes - 3) break;
		result = character + result;
		bytes += characterBytes;
	}
	return `...${result}`;
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((part) => {
			if (!part || typeof part !== "object") return [];
			const candidate = part as Record<string, unknown>;
			if (candidate.type === "text" && typeof candidate.text === "string")
				return [candidate.text];
			return [];
		})
		.join("\n");
}

function defaultUsage(): SubagentRunUsage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		contextPeakTokens: 0,
		turns: 0,
		cost: null,
	};
}

export class SubagentRunManager {
	private readonly snapshots = new Map<
		string,
		MutableSubagentRunSnapshot
	>();
	private readonly controllers = new Map<string, AbortController>();
	private readonly listeners = new Set<() => void>();
	private readonly runListeners = new Map<string, Set<() => void>>();
	private readonly backgroundCompletions = new Map<
		string,
		SubagentBackgroundCompletion
	>();
	private readonly completionListeners = new Set<
		(completion: SubagentBackgroundCompletion) => void
	>();
	private readonly settlements = new Map<string, RunSettlement>();
	private acceptBackgroundCompletions = true;
	private disposalStarted = false;
	private disposalComplete = false;
	private disposePromise: Promise<void> | undefined;

	list(): ReadonlyArray<SubagentRunSnapshot> {
		return [...this.snapshots.values()].sort((left, right) => {
			if (left.status === "running" && right.status !== "running") return -1;
			if (right.status === "running" && left.status !== "running") return 1;
			return right.startedAt - left.startedAt;
		});
	}

	get(runId: string): SubagentRunSnapshot | undefined {
		return this.snapshots.get(runId);
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	subscribeTo(runId: string, listener: () => void): () => void {
		const listeners = this.runListeners.get(runId) ?? new Set<() => void>();
		listeners.add(listener);
		this.runListeners.set(runId, listeners);
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) this.runListeners.delete(runId);
		};
	}

	onBackgroundCompletion(
		listener: (completion: SubagentBackgroundCompletion) => void,
	): () => void {
		this.completionListeners.add(listener);
		return () => this.completionListeners.delete(listener);
	}

	pendingBackgroundCompletions(): ReadonlyArray<SubagentBackgroundCompletion> {
		return [...this.backgroundCompletions.values()];
	}

	hasPendingBackgroundCompletion(orchestrationId: string): boolean {
		return this.backgroundCompletions.has(orchestrationId);
	}

	consumeBackgroundCompletion(orchestrationId: string): void {
		this.backgroundCompletions.delete(orchestrationId);
	}

	queueBackgroundCompletion(completion: SubagentBackgroundCompletion): void {
		if (
			!this.acceptBackgroundCompletions ||
			this.backgroundCompletions.has(completion.orchestrationId)
		)
			return;
		const pending: SubagentBackgroundCompletion = {
			...completion,
			taskIds: [...completion.taskIds],
		};
		this.backgroundCompletions.set(completion.orchestrationId, pending);
		for (const listener of [...this.completionListeners]) {
			try {
				listener(pending);
			} catch {
				// A delivery listener must not affect process settlement.
			}
		}
	}

	begin(input: BeginSubagentRun, controller: AbortController): void {
		if (this.disposalStarted)
			throw new Error("Subagent run manager is disposing.");
		if (this.snapshots.has(input.runId))
			throw new Error(`Subagent run ID ${input.runId} is already registered.`);
		const snapshot: MutableSubagentRunSnapshot = {
			...input,
			agent: boundedTail(input.agent, MAX_METADATA_TEXT_BYTES),
			task: boundedTail(input.task, MAX_TASK_TEXT_BYTES),
			cwd: boundedTail(input.cwd, MAX_METADATA_TEXT_BYTES),
			model:
				input.model === undefined
					? undefined
					: boundedTail(input.model, MAX_METADATA_TEXT_BYTES),
			effort:
				input.effort === undefined
					? undefined
					: boundedTail(input.effort, MAX_METADATA_TEXT_BYTES),
			background: input.background === true,
			status: "running",
			startedAt: Date.now(),
			usage: defaultUsage(),
			transcript: [],
			transcriptBytes: 0,
			liveText: "",
			liveTools: [],
			finalText: "",
		};
		let resolveSettlement: (() => void) | undefined;
		const settlement = new Promise<void>((resolve) => {
			resolveSettlement = resolve;
		});
		this.settlements.set(input.runId, {
			promise: settlement,
			resolve: () => resolveSettlement?.(),
		});
		this.snapshots.set(input.runId, snapshot);
		this.controllers.set(input.runId, controller);
		this.prune();
		this.notify(input.runId);
	}

	update(runId: string, patch: UpdateSubagentRun): void {
		const snapshot = this.snapshots.get(runId);
		if (!snapshot) return;
		if (patch.model !== undefined)
			snapshot.model = boundedTail(patch.model, MAX_METADATA_TEXT_BYTES);
		if (patch.exitCode !== undefined) snapshot.exitCode = patch.exitCode;
		if (patch.stopReason !== undefined)
			snapshot.stopReason = patch.stopReason;
		if (patch.errorMessage !== undefined)
			snapshot.errorMessage = boundedTail(
				patch.errorMessage,
				MAX_TRANSCRIPT_TEXT_BYTES,
			);
		if (patch.sessionPath !== undefined)
			snapshot.sessionPath = boundedTail(
				patch.sessionPath,
				MAX_METADATA_TEXT_BYTES,
			);
		if (patch.usage !== undefined) snapshot.usage = { ...patch.usage };
		if (patch.finalText !== undefined)
			snapshot.finalText = boundedTail(patch.finalText, MAX_LIVE_TEXT_BYTES);
		if (patch.durationMs !== undefined) snapshot.durationMs = patch.durationMs;
		this.notify(runId);
	}

	appendMessage(runId: string, message: Message): void {
		const candidate = message as unknown as Record<string, unknown>;
		const role = typeof candidate.role === "string" ? candidate.role : "";
		if (role === "assistant") {
			const content = Array.isArray(candidate.content)
				? candidate.content
				: [];
			for (const part of content) {
				if (!part || typeof part !== "object") continue;
				const block = part as Record<string, unknown>;
				if (block.type === "text" && typeof block.text === "string") {
					this.appendTranscript(runId, {
						kind: "assistant",
						text: block.text,
					});
				} else if (
					block.type === "thinking" &&
					typeof block.thinking === "string"
				) {
					this.appendTranscript(runId, {
						kind: "thinking",
						text: block.thinking,
					});
				} else if (block.type === "toolCall") {
					const name = typeof block.name === "string" ? block.name : "tool";
					const input =
						block.arguments === undefined
							? ""
							: JSON.stringify(block.arguments);
					this.appendTranscript(runId, {
						kind: "tool",
						toolName: name,
						text: input,
					});
				}
			}
			this.setLiveText(runId, "");
			return;
		}
		if (role === "toolResult") {
			this.appendTranscript(runId, {
				kind: "tool-result",
				toolName:
					typeof candidate.toolName === "string"
						? candidate.toolName
						: "tool",
				isError: candidate.isError === true,
				text: textFromContent(candidate.content),
			});
		}
	}

	appendLiveText(runId: string, delta: string): void {
		const snapshot = this.snapshots.get(runId);
		if (!snapshot || !delta) return;
		snapshot.liveText = boundedTail(
			`${snapshot.liveText}${delta}`,
			MAX_LIVE_TEXT_BYTES,
		);
		this.notify(runId);
	}

	setLiveText(runId: string, text: string): void {
		const snapshot = this.snapshots.get(runId);
		if (!snapshot) return;
		snapshot.liveText = boundedTail(text, MAX_LIVE_TEXT_BYTES);
		this.notify(runId);
	}

	startTool(runId: string, tool: SubagentLiveTool): void {
		const snapshot = this.snapshots.get(runId);
		if (!snapshot) return;
		const current = snapshot.liveTools.filter((item) => item.id !== tool.id);
		snapshot.liveTools = [
			...current,
			{
				...tool,
				name: boundedTail(tool.name, MAX_METADATA_TEXT_BYTES),
				input:
					tool.input === undefined
						? undefined
						: boundedTail(tool.input, MAX_TRANSCRIPT_TEXT_BYTES),
			},
		].slice(-MAX_SUBAGENT_LIVE_TOOLS);
		this.notify(runId);
	}

	updateTool(runId: string, toolId: string, output: string): void {
		const snapshot = this.snapshots.get(runId);
		if (!snapshot) return;
		snapshot.liveTools = snapshot.liveTools.map((tool) =>
			tool.id === toolId
				? { ...tool, output: boundedTail(output, MAX_TRANSCRIPT_TEXT_BYTES) }
				: tool,
		);
		this.notify(runId);
	}

	endTool(runId: string, toolId: string): void {
		const snapshot = this.snapshots.get(runId);
		if (!snapshot) return;
		snapshot.liveTools = snapshot.liveTools.filter(
			(tool) => tool.id !== toolId,
		);
		this.notify(runId);
	}

	settle(runId: string, result: SettleSubagentRun): void {
		const snapshot = this.snapshots.get(runId);
		if (!snapshot || snapshot.status !== "running") {
			this.resolveSettlement(runId);
			return;
		}
		this.update(runId, result);
		snapshot.status = result.status;
		snapshot.settledAt = Date.now();
		snapshot.durationMs ??= snapshot.settledAt - snapshot.startedAt;
		snapshot.liveText = "";
		snapshot.liveTools = [];
		this.controllers.delete(runId);
		this.prune();
		this.notify(runId);
		this.resolveSettlement(runId);
	}

	cancel(runId: string): boolean {
		return this.cancelTree(runId).includes(runId);
	}

	/** Cancel an in-process run together with every registered descendant. */
	cancelTree(runId: string): string[] {
		const cancelled: string[] = [];
		for (const snapshot of this.snapshots.values()) {
			if (
				snapshot.status !== "running" ||
				!this.isRunOrDescendant(snapshot.runId, runId)
			)
				continue;
			const controller = this.controllers.get(snapshot.runId);
			if (!controller) continue;
			controller.abort(new Error("Subagent run cancelled"));
			cancelled.push(snapshot.runId);
		}
		return cancelled;
	}

	cancelAll(owner?: SubagentRunOwner): string[] {
		const cancelled = new Set<string>();
		for (const snapshot of this.snapshots.values()) {
			if (snapshot.status !== "running") continue;
			if (owner !== undefined && snapshot.owner !== owner) continue;
			for (const runId of this.cancelTree(snapshot.runId)) cancelled.add(runId);
		}
		return [...cancelled];
	}

	cancelForeground(): string[] {
		const cancelled: string[] = [];
		for (const snapshot of this.snapshots.values()) {
			if (snapshot.status !== "running" || snapshot.background) continue;
			if (this.cancel(snapshot.runId)) cancelled.push(snapshot.runId);
		}
		return cancelled;
	}

	dispose(): Promise<void> {
		if (this.disposePromise) return this.disposePromise;
		this.disposalStarted = true;
		this.acceptBackgroundCompletions = false;
		let resolveDispose: (() => void) | undefined;
		this.disposePromise = new Promise<void>((resolve) => {
			resolveDispose = resolve;
		});
		const settlements = [...this.settlements.values()].map(
			(settlement) => settlement.promise,
		);
		this.cancelAll();
		void Promise.all(settlements).then(() => {
			this.snapshots.clear();
			this.controllers.clear();
			this.backgroundCompletions.clear();
			this.completionListeners.clear();
			this.listeners.clear();
			this.runListeners.clear();
			this.disposalComplete = true;
			resolveDispose?.();
		});
		return this.disposePromise;
	}

	clear(options: { abortRunning?: boolean } = {}): void {
		if (this.disposalStarted && !this.disposalComplete)
			throw new Error("Cannot clear subagent runs while disposal is in progress.");
		if (options.abortRunning) this.cancelAll();
		this.snapshots.clear();
		this.controllers.clear();
		this.settlements.clear();
		this.backgroundCompletions.clear();
		this.acceptBackgroundCompletions = true;
		this.disposalStarted = false;
		this.disposalComplete = false;
		this.disposePromise = undefined;
		this.notify();
		this.runListeners.clear();
		this.completionListeners.clear();
	}

	private resolveSettlement(runId: string): void {
		const settlement = this.settlements.get(runId);
		if (!settlement) return;
		this.settlements.delete(runId);
		settlement.resolve();
	}

	private appendTranscript(
		runId: string,
		item: SubagentTranscriptItem,
	): void {
		const snapshot = this.snapshots.get(runId);
		if (!snapshot) return;
		const boundedItem = {
			...item,
			...(item.toolName
				? { toolName: boundedTail(item.toolName, MAX_METADATA_TEXT_BYTES) }
				: {}),
			text: boundedTail(item.text, MAX_TRANSCRIPT_TEXT_BYTES),
		};
		snapshot.transcript.push(boundedItem);
		snapshot.transcriptBytes += Buffer.byteLength(boundedItem.text, "utf8");
		while (
			snapshot.transcript.length > MAX_SUBAGENT_TRANSCRIPT_ITEMS ||
			snapshot.transcriptBytes > MAX_SUBAGENT_TRANSCRIPT_BYTES
		) {
			const removed = snapshot.transcript.shift();
			if (removed)
				snapshot.transcriptBytes -= Buffer.byteLength(removed.text, "utf8");
		}
		this.notify(runId);
	}

	private isRunOrDescendant(runId: string, ancestorRunId: string): boolean {
		let current = this.snapshots.get(runId);
		while (current) {
			if (current.runId === ancestorRunId) return true;
			current = current.parentRunId
				? this.snapshots.get(current.parentRunId)
				: undefined;
		}
		return false;
	}

	private prune(): void {
		if (this.snapshots.size <= MAX_TRACKED_SUBAGENT_RUNS) return;
		const settled = [...this.snapshots.values()]
			.filter((snapshot) => snapshot.status !== "running")
			.sort(
				(left, right) =>
					(left.settledAt ?? left.startedAt) -
					(right.settledAt ?? right.startedAt),
			);
		for (const snapshot of settled) {
			if (this.snapshots.size <= MAX_TRACKED_SUBAGENT_RUNS) break;
			this.snapshots.delete(snapshot.runId);
			this.controllers.delete(snapshot.runId);
			this.runListeners.delete(snapshot.runId);
		}
	}

	private notify(runId?: string): void {
		for (const listener of [...this.listeners]) {
			try {
				listener();
			} catch {
				// A display listener must not affect execution state.
			}
		}
		if (!runId) return;
		for (const listener of [...(this.runListeners.get(runId) ?? [])]) {
			try {
				listener();
			} catch {
				// A display listener must not affect execution state.
			}
		}
	}
}

const SUBAGENT_RUN_MANAGER_VERSION = 1;
const SUBAGENT_RUN_MANAGER_KEY = Symbol.for(
	"dotfiles.pi.subagent-run-manager",
);

type SubagentRunManagerGlobal = {
	version: number;
	manager: SubagentRunManager;
};

function managerGlobals(): typeof globalThis & Record<symbol, unknown> {
	return globalThis as typeof globalThis & Record<symbol, unknown>;
}

export function getSubagentRunManager(): SubagentRunManager {
	const globals = managerGlobals();
	const existing = globals[
		SUBAGENT_RUN_MANAGER_KEY
	] as SubagentRunManagerGlobal | undefined;
	if (existing?.version === SUBAGENT_RUN_MANAGER_VERSION) {
		return existing.manager;
	}
	const manager = new SubagentRunManager();
	globals[SUBAGENT_RUN_MANAGER_KEY] = {
		version: SUBAGENT_RUN_MANAGER_VERSION,
		manager,
	} satisfies SubagentRunManagerGlobal;
	return manager;
}

export const subagentRunManager = getSubagentRunManager();
