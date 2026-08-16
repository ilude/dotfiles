import { randomUUID } from "node:crypto";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

export const MAX_WORKFLOW_ITEMS = 256;
export const DEFAULT_WORKFLOW_ATTEMPTS = 2;
export const MAX_WORKFLOW_ATTEMPTS = 3;
export const MIN_WORKFLOW_REDUCTION_GROUP_SIZE = 2;
export const MAX_WORKFLOW_REDUCTION_GROUP_SIZE = 8;
export const MAX_WORKFLOW_EXTRACT_BYTES = 16_000;
export const MAX_WORKFLOW_RANGE_LINES = 400;
export const MAX_WORKFLOW_TASK_BYTES = 8_000;
export const MAX_RETAINED_WORKFLOWS = 128;

export const MAX_ENVELOPE_EVIDENCE = 8;
export const MAX_ENVELOPE_CHANGED_FILES = 32;
export const MAX_ENVELOPE_VALIDATION = 8;
export const MAX_ENVELOPE_GAPS = 8;
export const MAX_ENVELOPE_TEXT_BYTES = 500;

export type WorkflowItemStatus =
	| "found"
	| "not_found"
	| "inconclusive"
	| "error";

export type WorkflowInput =
	| { readonly kind: "none" }
	| { readonly kind: "extract"; readonly content: string }
	| {
			readonly kind: "path-range";
			readonly path: string;
			readonly startLine: number;
			readonly endLine: number;
		};

export interface WorkflowRetry {
	readonly task: string;
	readonly input: WorkflowInput;
}

export interface WorkflowItem {
	readonly key: string;
	readonly agent: string;
	readonly task: string;
	readonly capabilities: readonly string[];
	readonly scope?: readonly string[];
	readonly input?: WorkflowInput;
	readonly retries?: readonly WorkflowRetry[];
}

export interface WorkflowVerification {
	readonly keys?: readonly string[];
	readonly agent: string;
	readonly task: string;
	readonly capabilities: readonly string[];
}

export interface WorkflowReduction {
	readonly groupSize?: number;
	readonly agent: string;
	readonly task: string;
	readonly capabilities: readonly string[];
}

export interface WorkflowSpecification {
	readonly id?: string;
	readonly items: readonly WorkflowItem[];
	readonly attempts?: number;
	readonly concurrency?: number;
	readonly verify?: WorkflowVerification;
	readonly reduce?: WorkflowReduction;
}

const WorkflowInputSchema = Type.Object(
	{
		kind: StringEnum(["none", "extract", "path-range"] as const),
		content: Type.Optional(
			Type.String({ maxLength: MAX_WORKFLOW_EXTRACT_BYTES }),
		),
		path: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
		startLine: Type.Optional(Type.Integer({ minimum: 1 })),
		endLine: Type.Optional(Type.Integer({ minimum: 1 })),
	},
	{ additionalProperties: false, default: { kind: "none" } },
);

const WorkflowRetrySchema = Type.Object(
	{
		task: Type.String({ minLength: 1, maxLength: MAX_WORKFLOW_TASK_BYTES }),
		input: WorkflowInputSchema,
	},
	{ additionalProperties: false },
);

const WorkflowItemSchema = Type.Object(
	{
		key: Type.String({ minLength: 1, maxLength: 256 }),
		agent: Type.String({ minLength: 1, maxLength: 256 }),
		task: Type.String({ minLength: 1, maxLength: MAX_WORKFLOW_TASK_BYTES }),
		capabilities: Type.Array(Type.String({ minLength: 1, maxLength: 128 }), {
			maxItems: 64,
		}),
		scope: Type.Optional(
			Type.Array(Type.String({ minLength: 1, maxLength: 512 }), {
				minItems: 1,
				maxItems: 64,
			}),
		),
		input: Type.Optional(WorkflowInputSchema),
		retries: Type.Optional(
			Type.Array(WorkflowRetrySchema, { maxItems: MAX_WORKFLOW_ATTEMPTS - 1 }),
		),
	},
	{ additionalProperties: false },
);

