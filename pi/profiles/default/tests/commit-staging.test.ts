import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execFileSync, execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssistantMessageEventStream, type AssistantMessage, type Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { runCommitReviewer } from "../commands/commit/reviewer.ts";

// Real Agent, native bash/read tools, and real temporary Git indexes. Only the
// provider and operator's dialog answer are deterministic fixtures.
const provider = vi.hoisted(() => ({ stream: vi.fn<ModelRuntime["streamSimple"]>() }));
vi.mock("../lib/model-runtime.ts", () => ({ createProfileModelRuntime: async () => ({
	getAvailable: async () => [model], streamSimple: provider.stream,
}) }));
const model: Model<"openai-codex-responses"> = {
	id: "gpt-6-luna", name: "offline", api: "openai-codex-responses", provider: "openai-codex", baseUrl: "https://unused.invalid",
	reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 10000, maxTokens: 1000,
};
type Call = { name: string; arguments: Record<string, string> };
let root: string;
let steps: Array<Call | Call[]>;
let results: Array<{ toolName: string; content: unknown; isError?: boolean }>;
let answers: string[];
let commands: string[];
let execs: string[][];
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 15000, windowsHide: true });
const bash = (command: string): Call => ({ name: "bash", arguments: { command } });
const inRepo = (cwd: string, command: string) => `git -C '${cwd.replace(/\\/g, "/")}' ${command}`;
const ask = (candidate: string): Call => ({ name: "ask_ignore", arguments: { repo: ".", candidate, reason: "Generated cache with uncertain repository policy", pattern: candidate } });
function init(cwd: string) {
	git(cwd, "init", "--quiet", "-b", "main");
	git(cwd, "config", "user.name", "Offline test"); git(cwd, "config", "user.email", "offline@example.invalid");
	git(cwd, "config", "core.autocrlf", "false");
	writeFileSync(join(cwd, "base.txt"), "base\n"); git(cwd, "add", "-A"); git(cwd, "commit", "--quiet", "-m", "baseline");
}
beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "commit-staging-")));
	init(root); steps = []; results = []; answers = []; commands = []; execs = [];
	provider.stream.mockReset().mockImplementation((_model, context) => {
		results = context.messages.filter(m => m.role === "toolResult") as typeof results;
		const step = steps.shift();
		const calls = step ? (Array.isArray(step) ? step : [step]) : [];
		for (const call of calls) if (call.name === "bash") commands.push(String(call.arguments.command));
		const message: AssistantMessage = {
			role: "assistant", content: calls.length ? calls.map((call, index) => ({ type: "toolCall", id: `call-${commands.length}-${index}`, ...call })) : [{ type: "text", text: "Pushed" }],
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
function run(push = false, signal?: AbortSignal) {
	const ctx = { cwd: root, hasUI: true, ui: { select: async () => answers.shift() } } as unknown as ExtensionContext;
	return runCommitReviewer(pi, ctx, push, signal);
}

it("stages before review, includes staged new files, and forms whole-file groups by unstage/restage", async () => {
	writeFileSync(join(root, "base.txt"), "edited\n"); git(root, "add", "base.txt");
	writeFileSync(join(root, "new.txt"), "new staged contents\n");
	steps.push(bash("git add -A"), bash("git diff --cached"), bash("git restore --staged -- ."),
		bash("git add -- base.txt"), bash("git commit -m first"), bash("git add -- new.txt"), bash("git commit -m second"));
	const report = await run();
	expect(JSON.stringify(results[1]?.content)).toContain("new staged contents");
	expect(git(root, "log", "-2", "--format=%s").trim()).toBe("second\nfirst");
	expect(git(root, "show", "HEAD~1", "--format=", "--name-only").trim()).toBe("base.txt");
	expect(readFileSync(join(root, "new.txt"), "utf8")).toBe("new staged contents\n");
	expect(report.text).toContain("first");
	expect(execs.some(args => /branch|remote|push/.test(args[2] ?? ""))).toBe(false);
});

it.each(["Include in commit", "Add to .gitignore", "Leave untracked"])("applies post-stage decision: %s without deleting contents", async answer => {
	writeFileSync(join(root, "cache.txt"), "cache data\n"); answers.push(answer);
	steps.push(bash("git add -A"), bash("git diff --cached"), ask("cache.txt"));
	if (answer !== "Leave untracked") steps.push(bash("git commit -m decision"));
	const report = await run();
	expect(JSON.stringify(results[1]?.content)).toContain("cache data");
	expect(readFileSync(join(root, "cache.txt"), "utf8")).toBe("cache data\n");
	if (answer === "Include in commit") expect(git(root, "ls-files", "cache.txt").trim()).toBe("cache.txt");
	else {
		expect(git(root, "ls-files", "cache.txt")).toBe(""); expect(report.text).toContain("Left out: cache.txt");
		if (answer === "Add to .gitignore") expect(git(root, "show", "HEAD:.gitignore").trim()).toBe("cache.txt");
		else expect(git(root, "status", "--short")).toContain("?? cache.txt");
	}
});

it("preserves sole index content with normal Git before blanket staging", async () => {
	writeFileSync(join(root, "base.txt"), "index-only\n"); git(root, "add", "base.txt"); writeFileSync(join(root, "base.txt"), "working copy\n");
	steps.push(bash('oid=$(git stash create) && git stash store -m "Pre-commit index content" "$oid"'), bash("git add -A"), bash("git diff --cached"), bash("git commit -m working"));
	await run();
	expect(git(root, "show", "stash@{0}^2:base.txt")).toBe("index-only\n");
	expect(readFileSync(join(root, "base.txt"), "utf8")).toBe("working copy\n");
});

it("recovers a bad inspection and no-match, allowing discovery and corrected Git inspection", async () => {
	steps.push(bash("git diff --invalid-inspection-option"), bash("git diff --cached"), bash("grep no-such-match base.txt"), bash("find . -name base.txt"),
		{ name: "read", arguments: { path: "missing-file.txt" } }, { name: "read", arguments: { path: "base.txt" } }, bash("git add -A"));
	await run(); expect(results[0]?.isError).toBe(true); expect(results[1]?.isError).toBe(false);
	expect(results[2]?.isError).toBe(true); expect(results[4]?.isError).toBe(true); expect(results[5]?.isError).toBe(false); expect(commands).toHaveLength(5);
});

it.each(["add -- nonexistent.txt", "restore --staged -- nonexistent.txt", "commit -m empty", "push --recurse-submodules=no nonexistent HEAD:refs/heads/main"])("stops on failed mutation and blocks queued mutations: %s", async operation => {
	writeFileSync(join(root, "new.txt"), "remaining\n");
	steps.push([bash(`git ${operation}`), bash("git add -A")]);
	await expect(run()).rejects.toThrow(/Stopped; existing commits and changes were not undone/);
	expect(git(root, "ls-files", "new.txt")).toBe("");
});

it("stops a failed hook without running a queued commit", async () => {
	writeFileSync(join(root, "new.txt"), "remaining\n");
	const hook = join(root, ".git", "hooks", "pre-commit");
	writeFileSync(hook, "#!/bin/sh\necho test-hook-failure >&2\nexit 1\n"); chmodSync(hook, 0o755);
	steps.push(bash("git add -A"), [bash("git commit -m failure"), bash("git commit -m queued")]);
	await expect(run()).rejects.toThrow(/Stopped/);
	expect(git(root, "log", "-1", "--format=%s").trim()).toBe("baseline");
	expect(git(root, "diff", "--cached", "--name-only").trim()).toBe("new.txt");
});

it("stops failed ignore-file mutation before queued Git mutations", async () => {
	writeFileSync(join(root, "cache.txt"), "remaining\n"); mkdirSync(join(root, ".gitignore")); answers.push("Add to .gitignore");
	steps.push(bash("git add -A"), [ask("cache.txt"), bash("git commit -m forbidden")]);
	await expect(run()).rejects.toThrow(/Stopped/);
	expect(git(root, "diff", "--cached", "--name-only").trim()).toBe("cache.txt");
	expect(git(root, "log", "-1", "--format=%s").trim()).toBe("baseline");
});

it("cancels an ignore question retaining already staged work", async () => {
	writeFileSync(join(root, "cache.txt"), "remaining\n");
	steps.push(bash("git add -A"), ask("cache.txt"), bash("git commit -m forbidden"));
	await expect(run()).rejects.toThrow("Ignore-file decision cancelled");
	expect(git(root, "diff", "--cached", "--name-only").trim()).toBe("cache.txt");
});

it.each([false, true])("commits child before parent gitlink and publishes clean outgoing children only on request (push=%s)", async push => {
	const source = join(root, "..", `${root.split(/[\\/]/).at(-1)}-child`);
	const childRemote = `${source}-remote`; const parentRemote = `${source}-parent`;
	try {
		git(root, "init", "--quiet", source); init(source);
		git(root, "-c", "protocol.file.allow=always", "submodule", "add", "--quiet", source, "child");
		git(root, "commit", "--quiet", "-am", "child baseline");
		const child = realpathSync(join(root, "child")); git(child, "checkout", "--quiet", "-b", "work");
		git(child, "config", "user.name", "Offline"); git(child, "config", "user.email", "offline@example.invalid");
		git(root, "init", "--quiet", "--bare", childRemote); git(root, "init", "--quiet", "--bare", parentRemote);
		git(child, "remote", "set-url", "origin", childRemote); git(root, "remote", "add", "origin", parentRemote);
		writeFileSync(join(child, "new.txt"), "child change\n");
		steps.push(bash(inRepo(child, "add -A")), bash(inRepo(child, "diff --cached")), bash(inRepo(child, "commit -m child-change")),
			bash("git add -A"), bash("git diff --cached"), bash("git commit -m parent-pin"));
		if (push) steps.push(bash(inRepo(child, "push --recurse-submodules=no origin HEAD:refs/heads/work")), bash("git push --recurse-submodules=no origin HEAD:refs/heads/main"));
		await run(push);
		expect(git(root, "rev-parse", "HEAD:child").trim()).toBe(git(child, "rev-parse", "HEAD").trim());
		if (push) {
			expect(git(childRemote, "rev-parse", "refs/heads/work").trim()).toBe(git(child, "rev-parse", "HEAD").trim());
			// No local changes, but the clean child's outgoing commit still publishes.
			git(child, "commit", "--quiet", "--allow-empty", "-m", "outgoing");
			git(root, "add", "child"); git(root, "commit", "--quiet", "-m", "outgoing pin");
			steps.push(bash(inRepo(child, "add -A")), bash(inRepo(child, "push --recurse-submodules=no origin HEAD:refs/heads/work")), bash("git add -A"), bash("git push --recurse-submodules=no origin HEAD:refs/heads/main"));
			await run(true);
			expect(git(childRemote, "rev-parse", "refs/heads/work").trim()).toBe(git(child, "rev-parse", "HEAD").trim());
			const publishedParent = git(parentRemote, "rev-parse", "refs/heads/main").trim();
			git(child, "commit", "--quiet", "--allow-empty", "-m", "unpublished");
			git(root, "add", "child"); git(root, "commit", "--quiet", "-m", "unpublished pin");
			git(child, "remote", "set-url", "origin", `${source}-missing`);
			steps.push([bash(inRepo(child, "push --recurse-submodules=no origin HEAD:refs/heads/work")), bash("git push --recurse-submodules=no origin HEAD:refs/heads/main")]);
			await expect(run(true)).rejects.toThrow(/Stopped/);
			expect(git(parentRemote, "rev-parse", "refs/heads/main").trim()).toBe(publishedParent);
		} else expect(execs.some(args => args[2] === "branch")).toBe(false);
	} finally { for (const path of [source, childRemote, parentRemote]) rmSync(path, { recursive: true, force: true }); }
}, 45_000);
