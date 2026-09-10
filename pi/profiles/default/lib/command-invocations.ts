export interface CommandInvocation {
	readonly id: string;
	readonly command: string;
	readonly options: Readonly<Record<string, unknown>>;
}

export interface InvocationResolver {
	getToolCall(toolCallId: string): CommandInvocation | undefined;
}

interface InvocationDetails {
	readonly invocationId?: unknown;
}

let nextInvocationId = 0;

function isInvocationDetails(value: unknown): value is InvocationDetails {
	return !!value && typeof value === "object" && "invocationId" in value;
}

/**
 * Process-local authority for prompt-backed command invocations.
 *
 * Details in restored messages are only a lookup key. The record must have
 * been created by this instance before it can grant any tool authority.
 */
export class CommandInvocationAuthority implements InvocationResolver {
	private readonly records = new Map<string, CommandInvocation>();
	private readonly pending = new Set<string>();
	private readonly toolCalls = new Map<string, CommandInvocation>();
	private currentId: string | undefined;

	create(command: string, options: Readonly<Record<string, unknown>> = {}): CommandInvocation {
		const invocation = Object.freeze({
			id: `${command}-${++nextInvocationId}`,
			command,
			options: Object.freeze({ ...options }),
		});
		this.records.set(invocation.id, invocation);
		this.pending.add(invocation.id);
		return invocation;
	}

	/** Select an invocation only when its custom message is actually delivered. */
	deliver(details: unknown): boolean {
		if (!isInvocationDetails(details) || typeof details.invocationId !== "string") return false;
		const invocation = this.records.get(details.invocationId);
		if (!invocation) return false;
		this.currentId = invocation.id;
		this.pending.delete(invocation.id);
		this.prune();
		return true;
	}

	bindToolCall(toolCallId: string, toolName: string, command: string, commandTools: ReadonlyMap<string, ReadonlySet<string>>): void {
		const invocation = this.currentId ? this.records.get(this.currentId) : undefined;
		if (!invocation || invocation.command !== command || !commandTools.get(command)?.has(toolName)) {
			throw new Error(`${toolName} has no delivered /${command} invocation.`);
		}
		this.toolCalls.set(toolCallId, invocation);
	}

	getToolCall(toolCallId: string): CommandInvocation | undefined {
		return this.toolCalls.get(toolCallId);
	}

	releaseToolCall(toolCallId: string): void {
		this.toolCalls.delete(toolCallId);
		this.prune();
	}

	settle(): void {
		this.clear();
	}

	shutdown(): void {
		this.clear();
	}

	private clear(): void {
		this.records.clear();
		this.pending.clear();
		this.toolCalls.clear();
		this.currentId = undefined;
	}

	private prune(): void {
		for (const id of this.records.keys()) {
			if (id !== this.currentId && !this.pending.has(id) && ![...this.toolCalls.values()].some((invocation) => invocation.id === id)) {
				this.records.delete(id);
			}
		}
	}
}