export const WorkflowSpecificationSchema = Type.Object(
	{
		id: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
		items: Type.Array(WorkflowItemSchema, {
			minItems: 1,
			maxItems: MAX_WORKFLOW_ITEMS,
		}),
		attempts: Type.Optional(
			Type.Integer({
				minimum: 1,
				maximum: MAX_WORKFLOW_ATTEMPTS,
				default: DEFAULT_WORKFLOW_ATTEMPTS,
			}),
		),
		concurrency: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_WORKFLOW_ITEMS })),
		verify: Type.Optional(
			Type.Object(
				{
					keys: Type.Optional(
						Type.Array(Type.String({ minLength: 1, maxLength: 256 }), {
							maxItems: MAX_WORKFLOW_ITEMS,
						}),
					),
					agent: Type.String({ minLength: 1, maxLength: 256 }),
					task: Type.String({
						minLength: 1,
						maxLength: MAX_WORKFLOW_TASK_BYTES,
					}),
					capabilities: Type.Array(
						Type.String({ minLength: 1, maxLength: 128 }),
						{ maxItems: 64 },
					),
				},
				{ additionalProperties: false },
			),
		),
		reduce: Type.Optional(
			Type.Object(
				{
					groupSize: Type.Optional(
						Type.Integer({
							minimum: MIN_WORKFLOW_REDUCTION_GROUP_SIZE,
							maximum: MAX_WORKFLOW_REDUCTION_GROUP_SIZE,
						}),
					),
					agent: Type.String({ minLength: 1, maxLength: 256 }),
					task: Type.String({
						minLength: 1,
						maxLength: MAX_WORKFLOW_TASK_BYTES,
					}),
					capabilities: Type.Array(
						Type.String({ minLength: 1, maxLength: 128 }),
						{ maxItems: 64 },
					),
				},
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);

function workflowEnvelopeTextListSchema(maxItems: number) {
	return Type.Array(Type.String({ maxLength: MAX_ENVELOPE_TEXT_BYTES }), {
		maxItems,
	});
}

export const WorkflowLeafOutputSchema = Type.Object(
	{
		status: StringEnum(
			["found", "not_found", "inconclusive", "error"] as const,
		),
		evidence: Type.Optional(
			workflowEnvelopeTextListSchema(MAX_ENVELOPE_EVIDENCE),
		),
		changedFiles: Type.Optional(
			workflowEnvelopeTextListSchema(MAX_ENVELOPE_CHANGED_FILES),
		),
		validation: Type.Optional(
			workflowEnvelopeTextListSchema(MAX_ENVELOPE_VALIDATION),
		),
		gaps: Type.Optional(workflowEnvelopeTextListSchema(MAX_ENVELOPE_GAPS)),
	},
	{ additionalProperties: false },
);

export const WorkflowVerificationOutputSchema = Type.Object(
	{
		contradicted: Type.Boolean(),
		evidence: Type.Optional(
			workflowEnvelopeTextListSchema(MAX_ENVELOPE_EVIDENCE),
		),
		gaps: Type.Optional(workflowEnvelopeTextListSchema(MAX_ENVELOPE_GAPS)),
	},
	{ additionalProperties: false },
);

export const WorkflowReductionOutputSchema = Type.Object(
	{
		summary: Type.String({ maxLength: MAX_ENVELOPE_TEXT_BYTES }),
		evidence: Type.Optional(
			workflowEnvelopeTextListSchema(MAX_ENVELOPE_EVIDENCE),
		),
		gaps: Type.Optional(workflowEnvelopeTextListSchema(MAX_ENVELOPE_GAPS)),
	},
	{ additionalProperties: false },
);

export interface WorkflowAgent {
	readonly name: string;
	readonly effectiveTools: readonly string[];
}

export interface WorkflowLeafResult {
	readonly status: WorkflowItemStatus;
	readonly evidence?: readonly string[];
	readonly changedFiles?: readonly string[];
	readonly validation?: readonly string[];
	readonly gaps?: readonly string[];
}

export interface WorkflowResultEnvelope extends WorkflowLeafResult {
	readonly key: string;
	readonly agent: string;
	readonly attempts: number;
	readonly verification?: {
		readonly contradicted: boolean;
		readonly evidence: readonly string[];
		readonly gaps: readonly string[];
	};
}

export interface WorkflowVerificationResult {
	readonly contradicted: boolean;
	readonly evidence?: readonly string[];
	readonly gaps?: readonly string[];
}

export interface WorkflowExecutionRequest {
	readonly workflowId: string;
	readonly key: string;
	readonly agent: string;
	readonly attempt: number;
	readonly phase: "map" | "retry";
	readonly retryOrigin?: string;
	readonly task: string;
	readonly input: WorkflowInput;
	readonly signal: AbortSignal;
}

export interface WorkflowReductionEntry {
	readonly kind: "item" | "reduction";
	readonly value: WorkflowResultEnvelope | WorkflowReductionResult;
}

export interface WorkflowReductionRequest {
	readonly workflowId: string;
	readonly level: number;
	readonly entries: readonly WorkflowReductionEntry[];
	readonly signal: AbortSignal;
}

export interface WorkflowReductionResult {
	readonly summary: string;
	readonly evidence?: readonly string[];
	readonly gaps?: readonly string[];
}

export interface WorkflowRuntimeDependencies {
	resolveAgent(
		agent: string,
		item?: WorkflowItem,
	): WorkflowAgent | undefined | Promise<WorkflowAgent | undefined>;
	execute(request: WorkflowExecutionRequest): unknown | Promise<unknown>;
	verify?(
		envelope: WorkflowResultEnvelope,
		signal: AbortSignal,
	): unknown | Promise<unknown>;
	reduce?(
		request: WorkflowReductionRequest,
	): unknown | Promise<unknown>;
}

export interface WorkflowRunResult {
	readonly id: string;
	readonly items: readonly WorkflowResultEnvelope[];
	readonly reductions: readonly WorkflowReductionResult[];
}

export type WorkflowSnapshot =
	| { readonly id: string; readonly state: "running" }
	| {
			readonly id: string;
			readonly state: "settled";
			readonly result: WorkflowRunResult;
	  }
	| {
			readonly id: string;
			readonly state: "cancelled";
			readonly error: WorkflowCancelledError;
	  }
	| {
			readonly id: string;
			readonly state: "failed";
			readonly error: Error;
	  };

export class WorkflowSpecificationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowSpecificationError";
	}
}

