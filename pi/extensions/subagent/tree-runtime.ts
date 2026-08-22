import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import * as net from "node:net";
import { signalProcessTree } from "../../lib/process-tree.js";
import {
	canonicalizeRepositoryRoot,
	normalizeRepositoryScopes,
} from "./scope-policy.js";

export const DEFAULT_MAX_ACTIVE_TREE_DESCENDANTS = 8;
export const MAX_ACTIVE_TREE_DESCENDANTS = 16;
export const MAX_RETAINED_TREE_RUNS = 512;
export const SUBAGENT_TREE_PROTOCOL_VERSION = 3;
export const SUBAGENT_TREE_RESTART_REQUIRED =
	"Subagent tree broker protocol or runtime generation does not match this Pi process. Restart Pi before starting new subagent work.";

const MAX_TREE_BROKER_FRAME_BYTES = 64 * 1024;
const TREE_BROKER_CONNECT_DEADLINE_MS = 5_000;
const TREE_BROKER_RESPONSE_DEADLINE_MS = 10_000;
const TREE_BROKER_REQUEST_IDLE_DEADLINE_MS = 5_000;
const TREE_BROKER_ACQUIRE_IDLE_DEADLINE_MS = 5_000;
const TREE_BROKER_ACQUIRE_HEARTBEAT_MS = 1_000;
const TREE_BROKER_CANCELLATION_DEADLINE_MS = 1_000;
const TREE_BROKER_CANCELLATION_ATTEMPTS = 3;
const TREE_BROKER_CANCELLATION_RETRY_MS = 10;

export type SubagentTreeRole = "root" | "coordinator" | "leaf";
export type SubagentTreeRunState =
	| "queued"
	| "active"
	| "waiting"
	| "settled"
	| "cancelled";

export interface SubagentTreeMetadata {
	readonly treeId: string;
	readonly parentRunId?: string;
	readonly runId: string;
	readonly role: SubagentTreeRole;
	readonly depth: number;
	readonly workflowPhase?: string;
	readonly taskKey?: string;
	readonly attempt?: number;
	readonly retryOrigin?: string;
	readonly coordinatorTaskId?: string;
}

export interface CreateSubagentTreeInput {
	readonly treeId?: string;
	readonly rootRunId?: string;
}

export interface SubagentTreeRoot {
	readonly treeId: string;
	readonly rootRunId: string;
	readonly ownerToken: string;
}

export interface RequestSubagentTreePermit {
	readonly treeId: string;
	readonly parentRunId: string;
	readonly runId?: string;
	readonly role: Exclude<SubagentTreeRole, "root">;
	readonly depth?: number;
	readonly workflowPhase?: string;
	readonly taskKey?: string;
	readonly attempt?: number;
	readonly retryOrigin?: string;
	readonly coordinatorTaskId?: string;
	readonly scopeLease?: {
		readonly repositoryRoot: string;
		readonly scopes: readonly string[];
	};
}

export interface SubagentTreeProcessRegistration {
	readonly pid: number;
	readonly cancel?: () => void | Promise<void>;
}

export interface SubagentTreePermit {
	readonly metadata: SubagentTreeMetadata;
	readonly ownerToken: string;
	registerProcess(registration: SubagentTreeProcessRegistration): Promise<void>;
	release(): Promise<void>;
}

export interface SubagentTreeController {
	readonly parent: SubagentTreeMetadata;
	ping(): Promise<void>;
	acquire(
		request: Omit<RequestSubagentTreePermit, "treeId" | "parentRunId">,
		signal?: AbortSignal,
	): Promise<SubagentTreePermit>;
	cancel(runId?: string): Promise<string[]>;
	childEnvironment(permit: SubagentTreePermit): NodeJS.ProcessEnv;
}

export interface SubagentTreeRunSnapshot extends SubagentTreeMetadata {
	readonly state: SubagentTreeRunState;
	readonly pid?: number;
	readonly cancellationPending?: boolean;
	readonly runtimePingAt?: number;
	readonly scopeLease?: {
		readonly repositoryRoot: string;
		readonly scopes: readonly string[];
	};
}

export interface SubagentTreeBrokerCredentials {
	readonly host: string;
	readonly port: number;
	readonly token: string;
	readonly protocolVersion: number;
	readonly runtimeGeneration: string;
}

export interface SubagentTreeEnvironment extends SubagentTreeBrokerCredentials {
	readonly callerToken: string;
	readonly treeId: string;
	readonly runId: string;
	readonly role: SubagentTreeRole;
	readonly depth: number;
}

export class SubagentTreeAdmissionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SubagentTreeAdmissionError";
	}
}

type MutableTreeNode = {
	metadata: SubagentTreeMetadata;
	ownerToken: string;
	state: SubagentTreeRunState;
	scopeLease?: { repositoryRoot: string; scopes: string[] };
	pid?: number;
	cancel?: () => void | Promise<void>;
	cancellation?: Promise<void>;
	cancellationPending?: boolean;
	runtimePingAt?: number;
	resolvePermit?: (permit: SubagentTreePermit) => void;
	rejectPermit?: (error: Error) => void;
};

type BrokerRequest =
	| { readonly type: "handshake" }
	| { readonly type: "ping" }
	| { readonly type: "acquire"; readonly request: RequestSubagentTreePermit }
	| { readonly type: "register"; readonly runId: string; readonly pid: number }
	| { readonly type: "release"; readonly runId: string }
	| { readonly type: "cancel"; readonly runId: string };

type BrokerRequestWithCaller = BrokerRequest & {
	readonly callerRunId: string;
	readonly callerToken: string;
	readonly protocolVersion: number;
	readonly runtimeGeneration: string;
};

type BrokerResponse =
	| {
			readonly ok: true;
			readonly metadata?: SubagentTreeMetadata;
			readonly ownerToken?: string;
			readonly cancelled?: string[];
			readonly protocolVersion?: number;
			readonly runtimeGeneration?: string;
		}
	| { readonly ok: false; readonly error: string };
type BrokerSuccessResponse = Extract<BrokerResponse, { readonly ok: true }>;

