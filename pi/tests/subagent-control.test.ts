import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
	createSubagentControlFacade,
	SubagentControlError,
} from "../extensions/subagent/control.ts";
import { SubagentRunManager } from "../extensions/subagent/run-manager.ts";
import { isProcessAlive } from "../extensions/subagent/status.ts";
import { SubagentTreeBroker } from "../extensions/subagent/tree-runtime.ts";

function fixture(limit = 2) {
	const broker = new SubagentTreeBroker({ maxActiveDescendants: limit });
	const root = broker.createTree({ treeId: "tree", rootRunId: "root" });
	const manager = new SubagentRunManager();
	return { broker, root, manager, control: createSubagentControlFacade(broker, manager) };
}

describe("subagent live control", () => {
	it("cancels an exact run without cancelling its sibling", async () => {
		const { broker, root, control } = fixture();
		const selected = await broker.acquire({ treeId: root.treeId, parentRunId: root.rootRunId, runId: "selected", role: "leaf" });
		const sibling = await broker.acquire({ treeId: root.treeId, parentRunId: root.rootRunId, runId: "sibling", role: "leaf" });
		const result = await control.execute({ action: "cancel", selector: { type: "run", id: "selected" } });
		expect(result.selectedIds).toEqual(["selected"]);
		expect(result.outcomes).toEqual([
			{ runId: "selected", outcome: "cancelled" },
		]);
		expect(broker.list().find((run) => run.runId === "selected")?.state).toBe("cancelled");
		expect(broker.list().find((run) => run.runId === "sibling")?.state).toBe("active");
		await selected.release();
		await sibling.release();
	});

	it("rejects prefixes and unknown exact selectors before mutation", async () => {
		const { broker, root, control } = fixture();
		const permit = await broker.acquire({ treeId: root.treeId, parentRunId: root.rootRunId, runId: "complete-run-id", role: "leaf" });
		await expect(control.execute({ action: "cancel", selector: { type: "run", id: "complete*" } })).rejects.toBeInstanceOf(SubagentControlError);
		await expect(control.execute({ action: "cancel", selector: { type: "run", id: "complete" } })).rejects.toThrow("No live broker boundary");
		expect(broker.list().find((run) => run.runId === "complete-run-id")?.state).toBe("active");
		await permit.release();
	});

	it("reconciles a terminal stale lease and permits reacquisition", async () => {
		const { broker, root, control } = fixture(1);
		const stale = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "stale",
			role: "leaf",
			scopeLease: { repositoryRoot: process.cwd(), scopes: ["src/reconcile"] },
		});
		broker.cancel(root.rootRunId, stale.metadata.runId);
		await control.execute({ action: "reconcile", selector: { type: "run", id: "stale" } });
		const replacement = await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "replacement",
			role: "leaf",
			scopeLease: { repositoryRoot: process.cwd(), scopes: ["src/reconcile"] },
		});
		expect(replacement.metadata.runId).toBe("replacement");
		await replacement.release();
	});

	it("preflights tree reconciliation before releasing any boundary", async () => {
		const { broker, root, control } = fixture();
		await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "first",
			role: "leaf",
		});
		await broker.acquire({
			treeId: root.treeId,
			parentRunId: root.rootRunId,
			runId: "second",
			role: "leaf",
		});

		await expect(
			control.execute({
				action: "reconcile",
				selector: { type: "tree", id: root.treeId },
			}),
		).rejects.toThrow("ambiguous process liveness");
		expect(
			broker
				.list()
				.filter((run) => run.role === "leaf")
				.map((run) => run.state),
		).toEqual(["active", "active"]);
	});

	it(
		"force-terminates and verifies settlement of a real cross-platform child process",
		async () => {
			const { broker, root, control } = fixture();
			const permit = await broker.acquire({
				treeId: root.treeId,
				parentRunId: root.rootRunId,
				runId: "real-process",
				role: "leaf",
			});
			const child = spawn(process.execPath, [
				"-e",
				"setInterval(() => {}, 1000)",
			], { stdio: "ignore" });
			if (!child.pid) throw new Error("test child process did not start");
			try {
				await permit.registerProcess({ pid: child.pid });
				const result = await control.execute({
					action: "force_terminate",
					selector: { type: "run", id: "real-process" },
				});
				expect(result).toMatchObject({
					finalState: "terminated",
					stoppedPids: [child.pid],
				});
				expect(isProcessAlive(child.pid)).toBe(false);
			} finally {
				if (isProcessAlive(child.pid)) child.kill("SIGKILL");
			}
		},
		10_000,
	);

	it("rejects reconciliation when process liveness is ambiguous", async () => {
		const { broker, root, control } = fixture();
		const live = await broker.acquire({ treeId: root.treeId, parentRunId: root.rootRunId, runId: "live", role: "leaf" });
		await expect(control.execute({ action: "reconcile", selector: { type: "run", id: "live" } })).rejects.toThrow("ambiguous process liveness");
		expect(broker.list().find((run) => run.runId === "live")?.state).toBe("active");
		await live.release();
	});
});
