import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ToolActivationApi = Pick<
	ExtensionAPI,
	"getActiveTools" | "getAllTools" | "setActiveTools"
>;

type ToolVisibilityRestriction = {
	allowed: Set<string>;
	alwaysVisible: Set<string>;
};

type ToolActivationState = {
	desired: string[];
	restrictions: Map<string, ToolVisibilityRestriction>;
};

const toolActivationStates = new WeakMap<object, ToolActivationState>();

function stateFor(pi: ToolActivationApi): ToolActivationState {
	let state = toolActivationStates.get(pi);
	if (!state) {
		state = { desired: pi.getActiveTools(), restrictions: new Map() };
		toolActivationStates.set(pi, state);
	}
	return state;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length &&
		left.every((name, index) => name === right[index])
	);
}

function applyDesiredToolState(
	pi: ToolActivationApi,
	state: ToolActivationState,
): string[] {
	const restrictions = [...state.restrictions.values()];
	let visible = state.desired.filter((name) =>
		restrictions.every((restriction) => restriction.allowed.has(name)),
	);
	const registered = new Set(pi.getAllTools().map((tool) => tool.name));
	for (const restriction of restrictions) {
		for (const name of restriction.alwaysVisible) {
			if (
				registered.has(name) &&
				restrictions.every((candidate) => candidate.allowed.has(name)) &&
				!visible.includes(name)
			)
				visible.push(name);
		}
	}
	const current = pi.getActiveTools();
	if (!arraysEqual(visible, current)) pi.setActiveTools(visible);
	return visible;
}

export function toolsetFingerprint(toolNames: readonly string[]): string {
	return createHash("sha256")
		.update([...new Set(toolNames)].sort().join("\n"))
		.digest("hex")
		.slice(0, 16);
}

/** Fingerprint an ordered provider-visible tool list without reordering it. */
export function orderedToolsetFingerprint(toolNames: readonly string[]): string {
	return createHash("sha256")
		.update(JSON.stringify([...new Set(toolNames)]))
		.digest("hex")
		.slice(0, 16);
}

export function setToolsActive(
	pi: ToolActivationApi,
	toolNames: readonly string[],
	active: boolean,
): string[] {
	const state = stateFor(pi);
	if (state.restrictions.size === 0) state.desired = pi.getActiveTools();
	const changed = new Set(toolNames);
	state.desired = active
		? [...new Set([...state.desired, ...toolNames])]
		: state.desired.filter((name) => !changed.has(name));
	return applyDesiredToolState(pi, state);
}

export function activateTools(
	pi: ToolActivationApi,
	toolNames: readonly string[],
): string[] {
	return setToolsActive(pi, toolNames, true);
}

export function deactivateTools(
	pi: ToolActivationApi,
	toolNames: readonly string[],
): string[] {
	return setToolsActive(pi, toolNames, false);
}

export function setToolVisibilityRestriction(
	pi: ToolActivationApi,
	key: string,
	allowedToolNames: readonly string[],
	alwaysVisibleToolNames: readonly string[] = [],
): string[] {
	const state = stateFor(pi);
	if (state.restrictions.size === 0) state.desired = pi.getActiveTools();
	state.restrictions.set(key, {
		allowed: new Set(allowedToolNames),
		alwaysVisible: new Set(alwaysVisibleToolNames),
	});
	return applyDesiredToolState(pi, state);
}

export function removeToolVisibilityRestriction(
	pi: ToolActivationApi,
	key: string,
): string[] {
	const state = stateFor(pi);
	state.restrictions.delete(key);
	return applyDesiredToolState(pi, state);
}