type BrokerRequestOptions = {
	readonly signal?: AbortSignal;
	readonly connectTimeoutMs?: number;
	readonly responseTimeoutMs?: number;
	readonly timeoutMode?: "response" | "idle";
	readonly probeAcquireIdle?: boolean;
};

function assertIdentifier(value: string, label: string): void {
	if (!value.trim()) throw new SubagentTreeAdmissionError(`${label} is required.`);
	if (value.length > 256)
		throw new SubagentTreeAdmissionError(`${label} must be at most 256 characters.`);
}

function validateLimit(limit: number): number {
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ACTIVE_TREE_DESCENDANTS) {
		throw new RangeError(
			`The active descendant ceiling must be an integer from 1 through ${MAX_ACTIVE_TREE_DESCENDANTS}.`,
		);
	}
	return limit;
}

function normalizeScopeLease(
	lease: RequestSubagentTreePermit["scopeLease"],
): { repositoryRoot: string; scopes: string[] } | undefined {
	if (!lease) return undefined;
	if (!lease.repositoryRoot.trim())
		throw new SubagentTreeAdmissionError("Scope lease repository root is required.");
	const repositoryRoot = canonicalizeRepositoryRoot(lease.repositoryRoot);
	return {
		repositoryRoot,
		scopes: normalizeRepositoryScopes(lease.scopes, repositoryRoot),
	};
}

function validateChild(
	parent: SubagentTreeMetadata,
	request: RequestSubagentTreePermit,
): SubagentTreeMetadata {
	assertIdentifier(request.treeId, "Tree ID");
	assertIdentifier(request.parentRunId, "Parent run ID");
	const runId = request.runId ?? randomUUID();
	assertIdentifier(runId, "Run ID");
	if (request.treeId !== parent.treeId || request.parentRunId !== parent.runId) {
		throw new SubagentTreeAdmissionError("The requested parent does not own this tree.");
	}
	const depth = request.depth ?? parent.depth + 1;
	if (depth !== parent.depth + 1) {
		throw new SubagentTreeAdmissionError("A child depth must be exactly one greater than its parent.");
	}
	const metadata: SubagentTreeMetadata = {
		treeId: request.treeId,
		parentRunId: request.parentRunId,
		runId,
		role: request.role,
		depth,
		workflowPhase: request.workflowPhase,
		taskKey: request.taskKey,
		attempt: request.attempt,
		retryOrigin: request.retryOrigin,
		coordinatorTaskId: request.coordinatorTaskId,
	};
	if (
		parent.role === "root" &&
		(request.role === "coordinator" || request.role === "leaf")
	) {
		return metadata;
	}
	if (parent.role === "coordinator" && request.role === "leaf") {
		return metadata;
	}
	throw new SubagentTreeAdmissionError(
		`${parent.role} runs cannot spawn ${request.role} runs.`,
	);
}

function isBrokerRequest(value: unknown): value is BrokerRequestWithCaller & {
	readonly token: string;
} {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.token === "string" &&
		typeof record.callerRunId === "string" &&
		typeof record.callerToken === "string" &&
		typeof record.protocolVersion === "number" &&
		typeof record.runtimeGeneration === "string" &&
		["handshake", "ping", "acquire", "register", "release", "cancel"].includes(
			typeof record.type === "string" ? record.type : "",
		)
	);
}

function asMetadata(value: unknown): SubagentTreeMetadata {
	if (!value || typeof value !== "object") throw new Error("Invalid broker metadata.");
	const record = value as Record<string, unknown>;
	if (
		typeof record.treeId !== "string" ||
		typeof record.runId !== "string" ||
		typeof record.role !== "string" ||
		typeof record.depth !== "number"
	) {
		throw new Error("Invalid broker metadata.");
	}
	return record as unknown as SubagentTreeMetadata;
}

function asResponse(value: unknown): BrokerResponse {
	if (!value || typeof value !== "object") throw new Error("Invalid tree broker response.");
	const record = value as Record<string, unknown>;
	if (record.ok === true) return record as unknown as BrokerResponse;
	if (record.ok === false && typeof record.error === "string")
		return { ok: false, error: record.error };
	throw new Error("Invalid tree broker response.");
}

function safeEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return (
		leftBuffer.length === rightBuffer.length &&
		timingSafeEqual(leftBuffer, rightBuffer)
	);
}

function encodeBrokerFrame(value: unknown, label: "request" | "response"): string {
	const payload = JSON.stringify(value);
	if (payload === undefined || Buffer.byteLength(payload, "utf8") > MAX_TREE_BROKER_FRAME_BYTES)
		throw new Error(
			`Tree broker ${label} frame exceeds ${MAX_TREE_BROKER_FRAME_BYTES} bytes.`,
		);
	return `${payload}\n`;
}

function encodeBrokerResponse(response: BrokerResponse): string {
	try {
		return encodeBrokerFrame(response, "response");
	} catch {
		return `${JSON.stringify({
			ok: false,
			error: `Tree broker response frame exceeds ${MAX_TREE_BROKER_FRAME_BYTES} bytes.`,
		} satisfies BrokerResponse)}\n`;
	}
}

function createRetryableReleaseOnce(
	release: () => Promise<void>,
): () => Promise<void> {
	let released = false;
	let pending: Promise<void> | undefined;
	return () => {
		if (released) return Promise.resolve();
		if (pending) return pending;
		pending = release()
			.then(() => {
				released = true;
			})
			.finally(() => {
				pending = undefined;
			});
		return pending;
	};
}

function abortReason(signal: AbortSignal, message: string): unknown {
	const reason: unknown = signal.reason;
	if (!(reason instanceof Error && reason.name === "AbortError") && reason !== undefined)
		return reason;
	return new Error(message);
}

function waitForSignal<T>(
	pending: Promise<T>,
	signal: AbortSignal | undefined,
	message: string,
): Promise<T> {
	if (!signal) return pending;
	if (signal.aborted) return Promise.reject(abortReason(signal, message));
	return new Promise<T>((resolve, reject) => {
		const abort = () => reject(abortReason(signal, message));
		signal.addEventListener("abort", abort, { once: true });
		pending.then(resolve, reject).finally(() => {
			signal.removeEventListener("abort", abort);
		});
	});
}

