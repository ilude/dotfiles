import { signalProcessTree } from "../../lib/process-tree.js";
import type { SubagentRunManager } from "./run-manager.js";
import { isProcessAlive } from "./status.js";
import type {
	SubagentTreeBroker,
	SubagentTreeRunSnapshot,
} from "./tree-runtime.js";

export type SubagentControlSelector =
	| { readonly type: "process"; readonly processId: string }
	| { readonly type: "tree"; readonly id: string };

export type SubagentControlInput = {
	readonly action: "cancel" | "force_terminate" | "reconcile";
	readonly selector: SubagentControlSelector;
};

export interface SubagentControlTargetOutcome {
	readonly processId: string;
	readonly pid?: number;
	readonly outcome: "cancelled" | "terminated" | "reconciled" | "failed" | "skipped";
	readonly message?: string;
}

export interface SubagentControlResult {
	readonly action: SubagentControlInput["action"];
	readonly selectedProcessIds: readonly string[];
	readonly finalState: "cancelled" | "terminated" | "reconciled" | "partial";
	readonly stoppedPids: readonly number[];
	readonly releasedProcessIds: readonly string[];
	readonly outcomes: readonly SubagentControlTargetOutcome[];
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

async function waitForProcessExit(pid: number, timeoutMs = 500): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (isProcessAlive(pid) && Date.now() < deadline)
		await new Promise((resolve) => setTimeout(resolve, 20));
	return !isProcessAlive(pid);
}

function selectRuns(
	runs: readonly SubagentTreeRunSnapshot[],
	selector: SubagentControlSelector,
): SubagentTreeRunSnapshot[] {
	const id = exactId(selector.type === "process" ? selector.processId : selector.id);
	const selected = runs.filter((run) =>
		selector.type === "process" ? run.runId === id : run.treeId === id,
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
		if (!input?.selector || (input.selector.type !== "process" && input.selector.type !== "tree"))
			throw new SubagentControlError("An exact process or tree selector is required.");
		const selected = selectRuns(this.broker.list(), input.selector);
		if (input.action === "reconcile") {
			const releasable = selected.filter((run) => run.role !== "root");
			for (const run of releasable) this.broker.assertReconcileSafe(run.runId);
			const releasedRunIds: string[] = [];
			for (const run of [...releasable].sort((a, b) => b.depth - a.depth)) {
				this.broker.reconcile(run.runId);
				releasedRunIds.push(run.runId);
			}
			return {
				action: input.action,
				selectedProcessIds: selected.map((run) => run.runId),
				finalState: "reconciled",
				stoppedPids: [],
				releasedProcessIds: releasedRunIds,
				outcomes: selected.map((run) =>
					run.role === "root"
						? { processId: run.runId, outcome: "skipped", message: "Root boundaries are retained." }
						: { processId: run.runId, outcome: "reconciled" },
				),
			};
		}

		const stoppedPids: number[] = [];
		const terminationFailures = new Map<string, string>();
		if (input.action === "force_terminate") {
			for (const run of selected) {
				if (!run.pid) {
					terminationFailures.set(run.runId, "No process ID is registered.");
					continue;
				}
				try {
					await signalProcessTree(
						{
							pid: run.pid,
							exitCode: null,
							signalCode: null,
							kill: (signal) => process.kill(run.pid as number, signal),
						},
						process.platform === "win32",
					);
					if (await waitForProcessExit(run.pid)) stoppedPids.push(run.pid);
					else
						terminationFailures.set(
							run.runId,
							`Process ${run.pid} is still live after termination.`,
						);
				} catch (error) {
					terminationFailures.set(
						run.runId,
						error instanceof Error ? error.message : String(error),
					);
				}
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
		const outcomes: SubagentControlTargetOutcome[] = selected.map((run) => {
			const failure = terminationFailures.get(run.runId);
			if (failure)
				return { processId: run.runId, pid: run.pid, outcome: "failed", message: failure };
			return {
				processId: run.runId,
				...(run.pid === undefined ? {} : { pid: run.pid }),
				outcome: input.action === "cancel" ? "cancelled" : "terminated",
			};
		});
		return {
			action: input.action,
			selectedProcessIds: selected.map((run) => run.runId),
			releasedProcessIds: [],
			finalState:
				terminationFailures.size > 0
					? "partial"
					: input.action === "cancel"
						? "cancelled"
						: "terminated",
			stoppedPids,
			outcomes,
		};
	}
}

export function createSubagentControlFacade(
	broker: SubagentTreeBroker,
	manager: SubagentRunManager,
): SubagentControlFacade {
	return new SubagentControlFacade(broker, manager);
}
