import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

export type CorrelationFields = Readonly<{
	runtime_instance_id: string;
	session_id?: string;
	turn_id?: string;
	trace_id?: string;
	interaction_id?: string;
	workflow_episode_id?: string;
	orchestration_id?: string;
	run_id?: string;
	task_id?: string;
	goal_id?: string;
	tool_call_id?: string;
	operation_id?: string;
}>;

export type CorrelationEnvelope = CorrelationFields & {
	scope_token: string;
};

type ChildFields = Partial<
	Omit<CorrelationFields, "runtime_instance_id" | "session_id" | "trace_id">
>;

const runtimeInstanceId = `rt-${randomBytes(7).toString("hex")}`;
const storage = new AsyncLocalStorage<CorrelationEnvelope>();
const settledTokens = new Map<string, string>();
const MAX_SETTLED_TOKENS = 2048;
let counter = 0;

function compactId(kind: string): string {
	counter += 1;
	return `${kind}-${runtimeInstanceId.slice(3, 11)}-${counter.toString(36)}`;
}

function newScopeToken(): string {
	return `scope-${randomBytes(12).toString("base64url")}`;
}

function isSettled(token: string): boolean {
	return settledTokens.has(token);
}

function immutableParentFields(
	parent: CorrelationEnvelope | undefined,
	fields: Partial<CorrelationFields>,
): CorrelationFields {
	if (!parent) return { runtime_instance_id: runtimeInstanceId, ...fields };
	if (
		fields.runtime_instance_id !== undefined &&
		fields.runtime_instance_id !== parent.runtime_instance_id
	)
		throw new Error(
			"runtime_instance_id is immutable within a correlation scope",
		);
	if (
		fields.session_id !== undefined &&
		fields.session_id !== parent.session_id
	)
		throw new Error("session_id is immutable within a correlation scope");
	if (fields.trace_id !== undefined && fields.trace_id !== parent.trace_id)
		throw new Error("trace_id is immutable within a correlation scope");
	return {
		...parent,
		...fields,
		runtime_instance_id: parent.runtime_instance_id,
		session_id: parent.session_id,
		trace_id: parent.trace_id,
	};
}

export function getRuntimeInstanceId(): string {
	return runtimeInstanceId;
}

export function createCorrelationId(kind: string): string {
	if (!/^[a-z][a-z0-9_]*$/.test(kind))
		throw new Error("correlation ID kind must be lowercase snake_case");
	return compactId(kind);
}

export function currentCorrelation(): CorrelationEnvelope | undefined {
	return storage.getStore();
}

export function serializeCorrelation(
	fields: CorrelationFields,
): CorrelationEnvelope {
	return Object.freeze({ ...fields, scope_token: newScopeToken() });
}

export function runCorrelation<T>(
	fields: Partial<CorrelationFields>,
	callback: () => T,
): T {
	const envelope = serializeCorrelation(
		immutableParentFields(currentCorrelation(), fields),
	);
	const result = storage.run(envelope, callback);
	if (result && typeof (result as unknown as PromiseLike<unknown>).then === "function") {
		return (result as unknown as PromiseLike<unknown>).then(
			(value) => {
				settleCorrelation(envelope.scope_token);
				return value;
			},
			(error) => {
				settleCorrelation(envelope.scope_token);
				throw error;
			},
		) as T;
	}
	settleCorrelation(envelope.scope_token);
	return result;
}

export function childCorrelation(fields: ChildFields): CorrelationEnvelope {
	return serializeCorrelation(
		immutableParentFields(currentCorrelation(), fields),
	);
}

export function runChildCorrelation<T>(
	fields: ChildFields,
	callback: () => T,
): T {
	return storage.run(childCorrelation(fields), callback);
}

export function detachedCorrelation(
	fields: Partial<CorrelationFields>,
): CorrelationEnvelope {
	return serializeCorrelation(immutableParentFields(undefined, fields));
}

export function settleCorrelation(
	scopeToken = currentCorrelation()?.scope_token,
): void {
	if (!scopeToken) return;
	settledTokens.set(scopeToken, runtimeInstanceId);
	while (settledTokens.size > MAX_SETTLED_TOKENS)
		settledTokens.delete(settledTokens.keys().next().value as string);
}

export function correlationForEmission(
	explicit?: CorrelationEnvelope,
): CorrelationFields | undefined {
	const value = explicit ?? currentCorrelation();
	if (!value || isSettled(value.scope_token)) return undefined;
	const { scope_token: _scopeToken, ...fields } = value;
	return Object.freeze(fields);
}

export function getSettledCorrelationCountForTests(): number {
	return settledTokens.size;
}

export function resetCorrelationForTests(): void {
	settledTokens.clear();
	counter = 0;
}