export class SubagentTreeBroker {
	readonly protocolVersion: number;
	readonly runtimeGeneration: string;
	private readonly nodes = new Map<string, MutableTreeNode>();
	private readonly queue: string[] = [];
	private readonly maxActiveDescendants: number;
	private server: net.Server | undefined;
	private credentials: SubagentTreeBrokerCredentials | undefined;
	private listenPromise: Promise<SubagentTreeBrokerCredentials> | undefined;

	constructor(
		options: {
			maxActiveDescendants?: number;
			protocolVersion?: number;
			runtimeGeneration?: string;
		} = {},
	) {
		this.maxActiveDescendants = validateLimit(
			options.maxActiveDescendants ?? DEFAULT_MAX_ACTIVE_TREE_DESCENDANTS,
		);
		this.protocolVersion =
			options.protocolVersion ?? SUBAGENT_TREE_PROTOCOL_VERSION;
		this.runtimeGeneration = options.runtimeGeneration ?? randomUUID();
		assertIdentifier(this.runtimeGeneration, "Runtime generation");
	}

	createTree(input: CreateSubagentTreeInput = {}): SubagentTreeRoot {
		const treeId = input.treeId ?? randomUUID();
		const rootRunId = input.rootRunId ?? randomUUID();
		assertIdentifier(treeId, "Tree ID");
		assertIdentifier(rootRunId, "Root run ID");
		if (this.nodes.has(rootRunId))
			throw new SubagentTreeAdmissionError(`Run ID ${rootRunId} is already registered.`);
		const ownerToken = randomBytes(32).toString("hex");
		this.nodes.set(rootRunId, {
			metadata: { treeId, runId: rootRunId, role: "root", depth: 0 },
			ownerToken,
			state: "active",
		});
		this.prune();
		return { treeId, rootRunId, ownerToken };
	}

	async acquire(request: RequestSubagentTreePermit): Promise<SubagentTreePermit> {
		const parent = this.nodes.get(request.parentRunId);
		if (!parent)
			throw new SubagentTreeAdmissionError(
				`Parent run ${request.parentRunId} is not registered.`,
			);
		if (parent.state !== "active" && parent.state !== "waiting")
			throw new SubagentTreeAdmissionError(
				`Parent run ${request.parentRunId} cannot request children.`,
			);
		const metadata = validateChild(parent.metadata, request);
		if (this.nodes.has(metadata.runId))
			throw new SubagentTreeAdmissionError(`Run ID ${metadata.runId} is already registered.`);
		// Scope markers are advisory. Keep the normalized marker on the broker
		// boundary for status inspection, but never turn overlap into admission,
		// queueing, or mutation authority.
		const scopeLease = normalizeScopeLease(request.scopeLease);
		const node: MutableTreeNode = {
			metadata,
			ownerToken: randomBytes(32).toString("hex"),
			state: "queued",
			...(scopeLease ? { scopeLease } : {}),
		};
		this.nodes.set(metadata.runId, node);
		this.queue.push(metadata.runId);
		if (parent.metadata.role === "coordinator" && parent.state === "active")
			parent.state = "waiting";
		this.dispatch();
		return new Promise<SubagentTreePermit>((resolve, reject) => {
			node.resolvePermit = resolve;
			node.rejectPermit = reject;
			this.dispatch();
		});
	}

	async registerProcess(
		callerRunId: string,
		runId: string,
		registration: SubagentTreeProcessRegistration,
	): Promise<void> {
		this.assertCallerOwns(callerRunId, runId);
		if (!Number.isInteger(registration.pid) || registration.pid <= 0)
			throw new SubagentTreeAdmissionError("A registered process must have a positive PID.");
		const node = this.nodes.get(runId);
		if (!node || node.state !== "active")
			throw new SubagentTreeAdmissionError(`Run ${runId} is not active.`);
		node.pid = registration.pid;
		node.cancel = registration.cancel;
	}

	async release(callerRunId: string, runId = callerRunId): Promise<void> {
		this.assertCallerOwns(callerRunId, runId);
		const node = this.nodes.get(runId);
		if (!node || node.state === "settled") return;
		if (node.state === "cancelled") {
			await node.cancellation;
			node.cancellationPending = false;
			this.dispatch();
			this.prune();
			return;
		}
		for (const descendant of this.nodes.values()) {
			if (
				descendant.metadata.runId === runId ||
				!this.isDescendantOf(descendant.metadata.runId, runId)
			)
				continue;
			this.cancelNode(
				descendant,
				`Run ${descendant.metadata.runId} was cancelled when its parent settled.`,
			);
		}
		if (node.state === "queued") {
			this.cancelNode(node, `Run ${runId} was released before admission.`);
		} else {
			node.state = "settled";
		}
		this.restoreWaitingParent(node.metadata.parentRunId);
		this.dispatch();
		this.prune();
	}

