import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { preparePlanRun, readPreparedPlanRun } from "../lib/plan-run.js";

const roots: string[] = [];
function repo(): string {
	const root = mkdtempSync(path.join(os.tmpdir(), "plan-run-")); roots.push(root);
	const run = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
	run("init", "-b", "feature/source"); run("config", "user.email", "test@example.invalid"); run("config", "user.name", "Test");
	mkdirSync(path.join(root, ".specs", "sample"), { recursive: true });
	writeFileSync(path.join(root, ".specs/sample/plan.md"), "uncommitted plan content\n");
	writeFileSync(path.join(root, ".specs/sample/support.txt"), "uncommitted support content\n");
	writeFileSync(path.join(root, "tracked.txt"), "base\n"); run("add", "."); run("commit", "-m", "base");
	writeFileSync(path.join(root, ".specs/sample/plan.md"), "newer uncommitted plan content\n");
	mkdirSync(path.join(root, ".specs/sample/nested"));
	writeFileSync(path.join(root, ".specs/sample/nested/notes.txt"), "untracked supporting notes\n");
	return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("preparePlanRun", () => {
	it("creates from non-main origin and carries the whole dirty spec with a verified receipt", () => {
		const origin = repo();
		const receipt = preparePlanRun({ originCheckoutPath: origin, specRelativePath: ".specs/sample/plan.md" });
		expect(receipt.originBranch).toBe("feature/source");
		expect(receipt.startingTargetCommit).toMatch(/^[a-f0-9]{40}$/);
		expect(readFileSync(path.join(receipt.taskWorktreePath, ".specs/sample/plan.md"), "utf8")).toBe("newer uncommitted plan content\n");
		expect(readFileSync(path.join(receipt.taskWorktreePath, ".specs/sample/support.txt"), "utf8")).toBe("uncommitted support content\n");
		expect(readFileSync(path.join(receipt.taskWorktreePath, ".specs/sample/nested/notes.txt"), "utf8")).toBe("untracked supporting notes\n");
		expect(readPreparedPlanRun(path.join(origin, ".specs/sample"))).toEqual(receipt);
		const raw = JSON.parse(readFileSync(path.join(origin, ".specs/sample/.pi-plan-run.json"), "utf8"));
		expect(Object.keys(raw).sort()).toEqual([...Object.keys(receipt), "sourceSpecSnapshot"].sort());
		expect(raw.sourceSpecSnapshot).toEqual({ version: 1, files: [
			{ path: "nested/notes.txt", sha256: createHash("sha256").update("untracked supporting notes\n").digest("hex") },
			{ path: "plan.md", sha256: createHash("sha256").update("newer uncommitted plan content\n").digest("hex") },
			{ path: "support.txt", sha256: createHash("sha256").update("uncommitted support content\n").digest("hex") },
		] });
		expect(readFileSync(path.join(origin, ".specs/sample/.pi-plan-run.json"), "utf8")).toBe(readFileSync(path.join(receipt.taskWorktreePath, ".specs/sample/.pi-plan-run.json"), "utf8"));
		expect(preparePlanRun({ originCheckoutPath: origin, specRelativePath: ".specs/sample/plan.md", taskWorktreePath: ".worktrees/sample" })).toEqual(receipt);
	});
	it("rejects corrupt records and mismatched explicit coordinates without overwriting", () => {
		const origin = repo();
		const receipt = preparePlanRun({ originCheckoutPath: origin, specRelativePath: ".specs/sample/plan.md" });
		expect(() => preparePlanRun({ originCheckoutPath: origin, specRelativePath: ".specs/sample/plan.md", taskWorktreePath: path.join(origin, "elsewhere") })).toThrow(/Explicit task worktree path/);
		expect(() => preparePlanRun({ originCheckoutPath: origin, specRelativePath: ".specs/sample/plan.md", taskBranch: "task/other" })).toThrow(/Explicit task branch/);
		const record = path.join(origin, ".specs/sample/.pi-plan-run.json");
		writeFileSync(record, JSON.stringify({ ...receipt, specStub: "different" }));
		expect(() => preparePlanRun({ originCheckoutPath: origin, specRelativePath: ".specs/sample/plan.md" })).toThrow(/does not match selected plan/);
		writeFileSync(record, "not json");
		expect(() => preparePlanRun({ originCheckoutPath: origin, specRelativePath: ".specs/sample/plan.md" })).toThrow(/Corrupt prepared-run record/);
		expect(readFileSync(record, "utf8")).toBe("not json");
		expect(receipt.taskBranch).toBe("task/sample");
	});
	it("rejects nested plan paths", () => {
		const origin = repo();
		mkdirSync(path.join(origin, ".specs/sample/nested"), { recursive: true });
		writeFileSync(path.join(origin, ".specs/sample/nested/plan.md"), "nested\n");
		expect(() => preparePlanRun({ originCheckoutPath: origin, specRelativePath: ".specs/sample/nested/plan.md" })).toThrow(/existing .specs/);
	});
	it("rejects an occupied unassociated task path without touching it", () => {
		const origin = repo(), occupied = path.join(origin, ".worktrees/sample");
		mkdirSync(occupied, { recursive: true }); writeFileSync(path.join(occupied, "keep"), "untouched");
		expect(() => preparePlanRun({ originCheckoutPath: origin, specRelativePath: ".specs/sample/plan.md" })).toThrow(/occupied but has no verified preparation record/);
		expect(readFileSync(path.join(occupied, "keep"), "utf8")).toBe("untouched");
	});
});
