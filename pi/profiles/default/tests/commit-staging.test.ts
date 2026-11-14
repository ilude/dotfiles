import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execFileSync, execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssistantMessageEventStream, type AssistantMessage, type Model, type ToolCall } from "@earendil-works/pi-ai";
import { createBashTool, type ExtensionAPI, type ExtensionContext, type ModelRuntime } from "@earendil-works/pi-coding-agent";
import { runCommitReviewer } from "../commands/commit/reviewer.ts";
import { discoverCommitRepositories } from "../commands/commit/repositories.ts";
import { commitShellCommand } from "../commands/commit/tools.ts";

// Real Agent, native inspection/read tools, and real temporary Git indexes. Only
// the provider and operator's dialog answer are deterministic fixtures. Mutation
// bash responses occur only after an established publication conflict.
const provider = vi.hoisted(() => ({ stream: vi.fn<ModelRuntime["streamSimple"]>() }));
vi.mock("../lib/model-runtime.ts", () => ({ createProfileModelRuntime: async () => ({
	getAvailable: async () => [model], streamSimple: provider.stream,
}) }));
const model: Model<"openai-responses"> = {
	id: "gpt-6.1-terra", name: "offline", api: "openai-responses", provider: "openai", baseUrl: "https://unused.invalid",
	reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 10000, maxTokens: 1000,
};
type Call = Pick<ToolCall, "name" | "arguments">;
let root: string;
let steps: Array<Call | Call[]>;
let results: Array<{ toolName: string; content: unknown; isError?: boolean }>;
let answers: string[];
let commands: string[];
let execs: string[][];
let completion: string;
let toolSets: string[][];
let requestTexts: string[];
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 15000, windowsHide: true });
const bash = (command: string): Call => ({ name: "bash", arguments: { command } });
const inspect = (command: string): Call => ({ name: "inspect", arguments: { command } });
const blocked = (reason: string): Call => ({ name: "report_commit_blocker", arguments: { reason } });
const inRepo = (cwd: string, command: string) => `git -C '${cwd.replace(/\\/g, "/")}' ${command}`;
const ask = (candidate: string): Call => ({ name: "ask_ignore", arguments: { repo: ".", candidate, reason: "Generated cache with uncertain repository policy", pattern: candidate } });
const plan = (subject: string, paths: string[], repo = ".", exclusions: Array<{ path: string; reason: string }> = []): Call => ({
	name: "submit_commit_plan", arguments: { repo, commits: paths.length ? [{ subject, paths }] : [], exclusions },
});
const empty = (repo = ".", exclusions: Array<{ path: string; reason: string }> = []) => plan("", [], repo, exclusions);
function init(cwd: string) {
	git(cwd, "init", "--quiet", "-b", "main");
	git(cwd, "config", "user.name", "Offline test"); git(cwd, "config", "user.email", "offline@example.invalid");
	git(cwd, "config", "core.autocrlf", "false");
	writeFileSync(join(cwd, "base.txt"), "base\n"); git(cwd, "add", "-A"); git(cwd, "commit", "--quiet", "-m", "baseline");
}
function submoduleFixture() {
	const source = join(root, ".git", "child-source"); mkdirSync(source); init(source);
	git(root, "-c", "protocol.file.allow=always", "submodule", "add", "--quiet", source, "modules/child");
	git(root, "commit", "--quiet", "-am", "child baseline");
	const child = realpathSync(join(root, "modules/child"));
	git(child, "config", "user.name", "Offline test"); git(child, "config", "user.email", "offline@example.invalid");
	return { source, child };
}
function publicationFixture(child: string) {
	const childRemote = join(root, ".git", "child-remote.git"), parentRemote = join(root, ".git", "parent-remote.git");
	git(root, "init", "--quiet", "--bare", childRemote); git(root, "init", "--quiet", "--bare", parentRemote);
	git(child, "remote", "set-url", "origin", childRemote); git(root, "remote", "add", "origin", parentRemote);
	return { childRemote, parentRemote };
}
beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "commit-staging-"))); init(root);
	steps = []; results = []; answers = []; commands = []; execs = []; completion = "Pushed"; toolSets = []; requestTexts = [];
	provider.stream.mockReset().mockImplementation((_model, context) => {
		requestTexts.push(JSON.stringify(context.messages));
		results = context.messages.filter(m => m.role === "toolResult") as typeof results;
		const system = context.messages.filter(m => m.role === "system").at(-1);
		toolSets.push(system?.toolsAdded?.map(tool => tool.name) ?? []);
		const step = steps.shift(); const calls = step ? (Array.isArray(step) ? step : [step]) : [];
		for (const call of calls) if (call.name === "bash" || call.name === "inspect") commands.push(String(call.arguments.command));
		const message: AssistantMessage = {
			role: "assistant", content: calls.length ? calls.map((call, index) => ({ type: "toolCall", id: `call-${provider.stream.mock.calls.length}-${index}`, ...call })) : [{ type: "text", text: completion }],
			stopReason: calls.length ? "toolUse" : "stop", model: model.id, api: model.api, provider: model.provider, timestamp: Date.now(),
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		};
		const stream = createAssistantMessageEventStream(); stream.push({ type: "start", partial: message });
		stream.push({ type: "done", reason: message.stopReason as "stop" | "toolUse", message }); return stream;
	});
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const pi = { exec: async (command: string, args: string[], options: { signal?: AbortSignal; timeout?: number }) => {
	execs.push(args);
	return await new Promise(resolve => execFile(command, args, { encoding: "utf8", timeout: options.timeout, signal: options.signal, windowsHide: true }, (error, stdout, stderr) => {
		resolve({ stdout, stderr, code: error ? (typeof error.code === "number" ? error.code : 1) : 0, killed: Boolean(error?.killed) });
	}));
} } as unknown as ExtensionAPI;
function run(push = false, signal?: AbortSignal, onProgress?: (text: string) => void) {
	const ctx = { cwd: root, hasUI: true, ui: { select: async () => answers.shift() } } as unknown as ExtensionContext;
	return runCommitReviewer(pi, ctx, push, signal, onProgress);
}
// Exercise the retained conflict-shell Git guard directly. Normal review no
// longer exposes this mutation surface, so these are not model review fixtures.
const conflictCommand = (command: string) => createBashTool(root).execute("conflict-guard", { command: commitShellCommand(command), timeout: 15 });