	assertReconcileSafe(runId: string): void {
		const node = this.nodes.get(runId);
		if (!node) throw new SubagentTreeAdmissionError(`Run ${runId} is not registered.`);
		if (node.metadata.role === "root")
			throw new SubagentTreeAdmissionError("Root broker boundaries cannot be reconciled.");
		const liveDescendant = [...this.nodes.values()].find(
			(candidate) =>
				candidate.metadata.runId !== runId &&
				this.isDescendantOf(candidate.metadata.runId, runId) &&
				(candidate.state === "queued" ||
					candidate.state === "active" ||
					candidate.state === "waiting" ||
					Boolean(candidate.cancellationPending)),
		);
		if (liveDescendant)
			throw new SubagentTreeAdmissionError(
				`Run ${runId} has live descendant ${liveDescendant.metadata.runId}.`,
			);
		if (node.state === "queued" || node.state === "active" || node.state === "waiting") {
			if (!node.pid)
				throw new SubagentTreeAdmissionError(
					`Run ${runId} has ambiguous process liveness.`,
				);
			try {
				process.kill(node.pid, 0);
				throw new SubagentTreeAdmissionError(`Run ${runId} process is still live.`);
			} catch (error) {
				if (error instanceof SubagentTreeAdmissionError) throw error;
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "ESRCH")
					throw new SubagentTreeAdmissionError(
						`Run ${runId} process liveness is ambiguous.`,
					);
			}
		}
	}

	reconcile(runId: string): SubagentTreeRunSnapshot {
		this.assertReconcileSafe(runId);
		const node = this.nodes.get(runId);
		if (!node) throw new SubagentTreeAdmissionError(`Run ${runId} is not registered.`);
		this.removeQueued(runId);
		node.state = "settled";
		node.cancellationPending = false;
		node.scopeLease = undefined;
		node.pid = undefined;
		node.cancel = undefined;
		this.restoreWaitingParent(node.metadata.parentRunId);
		this.dispatch();
		return { ...node.metadata, state: node.state };
	}

	cancel(callerRunId: string, runId = callerRunId): string[] {
		this.assertCallerOwns(callerRunId, runId);
		const cancelled: string[] = [];
		const candidates = [...this.nodes.values()].filter((node) =>
			this.isDescendantOf(node.metadata.runId, runId),
		);
		for (const node of candidates) {
			if (
				this.cancelNode(node, `Run ${node.metadata.runId} was cancelled.`)
			)
				cancelled.push(node.metadata.runId);
		}
		this.dispatch();
		this.prune();
		return cancelled;
	}

	list(): ReadonlyArray<SubagentTreeRunSnapshot> {
		return [...this.nodes.values()].map((node) => ({
			...node.metadata,
			state: node.state,
			...(node.pid === undefined ? {} : { pid: node.pid }),
			...(node.cancellationPending
				? { cancellationPending: true }
				: {}),
			...(node.runtimePingAt === undefined
				? {}
				: { runtimePingAt: node.runtimePingAt }),
			...(node.scopeLease
				? {
						scopeLease: {
							repositoryRoot: node.scopeLease.repositoryRoot,
							scopes: [...node.scopeLease.scopes],
						},
					}
				: {}),
		}));
	}

	hasOutstandingWork(): boolean {
		return [...this.nodes.values()].some(
			(node) =>
				node.state === "active" ||
				node.state === "waiting" ||
				node.state === "queued" ||
				Boolean(node.cancellationPending),
		);
	}

	async listen(): Promise<SubagentTreeBrokerCredentials> {
		if (this.credentials) return this.credentials;
		if (this.listenPromise) return this.listenPromise;
		this.listenPromise = (async () => {
			const token = randomBytes(32).toString("hex");
			this.server = net.createServer((socket) =>
				this.handleSocket(socket, token),
			);
			await new Promise<void>((resolve, reject) => {
				this.server?.once("error", reject);
				this.server?.listen(0, "127.0.0.1", () => {
					this.server?.off("error", reject);
					resolve();
				});
			});
			const address = this.server.address();
			if (!address || typeof address === "string") {
				await this.dispose();
				throw new Error("Tree broker did not bind a TCP address.");
			}
			this.server.unref();
			this.credentials = {
				host: "127.0.0.1",
				port: address.port,
				token,
				protocolVersion: this.protocolVersion,
				runtimeGeneration: this.runtimeGeneration,
			};
			return this.credentials;
		})();
		try {
			return await this.listenPromise;
		} finally {
			if (!this.credentials) this.listenPromise = undefined;
		}
	}

	async dispose(): Promise<void> {
		for (const node of this.nodes.values()) {
			if (node.state === "active" || node.state === "waiting" || node.state === "queued")
				this.cancel(node.metadata.runId);
		}
		if (!this.server) return;
		const server = this.server;
		this.server = undefined;
		this.credentials = undefined;
		this.listenPromise = undefined;
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}

	private dispatch(): void {
		while (this.activeDescendantCount() < this.maxActiveDescendants) {
			const leafIndex = this.queue.findIndex(
				(runId) => this.nodes.get(runId)?.metadata.role === "leaf",
			);
			const queueIndex = leafIndex >= 0 ? leafIndex : 0;
			const runId = this.queue.splice(queueIndex, 1)[0];
			if (!runId) {
				const waiting = [...this.nodes.values()].find(
					(node) =>
						node.state === "waiting" &&
						!this.hasOutstandingDirectChildren(node.metadata.runId),
				);
				if (!waiting) return;
				waiting.state = "active";
				continue;
			}
			const node = this.nodes.get(runId);
			if (!node || node.state !== "queued") continue;
			if (!node.resolvePermit) {
				this.queue.splice(queueIndex, 0, runId);
				return;
			}
			node.state = "active";
			const permit = this.makePermit(node);
			const resolve = node.resolvePermit;
			node.resolvePermit = undefined;
			node.rejectPermit = undefined;
			resolve(permit);
		}
	}

	private hasOutstandingDirectChildren(parentRunId: string): boolean {
		return [...this.nodes.values()].some(
			(node) =>
				node.metadata.parentRunId === parentRunId &&
				(node.state === "queued" ||
					node.state === "active" ||
					Boolean(node.cancellationPending)),
		);
	}

	private restoreWaitingParent(parentRunId: string | undefined): void {
		if (!parentRunId) return;
		const parent = this.nodes.get(parentRunId);
		if (
			parent?.state === "waiting" &&
			!this.hasOutstandingDirectChildren(parentRunId) &&
			this.activeDescendantCount() < this.maxActiveDescendants
		)
			parent.state = "active";
	}

	private makePermit(node: MutableTreeNode): SubagentTreePermit {
		return {
			metadata: node.metadata,
			ownerToken: node.ownerToken,
			registerProcess: async (registration) =>
				this.registerProcess(node.metadata.runId, node.metadata.runId, registration),
			release: createRetryableReleaseOnce(async () => {
				await this.release(node.metadata.runId);
			}),
		};
	}

	private assertCallerOwns(callerRunId: string, runId: string): void {
		const caller = this.nodes.get(callerRunId);
		if (!caller)
			throw new SubagentTreeAdmissionError(
				`Caller run ${callerRunId} is not registered.`,
			);
		if (!this.isDescendantOf(runId, callerRunId))
			throw new SubagentTreeAdmissionError(
				"A run may operate only on itself or its descendants.",
			);
	}

	private cancelNode(node: MutableTreeNode, reason: string): boolean {
		if (node.state === "settled" || node.state === "cancelled") return false;
		const wasQueued = node.state === "queued";
		node.cancellationPending = !wasQueued && node.state !== "waiting";
		node.state = "cancelled";
		if (wasQueued) this.removeQueued(node.metadata.runId);
		const reject = node.rejectPermit;
		node.resolvePermit = undefined;
		node.rejectPermit = undefined;
		reject?.(new SubagentTreeAdmissionError(reason));
		node.cancellation = this.cancelProcess(node).catch(() => undefined);
		return true;
	}

	private activeDescendantCount(): number {
		let active = 0;
		for (const node of this.nodes.values()) {
			if (
				node.metadata.role !== "root" &&
				(node.state === "active" || node.cancellationPending)
			)
				active++;
		}
		return active;
	}

	private isDescendantOf(runId: string, ancestorRunId: string): boolean {
		let current = this.nodes.get(runId);
		while (current) {
			if (current.metadata.runId === ancestorRunId) return true;
			const parentRunId = current.metadata.parentRunId;
			current = parentRunId ? this.nodes.get(parentRunId) : undefined;
		}
		return false;
	}

	private removeQueued(runId: string): void {
		const index = this.queue.indexOf(runId);
		if (index >= 0) this.queue.splice(index, 1);
	}

	private async cancelProcess(node: MutableTreeNode): Promise<void> {
		let callbackError: unknown;
		try {
			await node.cancel?.();
		} catch (error) {
			callbackError = error;
		}
		if (node.pid) {
			const pid = node.pid;
			await signalProcessTree(
				{
					pid,
					exitCode: null,
					signalCode: null,
					kill: (signal) => process.kill(pid, signal),
				},
				process.platform === "win32",
			);
		}
		if (callbackError) throw callbackError;
	}

	private prune(): void {
		if (this.nodes.size <= MAX_RETAINED_TREE_RUNS) return;
		for (const [runId, node] of this.nodes) {
			if (this.nodes.size <= MAX_RETAINED_TREE_RUNS) return;
			if (
				node.state === "settled" ||
				(node.state === "cancelled" && !node.cancellationPending)
			)
				this.nodes.delete(runId);
		}
	}

	private handleSocket(socket: net.Socket, token: string): void {
		const chunks: Buffer[] = [];
		let frameBytes = 0;
		let requestAccepted = false;
		let responseStarted = false;
		const finishResponse = (response: BrokerResponse) => {
			if (responseStarted || socket.destroyed) return;
			responseStarted = true;
			socket.setTimeout(0);
			socket.end(encodeBrokerResponse(response));
		};
		const rejectFrame = (error: string) => {
			socket.off("data", receiveData);
			finishResponse({ ok: false, error });
		};
		const receiveData = (chunk: Buffer) => {
			const newline = chunk.indexOf(0x0a);
			const retainedBytes = newline < 0 ? chunk.length : newline;
			if (frameBytes + retainedBytes > MAX_TREE_BROKER_FRAME_BYTES) {
				rejectFrame(
					`Tree broker request frame exceeds ${MAX_TREE_BROKER_FRAME_BYTES} bytes.`,
				);
				return;
			}
			if (newline < 0) {
				chunks.push(chunk);
				frameBytes += chunk.length;
				return;
			}
			requestAccepted = true;
			socket.off("data", receiveData);
			socket.setTimeout(0);
			const finalChunk = chunk.subarray(0, newline);
			const line = Buffer.concat([...chunks, finalChunk], frameBytes + newline).toString(
				"utf8",
			);
			void this.handleSocketRequest(line, token, socket).then(finishResponse);
		};
		socket.setTimeout(TREE_BROKER_REQUEST_IDLE_DEADLINE_MS, () => {
			rejectFrame("Tree broker request framing timed out.");
		});
		socket.on("data", receiveData);
		socket.once("end", () => {
			if (!requestAccepted)
				finishResponse({
					ok: false,
					error: "Tree broker connection closed before a complete request frame.",
				});
		});
		socket.once("error", () => socket.destroy());
	}

	private authenticateSocketCaller(
		callerRunId: string,
		callerToken: string,
	): void {
		const caller = this.nodes.get(callerRunId);
		if (!caller || !safeEqual(caller.ownerToken, callerToken))
			throw new SubagentTreeAdmissionError(
				"Tree broker caller authentication failed.",
			);
	}

	private async handleSocketRequest(
		line: string,
		token: string,
		socket: net.Socket,
	): Promise<BrokerResponse> {
		try {
			const candidate: unknown = JSON.parse(line);
			if (!isBrokerRequest(candidate) || !safeEqual(candidate.token, token)) {
				return { ok: false, error: "Tree broker authentication failed." };
			}
			if (
				candidate.protocolVersion !== this.protocolVersion ||
				candidate.runtimeGeneration !== this.runtimeGeneration
			)
				throw new SubagentTreeAdmissionError(SUBAGENT_TREE_RESTART_REQUIRED);
			this.authenticateSocketCaller(
				candidate.callerRunId,
				candidate.callerToken,
			);
			switch (candidate.type) {
				case "handshake":
					return {
						ok: true,
						protocolVersion: this.protocolVersion,
						runtimeGeneration: this.runtimeGeneration,
					};
				case "ping": {
					const caller = this.nodes.get(candidate.callerRunId);
					if (!caller)
						throw new SubagentTreeAdmissionError("Tree broker caller is not active.");
					caller.runtimePingAt = Date.now();
					return { ok: true };
				}
				case "acquire": {
					if (candidate.request.parentRunId !== candidate.callerRunId)
						throw new SubagentTreeAdmissionError(
							"Tree permit acquisition must use the authenticated caller as parent.",
						);
					const request = {
						...candidate.request,
						runId: candidate.request.runId ?? randomUUID(),
					};
					let disconnected = socket.destroyed;
					const cancelDisconnectedAcquire = () => {
						disconnected = true;
						try {
							this.cancel(candidate.callerRunId, request.runId);
						} catch {
							// The bounded client cancellation remains the fallback for admission races.
						}
					};
					socket.once("close", cancelDisconnectedAcquire);
					const heartbeat = setInterval(() => {
						if (
							!socket.destroyed &&
							socket.writable &&
							!socket.writableNeedDrain
						)
							socket.write(" ");
					}, TREE_BROKER_ACQUIRE_HEARTBEAT_MS);
					heartbeat.unref();
					try {
						const permit = await this.acquire(request);
						if (disconnected || socket.destroyed) {
							try {
								this.cancel(candidate.callerRunId, permit.metadata.runId);
							} finally {
								await permit.release();
							}
							throw new SubagentTreeAdmissionError(
								"Tree permit requester disconnected before admission completed.",
							);
						}
						return {
							ok: true,
							metadata: permit.metadata,
							ownerToken: permit.ownerToken,
						};
					} finally {
						clearInterval(heartbeat);
						socket.off("close", cancelDisconnectedAcquire);
					}
				}
				case "register":
					await this.registerProcess(candidate.callerRunId, candidate.runId, {
						pid: candidate.pid,
					});
					return { ok: true };
				case "release":
					await this.release(candidate.callerRunId, candidate.runId);
					return { ok: true };
				case "cancel":
					return {
						ok: true,
						cancelled: this.cancel(candidate.callerRunId, candidate.runId),
					};
			}
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	}
}

