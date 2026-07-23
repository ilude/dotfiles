import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function setToolsActive(
	pi: Pick<ExtensionAPI, "getActiveTools" | "setActiveTools">,
	toolNames: readonly string[],
	active: boolean,
): string[] {
	const current = pi.getActiveTools();
	const deferred = new Set(toolNames);
	const normalized = active
		? [...new Set([...current, ...toolNames])]
		: current.filter((name) => !deferred.has(name));
	if (
		normalized.length !== current.length ||
		normalized.some((name, index) => name !== current[index])
	)
		pi.setActiveTools(normalized);
	return normalized;
}

export function activateTools(
	pi: Pick<ExtensionAPI, "getActiveTools" | "setActiveTools">,
	toolNames: readonly string[],
): string[] {
	return setToolsActive(pi, toolNames, true);
}

export function deactivateTools(
	pi: Pick<ExtensionAPI, "getActiveTools" | "setActiveTools">,
	toolNames: readonly string[],
): string[] {
	return setToolsActive(pi, toolNames, false);
}