it("stages before review, includes staged new files, and executes whole-file groups in code", async () => {
	writeFileSync(join(root, "base.txt"), "edited\n"); git(root, "add", "base.txt"); writeFileSync(join(root, "new.txt"), "new staged contents\n");
	steps.push(inspect("git diff --cached"), { name: "submit_commit_plan", arguments: { repo: ".", commits: [{ subject: "first", paths: ["base.txt"] }, { subject: "second", paths: ["new.txt"] }], exclusions: [] } });
	const report = await run();
	expect(JSON.stringify(results[0]?.content)).toContain("new staged contents");
	expect(git(root, "log", "-2", "--format=%s").trim()).toBe("second\nfirst");
	expect(git(root, "show", "HEAD~1", "--format=", "--name-only").trim()).toBe("base.txt");
	expect(readFileSync(join(root, "new.txt"), "utf8")).toBe("new staged contents\n"); expect(report.text).toContain("first");
	expect(execs.some(args => /branch|remote|push/.test(args[2] ?? ""))).toBe(false);
	expect(toolSets[0]).toEqual(["submit_commit_plan", "report_commit_blocker", "inspect", "read", "ask_ignore"]);
	expect(provider.stream).toHaveBeenCalledTimes(2);
});

it.each(["Include in commit", "Add to .gitignore", "Leave untracked"])("applies post-stage decision: %s without deleting contents", async answer => {
	writeFileSync(join(root, "cache.txt"), "cache data\n"); answers.push(answer);
	steps.push(inspect("git diff --cached"), ask("cache.txt"));
	if (answer === "Include in commit") steps.push(plan("decision", ["cache.txt"]));
	else if (answer === "Add to .gitignore") steps.push(plan("decision", [".gitignore"]));
	else steps.push(empty(".", [{ path: "cache.txt", reason: "Operator chose Leave untracked" }]));
	const report = await run();
	expect(JSON.stringify(results[0]?.content)).toContain("cache data"); expect(readFileSync(join(root, "cache.txt"), "utf8")).toBe("cache data\n");
	if (answer === "Include in commit") expect(git(root, "ls-files", "cache.txt").trim()).toBe("cache.txt");
	else {
		expect(git(root, "ls-files", "cache.txt")).toBe(""); expect(report.text).toContain("Left out: cache.txt");
		if (answer === "Add to .gitignore") expect(git(root, "show", "HEAD:.gitignore").trim()).toBe("cache.txt");
		else expect(git(root, "status", "--short")).toContain("?? cache.txt");
	}
});

it("corrects an invalid ignore request without asking the user or excluding tracked feedback", async () => {
	const candidate = "instruction-feedback.md";
	writeFileSync(join(root, candidate), "A feedback record is not permission to commit.\n"); git(root, "add", candidate); git(root, "commit", "--quiet", "-m", "feedback baseline");
	writeFileSync(join(root, candidate), "Operator feedback correction\n"); answers.push("Leave untracked");
	steps.push(ask(candidate), plan("feedback correction", [candidate]));
	const report = await run();
	expect(results[0]?.isError).toBe(true); expect(JSON.stringify(results[0]?.content)).toContain("Not a staged new file in .");
	expect(answers).toEqual(["Leave untracked"]); expect(git(root, "diff", "--cached", "--name-only").trim()).toBe("");
	expect(git(root, "show", `HEAD:${candidate}`)).toBe("Operator feedback correction\n"); expect(report.text).toContain("feedback correction");
});

it("isolates child and parent conversations, candidate inventories, and relative tool roots", async () => {
	const { child } = submoduleFixture();
	writeFileSync(join(child, "base.txt"), "child review sentinel\n");
	writeFileSync(join(root, "root-only.txt"), "parent file contents\n");
	steps.push(inspect("git diff --cached"), { name: "read", arguments: { path: "base.txt" } }, plan("child edit", ["base.txt"], "modules/child"),
		inspect("git diff --cached"), { name: "read", arguments: { path: "root-only.txt" } }, plan("parent edit and pin", ["root-only.txt", "modules/child"]));
	const report = await run();
	expect(requestTexts[0]).not.toContain("root-only.txt");
	expect(requestTexts[2]).toContain("child review sentinel");
	expect(requestTexts[3]).not.toContain("child review sentinel");
	expect(requestTexts[3]).not.toContain("Plan accepted");
	expect(JSON.stringify(results.map(result => result.content))).toContain("parent file contents");
	expect(git(child, "show", "HEAD:base.txt")).toBe("child review sentinel\n");
	expect(git(root, "status", "--porcelain")).toBe(""); expect(report.text).toContain("parent edit and pin");
}, 45_000);

it("walks declared nested submodules without treating vendored gitlinks as repositories", async () => {
	const { child } = submoduleFixture();
	const source = join(root, ".git", "grandchild-source"); mkdirSync(source); init(source);
	const nestedPath = "deps/nested child";
	git(child, "-c", "protocol.file.allow=always", "submodule", "add", "--quiet", source, nestedPath);
	const nested = join(child, nestedPath);
	git(nested, "config", "user.name", "Offline test"); git(nested, "config", "user.email", "offline@example.invalid");
	const vendor = ".repos/alchemy-effect";
	const orphan = `${vendor}/submodules/distilled`;
	mkdirSync(join(child, orphan), { recursive: true });
	const vendorConfig = '[submodule "distilled"]\n\tpath = submodules/distilled\n\turl = https://unused.invalid/distilled.git\n';
	writeFileSync(join(child, vendor, ".gitmodules"), vendorConfig);
	git(child, "add", "-A");
	git(child, "update-index", "--add", "--cacheinfo", `160000,${git(nested, "rev-parse", "HEAD").trim()},${orphan}`);
	git(child, "commit", "--quiet", "-m", "nested module and vendored reference");
	git(root, "add", "modules/child"); git(root, "commit", "--quiet", "-m", "nested baseline");
	const vendorIndex = git(child, "ls-files", "--stage", "--", orphan);
	const before = git(root, "status", "--porcelain", "--ignore-submodules=all");
	const repositories = await discoverCommitRepositories(pi, root);
	expect(repositories).toEqual([root, child, realpathSync(nested)]);
	expect(git(root, "status", "--porcelain", "--ignore-submodules=all")).toBe(before);
	expect(git(child, "ls-files", "--stage", "--", orphan)).toBe(vendorIndex);
	expect(readFileSync(join(child, vendor, ".gitmodules"), "utf8")).toBe(vendorConfig);
}, 45_000);