function identityEnvironment(
	permit: SubagentTreePermit,
): NodeJS.ProcessEnv {
	const { metadata } = permit;
	return {
		PI_SUBAGENT_TREE_CALLER_TOKEN: permit.ownerToken,
		PI_SUBAGENT_TREE_ID: metadata.treeId,
		PI_SUBAGENT_TREE_RUN_ID: metadata.runId,
		PI_SUBAGENT_TREE_ROLE: metadata.role,
		PI_SUBAGENT_TREE_DEPTH: String(metadata.depth),
	};
}

export class SubagentTreeRootClient implements SubagentTreeController {
	readonly parent: SubagentTreeMetadata;
	private remoteCredentials: SubagentTreeBrokerCredentials | undefined;

	constructor(
		private readonly broker: SubagentTreeBroker,
		root: SubagentTreeRoot,
	) {
		this.parent = {
			treeId: root.treeId,
			runId: root.rootRunId,
			role: "root",
			depth: 0,
		};
	}

	async ping(): Promise<void> {
		return Promise.resolve();
	}

	async acquire(
		request: Omit<RequestSubagentTreePermit, "treeId" | "parentRunId">,
		signal?: AbortSignal,
	): Promise<SubagentTreePermit> {
		if (signal?.aborted)
			throw signal.reason ?? new Error("Tree permit request was cancelled.");
		const runId = request.runId ?? randomUUID();
		const pending = this.broker.acquire({
			...request,
			runId,
			treeId: this.parent.treeId,
			parentRunId: this.parent.runId,
		});
		const abort = () => {
			this.broker.cancel(this.parent.runId, runId);
		};
		signal?.addEventListener("abort", abort, { once: true });
		try {
			const permit = await pending;
			if (signal?.aborted) {
				await permit.release();
				throw signal.reason ?? new Error("Tree permit request was cancelled.");
			}
			try {
				this.remoteCredentials = await this.broker.listen();
			} catch (error) {
				await permit.release();
				throw error;
			}
			return permit;
		} finally {
			signal?.removeEventListener("abort", abort);
		}
	}