export class WorkflowCancelledError extends Error {
	constructor() {
		super("Subagent workflow was cancelled.");
		this.name = "WorkflowCancelledError";
	}
}

type ValidatedWorkflowItem = Omit<WorkflowItem, "input"> & {
	readonly input: WorkflowInput;
};

type ValidatedSpecification = {
	id: string;
	items: readonly ValidatedWorkflowItem[];
	attempts: number;
	concurrency: number;
	verify?: WorkflowVerification;
	reduce?: WorkflowReduction & { groupSize: number };
	fingerprint: string;
};

type MutableWorkflowState = {
	id: string;
	fingerprint: string;
	state: WorkflowSnapshot["state"];
	controller: AbortController;
	result?: WorkflowRunResult;
	error?: Error;
	promise?: Promise<WorkflowRunResult>;
};

type ItemExecution = {
	item: ValidatedWorkflowItem;
	agent?: WorkflowAgent;
	ready: boolean;
	envelope: WorkflowResultEnvelope;
	fingerprints: Set<string>;
};

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf8");
}

function compactStrings(
	value: unknown,
	limit: number,
	label: string,
): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		throw new WorkflowSpecificationError(`${label} must be an array of strings.`);
	}
	if (value.length > limit)
		throw new WorkflowSpecificationError(`${label} has too many entries.`);
	return value.map((entry) => {
		if (byteLength(entry) > MAX_ENVELOPE_TEXT_BYTES)
			throw new WorkflowSpecificationError(`${label} contains oversized text.`);
		return entry;
	});
}

function assertTask(task: string, label: string): void {
	if (typeof task !== "string" || !task.trim())
		throw new WorkflowSpecificationError(`${label} is required.`);
	if (byteLength(task) > MAX_WORKFLOW_TASK_BYTES)
		throw new WorkflowSpecificationError(`${label} exceeds the workflow prompt bound.`);
}

function assertCapabilities(
	capabilities: readonly string[],
	label: string,
): void {
	if (
		!Array.isArray(capabilities) ||
		capabilities.length > 64 ||
		capabilities.some(
			(capability) =>
				typeof capability !== "string" ||
				!capability.trim() ||
				capability.length > 128,
		)
	) {
		throw new WorkflowSpecificationError(
			`${label} must declare at most 64 bounded capabilities.`,
		);
	}
}

function assertOnlyFields(
	value: object,
	fields: readonly string[],
	label: string,
): void {
	const permitted = new Set(fields);
	if (Object.keys(value).some((key) => !permitted.has(key))) {
		throw new WorkflowSpecificationError(`${label} contains unsupported fields.`);
	}
}

function assertRelativePath(value: string): void {
	if (!value || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
		throw new WorkflowSpecificationError("Path/range inputs require a repository-relative slash path.");
	}
	const parts = value.split("/");
	if (parts.some((part) => !part || part === "." || part === "..")) {
		throw new WorkflowSpecificationError("Path/range inputs must not escape the repository.");
	}
}