it("recovers a root-file ignore request during a clean child pass without a dialog", async () => {
	submoduleFixture(); writeFileSync(join(root, "root-only.txt"), "parent file\n");
	answers.push("Leave untracked");
	steps.push({ name: "ask_ignore", arguments: { ...ask("root-only.txt").arguments, repo: "modules/child" } }, empty("modules/child"), plan("parent file", ["root-only.txt"]));
	const report = await run();
	expect(requestTexts[1]).toContain("Path is not changed in modules/child");
	expect(answers).toEqual(["Leave untracked"]); expect(report.text).toContain("parent file");
	expect(git(root, "show", "HEAD:root-only.txt")).toBe("parent file\n");
}, 45_000);

it.each([
	{ repo: "missing", candidate: "new.txt", pattern: "new.txt" },
	{ repo: ".", candidate: "../new.txt", pattern: "new.txt" },
	{ repo: ".", candidate: "new.txt", pattern: "!new.txt" },
])("corrects invalid ignore arguments before any dialog: %j", async args => {
	writeFileSync(join(root, "new.txt"), "new file\n"); answers.push("Leave untracked");
	steps.push({ name: "ask_ignore", arguments: { ...ask("new.txt").arguments, ...args } }, plan("new file", ["new.txt"]));
	const report = await run();
	expect(results[0]?.isError).toBe(true); expect(answers).toEqual(["Leave untracked"]); expect(report.text).toContain("new file");
	expect(git(root, "show", "HEAD:new.txt")).toBe("new file\n");
});

it("accepts native Windows candidate separators and preserves POSIX literal backslashes", async () => {
	const candidate = "new\\file.txt";
	const gitPath = process.platform === "win32" ? "new/file.txt" : candidate;
	if (process.platform === "win32") mkdirSync(join(root, "new"));
	writeFileSync(join(root, candidate), "native candidate\n"); answers.push("Include in commit");
	steps.push(ask(candidate), plan("native candidate", [gitPath]));
	const report = await run();
	expect(answers).toEqual([]); expect(report.text).toContain("native candidate");
	expect(git(root, "show", `HEAD:${gitPath}`)).toBe("native candidate\n");
});

it("reports reviewer-selected exclusion reasons and unstages them without losing contents", async () => {
	writeFileSync(join(root, "base.txt"), "remaining\n");
	steps.push(empty(".", [{ path: "base.txt", reason: "concrete review issue" }]));
	const report = await run(); expect(report.text).toContain("Remaining changes:"); expect(report.text).toContain("Left out: base.txt: concrete review issue");
	expect(git(root, "diff", "--cached", "--name-only")).toBe(""); expect(readFileSync(join(root, "base.txt"), "utf8")).toBe("remaining\n");
});

it("reports inventory, model, staging, review, tool, and completion phases", async () => {
	const progress: string[] = []; steps.push(inspect("git diff --cached"), { name: "read", arguments: { path: "base.txt" } });
	await run(false, undefined, text => progress.push(text));
	expect(progress).toEqual([
		"Inspecting repositories…", "Resolving commit model…", "Reviewing changes…", "Staging repository changes…",
		"Running Git/shell command…", "Reviewing changes…", "Reading repository instructions and changes…", "Reviewing changes…", "Collecting commit results…",
	]);
});

it("preserves sole index content with normal Git before blanket staging", async () => {
	writeFileSync(join(root, "base.txt"), "index-only\n"); git(root, "add", "base.txt"); writeFileSync(join(root, "base.txt"), "working copy\n");
	steps.push(inspect("git diff --cached"), plan("working", ["base.txt"]));
	const report = await run();
	expect(git(root, "show", "stash@{0}^2:base.txt")).toBe("index-only\n"); expect(readFileSync(join(root, "base.txt"), "utf8")).toBe("working copy\n");
	expect(report.text).toContain("Preserved index content:"); expect(JSON.stringify(results[0]?.content)).toContain("working copy");
});

it("preserves index-only contents alongside a tracked-directory-to-submodule conversion", async () => {
	const vault = "docs/vault", child = join(root, vault);
	mkdirSync(child, { recursive: true }); writeFileSync(join(child, "note.md"), "research\n");
	git(root, "add", "-A"); git(root, "commit", "--quiet", "-m", "tracked research");
	init(child);
	const childHead = git(child, "rev-parse", "HEAD").trim();
	git(root, "rm", "-r", "--cached", "--", vault);
	writeFileSync(join(root, ".gitmodules"), `[submodule "vault"]\n\tpath = ${vault}\n\turl = https://unused.invalid/vault.git\n`);
	git(root, "add", "--", ".gitmodules", vault);
	writeFileSync(join(root, "base.txt"), "index-only\n"); git(root, "add", "--", "base.txt");
	writeFileSync(join(root, "base.txt"), "working copy\n");
	steps.push(empty(vault), inspect("git diff --cached -- base.txt"), plan("convert vault", [".gitmodules", "base.txt", vault, `${vault}/note.md`]));
	const originalStream = provider.stream.getMockImplementation()!;
	provider.stream.mockImplementation((model, context, options) => {
		if (JSON.stringify(context.messages.at(-1)).includes("Git stash failed")) steps.unshift(blocked("Stash cannot preserve this directory replacement."));
		return originalStream(model, context, options);
	});
	const report = await run();
	expect(git(root, "show", "stash@{0}^2:base.txt")).toBe("index-only\n");
	expect(git(root, "ls-tree", "stash@{0}^2", "--", vault)).toContain(`160000 commit ${childHead}`);
	expect(git(root, "show", "HEAD:base.txt")).toBe("working copy\n");
	expect(readFileSync(join(child, "note.md"), "utf8")).toBe("research\n");
	expect(git(root, "ls-tree", "HEAD", "--", vault)).toContain(`160000 commit ${childHead}`);
	expect(git(root, "status", "--porcelain")).toBe("");
	expect(report.text).toContain("Preserved index content:");
}, 45_000);

