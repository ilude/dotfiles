import { signalProcessTree } from "../../lib/process-tree.js";
import type { SubagentRunManager } from "./run-manager.js";
import type {
	SubagentTreeBroker,
	SubagentTreeRunSnapshot,
} from "./tree-runtime.js";

export type SubagentControlSelector = {
	readonly type: "run" | "tree";
	readonly id: string;
};

export type SubagentControlInput = {
	readonly action: "cancel" | "force_terminate" | "reconcile";
	readonly selector: SubagentControlSelector;
};

export interface SubagentControlResult {
	readonly action: SubagentControlInput["action"];
	readonly selectedIds: readonly string[];
	readonly finalState: "cancelled" | "terminated" | "reconciled";
	readonly stoppedPids: readonly number[];
	readonly releasedRunIds: readonly string[];
}

export class SubagentControlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SubagentControlError";
	}
}

function exactId(value: string): string {
	if (typeof value !== "string" || !value.trim())
		throw new SubagentControlError("An exact non-empty identifier is required.");
	if (value.includes("*") || value.includes("?"))
		throw new SubagentControlError("Prefix and wildcard selectors are not supported.");
	return value;
}

function selectRuns(
	runs: readonly SubagentTreeRunSnapshot[],
	selector: SubagentControlSelector,
): SubagentTreeRunSnapshot[] {
	const id = exactId(selector.id);
	const selected = runs.filter((run) =>
		selector.type === "run" ? run.runId === id : run.treeId === id,
	);
	if (selected.length === 0)
		throw new SubagentControlError(`No live broker boundary matches ${selector.type} ${id}.`);
	return selected;
}

export class SubagentControlFacade {
	constructor(
		private readonly broker: SubagentTreeBroker,
		private readonly manager: SubagentRunManager,
	) {}

	async execute(input: SubagentControlInput): Promise<SubagentControlResult> {
		if (!input?.selector || (input.selector.type !== "run" && input.selector.type !== "tree"))
			throw new SubagentControlError("An exact run or tree selector is required.");
		const selected = selectRuns(this.broker.list(), input.selector);
		if (input.action === "reconcile") {
			const releasedRunIds: string[] = [];
			for (const run of selected) {
				if (run.role === "root") continue;
				this.broker.reconcile(run.runId);
				releasedRunIds.push(run.runId);
			}
			return {
				action: input.action,
				selectedIds: selected.map((run) => run.runId),
				finalState: "reconciled",
				stoppedPids: [],
				releasedRunIds,
			};
		}

		const stoppedPids: number[] = [];
		if (input.action === "force_terminate") {
			for (const run of selected) {
				if (!run.pid) continue;
				await signalProcessTree(
					{
						pid: run.pid,
						exitCode: null,
						signalCode: null,
						kill: (signal) => process.kill(run.pid as number, signal),
					},
					process.platform === "win32",
				);
				stoppedPids.push(run.pid);
			}
		}
		for (const run of selected) {
			if (run.role === "root") continue;
			const root = this.broker.list().find(
				(candidate) => candidate.treeId === run.treeId && candidate.role === "root",
			);
			if (root) this.broker.cancel(root.runId, run.runId);
			this.manager.cancelTree(run.runId);
		}
		return {
			action: input.action,
			selectedIds: selected.map((run) => run.runId),
			finalState: input.action === "cancel" ? "cancelled" : "terminated",
			stoppedPids,
			releasedRunIds: [],
		};
	}
}

export function createSubagentControlFacade(
	broker: SubagentTreeBroker,
	manager: SubagentRunManager,
): SubagentControlFacade {
	return new SubagentControlFacade(broker, manager);
}