	async cancel(runId = this.parent.runId): Promise<string[]> {
		return this.broker.cancel(this.parent.runId, runId);
	}

	childEnvironment(permit: SubagentTreePermit): NodeJS.ProcessEnv {
		const identity = identityEnvironment(permit);
		if (!this.remoteCredentials)
			throw new Error("Coordinator process is missing tree broker credentials.");
		return {
			...identity,
			PI_SUBAGENT_TREE_BROKER_HOST: this.remoteCredentials.host,
			PI_SUBAGENT_TREE_BROKER_PORT: String(this.remoteCredentials.port),
			PI_SUBAGENT_TREE_BROKER_TOKEN: this.remoteCredentials.token,
			PI_SUBAGENT_TREE_PROTOCOL_VERSION: String(
				this.remoteCredentials.protocolVersion,
			),
			PI_SUBAGENT_TREE_RUNTIME_GENERATION:
				this.remoteCredentials.runtimeGeneration,
		};
	}
}

export class SubagentTreeClient implements SubagentTreeController {
	private handshakePromise: Promise<void> | undefined;

	constructor(
		private readonly credentials: SubagentTreeBrokerCredentials,
		readonly parent: SubagentTreeMetadata,
		private readonly callerToken: string,
	) {}

	async ping(): Promise<void> {
		await this.handshake();
		await this.request({ type: "ping" });
	}

	async acquire(
		request: Omit<RequestSubagentTreePermit, "treeId" | "parentRunId">,
		signal?: AbortSignal,
	): Promise<SubagentTreePermit> {
		if (signal?.aborted)
			throw abortReason(signal, "Tree permit request was cancelled.");
		await this.handshake(signal);
		if (signal?.aborted)
			throw abortReason(signal, "Tree permit request was cancelled.");
		const requestWithParent: RequestSubagentTreePermit = {
			...request,
			runId: request.runId ?? randomUUID(),
			treeId: this.parent.treeId,
			parentRunId: this.parent.runId,
		};
		let response: BrokerSuccessResponse;
		try {
			response = await this.request(
				{ type: "acquire", request: requestWithParent },
				{ signal, timeoutMode: "idle" },
			);
		} catch (error) {
			if (!signal?.aborted) throw error;
			await this.cancelAbortedAcquire(requestWithParent.runId ?? "");
			throw abortReason(signal, "Tree permit request was cancelled.");
		}
		if (!response.metadata || !response.ownerToken)
			throw new Error("Tree broker did not return permit credentials.");
		const metadata = asMetadata(response.metadata);
		if (signal?.aborted) {
			await this.cancelAbortedAcquire(metadata.runId);
			throw abortReason(signal, "Tree permit request was cancelled.");
		}
		return {
			metadata,
			ownerToken: response.ownerToken,
			registerProcess: async ({ pid }) => {
				await this.request({ type: "register", runId: metadata.runId, pid });
			},
			release: createRetryableReleaseOnce(async () => {
				await this.request({ type: "release", runId: metadata.runId });
			}),
		};
	}