it("applies the fixed local settings policy in code before review", async () => {
	mkdirSync(join(root, ".pi")); writeFileSync(join(root, ".pi", "settings.json"), "{}\n");
	steps.push(inspect("git diff --cached"), plan("ignore local settings", [".gitignore"]));
	const report = await run();
	expect(git(root, "show", "HEAD:.gitignore").trim()).toBe(".pi/settings.json"); expect(git(root, "ls-files", ".pi/settings.json")).toBe("");
	expect(readFileSync(join(root, ".pi", "settings.json"), "utf8")).toBe("{}\n"); expect(report.text).toContain("Left out: .pi/settings.json");
});

it("recovers a bad inspection and no-match, allowing discovery and corrected Git inspection", async () => {
	steps.push(inspect("git diff --invalid-inspection-option"), inspect("git diff --cached"), inspect("grep no-such-match base.txt"), inspect("find . -name base.txt"),
		{ name: "read", arguments: { path: "missing-file.txt" } }, { name: "read", arguments: { path: "base.txt" } });
	await run(); expect(results[0]?.isError).toBe(true); expect(results[1]?.isError).toBe(false);
	expect(results[2]?.isError).toBe(true); expect(results[4]?.isError).toBe(true); expect(results[5]?.isError).toBe(false); expect(commands).toHaveLength(4);
});

it("continues after a compound inspection ends with a normal check-ignore no-match", async () => {
	writeFileSync(join(root, "new.txt"), "commit me\n");
	steps.push(inspect("pwd && git status --short --branch && git diff --cached -- base.txt && git diff -- base.txt && git ls-files --stage -- base.txt && git check-ignore new.txt"),
		inspect("git diff --cached"), plan("after-inspection", ["new.txt"]));
	const report = await run(); expect(results[0]?.isError).toBe(true); expect(JSON.stringify(results[0]?.content)).toContain("code 1");
	expect(report.text).toContain("after-inspection"); expect(git(root, "show", "HEAD:new.txt")).toBe("commit me\n");
});

it("retains the conflict-shell guard for nonzero read-only checks without discarding staged work", async () => {
	writeFileSync(join(root, "base.txt"), "staged edit\n"); git(root, "add", "base.txt");
	const result = await conflictCommand("git diff --cached --quiet -- base.txt && git restore --staged -- base.txt");
	expect(JSON.stringify(result.content)).toContain("Read-only git diff returned 1");
	steps.push(plan("after-check", ["base.txt"])); expect((await run()).text).toContain("after-check"); expect(git(root, "show", "HEAD:base.txt")).toBe("staged edit\n");
});

it.each(["restore --worktree -- base.txt", "restore -- base.txt", "restore -SW -- base.txt", "checkout -- base.txt", "reset --hard", "clean -fd"])("retains conflict-shell working-tree discard protection: %s", async operation => {
	writeFileSync(join(root, "base.txt"), "working edit\n");
	const result = await conflictCommand(`git ${operation} && git add -A`); expect(JSON.stringify(result.content)).toContain("Refused git");
	steps.push(plan("kept", ["base.txt"])); const report = await run();
	expect(readFileSync(join(root, "base.txt"), "utf8")).toBe("working edit\n"); expect(report.text).toContain("kept");
});

it("returns full failed conflict diagnostics, blocks queued mutations, and lets the agent correct the command", async () => {
	const remote = join(root, ".git", "shell-failure-remote.git"), seed = join(root, ".git", "shell-failure-seed");
	git(root, "init", "--quiet", "--bare", remote); git(root, "remote", "add", "origin", remote); git(root, "push", "--quiet", "-u", "origin", "main");
	git(root, "clone", "--quiet", "--branch", "main", remote, seed); git(seed, "config", "user.name", "Offline test"); git(seed, "config", "user.email", "offline@example.invalid");
	writeFileSync(join(seed, "base.txt"), "remote conflict\n"); git(seed, "add", "-A"); git(seed, "commit", "--quiet", "-m", "remote conflict"); git(seed, "push", "--quiet");
	writeFileSync(join(root, "base.txt"), "local conflict\n"); git(root, "add", "-A"); git(root, "commit", "--quiet", "-m", "local conflict");
	const command = `git add -- '${"missing".repeat(60)}'`;
	steps.push(empty(), [bash(command), bash("git add base.txt && git commit -m forbidden")], bash("printf 'resolved conflict\\n' > base.txt && git add base.txt && git commit -m 'resolved merge'"));
	const report = await run(true);
	expect(requestTexts.some(text => text.includes(command))).toBe(true);
	expect(requestTexts.some(text => text.includes("The previous mutation failed"))).toBe(true);
	expect(git(root, "log", "-1", "--format=%s").trim()).toBe("resolved merge");
	expect(git(root, "log", "--format=%s")).not.toContain("forbidden");
	expect(git(root, "diff", "--name-only", "--diff-filter=U").trim()).toBe("");
	expect(report.text).toContain("Pushed.");
}, 60_000);

it.each(["add -- nonexistent.txt", "restore --staged -- nonexistent.txt", "-C nonexistent commit -m failure", "push --recurse-submodules=no nonexistent HEAD:refs/heads/main"])("retains failed conflict-shell mutation behavior: %s", async operation => {
	writeFileSync(join(root, "new.txt"), "remaining\n");
	const result = await conflictCommand(`git ${operation} && git add -A`);
	expect(result.isError).toBe(true); expect(git(root, "ls-files", "new.txt")).toBe("");
});

it.each([false, true])("skips empty child groups and continues committing the parent (excluded child changes=%s)", async dirty => {
	const { child } = submoduleFixture(); const childHead = git(child, "rev-parse", "HEAD").trim();
	if (dirty) writeFileSync(join(child, "base.txt"), "unstaged child work\n");
	writeFileSync(join(root, "base.txt"), "parent change\n");
	steps.push(empty("modules/child", dirty ? [{ path: "base.txt", reason: "intentionally excluded child work" }] : []), plan("parent-change", ["base.txt"]));
	const report = await run();
	expect(git(child, "rev-parse", "HEAD").trim()).toBe(childHead); expect(git(root, "log", "-1", "--format=%s").trim()).toBe("parent-change");
	expect(report.text).toContain("parent-change"); if (dirty) expect(readFileSync(join(child, "base.txt"), "utf8")).toBe("unstaged child work\n");
});