export function validateWorkflowInput(input: WorkflowInput): WorkflowInput {
	if (!input || typeof input !== "object" || !("kind" in input)) {
		throw new WorkflowSpecificationError("Workflow input is required.");
	}
	if (input.kind === "none") {
		assertOnlyFields(input, ["kind"], "None input");
		return { kind: "none" };
	}
	if (input.kind === "extract") {
		assertOnlyFields(input, ["kind", "content"], "Extract input");
		if (typeof input.content !== "string")
			throw new WorkflowSpecificationError("Extract input content must be a string.");
		if (byteLength(input.content) > MAX_WORKFLOW_EXTRACT_BYTES) {
			throw new WorkflowSpecificationError(
				`Extract input exceeds ${MAX_WORKFLOW_EXTRACT_BYTES} bytes. Use path/range partitions instead.`,
			);
		}
		return { kind: "extract", content: input.content };
	}
	if (input.kind === "path-range") {
		assertOnlyFields(
			input,
			["kind", "path", "startLine", "endLine"],
			"Path/range input",
		);
		assertRelativePath(input.path);
		if (
			!Number.isInteger(input.startLine) ||
			!Number.isInteger(input.endLine) ||
			input.startLine < 1 ||
			input.endLine < input.startLine ||
			input.endLine - input.startLine + 1 > MAX_WORKFLOW_RANGE_LINES
		) {
			throw new WorkflowSpecificationError(
				`Path/range inputs must contain 1 through ${MAX_WORKFLOW_RANGE_LINES} lines.`,
			);
		}
		return {
			kind: "path-range",
			path: input.path,
			startLine: input.startLine,
			endLine: input.endLine,
		};
	}
	throw new WorkflowSpecificationError("Workflow input kind is not supported.");
}

export function partitionFileRange(
	path: string,
	totalLines: number,
	maxLines = MAX_WORKFLOW_RANGE_LINES,
): WorkflowInput[] {
	assertRelativePath(path);
	if (!Number.isInteger(totalLines) || totalLines < 1)
		throw new WorkflowSpecificationError("File partitioning requires a positive line count.");
	if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > MAX_WORKFLOW_RANGE_LINES) {
		throw new WorkflowSpecificationError(
			`File partition size must be an integer from 1 through ${MAX_WORKFLOW_RANGE_LINES}.`,
		);
	}
	const ranges: WorkflowInput[] = [];
	for (let startLine = 1; startLine <= totalLines; startLine += maxLines) {
		ranges.push({
			kind: "path-range",
			path,
			startLine,
			endLine: Math.min(totalLines, startLine + maxLines - 1),
		});
	}
	return ranges;
}

