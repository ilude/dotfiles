import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	removeToolVisibilityRestriction,
	setToolVisibilityRestriction,
} from "./tool-activation.js";

export const DIAGNOSTIC_INSPECTION_TOOL_NAME = "tool_failure_inspect";
export const DIAGNOSTIC_DECISION_TOOL_NAME = "tool_failure_decide";
export const DIAGNOSTIC_RESTRICTION_KEY = "tool-failure-diagnostic";

type ToolVisibilityApi = Pick<ExtensionAPI, "getActiveTools" | "getAllTools" | "setActiveTools">;

type ActiveTurn = { owner: string; settle(): void };
const activeOwners = new WeakMap<object, ActiveTurn>();

export type DiagnosticTurn = {
	owner: string;
	settle(): void;
};

export function startDiagnosticTurn(
	pi: ToolVisibilityApi,
	owner: string,
	onSettled?: () => void,
): DiagnosticTurn {
	if (activeOwners.has(pi)) throw new Error("a tool-failure diagnostic turn is already active");
	if (!owner) throw new Error("diagnostic turn owner is required");
	const activeTurn: ActiveTurn = { owner, settle: () => undefined };
	activeOwners.set(pi, activeTurn);
	setToolVisibilityRestriction(
		pi,
		`${DIAGNOSTIC_RESTRICTION_KEY}:${owner}`,
		[DIAGNOSTIC_INSPECTION_TOOL_NAME, DIAGNOSTIC_DECISION_TOOL_NAME],
		[DIAGNOSTIC_INSPECTION_TOOL_NAME, DIAGNOSTIC_DECISION_TOOL_NAME],
	);
	let settled = false;
	const settle = (): void => {
		if (settled) return;
		settled = true;
		activeOwners.delete(pi);
		removeToolVisibilityRestriction(pi, `${DIAGNOSTIC_RESTRICTION_KEY}:${owner}`);
		onSettled?.();
	};
	activeTurn.settle = settle;
	return { owner, settle };
}

export function registerDiagnosticTurnLifecycle(pi: ToolVisibilityApi & { on: Function }): void {
	const clear = (): void => {
		const activeTurn = activeOwners.get(pi);
		if (!activeTurn) return;
		activeTurn.settle();
	};
	pi.on("agent_end", clear);
	pi.on("session_before_switch", clear);
	pi.on("session_shutdown", clear);
	pi.on("session_start", clear);
}