it("commits newly staged contents normally in an unborn repository", async () => {
	git(root, "checkout", "--quiet", "--orphan", "unborn"); git(root, "rm", "--quiet", "-rf", ".");
	writeFileSync(join(root, "first.txt"), "first commit contents\n"); steps.push(plan("first-commit", ["first.txt"]));
	const report = await run(); expect(report.text).toContain("first-commit"); expect(git(root, "show", "HEAD:first.txt")).toBe("first commit contents\n");
});

it("reviews a file arriving after a commit and preserves an operator exclusion across fresh staging", async () => {
	writeFileSync(join(root, "new.txt"), "first group\n"); writeFileSync(join(root, "cache.txt"), "keep locally\n");
	const hook = join(root, ".git", "hooks", "post-commit");
	writeFileSync(hook, "#!/bin/sh\nif ! test -f arrived.txt; then printf 'new work\\n' > arrived.txt; fi\n"); chmodSync(hook, 0o755);
	answers.push("Leave untracked");
	steps.push(ask("cache.txt"), plan("first group", ["new.txt"], ".", [{ path: "cache.txt", reason: "Operator chose Leave untracked" }]), inspect("git diff --cached -- arrived.txt"), plan("new arrival", ["arrived.txt"], ".", [{ path: "cache.txt", reason: "Operator chose Leave untracked" }]));
	const report = await run();
	expect(git(root, "log", "-2", "--format=%s").trim()).toBe("new arrival\nfirst group");
	expect(git(root, "show", "HEAD:arrived.txt")).toBe("new work\n");
	expect(readFileSync(join(root, "cache.txt"), "utf8")).toBe("keep locally\n"); expect(git(root, "status", "--short").trim()).toBe("?? cache.txt");
	expect(report.text).toContain("Left out: cache.txt"); expect(requestTexts.some(text => text.includes("Unfinished eligible changes"))).toBe(true);
}, 45_000);

it("reviews formatter hook edits and commits the corrected contents without bypassing the hook", async () => {
	writeFileSync(join(root, "base.txt"), "unformatted\n");
	const hook = join(root, ".git", "hooks", "pre-commit");
	writeFileSync(hook, "#!/bin/sh\nif grep -q unformatted base.txt; then printf 'formatted\\n' > base.txt; echo 'formatter updated base.txt' >&2; exit 1; fi\n"); chmodSync(hook, 0o755);
	steps.push(plan("initial", ["base.txt"]), inspect("git diff --cached -- base.txt"), plan("formatted contents", ["base.txt"]));
	const report = await run();
	expect(git(root, "show", "HEAD:base.txt")).toBe("formatted\n"); expect(git(root, "status", "--porcelain")).toBe("");
	expect(report.text).toContain("formatted contents"); expect(requestTexts.some(text => text.includes("formatter updated base.txt"))).toBe(true);
	expect(execs.filter(args => args[2] === "commit")).toHaveLength(2);
}, 45_000);

it("does not blindly run later groups after a hook failure when the agent reports a blocker", async () => {
	writeFileSync(join(root, "new.txt"), "remaining\n"); writeFileSync(join(root, "later.txt"), "later group\n");
	const hook = join(root, ".git", "hooks", "pre-commit"); writeFileSync(hook, "#!/bin/sh\necho test-hook-failure >&2\nexit 1\n"); chmodSync(hook, 0o755);
	steps.push({ name: "submit_commit_plan", arguments: { repo: ".", commits: [{ subject: "failure", paths: ["new.txt"] }, { subject: "queued", paths: ["later.txt"] }], exclusions: [] } }, blocked("The hook requires a user decision; test-hook-failure"));
	await expect(run()).rejects.toThrow(/test-hook-failure[\s\S]*Stopped/);
	expect(git(root, "log", "-1", "--format=%s").trim()).toBe("baseline"); expect(git(root, "diff", "--cached", "--name-only").trim()).toBe("later.txt\nnew.txt");
	expect(execs.filter(args => args[2] === "commit")).toHaveLength(1);
});

it("repairs an ignore mutation without losing the operator's exclusion or running a queued plan", async () => {
	writeFileSync(join(root, "cache.txt"), "remaining\n"); mkdirSync(join(root, ".gitignore")); answers.push("Add to .gitignore");
	steps.push([ask("cache.txt"), plan("forbidden", ["cache.txt"])], bash("rmdir .gitignore && printf 'cache.txt\\n' > .gitignore"), plan("ignore cache", [".gitignore"], ".", [{ path: "cache.txt", reason: "Operator chose Add to .gitignore" }]));
	const stream = provider.stream.getMockImplementation()!;
	provider.stream.mockImplementation((model, context, options) => {
		if (!steps.length) throw new Error(`Unexpected review continuation: ${JSON.stringify(context.messages.filter(message => message.role === "toolResult"))}`);
		return stream(model, context, options);
	});
	const report = await run();
	expect(git(root, "show", "HEAD:.gitignore")).toBe("cache.txt\n"); expect(git(root, "ls-files", "cache.txt")).toBe("");
	expect(readFileSync(join(root, "cache.txt"), "utf8")).toBe("remaining\n"); expect(report.text).toContain("Left out: cache.txt");
	expect(git(root, "log", "--format=%s")).not.toContain("forbidden");
}, 45_000);

it("cancels an ignore question retaining already staged work", async () => {
	writeFileSync(join(root, "cache.txt"), "remaining\n"); steps.push(ask("cache.txt"), plan("forbidden", ["cache.txt"]));
	await expect(run()).rejects.toThrow("Ignore-file decision cancelled"); expect(git(root, "diff", "--cached", "--name-only").trim()).toBe("cache.txt");
});

