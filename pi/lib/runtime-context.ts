const RUNTIME_CONTEXT_MAX_CHARS = 8_000;
const RUNTIME_CONTEXT_START = "<!-- pi-runtime-context:";
const RUNTIME_CONTEXT_END = "<!-- /pi-runtime-context -->";
const RUNTIME_CONTEXT_MESSAGE_TYPE = "pi-runtime-context";

function contextMarker(key: string): string {
	return `${RUNTIME_CONTEXT_START}${key} -->`;
}

function removeContextSection(systemPrompt: string, key: string): string {
	const start = contextMarker(key);
	const startIndex = systemPrompt.indexOf(start);
	if (startIndex < 0) return systemPrompt;
	const endIndex = systemPrompt.indexOf(RUNTIME_CONTEXT_END, startIndex + start.length);
	if (endIndex < 0) return systemPrompt;
	return `${systemPrompt.slice(0, startIndex)}${systemPrompt.slice(endIndex + RUNTIME_CONTEXT_END.length)}`.trimEnd();
}

export function boundRuntimeContext(value: string, maxChars = RUNTIME_CONTEXT_MAX_CHARS): string {
	const normalized = value.trim();
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 32)).trimEnd()}\n[dynamic context truncated]`;
}

export type RuntimeContextMessage = {
	role: "custom";
	customType: typeof RUNTIME_CONTEXT_MESSAGE_TYPE;
	display: false;
	content: string;
	details: { key: string };
};

export function runtimeContextMessage(
	key: string,
	context: string,
): RuntimeContextMessage | undefined {
	const bounded = boundRuntimeContext(context);
	if (!bounded) return undefined;
	return {
		role: "custom",
		customType: RUNTIME_CONTEXT_MESSAGE_TYPE,
		display: false,
		content: `${contextMarker(key)}\n${bounded}\n${RUNTIME_CONTEXT_END}`,
		details: { key },
	};
}

function isRuntimeContextMessage(
	message: Record<string, unknown>,
	key: string,
): boolean {
	if (message.role !== "custom") return false;
	if (message.customType === RUNTIME_CONTEXT_MESSAGE_TYPE)
		return (
			message.details !== null &&
			typeof message.details === "object" &&
			(message.details as Record<string, unknown>).key === key
		);
	return (
		(key === "agents" && message.customType === "agents-context-report") ||
		(key === "goal" && message.customType === "goal-runtime-context") ||
		(key === "tasks" && message.customType === "tasks-runtime-context")
	);
}

/** Replace one hidden runtime context message at the end of active model context. */
export function replaceRuntimeContext(
	messages: Array<Record<string, unknown>>,
	key: string,
	context: string | undefined,
): Array<Record<string, unknown>> {
	const retained = messages.filter((message) => !isRuntimeContextMessage(message, key));
	const replacement = runtimeContextMessage(key, context ?? "");
	return replacement ? [...retained, replacement] : retained;
}

export const runtimeContextTestApi = {
	RUNTIME_CONTEXT_MAX_CHARS,
	RUNTIME_CONTEXT_MESSAGE_TYPE,
	removeContextSection,
	isRuntimeContextMessage,
};