	async cancel(runId = this.parent.runId): Promise<string[]> {
		await this.handshake();
		const response = await this.request({ type: "cancel", runId });
		return response.cancelled ?? [];
	}

	childEnvironment(permit: SubagentTreePermit): NodeJS.ProcessEnv {
		return {
			...identityEnvironment(permit),
			PI_SUBAGENT_TREE_BROKER_HOST: this.credentials.host,
			PI_SUBAGENT_TREE_BROKER_PORT: String(this.credentials.port),
			PI_SUBAGENT_TREE_BROKER_TOKEN: this.credentials.token,
			PI_SUBAGENT_TREE_PROTOCOL_VERSION: String(
				this.credentials.protocolVersion,
			),
			PI_SUBAGENT_TREE_RUNTIME_GENERATION:
				this.credentials.runtimeGeneration,
		};
	}

	private async handshake(signal?: AbortSignal): Promise<void> {
		if (!this.handshakePromise) {
			const pending = this.request({ type: "handshake" }).then((response) => {
				if (
					response.protocolVersion !== this.credentials.protocolVersion ||
					response.runtimeGeneration !== this.credentials.runtimeGeneration
				)
					throw new SubagentTreeAdmissionError(
						SUBAGENT_TREE_RESTART_REQUIRED,
					);
			});
			this.handshakePromise = pending;
			void pending.catch(() => {
				if (this.handshakePromise === pending) this.handshakePromise = undefined;
			});
		}
		await waitForSignal(
			this.handshakePromise,
			signal,
			"Tree permit request was cancelled.",
		);
	}

	private async cancelAbortedAcquire(runId: string): Promise<void> {
		await this.bestEffortRequest({ type: "cancel", runId });
		await this.bestEffortRequest({ type: "release", runId });
	}

	private async bestEffortRequest(request: BrokerRequest): Promise<void> {
		const deadline = Date.now() + TREE_BROKER_CANCELLATION_DEADLINE_MS;
		const controller = new AbortController();
		const deadlineTimer = setTimeout(() => {
			controller.abort(new Error("Tree broker cancellation request timed out."));
		}, TREE_BROKER_CANCELLATION_DEADLINE_MS);
		deadlineTimer.unref();
		try {
			for (
				let attempt = 0;
				attempt < TREE_BROKER_CANCELLATION_ATTEMPTS;
				attempt += 1
			) {
				const remaining = deadline - Date.now();
				if (remaining <= 0 || controller.signal.aborted) return;
				try {
					await this.request(request, {
						signal: controller.signal,
						connectTimeoutMs: remaining,
						responseTimeoutMs: remaining,
					});
					return;
				} catch {
					const retryMs = Math.min(
						TREE_BROKER_CANCELLATION_RETRY_MS,
						deadline - Date.now(),
					);
					if (
						controller.signal.aborted ||
						attempt + 1 >= TREE_BROKER_CANCELLATION_ATTEMPTS ||
						retryMs <= 0
					)
						return;
					await new Promise<void>((resolve) => setTimeout(resolve, retryMs));
				}
			}
		} finally {
			clearTimeout(deadlineTimer);
		}
	}

	private async request(
		request: BrokerRequest,
		options: BrokerRequestOptions = {},
	): Promise<BrokerSuccessResponse> {
		const signal = options.signal;
		if (signal?.aborted)
			throw abortReason(signal, "Tree broker request was cancelled.");
		const frame = encodeBrokerFrame(
			{
				...request,
				token: this.credentials.token,
				callerRunId: this.parent.runId,
				callerToken: this.callerToken,
				protocolVersion: this.credentials.protocolVersion,
				runtimeGeneration: this.credentials.runtimeGeneration,
			},
			"request",
		);
		const connectTimeoutMs =
			options.connectTimeoutMs ?? TREE_BROKER_CONNECT_DEADLINE_MS;
		const responseTimeoutMs =
			options.responseTimeoutMs ??
			(request.type === "acquire"
				? TREE_BROKER_ACQUIRE_IDLE_DEADLINE_MS
				: TREE_BROKER_RESPONSE_DEADLINE_MS);
		const timeoutMode =
			options.timeoutMode ?? (request.type === "acquire" ? "idle" : "response");
		return new Promise<BrokerSuccessResponse>((resolve, reject) => {
			const socket = net.createConnection({
				host: this.credentials.host,
				port: this.credentials.port,
			});
			let buffer = "";
			let settled = false;
			let connectTimer: NodeJS.Timeout | undefined;
			let responseTimer: NodeJS.Timeout | undefined;
			let idleProbePending = false;
			const clearTimers = () => {
				if (connectTimer) clearTimeout(connectTimer);
				if (responseTimer) clearTimeout(responseTimer);
				connectTimer = undefined;
				responseTimer = undefined;
			};
			const cleanup = () => {
				clearTimers();
				signal?.removeEventListener("abort", abort);
			};
			const fail = (error: unknown) => {
				if (settled) return;
				settled = true;
				cleanup();
				socket.destroy();
				reject(error);
			};
			const succeed = (response: BrokerSuccessResponse) => {
				if (settled) return;
				settled = true;
				cleanup();
				socket.destroy();
				resolve(response);
			};
			const abort = () =>
				fail(abortReason(signal as AbortSignal, "Tree broker request was cancelled."));
			const armResponseTimer = () => {
				if (responseTimer) clearTimeout(responseTimer);
				responseTimer = setTimeout(() => {
					responseTimer = undefined;
					if (
						timeoutMode === "idle" &&
						request.type === "acquire" &&
						options.probeAcquireIdle !== false &&
						!idleProbePending
					) {
						idleProbePending = true;
						void this.request(
							{ type: "handshake" },
							{
								signal,
								connectTimeoutMs,
								responseTimeoutMs: TREE_BROKER_RESPONSE_DEADLINE_MS,
								probeAcquireIdle: false,
							},
						).then(
							() => {
								idleProbePending = false;
								if (!settled) armResponseTimer();
							},
							(error) => {
								idleProbePending = false;
								fail(
									new Error("Tree broker acquire response became idle.", {
										cause: error,
									}),
								);
							},
						);
						return;
					}
					fail(new Error("Tree broker response timed out."));
				}, Math.max(1, responseTimeoutMs));
				responseTimer.unref();
			};
			connectTimer = setTimeout(() => {
				fail(new Error("Tree broker connection timed out."));
			}, Math.max(1, connectTimeoutMs));
			connectTimer.unref();
			socket.setEncoding("utf8");
			socket.once("connect", () => {
				if (connectTimer) clearTimeout(connectTimer);
				connectTimer = undefined;
				armResponseTimer();
				try {
					socket.write(frame);
				} catch (error) {
					fail(error);
				}
			});
			socket.on("data", (chunk: string) => {
				if (timeoutMode === "idle") armResponseTimer();
				buffer = `${buffer}${chunk}`.replace(/^[\t\r ]+/, "");
				const newline = buffer.indexOf("\n");
				const line = newline < 0 ? buffer : buffer.slice(0, newline);
				if (Buffer.byteLength(line, "utf8") > MAX_TREE_BROKER_FRAME_BYTES) {
					fail(
						new Error(
							`Tree broker response frame exceeds ${MAX_TREE_BROKER_FRAME_BYTES} bytes.`,
						),
					);
					return;
				}
				if (newline < 0) return;
				try {
					const response = asResponse(JSON.parse(line));
					if (!response.ok) throw new SubagentTreeAdmissionError(response.error);
					succeed(response);
				} catch (error) {
					fail(error);
				}
			});
			socket.once("error", fail);
			socket.once("close", () => {
				if (!settled)
					fail(new Error("Tree broker connection closed without a response."));
			});
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) abort();
		});
	}
}