it("does not publish or report success when staged files remain without a submitted plan", async () => {
	writeFileSync(join(root, "uncommitted.txt"), "must remain staged\n"); git(root, "add", "uncommitted.txt"); const before = git(root, "rev-parse", "HEAD");
	steps.push(blocked("Cannot resolve the remaining uncommitted.txt changes without user intent"));
	const error = await run(true).catch(error => error as Error);
	expect(error).toBeInstanceOf(Error); expect(String(error)).toContain("Commit blocked:"); expect(String(error)).toContain("No commits created."); expect(String(error)).not.toContain("Pushed.");
	expect(execs.some(args => args[2] === "push" || args[2] === "pull")).toBe(false); expect(git(root, "rev-parse", "HEAD")).toBe(before);
	expect(git(root, "diff", "--cached", "--name-only").trim()).toBe("uncommitted.txt"); expect(readFileSync(join(root, "uncommitted.txt"), "utf8")).toBe("must remain staged\n");
});

it("corrects an invalid plan before committing and publishing through code", async () => {
	const remote = join(root, ".git", "remote.git"); git(root, "init", "--quiet", "--bare", remote); git(root, "remote", "add", "origin", remote);
	writeFileSync(join(root, "new.txt"), "reviewed\n"); steps.push(plan("invalid", ["missing.txt"]), plan("corrected", ["new.txt"]));
	const report = await run(true); expect(results[0]?.isError).toBe(true); expect(JSON.stringify(results[0]?.content)).toContain("Missing path");
	expect(git(root, "log", "-1", "--format=%s").trim()).toBe("corrected"); expect(report.text).toContain("Pushed.");
	expect(git(remote, "rev-parse", "refs/heads/main")).toBe(git(root, "rev-parse", "HEAD"));
	expect(execs.findIndex(args => args[2] === "commit")).toBeLessThan(execs.findIndex(args => args[2] === "push"));
});

it("rejects persistently invalid plans without commits, publication, or index changes", async () => {
	writeFileSync(join(root, "first.txt"), "first\n"); writeFileSync(join(root, "omitted.txt"), "second\n"); git(root, "add", "-A");
	const indexBefore = git(root, "write-tree"), headBefore = git(root, "rev-parse", "HEAD");
	steps.push(plan("partial", ["first.txt"]), plan("partial", ["first.txt"]), plan("partial", ["first.txt"]), blocked('Cannot decide inclusion: Missing path: "omitted.txt"'));
	await expect(run(true)).rejects.toThrow(/Commit blocked:[\s\S]*Missing path: "omitted.txt"/);
	expect(git(root, "write-tree")).toBe(indexBefore); expect(git(root, "rev-parse", "HEAD")).toBe(headBefore);
	expect(execs.some(args => args[2] === "commit" || args[2] === "push" || args[2] === "pull")).toBe(false); expect(provider.stream).toHaveBeenCalledTimes(4);
});

it("reports actual local-remote push results independently of completion wording", async () => {
	const remote = `${root}-publication-remote`;
	try {
		git(root, "init", "--quiet", "--bare", remote); git(root, "remote", "add", "origin", remote); completion = "Finished.\nDone";
		expect((await run(true)).text).toContain("Pushed."); expect(git(remote, "rev-parse", "refs/heads/main").trim()).toBe(git(root, "rev-parse", "HEAD").trim());
		git(root, "commit", "--quiet", "--allow-empty", "-m", "outgoing"); git(root, "remote", "set-url", "origin", `${remote}-missing`);
		steps.push(empty(), blocked("Publication remote is unavailable"));
		await expect(run(true)).rejects.toThrow(/Fetch before publication failed/);
	} finally { rmSync(remote, { recursive: true, force: true }); }
}, 30_000);

it("publishes the fetched branch even when a background fetch overwrites FETCH_HEAD", async () => {
	const remote = join(root, ".git", "race-remote.git"), seed = join(root, ".git", "race-seed");
	git(root, "init", "--quiet", "--bare", remote); git(root, "remote", "add", "origin", remote); git(root, "push", "--quiet", "-u", "origin", "main");
	git(root, "clone", "--quiet", remote, seed); git(seed, "config", "user.name", "Offline test"); git(seed, "config", "user.email", "offline@example.invalid");
	writeFileSync(join(seed, "remote.txt"), "remote work\n"); git(seed, "add", "-A"); git(seed, "commit", "--quiet", "-m", "remote work"); git(seed, "push", "--quiet");
	const remoteHead = git(seed, "rev-parse", "HEAD").trim();
	git(seed, "checkout", "--quiet", "-b", "background"); writeFileSync(join(seed, "unrelated.txt"), "other branch\n");
	git(seed, "add", "-A"); git(seed, "commit", "--quiet", "-m", "unrelated branch"); git(seed, "push", "--quiet", "origin", "background");
	const backgroundHead = git(seed, "rev-parse", "HEAD").trim();
	writeFileSync(join(root, "local.txt"), "local work\n"); git(root, "add", "-A"); git(root, "commit", "--quiet", "-m", "local work");
	const localHead = git(root, "rev-parse", "HEAD").trim(), execute = pi.exec.bind(pi);
	let overwroteFetchHead = false;
	const spy = vi.spyOn(pi, "exec").mockImplementation(async (command, args, options) => {
		const result = await execute(command, args, options);
		if (args[2] === "fetch" && result.code === 0) {
			git(root, "fetch", "--quiet", "origin", "background");
			overwroteFetchHead = true;
		}
		return result;
	});
	try {
		const report = await run(true);
		expect(execs.some(args => args[2] === "pull")).toBe(false);
		expect(overwroteFetchHead).toBe(true);
		expect(readFileSync(join(root, ".git", "FETCH_HEAD"), "utf8")).toContain(backgroundHead);
		expect(git(root, "log", "-1", "--format=%P").trim().split(" ")).toEqual([localHead, remoteHead]);
		expect(git(root, "ls-tree", "--name-only", "HEAD")).not.toContain("unrelated.txt");
		expect(git(remote, "rev-parse", "main")).toBe(git(root, "rev-parse", "HEAD"));
		expect(report.text).toContain("Pushed.");
	} finally { spy.mockRestore(); }
}, 30_000);

