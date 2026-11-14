import { afterEach, beforeEach, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { executeCommitPlan, parseCommitStatus, validateCommitPlan, type CommitPlan } from "../commands/commit/plan.ts";

const proposal = (paths = ["a", "b"]): CommitPlan => ({ repo: ".", commits: [{ subject: "Reviewed change", paths }], exclusions: [] });
const status = "M  a\0A  b\0";
it("accepts exact coverage, empty clean plans, and all-excluded changes", () => {
	expect(validateCommitPlan(proposal(), status)).toEqual({ ok: true, plan: proposal() });
	expect(validateCommitPlan({ repo: ".", commits: [], exclusions: [] }, "").ok).toBe(true);
	expect(validateCommitPlan({ repo: ".", commits: [], exclusions: [{ path: "a", reason: "  Operator exclusion  " }] }, "M  a\0")).toEqual({ ok: true, plan: { repo: ".", commits: [], exclusions: [{ path: "a", reason: "Operator exclusion" }] } });
});
it.each([
	[proposal(["a"]), "Missing path"],
	[proposal(["a", "a", "b"]), "Duplicate path"],
	[proposal(["a", "b", "other"]), "Unknown path"],
	[{ ...proposal(), exclusions: [{ path: "a", reason: "excluded twice" }] }, "Duplicate path"],
	[{ ...proposal(), commits: [] }, "Missing path"],
	[{ ...proposal(), repo: "other" }, "Repository must"],
	[{ ...proposal(), exclusions: [{ path: "other", reason: " " }] }, "non-empty reason"],
	[{ ...proposal(), commits: [{ subject: "fine", paths: [] }] }, "non-empty paths"],
	[null, "must be an object"],
] as const)("rejects incomplete or invalid plans %#", (input, error) => {
	const result = validateCommitPlan(input, status);
	expect(result.ok).toBe(false);
	if (!result.ok) expect(result.errors.join("\n")).toContain(error);
});
it.each(["", "/absolute", "C:\\absolute", "../outside", "a/../b", "a\0b"])("rejects invalid path %j", path => {
	const result = validateCommitPlan(proposal(["a", "b", path]), status);
	expect(result.ok).toBe(false);
	if (!result.ok) expect(result.errors.join("\n")).toContain("Invalid repository-relative path");
});
it.each(["", " padded", "padded ", "two\nlines", "two\rlines"])("rejects bad subject %j", subject => {
	expect(validateCommitPlan({ ...proposal(), commits: [{ subject, paths: ["a", "b"] }] }, status).ok).toBe(false);
});
it("parses NUL records without trimming path data and rejects split renames", () => {
	const renamed = "R  new name\n\0old name\t\0";
	expect(parseCommitStatus(renamed)).toEqual([{ xy: "R ", path: "new name\n", source: "old name\t" }]);
	expect(validateCommitPlan(proposal(["new name\n", "old name\t"]), renamed).ok).toBe(true);
	const result = validateCommitPlan({ repo: ".", commits: [{ subject: "first", paths: ["new name\n"] }, { subject: "second", paths: ["old name\t"] }], exclusions: [] }, renamed);
	expect(result.ok).toBe(false);
	if (!result.ok) expect(result.errors.join("\n")).toContain("same commit");
});
it("keeps directory replacement paths in one commit or one exclusion", () => {
	const replacement = "A  vault\0D  vault/note.md\0D  vault/nested/index.md\0";
	expect(validateCommitPlan(proposal(["vault", "vault/note.md", "vault/nested/index.md"]), replacement).ok).toBe(true);
	const split = validateCommitPlan({ repo: ".", commits: [{ subject: "link", paths: ["vault"] }, { subject: "delete", paths: ["vault/note.md", "vault/nested/index.md"] }], exclusions: [] }, replacement);
	expect(split.ok).toBe(false);
	if (!split.ok) expect(split.errors.join("\n")).toContain("Directory replacement paths must stay in the same commit");
	const excluded = validateCommitPlan({ repo: ".", commits: [{ subject: "link", paths: ["vault"] }], exclusions: [{ path: "vault/note.md", reason: "operator" }, { path: "vault/nested/index.md", reason: "operator" }] }, replacement);
	expect(excluded.ok).toBe(false);
	expect(validateCommitPlan({ repo: ".", commits: [], exclusions: ["vault", "vault/note.md", "vault/nested/index.md"].map(path => ({ path, reason: "operator" })) }, replacement).ok).toBe(true);
});
it("normalizes repository IDs only according to the host platform", () => {
	const result = validateCommitPlan({ ...proposal(), repo: "modules\\child" }, status, "modules/child");
	expect(result.ok).toBe(process.platform === "win32");
});

let root: string;
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 15000, windowsHide: true });
const exec: ExtensionAPI["exec"] = async (command, args, options) => new Promise((resolve) => {
	execFile(command, args, { encoding: "utf8", timeout: options?.timeout, signal: options?.signal, windowsHide: true }, (error, stdout, stderr) => {
		const result = { stdout, stderr, code: error ? typeof error.code === "number" ? error.code : 1 : 0, killed: Boolean(error?.killed), truncated: false };
		resolve(result);
	});
});
function init(cwd: string, baseline = true) {
	git(cwd, "init", "--quiet", "-b", "main");
	git(cwd, "config", "user.name", "Offline test"); git(cwd, "config", "user.email", "offline@example.invalid");
	git(cwd, "config", "core.autocrlf", "false");
	if (baseline) { writeFileSync(join(cwd, "base"), "baseline\n"); git(cwd, "add", "-A"); git(cwd, "commit", "--quiet", "-m", "baseline"); }
}
function stagedStatus() { return git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=dirty"); }
function run(plan: CommitPlan) {
	const validated = validateCommitPlan(plan, stagedStatus());
	if (!validated.ok) throw new Error(validated.errors.join("\n"));
	return executeCommitPlan(exec, root, undefined, validated.plan);
}
function hook(script: string) {
	const file = join(root, ".git", "hooks", "pre-commit");
	writeFileSync(file, `#!/bin/sh\n${script}\n`); chmodSync(file, 0o755);
}
beforeEach(() => { root = realpathSync(mkdtempSync(join(tmpdir(), "commit-plan-"))); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

it("commits multiple whole-file groups and leaves excluded contents unstaged", async () => {
	init(root);
	writeFileSync(join(root, "a file"), "first\n"); writeFileSync(join(root, "b"), "second\n");
	writeFileSync(join(root, "base"), "excluded edit\n"); writeFileSync(join(root, "untracked"), "excluded new\n");
	git(root, "add", "-A");
	const result = await run({ repo: ".", commits: [{ subject: "first", paths: ["a file"] }, { subject: "second", paths: ["b"] }], exclusions: [{ path: "base", reason: "operator" }, { path: "untracked", reason: "operator" }] });
	expect(result.ok).toBe(true); expect(result.commits.map(commit => commit.subject)).toEqual(["first", "second"]);
	expect(result.commits.map(commit => commit.paths)).toEqual([["a file"], ["b"]]);
	expect(git(root, "diff", "--cached", "--name-only")).toBe("");
	expect(readFileSync(join(root, "base"), "utf8")).toBe("excluded edit\n");
	expect(readFileSync(join(root, "untracked"), "utf8")).toBe("excluded new\n");
	expect(result.remaining).toEqual([{ xy: " M", path: "base" }, { xy: "??", path: "untracked" }]);
});
it.each([false, true])("preserves unchanged index stat information while reconstructing a plan (commit=%s)", async commit => {
	init(root);
	const paths = commit ? ["a"] : [];
	if (commit) { writeFileSync(join(root, "a"), "reviewed\n"); git(root, "add", "--", "a"); }
	const before = git(root, "ls-files", "--debug", "--", "base");
	expect(before).not.toContain("mtime: 0:0");
	const observed: string[] = [];
	const observe: ExtensionAPI["exec"] = async (command, args, options) => {
		// Inspect the metadata before status/commit can refresh it and hide the
		// expensive full-file reread caused by a plain read-tree.
		if (args[2] === "status" || args[2] === "diff") observed.push(git(root, "ls-files", "--debug", "--", "base"));
		return exec(command, args, options);
	};
	const result = await executeCommitPlan(observe, root, undefined, { repo: ".", commits: commit ? [{ subject: "reviewed", paths }] : [], exclusions: [] });
	expect(result.ok, result.error).toBe(true);
	expect(observed.length).toBeGreaterThan(1);
	for (const metadata of observed) expect(metadata).toBe(before);
	expect(readFileSync(join(root, "base"), "utf8")).toBe("baseline\n");
}, 45_000);
it("does not alter the index or commit any part of an invalid plan", async () => {
	init(root); writeFileSync(join(root, "a"), "a"); writeFileSync(join(root, "b"), "b"); git(root, "add", "-A");
	const before = git(root, "write-tree"), head = git(root, "rev-parse", "HEAD");
	const result = await executeCommitPlan(exec, root, undefined, proposal(["a"]));
	expect(result.ok).toBe(false); expect(result.error).toContain("Missing path");
	expect(git(root, "write-tree")).toBe(before); expect(git(root, "rev-parse", "HEAD")).toBe(head);
});
it("creates grouped commits in an unborn repository", async () => {
	init(root, false); writeFileSync(join(root, "a"), "a"); writeFileSync(join(root, "b"), "b"); git(root, "add", "-A");
	const result = await run({ repo: ".", commits: [{ subject: "first", paths: ["a"] }, { subject: "second", paths: ["b"] }], exclusions: [] });
	expect(result.ok).toBe(true); expect(result.commits).toHaveLength(2); expect(stagedStatus()).toBe("");
});
it("unstages all exclusions before the first unborn commit without deleting files", async () => {
	init(root, false); writeFileSync(join(root, "a"), "keep"); git(root, "add", "-A");
	const result = await run({ repo: ".", commits: [], exclusions: [{ path: "a", reason: "operator" }] });
	expect(result.ok).toBe(true); expect(git(root, "ls-files")).toBe(""); expect(readFileSync(join(root, "a"), "utf8")).toBe("keep");
});
it("commits both sides of a real rename and a deletion", async () => {
	init(root); renameSync(join(root, "base"), join(root, "new name")); git(root, "add", "-A");
	const result = await run(proposal(["base", "new name"]));
	expect(result.ok).toBe(true); expect(result.commits[0]?.paths.sort()).toEqual(["base", "new name"]);
	rmSync(join(root, "new name")); git(root, "add", "-A");
	expect((await run(proposal(["new name"]))).ok).toBe(true);
});
it("uses literal pathspecs, including magic-looking names and POSIX newline names", async () => {
	init(root);
	const paths = process.platform === "win32" ? ["[literal]", "space name"] : ["[literal]", ":(glob)magic", "line\nname"];
	for (const path of paths) writeFileSync(join(root, path), path);
	git(root, "add", "-A"); const result = await run(proposal(paths));
	expect(result.ok).toBe(true); expect(result.commits[0]?.paths.sort()).toEqual([...paths].sort());
});
it("includes a staged gitlink in coverage and the verified commit", async () => {
	init(root); const child = join(root, ".git", "child-source"); mkdirSync(child); init(child);
	const oid = git(child, "rev-parse", "HEAD").trim();
	git(root, "clone", "--quiet", child, "child");
	git(root, "update-index", "--add", "--cacheinfo", `160000,${oid},child`);
	expect(validateCommitPlan({ repo: ".", commits: [], exclusions: [] }, stagedStatus()).ok).toBe(false);
	const result = await run(proposal(["child"]));
	expect(result.ok).toBe(true); expect(result.remaining).toEqual([]);
	expect(result.commits[0]?.paths).toEqual(["child"]);
	expect(git(root, "ls-tree", "HEAD", "child")).toContain(`160000 commit ${oid}`);
});
it("commits a tracked directory's replacement with a gitlink and the reverse without changing working files", async () => {
	init(root);
	const path = "docs/[vault]", child = join(root, path);
	mkdirSync(join(child, "nested"), { recursive: true });
	writeFileSync(join(child, "note.md"), "research\n");
	writeFileSync(join(child, "nested", "index.md"), "index\n");
	git(root, "add", "-A"); git(root, "commit", "--quiet", "-m", "tracked vault");
	init(child, false); git(child, "add", "-A"); git(child, "commit", "--quiet", "-m", "independent vault");
	const oid = git(child, "rev-parse", "HEAD").trim();
	git(root, "rm", "-r", "--cached", "--", path); git(root, "add", "--", path);
	writeFileSync(join(root, "base"), "excluded edit\n"); git(root, "add", "base");
	const paths = [path, `${path}/note.md`, `${path}/nested/index.md`];
	const result = await run({ ...proposal(paths), exclusions: [{ path: "base", reason: "operator" }] });
	expect(result.ok, result.error).toBe(true);
	expect(result.commits[0]?.paths.sort()).toEqual([...paths].sort());
	expect(git(root, "ls-tree", "HEAD", "--", path)).toContain(`160000 commit ${oid}`);
	expect(git(root, "ls-files", "--", path).trim()).toBe(path);
	expect(git(child, "rev-parse", "HEAD").trim()).toBe(oid);
	expect(readFileSync(join(child, "note.md"), "utf8")).toBe("research\n");
	expect(git(root, "diff", "--cached", "--name-only")).toBe("");
	expect(readFileSync(join(root, "base"), "utf8")).toBe("excluded edit\n");

	// A gitlink-to-directory replacement needs the same indivisible path group.
	rmSync(join(child, ".git"), { recursive: true });
	git(root, "rm", "--cached", "--", path); git(root, "add", "--", path);
	const reverse = await run({ ...proposal(paths), exclusions: [{ path: "base", reason: "operator" }] });
	expect(reverse.ok, reverse.error).toBe(true);
	expect(reverse.commits[0]?.paths.sort()).toEqual([...paths].sort());
	expect(git(root, "ls-tree", "-r", "HEAD", "--", path)).not.toContain("160000");
	expect(readFileSync(join(child, "nested", "index.md"), "utf8")).toBe("index\n");
}, 45_000);
it("reports completed commits and stops later groups after hook failure", async () => {
	init(root); for (const path of ["a", "b", "c"]) writeFileSync(join(root, path), path); git(root, "add", "-A");
	hook("if git diff --cached --name-only | grep '^b$'; then\n  echo hook-rejected >&2\n  exit 1\nfi\nexit 0");
	const result = await run({ repo: ".", commits: [{ subject: "first", paths: ["a"] }, { subject: "second", paths: ["b"] }, { subject: "third", paths: ["c"] }], exclusions: [] });
	expect(result.ok).toBe(false); expect(result.error).toContain("hook-rejected"); expect(result.commits.map(commit => commit.subject)).toEqual(["first"]);
	expect(git(root, "log", "-1", "--format=%s").trim()).toBe("first");
	expect(readFileSync(join(root, "c"), "utf8")).toBe("c");
});
it("reports hook-modified files as unfinished, retaining reviewed later-group contents", async () => {
	init(root); writeFileSync(join(root, "a"), "reviewed a\n"); writeFileSync(join(root, "b"), "reviewed b\n"); git(root, "add", "-A");
	hook("printf 'hook edit\\n' > b\nprintf 'hook new\\n' > hook-new");
	const result = await run({ repo: ".", commits: [{ subject: "first", paths: ["a"] }, { subject: "second", paths: ["b"] }], exclusions: [] });
	expect(result.ok).toBe(false); expect(result.error).toContain("Unfinished eligible changes"); expect(result.error).toContain("hook-new");
	expect(git(root, "show", "HEAD:b")).toBe("reviewed b\n"); expect(readFileSync(join(root, "b"), "utf8")).toBe("hook edit\n");
});
it("rejects hooks that stage unreviewed commit paths and stops later groups", async () => {
	init(root); writeFileSync(join(root, "a"), "a"); writeFileSync(join(root, "b"), "b"); git(root, "add", "-A");
	hook("printf 'unreviewed\\n' > hook-added\ngit add -- hook-added");
	const result = await run({ repo: ".", commits: [{ subject: "first", paths: ["a"] }, { subject: "second", paths: ["b"] }], exclusions: [] });
	expect(result.ok).toBe(false); expect(result.error).toContain("paths differ"); expect(result.commits).toHaveLength(1);
	expect(result.commits[0]?.paths).toContain("hook-added");
});