function normalizeSpecification(specification: WorkflowSpecification): ValidatedSpecification {
	if (
		!Array.isArray(specification.items) ||
		specification.items.length < 1 ||
		specification.items.length > MAX_WORKFLOW_ITEMS
	) {
		throw new WorkflowSpecificationError(
			`A workflow must contain 1 through ${MAX_WORKFLOW_ITEMS} unique items.`,
		);
	}
	const attempts = specification.attempts ?? DEFAULT_WORKFLOW_ATTEMPTS;
	if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_WORKFLOW_ATTEMPTS) {
		throw new WorkflowSpecificationError(
			`Workflow attempts must be an integer from 1 through ${MAX_WORKFLOW_ATTEMPTS}.`,
		);
	}
	const concurrency = specification.concurrency ?? MAX_WORKFLOW_REDUCTION_GROUP_SIZE;
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_WORKFLOW_ITEMS) {
		throw new WorkflowSpecificationError("Workflow concurrency must be an integer from 1 through 256.");
	}
	const keys = new Set<string>();
	const items = specification.items.map((item): ValidatedWorkflowItem => {
		if (
			typeof item.key !== "string" ||
			!item.key.trim() ||
			typeof item.agent !== "string" ||
			!item.agent.trim()
		) {
			throw new WorkflowSpecificationError("Workflow item key and agent are required.");
		}
		if (keys.has(item.key))
			throw new WorkflowSpecificationError(`Workflow item key ${item.key} is duplicated.`);
		keys.add(item.key);
		assertTask(item.task, `Workflow item ${item.key} task`);
		assertCapabilities(item.capabilities, `Workflow item ${item.key}`);
		if (item.retries !== undefined && !Array.isArray(item.retries)) {
			throw new WorkflowSpecificationError(`Workflow item ${item.key} retries must be an array.`);
		}
		if ((item.retries?.length ?? 0) > attempts - 1) {
			throw new WorkflowSpecificationError(
				`Workflow item ${item.key} declares more retries than its attempt limit.`,
			);
		}
		const retries = item.retries?.map((retry: WorkflowRetry) => {
			assertTask(retry.task, `Workflow retry for ${item.key}`);
			return {
				task: retry.task,
				input: validateWorkflowInput(retry.input),
			};
		});
		return {
			key: item.key,
			agent: item.agent,
			task: item.task,
			capabilities: [...item.capabilities],
			...(item.scope ? { scope: [...item.scope] } : {}),
			input: validateWorkflowInput(item.input ?? { kind: "none" }),
			...(retries ? { retries } : {}),
		};
	});
	let verify: WorkflowVerification | undefined;
	if (specification.verify) {
		assertTask(specification.verify.task, "Workflow verification task");
		if (!specification.verify.agent?.trim()) {
			throw new WorkflowSpecificationError("Workflow verification agent is required.");
		}
		assertCapabilities(
			specification.verify.capabilities,
			"Workflow verification",
		);
		if (
			specification.verify.keys !== undefined &&
			(!Array.isArray(specification.verify.keys) ||
				specification.verify.keys.length > MAX_WORKFLOW_ITEMS)
		) {
			throw new WorkflowSpecificationError("Workflow verification keys are invalid.");
		}
		for (const key of specification.verify.keys ?? []) {
			if (typeof key !== "string" || !keys.has(key)) {
				throw new WorkflowSpecificationError(`Verification target ${String(key)} is not a workflow item.`);
			}
		}
		verify = {
			...(specification.verify.keys
				? { keys: [...specification.verify.keys] }
				: {}),
			agent: specification.verify.agent,
			task: specification.verify.task,
			capabilities: [...specification.verify.capabilities],
		};
	}
	let reduce: (WorkflowReduction & { groupSize: number }) | undefined;
	if (specification.reduce) {
		assertTask(specification.reduce.task, "Workflow reduction task");
		if (!specification.reduce.agent?.trim()) {
			throw new WorkflowSpecificationError("Workflow reduction agent is required.");
		}
		assertCapabilities(specification.reduce.capabilities, "Workflow reduction");
		const groupSize =
			specification.reduce.groupSize ?? MAX_WORKFLOW_REDUCTION_GROUP_SIZE;
		if (
			!Number.isInteger(groupSize) ||
			groupSize < MIN_WORKFLOW_REDUCTION_GROUP_SIZE ||
			groupSize > MAX_WORKFLOW_REDUCTION_GROUP_SIZE
		) {
			throw new WorkflowSpecificationError(
				`Reduction groups must contain ${MIN_WORKFLOW_REDUCTION_GROUP_SIZE} through ${MAX_WORKFLOW_REDUCTION_GROUP_SIZE} results.`,
			);
		}
		reduce = {
			groupSize,
			agent: specification.reduce.agent,
			task: specification.reduce.task,
			capabilities: [...specification.reduce.capabilities],
		};
	}
	const id = specification.id?.trim() || randomUUID();
	const normalized = { id, items, attempts, concurrency, verify, reduce };
	return { ...normalized, fingerprint: JSON.stringify(normalized) };
}

function parseLeafResult(value: unknown): WorkflowLeafResult {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new WorkflowSpecificationError("Leaf result must be an object.");
	}
	const record = value as Record<string, unknown>;
	const permitted = new Set([
		"status",
		"evidence",
		"changedFiles",
		"validation",
		"gaps",
	]);
	if (Object.keys(record).some((key) => !permitted.has(key))) {
		throw new WorkflowSpecificationError("Leaf result contains unsupported fields.");
	}
	if (
		record.status !== "found" &&
		record.status !== "not_found" &&
		record.status !== "inconclusive" &&
		record.status !== "error"
	) {
		throw new WorkflowSpecificationError("Leaf result has an invalid status.");
	}
	return {
		status: record.status,
		evidence: compactStrings(record.evidence, MAX_ENVELOPE_EVIDENCE, "Leaf evidence"),
		changedFiles: compactStrings(record.changedFiles, MAX_ENVELOPE_CHANGED_FILES, "Leaf changed files"),
		validation: compactStrings(record.validation, MAX_ENVELOPE_VALIDATION, "Leaf validation"),
		gaps: compactStrings(record.gaps, MAX_ENVELOPE_GAPS, "Leaf gaps"),
	};
}