it("merges real Git divergence before publishing and resolves an established conflict through temporary bash", async () => {
	const remote = `${root}-divergence-remote`;
	try {
		git(root, "init", "--quiet", "--bare", remote); git(root, "remote", "add", "origin", remote); git(root, "push", "--quiet", "-u", "origin", "main");
		const seed = `${root}-seed`;
		try {
			git(root, "clone", "--quiet", remote, seed); git(seed, "config", "user.name", "Offline test"); git(seed, "config", "user.email", "offline@example.invalid");
			writeFileSync(join(seed, "remote.txt"), "remote\n"); git(seed, "add", "-A"); git(seed, "commit", "--quiet", "-m", "remote divergence"); git(seed, "push", "--quiet");
		} finally { rmSync(seed, { recursive: true, force: true }); }
		writeFileSync(join(root, "local.txt"), "local\n"); git(root, "add", "-A"); git(root, "commit", "--quiet", "-m", "local divergence"); git(root, "config", "pull.ff", "only");
		await run(true); expect(git(root, "log", "-1", "--format=%P").trim().split(" ")).toHaveLength(2);
		expect(git(remote, "rev-parse", "refs/heads/main").trim()).toBe(git(root, "rev-parse", "HEAD").trim());
		const conflictSeed = `${root}-conflict-seed`;
		try {
			git(root, "clone", "--quiet", remote, conflictSeed); git(conflictSeed, "config", "user.name", "Offline test"); git(conflictSeed, "config", "user.email", "offline@example.invalid");
			writeFileSync(join(conflictSeed, "base.txt"), "remote conflict\n"); git(conflictSeed, "add", "-A"); git(conflictSeed, "commit", "--quiet", "-m", "remote conflict"); git(conflictSeed, "push", "--quiet");
		} finally { rmSync(conflictSeed, { recursive: true, force: true }); }
		writeFileSync(join(root, "base.txt"), "local conflict\n"); git(root, "add", "-A"); git(root, "commit", "--quiet", "-m", "local conflict");
		steps.push(empty(), inspect("git diff --name-only --diff-filter=U"), bash("git add base.txt && git commit -m 'resolve pull conflict'"));
		await run(true); expect(JSON.stringify(results.map(result => result.content))).toContain("base.txt");
		expect(git(root, "status", "--porcelain")).toBe(""); expect(git(root, "log", "-1", "--format=%P").trim().split(" ")).toHaveLength(2);
		expect(git(remote, "rev-parse", "refs/heads/main").trim()).toBe(git(root, "rev-parse", "HEAD").trim());
		expect(toolSets.some(tools => tools.includes("bash") && !tools.includes("submit_commit_plan") && !tools.includes("ask_ignore"))).toBe(true);
	} finally { rmSync(remote, { recursive: true, force: true }); }
}, 30_000);

it.each([false, true])("includes runner-staged parent gitlinks in the reviewed plan before publication (push=%s)", async push => {
	const { child } = submoduleFixture(); const remotes = push ? publicationFixture(child) : undefined;
	const originalPin = git(root, "rev-parse", "HEAD:modules/child").trim();
	writeFileSync(join(child, "new.txt"), "child change\n"); writeFileSync(join(root, "base.txt"), "parent change\n");
	steps.push(plan("child-change", ["new.txt"], "modules/child"), inspect("git diff --cached -- modules/child"),
		{ name: "submit_commit_plan", arguments: { repo: ".", commits: [{ subject: "parent-change", paths: ["base.txt"] }, { subject: "parent-pin", paths: ["modules/child"] }], exclusions: [] } });
	const report = await run(push); const childHead = git(child, "rev-parse", "HEAD").trim();
	expect(git(root, "rev-parse", "HEAD~1:modules/child").trim()).toBe(originalPin); expect(git(root, "rev-parse", "HEAD:modules/child").trim()).toBe(childHead);
	expect(JSON.stringify(results.map(result => result.content))).toContain(`+Subproject commit ${childHead}`);
	expect(git(root, "status", "--porcelain")).toBe(""); expect(report.text).toContain("parent-pin");
	if (remotes) {
		expect(report.text).toContain("Pushed."); expect(git(remotes.childRemote, "rev-parse", "refs/heads/main").trim()).toBe(childHead);
		expect(git(remotes.parentRemote, "rev-parse", "main:modules/child").trim()).toBe(childHead); expect(execs.filter(args => args[2] === "push").map(args => args[1])).toEqual([child, root]);
	} else expect(execs.some(args => /^(branch|pull|push|remote|ls-remote)$/.test(args[2] ?? ""))).toBe(false);
}, 45_000);

it("propagates nested gitlinks deepest-first without committing unreviewed pointers", async () => {
	const { source, child } = submoduleFixture(); const grandSource = join(root, ".git", "grand-source"); mkdirSync(grandSource); init(grandSource);
	git(source, "-c", "protocol.file.allow=always", "submodule", "add", "--quiet", grandSource, "deps/grand"); git(source, "commit", "--quiet", "-am", "grandchild baseline");
	git(child, "pull", "--quiet", "--ff-only"); git(child, "-c", "protocol.file.allow=always", "submodule", "update", "--init", "--recursive");
	git(root, "add", "modules/child"); git(root, "commit", "--quiet", "-m", "nested baseline");
	const grand = realpathSync(join(child, "deps/grand")); git(grand, "config", "user.name", "Offline test"); git(grand, "config", "user.email", "offline@example.invalid");
	writeFileSync(join(grand, "base.txt"), "grandchild work\n");
	steps.push(plan("grand-change", ["base.txt"], "modules/child/deps/grand"), inspect(inRepo(child, "diff --cached -- deps/grand")), plan("child-pin", ["deps/grand"], "modules/child"),
		inspect("git diff --cached -- modules/child"), plan("root-pin", ["modules/child"]));
	const report = await run();
	expect(git(child, "rev-parse", "HEAD:deps/grand").trim()).toBe(git(grand, "rev-parse", "HEAD").trim()); expect(git(root, "rev-parse", "HEAD:modules/child").trim()).toBe(git(child, "rev-parse", "HEAD").trim());
	expect(report.text.indexOf("grand-change")).toBeLessThan(report.text.indexOf("child-pin")); expect(report.text.indexOf("child-pin")).toBeLessThan(report.text.indexOf("root-pin")); expect(git(root, "status", "--porcelain")).toBe("");
}, 45_000);

