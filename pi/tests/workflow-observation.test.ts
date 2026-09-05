import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverWorkflows, observeWorkflow, selectWorkflowSource } from "../lib/workflow-observation.js";
import type { WorkflowGitRunner } from "../lib/workflow-worktree.js";

const roots: string[] = [];
const completePlan = "---\nstatus: complete\n---\n\n## Tasks\n\n- [x] **T1: Finish**\n  - State: completed\n\n## Execution Status\n\n- State: complete\n";

function fixture(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-workflow-observation-"));
	roots.push(root);
	fs.mkdirSync(path.join(root, ".specs", "fixture"), { recursive: true });
	fs.mkdirSync(path.join(root, ".worktrees", "fixture", ".specs", "archive", "fixture"), { recursive: true });
	fs.writeFileSync(path.join(root, ".specs", "fixture", "plan.md"), "stale primary\n");
	fs.writeFileSync(path.join(root, ".worktrees", "fixture", ".specs", "archive", "fixture", "plan.md"), completePlan);
	fs.mkdirSync(path.join(root, ".worktrees", "fixture", ".specs", "fixture"), { recursive: true });
	fs.writeFileSync(path.join(root, ".worktrees", "fixture", ".specs", "fixture", "plan.md"), "owned implementation\n");
	fs.writeFileSync(path.join(root, ".worktrees", "fixture.workflow.json"), JSON.stringify({
		version: 1, workflow: "do-it", workflowId: "do-it:fixture", repoRoot: root,
		primaryWorktree: root, primaryBranch: "main", initialPrimaryHead: "initial",
		branch: "workflow/fixture", worktree: path.join(root, ".worktrees", "fixture"),
		createdAt: "now", updatedAt: "now", state: "active", planPath: ".specs/fixture/plan.md",
	}));
	return root;
}

const runner: WorkflowGitRunner = async (cwd, args) => {
	if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: cwd.includes(`${path.sep}.worktrees${path.sep}`) ? path.resolve(cwd, "..", "..") : cwd, stderr: "" };
	if (args[0] === "worktree") return { code: 0, stdout: `worktree ${cwd}\nHEAD initial\nbranch refs/heads/main\n\nworktree ${path.join(cwd, ".worktrees", "fixture")}\nHEAD owned\nbranch refs/heads/workflow/fixture\n`, stderr: "" };
	if (args[0] === "diff" && args[1] === "--quiet") return { code: 0, stdout: "", stderr: "" };
	if (args[0] === "merge-base") return { code: 1, stdout: "", stderr: "not merged" };
	return { code: 0, stdout: "", stderr: "" };
};

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("workflow observation", () => {
	it("selects a completed owned archive while retaining stale primary claims", async () => {
		const root = fixture();
		const observed = await observeWorkflow({ cwd: root, planPath: ".specs/fixture/plan.md", runner });
		expect(observed.selection).toBe("archive");
		expect(observed.primary.content).toBe("stale primary\n");
		expect(observed.selected?.plan?.complete).toBe(true);
		expect(observed.selected?.workspace).toBe(path.join(root, ".worktrees", "fixture"));
		expect(selectWorkflowSource(observed).kind).toBe("archive");
	});

	it("keeps an unbound archive inspectable without selecting or inventing ownership", async () => {
		const root = fixture();
		const archive = path.join(root, ".specs", "archive", "fixture", "plan.md");
		fs.mkdirSync(path.dirname(archive), { recursive: true });
		fs.copyFileSync(path.join(root, ".worktrees", "fixture", ".specs", "archive", "fixture", "plan.md"), archive);
		fs.rmSync(path.join(root, ".worktrees", "fixture.workflow.json"));
		const observed = await observeWorkflow({ cwd: root, planPath: ".specs/fixture/plan.md", runner });
		expect(observed.archive?.exists).toBe(true);
		expect(observed.archive?.kind).toBe("archive");
		expect(observed.selection).toBe("primary");
		expect(observed.ownership).toBeUndefined();
		expect(observed.facts.integration).toBe("unknown");
	});

	it("does not call a one-sided stale-primary difference a conflict", async () => {
		const root = fixture();
		const observed = await observeWorkflow({ cwd: root, planPath: ".specs/fixture/plan.md", runner });
		expect(observed.selection).not.toBe("conflict");
	});

	it("reports independently changed primary and owned copies as a conflict", async () => {
		const root = fixture();
		const changedRunner: WorkflowGitRunner = async (cwd, args) => args[0] === "diff" ? { code: 1, stdout: "", stderr: "changed" } : runner(cwd, args);
		const observed = await observeWorkflow({ cwd: root, planPath: ".specs/fixture/plan.md", runner: changedRunner });
		expect(observed.selection).toBe("conflict");
		expect(observed.conflicts).toContain("primary and owned plan content differ after independent changes");
		expect(() => selectWorkflowSource(observed)).toThrow("source conflict");
	});

	it("lists malformed ownership explicitly instead of hiding it", async () => {
		const root = fixture();
		fs.writeFileSync(path.join(root, ".worktrees", "bad.workflow.json"), "{");
		const discovered = await discoverWorkflows({ cwd: root, runner });
		expect(discovered.complete).toBe(false);
		expect(discovered.errors.some((error) => error.path?.endsWith("bad.workflow.json"))).toBe(true);
	});

	it("discovers plan-bound in-place ownership and exposes separate facts", async () => {
		const root = fixture();
		fs.writeFileSync(path.join(root, ".worktrees", "fixture.workflow.json"), "");
		fs.writeFileSync(path.join(root, ".worktrees", "fixture.in-place.workflow.json"), JSON.stringify({
			version: 1, workflow: "do-it", workflowId: "do-it:fixture", repoRoot: root,
			worktree: root, branch: "main", baselineHead: "initial", planPath: ".specs/fixture/plan.md",
			createdAt: "now", updatedAt: "now", state: "complete",
		}));
		const discovered = await discoverWorkflows({ cwd: root, runner });
		const observed = discovered.observations.find((item) => item.canonicalPath === ".specs/fixture/plan.md");
		expect(observed?.inPlaceOwnership?.planPath).toBe(".specs/fixture/plan.md");
		expect(observed?.facts).toMatchObject({ integration: "unknown", cleanup: "unknown" });
	});

	it("reports current primary state in the comparison and never writes during inspection", async () => {
		const root = fixture();
		const before = fs.readFileSync(path.join(root, ".specs", "fixture", "plan.md"));
		const changedRunner: WorkflowGitRunner = async (cwd, args, signal) => {
			expect(signal?.aborted).toBeFalsy();
			if (args[0] === "--no-optional-locks") return { code: 0, stdout: " M .specs/fixture/plan.md", stderr: "" };
			return runner(cwd, args, signal);
		};
		const observed = await observeWorkflow({ cwd: root, planPath: ".specs/fixture/plan.md", runner: changedRunner });
		expect(observed.selection).toBe("conflict");
		expect(observed.comparisonRevision).toBeTruthy();
		expect(fs.readFileSync(path.join(root, ".specs", "fixture", "plan.md"))).toEqual(before);
	});

	it("propagates an aborted read-only Git inspection as an explicit error", async () => {
		const root = fixture();
		const signal = AbortSignal.abort();
		const aborted: WorkflowGitRunner = async (_cwd, _args, received) => ({ code: received?.aborted ? 1 : 0, stdout: "", stderr: received?.aborted ? "Operation cancelled" : "" });
		const discovered = await discoverWorkflows({ cwd: root, runner: aborted, signal });
		expect(discovered.complete).toBe(false);
		expect(discovered.errors[0]?.message).toContain("cancelled");
	});
});