function parseVerification(value: unknown): WorkflowVerificationResult {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new WorkflowSpecificationError("Verification result must be an object.");
	}
	const record = value as Record<string, unknown>;
	const permitted = new Set(["contradicted", "evidence", "gaps"]);
	if (Object.keys(record).some((key) => !permitted.has(key))) {
		throw new WorkflowSpecificationError(
			"Verification result contains unsupported fields.",
		);
	}
	if (typeof record.contradicted !== "boolean") {
		throw new WorkflowSpecificationError("Verification result must declare contradicted.");
	}
	return {
		contradicted: record.contradicted,
		evidence: compactStrings(record.evidence, MAX_ENVELOPE_EVIDENCE, "Verification evidence"),
		gaps: compactStrings(record.gaps, MAX_ENVELOPE_GAPS, "Verification gaps"),
	};
}

function parseReduction(value: unknown): WorkflowReductionResult {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new WorkflowSpecificationError("Reduction result must be an object.");
	}
	const record = value as Record<string, unknown>;
	const permitted = new Set(["summary", "evidence", "gaps"]);
	if (Object.keys(record).some((key) => !permitted.has(key))) {
		throw new WorkflowSpecificationError("Reduction result contains unsupported fields.");
	}
	if (typeof record.summary !== "string" || byteLength(record.summary) > MAX_ENVELOPE_TEXT_BYTES) {
		throw new WorkflowSpecificationError("Reduction result requires a bounded summary.");
	}
	return {
		summary: record.summary,
		evidence: compactStrings(record.evidence, MAX_ENVELOPE_EVIDENCE, "Reduction evidence"),
		gaps: compactStrings(record.gaps, MAX_ENVELOPE_GAPS, "Reduction gaps"),
	};
}

function errorEnvelope(
	item: WorkflowItem,
	attempts: number,
	gap: string,
): WorkflowResultEnvelope {
	return {
		key: item.key,
		agent: item.agent,
		status: "error",
		attempts,
		evidence: [],
		changedFiles: [],
		validation: [],
		gaps: [gap],
	};
}

function leafEnvelope(
	item: WorkflowItem,
	attempts: number,
	result: WorkflowLeafResult,
): WorkflowResultEnvelope {
	return {
		key: item.key,
		agent: item.agent,
		attempts,
		status: result.status,
		evidence: result.evidence ?? [],
		changedFiles: result.changedFiles ?? [],
		validation: result.validation ?? [],
		gaps: result.gaps ?? [],
	};
}

function retryable(status: WorkflowItemStatus): boolean {
	return status === "error" || status === "inconclusive";
}

function executionFingerprint(task: string, input: WorkflowInput): string {
	return JSON.stringify({ task, input });
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw new WorkflowCancelledError();
}

export class BoundedWorkflowRuntime {
	private readonly workflows = new Map<string, MutableWorkflowState>();

	async run(
		specification: WorkflowSpecification,
		dependencies: WorkflowRuntimeDependencies,
		signal?: AbortSignal,
	): Promise<WorkflowRunResult> {
		const spec = normalizeSpecification(specification);
		const retained = this.workflows.get(spec.id);
		if (retained) {
			if (retained.fingerprint !== spec.fingerprint) {
				throw new WorkflowSpecificationError(
					`Workflow ID ${spec.id} is already retained with a different specification.`,
				);
			}
			if (retained.state === "settled" && retained.result) return retained.result;
			if (retained.state === "running" && retained.promise) return retained.promise;
			if (
				(retained.state === "failed" || retained.state === "cancelled") &&
				retained.error
			) {
				throw retained.error;
			}
			throw new Error(`Retained workflow ${spec.id} has incomplete state.`);
		}
		if (spec.verify && !dependencies.verify) {
			throw new WorkflowSpecificationError(
				"Workflow verification requires a verification dependency.",
			);
		}
		if (spec.reduce && !dependencies.reduce) {
			throw new WorkflowSpecificationError(
				"Workflow reduction requires a reduction dependency.",
			);
		}
		const controller = new AbortController();
		const forwardAbort = () => controller.abort(signal?.reason);
		if (signal?.aborted) forwardAbort();
		else signal?.addEventListener("abort", forwardAbort, { once: true });
		const state: MutableWorkflowState = {
			id: spec.id,
			fingerprint: spec.fingerprint,
			state: "running",
			controller,
		};
		this.workflows.set(spec.id, state);
		state.promise = this.execute(spec, dependencies, controller.signal)
			.then((result) => {
				state.state = "settled";
				state.result = result;
				return result;
			})
			.catch((error: unknown) => {
				const terminalError = controller.signal.aborted
					? error instanceof WorkflowCancelledError
						? error
						: new WorkflowCancelledError()
					: error instanceof Error
						? error
						: new Error(String(error));
				state.state = controller.signal.aborted ? "cancelled" : "failed";
				state.error = terminalError;
				throw terminalError;
			})
			.finally(() => signal?.removeEventListener("abort", forwardAbort));
		this.prune();
		return state.promise;
	}