it("pins and publishes the child HEAD produced by a publication pull merge", async () => {
	const { source, child } = submoduleFixture(); const { childRemote, parentRemote } = publicationFixture(child);
	git(child, "push", "--quiet", "origin", "main"); git(source, "remote", "add", "publication", childRemote);
	writeFileSync(join(source, "remote.txt"), "remote work\n"); git(source, "add", "-A"); git(source, "commit", "--quiet", "-m", "remote work"); git(source, "push", "--quiet", "publication", "main");
	writeFileSync(join(child, "local.txt"), "local work\n"); git(child, "add", "-A"); git(child, "commit", "--quiet", "-m", "local work"); const prePullHead = git(child, "rev-parse", "HEAD").trim();
	steps.push(empty("modules/child"), inspect("git diff --cached -- modules/child"), plan("integrated-child-pin", ["modules/child"]));
	const report = await run(true); const integratedHead = git(child, "rev-parse", "HEAD").trim();
	expect(integratedHead).not.toBe(prePullHead); expect(git(child, "log", "-1", "--format=%P").trim().split(" ")).toHaveLength(2);
	expect(git(root, "rev-parse", "HEAD:modules/child").trim()).toBe(integratedHead); expect(git(childRemote, "rev-parse", "main").trim()).toBe(integratedHead);
	expect(git(parentRemote, "rev-parse", "main:modules/child").trim()).toBe(integratedHead); expect(report.text).toContain("integrated-child-pin"); expect(report.text).toContain("Pushed.");
}, 45_000);

it("preserves a distinct index-only gitlink for review before committing the working pointer", async () => {
	const { child } = submoduleFixture(); git(child, "commit", "--quiet", "--allow-empty", "-m", "index-only child"); git(root, "add", "modules/child");
	const indexedHead = git(child, "rev-parse", "HEAD").trim(); git(child, "commit", "--quiet", "--allow-empty", "-m", "working child");
	steps.push(empty("modules/child"), inspect("git diff 'stash@{0}^1' 'stash@{0}^2' -- modules/child"), plan("parent-pin", ["modules/child"]));
	const report = await run(); expect(JSON.stringify(results.map(result => result.content))).toContain(`+Subproject commit ${indexedHead}`);
	expect(report.text).toContain("Preserved index content:"); expect(git(child, "rev-parse", "HEAD^").trim()).toBe(indexedHead);
	expect(git(root, "rev-parse", "HEAD:modules/child").trim()).toBe(git(child, "rev-parse", "HEAD").trim());
}, 45_000);

it("does not infer publication from the model's completion wording for an up-to-date remote", async () => {
	const remote = join(root, ".git", "up-to-date.git");
	git(root, "init", "--quiet", "--bare", remote); git(root, "remote", "add", "origin", remote); git(root, "push", "--quiet", "-u", "origin", "main");
	completion = "Pushed";
	const report = await run(true); expect(report.text).toContain("No pushes performed."); expect(report.text).not.toContain("Pushed.");
	expect(execs.some(args => args[2] === "push" || args[2] === "pull")).toBe(false);
});

it("does not infer publication from the model's completion wording for detached HEAD", async () => {
	git(root, "checkout", "--quiet", "--detach"); completion = "Pushed";
	const report = await run(true); expect(report.text).not.toContain("Pushed."); expect(execs.some(args => args[2] === "push" || args[2] === "for-each-ref")).toBe(false);
});

it.each([false, true])("commits child before parent gitlink and publishes clean outgoing children only on request (push=%s)", async push => {
	const { child } = submoduleFixture(); const { childRemote, parentRemote } = publicationFixture(child); git(child, "checkout", "--quiet", "-b", "work");
	const childId = "modules/child", nativeToolId = process.platform === "win32" ? "modules\\child" : childId;
	writeFileSync(join(child, "new.txt"), "child change\n"); writeFileSync(join(child, "cache.txt"), "generated child cache\n"); answers.push("Add to .gitignore");
	steps.push(inspect(inRepo(child, "diff --cached")), { name: "ask_ignore", arguments: { ...ask("cache.txt").arguments, repo: push ? nativeToolId : childId } },
		plan("child-change", [".gitignore", "new.txt"], childId), inspect("git diff --cached"), plan("parent-pin", [childId]));
	completion = "Finished publishing.\nDone"; const report = await run(push);
	if (push) expect(report.text).toContain("Pushed.");
	expect(JSON.stringify(provider.stream.mock.calls[0][1].messages)).toContain(`Repository: ${childId}`); expect(report.text).toContain(`child-change (${childId})`);
	expect(report.text).toContain(`Left out: ${childId}/cache.txt`); expect(git(child, "show", "HEAD:.gitignore").trim()).toBe("cache.txt");
	expect(git(root, "rev-parse", `HEAD:${childId}`).trim()).toBe(git(child, "rev-parse", "HEAD").trim());
	if (push) {
		expect(git(childRemote, "rev-parse", "refs/heads/work").trim()).toBe(git(child, "rev-parse", "HEAD").trim());
		git(child, "commit", "--quiet", "--allow-empty", "-m", "outgoing"); git(root, "add", childId); git(root, "commit", "--quiet", "-m", "outgoing pin");
		steps.push(empty(nativeToolId), empty()); await run(true);
		expect(git(childRemote, "rev-parse", "refs/heads/work").trim()).toBe(git(child, "rev-parse", "HEAD").trim()); const publishedParent = git(parentRemote, "rev-parse", "refs/heads/main").trim();
		git(child, "commit", "--quiet", "--allow-empty", "-m", "unpublished"); git(root, "add", childId); git(root, "commit", "--quiet", "-m", "unpublished pin");
		git(child, "remote", "set-url", "origin", join(root, ".git", "missing")); steps.push(empty(childId), blocked("Child publication remote is unavailable")); await expect(run(true)).rejects.toThrow(/Stopped/);
		expect(git(parentRemote, "rev-parse", "refs/heads/main").trim()).toBe(publishedParent);
	} else expect(execs.some(args => args[2] === "branch")).toBe(false);
}, 45_000);
