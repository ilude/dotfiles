import { describe, expect, it, vi } from "vitest";
import {
	BoundedWorkflowRuntime,
	MAX_WORKFLOW_EXTRACT_BYTES,
	WorkflowCancelledError,
	WorkflowSpecificationError,
	partitionFileRange,
	type WorkflowRuntimeDependencies,
} from "../extensions/subagent/workflow-runtime.ts";

function dependencies(
	execute: WorkflowRuntimeDependencies["execute"],
	overrides: Partial<WorkflowRuntimeDependencies> = {},
): WorkflowRuntimeDependencies {
	return {
		resolveAgent: (agent) => ({ name: agent, effectiveTools: ["read", "grep", "bash"] }),
		execute,
		...overrides,
	};
}

describe("BoundedWorkflowRuntime", () => {
	it("queues map items at the requested concurrency and retains settled results", async () => {
		const runtime = new BoundedWorkflowRuntime();
		let active = 0;
		let peak = 0;
		const execute = vi.fn(async ({ key }: { key: string }) => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active--;
			return { status: "found", evidence: [key] };
		});
		const spec = {
			id: "queued-workflow",
			concurrency: 2,
			items: Array.from({ length: 5 }, (_, index) => ({
				key: `item-${index}`,
				agent: "worker",
				task: "Inspect the bounded input.",
				capabilities: ["read"],
				input: { kind: "none" as const },
			})),
		};

		const first = await runtime.run(spec, dependencies(execute));
		const resumed = await runtime.run(spec, dependencies(execute));

		expect(peak).toBe(2);
		expect(execute).toHaveBeenCalledTimes(5);
		expect(first).toBe(resumed);
		expect(runtime.get("queued-workflow")?.state).toBe("settled");
	});

	it("rejects missing capabilities before dispatch without consuming attempts", async () => {
		const runtime = new BoundedWorkflowRuntime();
		const execute = vi.fn();
		const result = await runtime.run(
			{
				items: [
					{
						key: "needs-edit",
						agent: "reader",
						task: "Edit the file.",
						capabilities: ["read", "edit"],
						input: { kind: "none" },
					},
				],
			},
			dependencies(execute, {
				resolveAgent: () => ({ name: "reader", effectiveTools: ["read"] }),
			}),
		);

		expect(execute).not.toHaveBeenCalled();
		expect(result.items[0]).toMatchObject({ status: "error", attempts: 0 });
		expect(result.items[0]?.gaps[0]).toContain("missing tools: edit");
	});

	it("retries only retryable results with a materially changed retry", async () => {
		const runtime = new BoundedWorkflowRuntime();
		const tasks: string[] = [];
		const result = await runtime.run(
			{
				attempts: 3,
				items: [
					{
						key: "corrected",
						agent: "worker",
						task: "Initial request.",
						capabilities: ["read"],
						input: { kind: "none" },
						retries: [{ task: "Corrected request.", input: { kind: "none" } }],
					},
					{
						key: "complete",
						agent: "worker",
						task: "Complete request.",
						capabilities: ["read"],
						input: { kind: "none" },
						retries: [{ task: "Should not run.", input: { kind: "none" } }],
					},
				],
			},
			dependencies(({ key, task }) => {
				tasks.push(task);
				return key === "corrected" && task === "Initial request."
					? { status: "invalid" }
					: { status: "found", evidence: ["complete"] };
			}),
		);

		expect(tasks).toEqual([
			"Initial request.",
			"Complete request.",
			"Corrected request.",
		]);
		expect(result.items.find((item) => item.key === "corrected")).toMatchObject({
			status: "found",
			attempts: 2,
		});
		expect(result.items.find((item) => item.key === "complete")?.attempts).toBe(1);
	});

	it("rejects materially identical retry instructions", async () => {
		const runtime = new BoundedWorkflowRuntime();
		const execute = vi.fn(() => ({ status: "error", gaps: ["failed"] }));
		const result = await runtime.run(
			{
				items: [
					{
						key: "same",
						agent: "worker",
						task: "Repeat this.",
						capabilities: [],
						input: { kind: "none" },
						retries: [{ task: "Repeat this.", input: { kind: "none" } }],
					},
				],
			},
			dependencies(execute),
		);

		expect(execute).toHaveBeenCalledTimes(1);
		expect(result.items[0]?.attempts).toBe(1);
		expect(result.items[0]?.gaps[0]).toContain("materially identical");
	});

	it("uses bounded path/range inputs, targeted verification, and reductions without leaf output", async () => {
		const ranges = partitionFileRange("src/large.ts", 11, 4);
		expect(ranges).toEqual([
			{ kind: "path-range", path: "src/large.ts", startLine: 1, endLine: 4 },
			{ kind: "path-range", path: "src/large.ts", startLine: 5, endLine: 8 },
			{ kind: "path-range", path: "src/large.ts", startLine: 9, endLine: 11 },
		]);
		const runtime = new BoundedWorkflowRuntime();
		const verification = vi.fn(() => ({ contradicted: true, evidence: ["stale"] }));
		const reductions: unknown[][] = [];
		const result = await runtime.run(
			{
				verify: { keys: ["target"] },
				reduce: { groupSize: 2 },
				items: [
					{
						key: "target",
						agent: "worker",
						task: "Inspect partition.",
						capabilities: ["read"],
						input: ranges[0]!,
						retries: [{ task: "Recheck partition.", input: ranges[0]! }],
					},
					{
						key: "other",
						agent: "worker",
						task: "Inspect partition.",
						capabilities: ["read"],
						input: ranges[1]!,
					},
					{
						key: "third",
						agent: "worker",
						task: "Inspect partition.",
						capabilities: ["read"],
						input: ranges[2]!,
					},
				],
			},
			dependencies(
				({ key, attempt }) => ({ status: "found", evidence: [`${key}-${attempt}`] }),
				{
					verify: verification,
					reduce: ({ entries }) => {
						reductions.push(entries.map((entry) => entry.value));
						return { summary: `group-${reductions.length}` };
					},
				},
			),
		);

		expect(verification).toHaveBeenCalledTimes(1);
		expect(result.items.find((item) => item.key === "target")?.attempts).toBe(2);
		expect(reductions.map((group) => group.length)).toEqual([2, 1, 2]);
		expect(JSON.stringify(reductions)).not.toContain("rawOutput");
		expect(result.reductions).toEqual([{ summary: "group-3", evidence: [], gaps: [] }]);
	});

	it("rejects oversized extracts and cancels active execution", async () => {
		await expect(
			new BoundedWorkflowRuntime().run(
				{
					items: [
						{
							key: "large",
							agent: "worker",
							task: "Inspect.",
							capabilities: [],
							input: { kind: "extract", content: "x".repeat(MAX_WORKFLOW_EXTRACT_BYTES + 1) },
						},
					],
				},
				dependencies(() => ({ status: "found" })),
			),
		).rejects.toBeInstanceOf(WorkflowSpecificationError);

		const runtime = new BoundedWorkflowRuntime();
		let started!: () => void;
		const executionStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const running = runtime.run(
			{
				id: "cancelled",
				items: [
					{
						key: "wait",
						agent: "worker",
						task: "Wait.",
						capabilities: [],
						input: { kind: "none" },
					},
				],
			},
			dependencies(({ signal }) => {
				started();
				return new Promise((_resolve, reject) =>
					signal.addEventListener("abort", () => reject(new WorkflowCancelledError()), {
						once: true,
					}),
				);
			}),
		);
		await executionStarted;
		expect(runtime.cancel("cancelled")).toBe(true);
		await expect(running).rejects.toBeInstanceOf(WorkflowCancelledError);
		expect(runtime.get("cancelled")?.state).toBe("cancelled");
	});
});