export function treeClientFromEnvironment(
	environment: NodeJS.ProcessEnv = process.env,
): SubagentTreeClient | undefined {
	const host = environment.PI_SUBAGENT_TREE_BROKER_HOST;
	const port = Number(environment.PI_SUBAGENT_TREE_BROKER_PORT);
	const token = environment.PI_SUBAGENT_TREE_BROKER_TOKEN;
	const callerToken = environment.PI_SUBAGENT_TREE_CALLER_TOKEN;
	const treeId = environment.PI_SUBAGENT_TREE_ID;
	const runId = environment.PI_SUBAGENT_TREE_RUN_ID;
	const role = environment.PI_SUBAGENT_TREE_ROLE;
	const depth = Number(environment.PI_SUBAGENT_TREE_DEPTH);
	const protocolVersion = Number(
		environment.PI_SUBAGENT_TREE_PROTOCOL_VERSION,
	);
	const runtimeGeneration =
		environment.PI_SUBAGENT_TREE_RUNTIME_GENERATION;
	const hasBrokerEnvironment = Boolean(host || token || callerToken);
	if (
		hasBrokerEnvironment &&
		(protocolVersion !== SUBAGENT_TREE_PROTOCOL_VERSION ||
			!runtimeGeneration)
	)
		throw new SubagentTreeAdmissionError(SUBAGENT_TREE_RESTART_REQUIRED);
	if (
		!host ||
		!Number.isInteger(port) ||
		port < 1 ||
		!token ||
		!callerToken ||
		!treeId ||
		!runId ||
		(role !== "coordinator" && role !== "leaf") ||
		!Number.isInteger(depth) ||
		!runtimeGeneration
	) {
		return undefined;
	}
	return new SubagentTreeClient(
		{ host, port, token, protocolVersion, runtimeGeneration },
		{ treeId, runId, role, depth },
		callerToken,
	);
}

const SUBAGENT_TREE_BROKER_KEY = Symbol.for("dotfiles.pi.subagent-tree-broker");

type SubagentTreeBrokerGlobal = {
	protocolVersion: number;
	broker: SubagentTreeBroker;
};

function brokerGlobals(): typeof globalThis & Record<symbol, unknown> {
	return globalThis as typeof globalThis & Record<symbol, unknown>;
}

function createSubagentTreeBroker(): SubagentTreeBroker {
	const configuredLimit = process.env.PI_SUBAGENT_MAX_ACTIVE_DESCENDANTS;
	return new SubagentTreeBroker(
		configuredLimit === undefined
			? {}
			: { maxActiveDescendants: Number(configuredLimit) },
	);
}

function installSubagentTreeBroker(
	globals: ReturnType<typeof brokerGlobals>,
): SubagentTreeBroker {
	const broker = createSubagentTreeBroker();
	globals[SUBAGENT_TREE_BROKER_KEY] = {
		protocolVersion: SUBAGENT_TREE_PROTOCOL_VERSION,
		broker,
	} satisfies SubagentTreeBrokerGlobal;
	return broker;
}

export function getSubagentTreeBroker(): SubagentTreeBroker {
	const globals = brokerGlobals();
	const existing = globals[SUBAGENT_TREE_BROKER_KEY] as
		| SubagentTreeBrokerGlobal
		| undefined;
	if (!existing) return installSubagentTreeBroker(globals);

	const compatible =
		existing.protocolVersion === SUBAGENT_TREE_PROTOCOL_VERSION &&
		existing.broker.protocolVersion === SUBAGENT_TREE_PROTOCOL_VERSION;
	if (compatible) return existing.broker;

	const hasOutstandingWork =
		typeof existing.broker.hasOutstandingWork === "function"
			? existing.broker.hasOutstandingWork()
			: existing.broker
					.list()
					.some(
						(run) =>
							run.state === "active" ||
							run.state === "waiting" ||
							run.state === "queued",
					);
	if (hasOutstandingWork)
		throw new SubagentTreeAdmissionError(SUBAGENT_TREE_RESTART_REQUIRED);

	const replacement = installSubagentTreeBroker(globals);
	void existing.broker.dispose();
	return replacement;
}

export async function disposeInstalledSubagentTreeBroker(): Promise<void> {
	const existing = brokerGlobals()[SUBAGENT_TREE_BROKER_KEY] as
		| SubagentTreeBrokerGlobal
		| undefined;
	await existing?.broker.dispose();
}