	cancel(id: string): boolean {
		const state = this.workflows.get(id);
		if (!state || state.state !== "running") return false;
		state.controller.abort();
		return true;
	}

	get(id: string): WorkflowSnapshot | undefined {
		const state = this.workflows.get(id);
		if (!state) return undefined;
		if (state.state === "running") return { id: state.id, state: "running" };
		if (state.state === "settled" && state.result) {
			return { id: state.id, state: "settled", result: state.result };
		}
		if (state.state === "cancelled" && state.error) {
			return {
				id: state.id,
				state: "cancelled",
				error: state.error as WorkflowCancelledError,
			};
		}
		if (state.state === "failed" && state.error) {
			return { id: state.id, state: "failed", error: state.error };
		}
		throw new Error(`Retained workflow ${id} has incomplete state.`);
	}

	clear(): void {
		for (const state of this.workflows.values()) {
			if (state.state === "running") state.controller.abort();
		}
		this.workflows.clear();
	}

	private async execute(
		spec: ValidatedSpecification,
		dependencies: WorkflowRuntimeDependencies,
		signal: AbortSignal,
	): Promise<WorkflowRunResult> {
		const executions = await Promise.all(
			spec.items.map(async (item) => {
				let agent: WorkflowAgent | undefined;
				try {
					agent = await dependencies.resolveAgent(item.agent, item);
				} catch (error) {
					return {
						item,
						ready: false,
						envelope: errorEnvelope(
							item,
							0,
							`Agent preflight failed: ${error instanceof Error ? error.message : String(error)}`,
						),
						fingerprints: new Set<string>(),
					} satisfies ItemExecution;
				}
				if (!agent) {
					return {
						item,
						ready: false,
						envelope: errorEnvelope(item, 0, `Selected agent ${item.agent} is unavailable.`),
						fingerprints: new Set<string>(),
					} satisfies ItemExecution;
				}
				const tools = new Set(agent.effectiveTools);
				const missing = item.capabilities.filter((capability) => !tools.has(capability));
				if (missing.length > 0) {
					return {
						item,
						agent,
						ready: false,
						envelope: errorEnvelope(
							item,
							0,
							`Capability preflight rejected ${item.key}; missing tools: ${missing.join(", ")}.`,
						),
						fingerprints: new Set<string>(),
					} satisfies ItemExecution;
				}
				return {
					item,
					agent,
					ready: true,
					envelope: errorEnvelope(item, 0, "Workflow item has not run."),
					fingerprints: new Set<string>(),
				} satisfies ItemExecution;
			}),
		);
		await this.mapWithConcurrency(executions, spec.concurrency, async (execution) => {
			if (!execution.agent || !execution.ready) return;
			await this.runItem(execution, spec, dependencies, signal, false);
		});
		if (spec.verify && dependencies.verify) {
			const targets = new Set(spec.verify.keys ?? spec.items.map((item) => item.key));
			for (const execution of executions) {
				throwIfAborted(signal);
				if (!targets.has(execution.item.key) || !execution.agent || !execution.ready)
					continue;
				let verification: WorkflowVerificationResult;
				try {
					verification = parseVerification(
						await dependencies.verify(execution.envelope, signal),
					);
				} catch (error) {
					verification = {
						contradicted: false,
						gaps: [
							`Verification failed: ${error instanceof Error ? error.message : String(error)}`,
						],
					};
				}
				execution.envelope = {
					...execution.envelope,
					verification: {
						contradicted: verification.contradicted,
						evidence: verification.evidence ?? [],
						gaps: verification.gaps ?? [],
					},
				};
				if (verification.contradicted) {
					const verificationRecord = execution.envelope.verification;
					await this.runItem(execution, spec, dependencies, signal, true);
					execution.envelope = {
						...execution.envelope,
						...(verificationRecord ? { verification: verificationRecord } : {}),
					};
				}
			}
		}
		const items = executions.map((execution) => execution.envelope);
		const reductions = await this.reduce(items, spec, dependencies, signal);
		return { id: spec.id, items, reductions };
	}

