const RUNTIME_CONTEXT_MAX_CHARS = 8_000;
const RUNTIME_CONTEXT_START = "<!-- pi-runtime-context:";
const RUNTIME_CONTEXT_END = "<!-- /pi-runtime-context -->";

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

/** Append one replaceable dynamic section after the stable system instructions. */
export function appendRuntimeContext(
	systemPrompt: string,
	key: string,
	context: string,
): string {
	const base = removeContextSection(systemPrompt, key);
	const bounded = boundRuntimeContext(context);
	if (!bounded) return base;
	return `${base}\n\n${contextMarker(key)}\n${bounded}\n${RUNTIME_CONTEXT_END}`;
}

export const runtimeContextTestApi = {
	RUNTIME_CONTEXT_MAX_CHARS,
	removeContextSection,
};