	private async runItem(
		execution: ItemExecution,
		spec: ValidatedSpecification,
		dependencies: WorkflowRuntimeDependencies,
		signal: AbortSignal,
		forceRetry: boolean,
	): Promise<void> {
		let task = execution.item.task;
		let input = execution.item.input;
		while (execution.envelope.attempts < spec.attempts) {
			throwIfAborted(signal);
			const isRetry = execution.envelope.attempts > 0;
			if (isRetry) {
				if (!forceRetry && !retryable(execution.envelope.status)) return;
				const retry = execution.item.retries?.[execution.envelope.attempts - 1];
				if (!retry) return;
				task = retry.task;
				input = retry.input;
				const fingerprint = executionFingerprint(task, input);
				if (execution.fingerprints.has(fingerprint)) {
					execution.envelope = errorEnvelope(
						execution.item,
						execution.envelope.attempts,
						"Retry rejected because its task and input are materially identical to an earlier attempt.",
					);
					return;
				}
			}
			const fingerprint = executionFingerprint(task, input);
			execution.fingerprints.add(fingerprint);
			const attempt = execution.envelope.attempts + 1;
			let rawResult: unknown;
			try {
				rawResult = await dependencies.execute({
					workflowId: spec.id,
					key: execution.item.key,
					agent: execution.item.agent,
					attempt,
					phase: isRetry ? "retry" : "map",
					...(isRetry ? { retryOrigin: execution.item.key } : {}),
					task,
					input,
					signal,
				});
			} catch (error) {
				if (signal.aborted || error instanceof WorkflowCancelledError)
					throw new WorkflowCancelledError();
				execution.envelope = errorEnvelope(
					execution.item,
					attempt,
					`Leaf execution failed: ${error instanceof Error ? error.message : String(error)}`,
				);
				forceRetry = false;
				continue;
			}
			try {
				execution.envelope = leafEnvelope(
					execution.item,
					attempt,
					parseLeafResult(rawResult),
				);
			} catch (error) {
				execution.envelope = errorEnvelope(
					execution.item,
					attempt,
					`Leaf result schema-invalid: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			forceRetry = false;
			if (!retryable(execution.envelope.status)) return;
		}
	}

	private async reduce(
		items: readonly WorkflowResultEnvelope[],
		spec: ValidatedSpecification,
		dependencies: WorkflowRuntimeDependencies,
		signal: AbortSignal,
	): Promise<WorkflowReductionResult[]> {
		if (!spec.reduce || !dependencies.reduce) return [];
		let entries: WorkflowReductionEntry[] = items.map((value) => ({
			kind: "item",
			value,
		}));
		let level = 0;
		while (entries.length > 1 || level === 0) {
			throwIfAborted(signal);
			const next: WorkflowReductionEntry[] = [];
			for (let index = 0; index < entries.length; index += spec.reduce.groupSize) {
				const group = entries.slice(index, index + spec.reduce.groupSize);
				const reduction = parseReduction(
					await dependencies.reduce({
						workflowId: spec.id,
						level,
						entries: group,
						signal,
					}),
				);
				next.push({ kind: "reduction", value: reduction });
			}
			entries = next;
			level++;
		}
		return entries.map((entry) => entry.value as WorkflowReductionResult);
	}

	private async mapWithConcurrency<T>(
		values: readonly T[],
		concurrency: number,
		operation: (value: T) => Promise<void>,
	): Promise<void> {
		let next = 0;
		const workers = Array.from(
			{ length: Math.min(concurrency, values.length) },
			async () => {
				while (next < values.length) {
					const index = next++;
					await operation(values[index]);
				}
			},
		);
		await Promise.all(workers);
	}

	private prune(): void {
		if (this.workflows.size <= MAX_RETAINED_WORKFLOWS) return;
		for (const [id, workflow] of this.workflows) {
			if (this.workflows.size <= MAX_RETAINED_WORKFLOWS) return;
			if (workflow.state !== "running") this.workflows.delete(id);
		}
	}
}

const WORKFLOW_RUNTIME_VERSION = 1;
const WORKFLOW_RUNTIME_KEY = Symbol.for("dotfiles.pi.subagent-workflow-runtime");

type WorkflowRuntimeGlobal = {
	version: number;
	runtime: BoundedWorkflowRuntime;
};

export function getSubagentWorkflowRuntime(): BoundedWorkflowRuntime {
	const globals = globalThis as typeof globalThis & Record<symbol, unknown>;
	const existing = globals[WORKFLOW_RUNTIME_KEY] as
		| WorkflowRuntimeGlobal
		| undefined;
	if (existing?.version === WORKFLOW_RUNTIME_VERSION) return existing.runtime;
	const runtime = new BoundedWorkflowRuntime();
	globals[WORKFLOW_RUNTIME_KEY] = {
		version: WORKFLOW_RUNTIME_VERSION,
		runtime,
	} satisfies WorkflowRuntimeGlobal;
	return runtime;
}
