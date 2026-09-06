import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import workflowCommands from "../extensions/workflow-commands.js";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.js";

vi.mock("../lib/workflow-friction", () => ({ noteWorkflowSubmission: vi.fn() }));
vi.mock("../lib/workflow-telemetry", () => ({ startWorkflowEpisode: vi.fn() }));

const roots: string[] = [];
const planPath = ".specs/startup/plan.md";
const original = `---
status: ready
---
## Tasks
- [ ] **T1: Implement fixture**
  - Verify: deterministic Check the fixture.
- [ ] **T2: Evaluate fixture**
  - Depends on: T1
  - Verify: live Observe results, then settle children, and then clean owned fixtures.
  - Max attempts: 1
  - Session: disposable fixture
  - Terminal outcomes: supported | rejected | blocked
## Live attempt ledger
| Task | Attempt | Preconditions | Result | Cleanup | Disposition |
| --- | --- | --- | --- | --- | --- |
`;
const reviewed = original.replace("Implement fixture", "Implement reviewed fixture");

function git(cwd: string, args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
}

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-workflow-startup-"));
	roots.push(root);
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["config", "user.name", "Workflow Test"]);
	git(root, ["config", "user.email", "workflow@example.invalid"]);
	git(root, ["config", "core.autocrlf", "false"]);
	fs.mkdirSync(path.dirname(path.join(root, planPath)), { recursive: true });
	fs.writeFileSync(path.join(root, planPath), original);
	fs.writeFileSync(path.join(root, ".gitignore"), ".worktrees/\n");
	git(root, ["add", "."]);
	git(root, ["commit", "-qm", "fixture baseline"]);
	return root;
}

function runtime(root: string, session = SessionManager.inMemory(root)) {
	const pi = createMockPi();
	pi.exec.mockImplementation(async (command, args = [], options) => {
		if (command !== "git") throw new Error(`Unexpected command: ${command}`);
		try {
			return { code: 0, stdout: git(options.cwd, args), stderr: "" };
		} catch (error) {
			const result = error as { status: number; stdout: string; stderr: string };
			return { code: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
		}
	});
	pi.appendEntry.mockImplementation(async (type, data) => { session.appendCustomEntry(type, data); });
	const failureHost = {
		isStreaming: false,
		_pendingNextTurnMessages: [],
		_appendCustomMessage: (message: any) => session.appendCustomMessageEntry(message.customType, message.content, message.display),
	};
	pi.sendMessage.mockImplementation((message, options) => {
		if (message.customType === "workflow.plan-preflight")
			void AgentSession.prototype.sendCustomMessage.call(failureHost as unknown as AgentSession, message, options);
	});
	workflowCommands(pi as Parameters<typeof workflowCommands>[0]);
	const ctx = createMockCtx({ cwd: root, mode: "tui", sessionManager: session });
	return {
		pi, ctx, session,
		run: (args = planPath, extra = {}) => pi._commands.find((item) => item.name === "do-it")!.handler(args, { ...ctx, ...extra }),
		start: () => pi._getHook("session_start")[0].handler({ reason: "new" }, ctx),
	};
}

afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("do-it startup through real Git and session replacement", () => {
	it("keeps failed setup in context, reconciles its untouched worktree, and dispatches the reviewed plan once after clear", async () => {
		const root = fixture();
		fs.writeFileSync(path.join(root, planPath), reviewed);
		git(root, ["add", planPath]);
		const old = runtime(root);
		const nextSession = SessionManager.inMemory(root);
		let replacement: ReturnType<typeof runtime> | undefined;
		const newSession = vi.fn(async (options) => {
			// Everything needed to start must be ready before the old context is cleared.
			expect(fs.readFileSync(path.join(root, ".worktrees/startup", planPath), "utf8")).toBe(reviewed);
			expect(fs.readFileSync(path.join(root, planPath), "utf8")).toBe(original);
			await options.setup(nextSession);
			replacement = runtime(root, nextSession);
			await replacement.start();
			return { cancelled: false };
		});

		await old.run(planPath, { newSession });
		expect(newSession).not.toHaveBeenCalled();
		expect(old.session.getBranch()).toEqual(expect.arrayContaining([expect.objectContaining({
			type: "custom_message", customType: "workflow.plan-preflight", display: true,
			content: expect.stringContaining(planPath),
		})]));
		expect(old.pi.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
			customType: "workflow.plan-preflight",
			content: expect.stringContaining(planPath),
		}), expect.anything());
		expect(fs.readFileSync(path.join(root, planPath), "utf8")).toBe(reviewed);
		// Preserve working bytes while removing the fixture's staged change.
		git(root, ["reset", "-q", "HEAD", "--", planPath]);
		await old.run(planPath, { newSession });
		expect(newSession).toHaveBeenCalledOnce();
		expect(old.pi.sendMessage.mock.calls.filter(([message]) => message.customType === "workflow.hiddenPrompt")).toHaveLength(0);
		expect(replacement).toBeDefined();
		expect(replacement!.pi.sendMessage.mock.calls.filter(([message]) => message.customType === "workflow.hiddenPrompt")).toHaveLength(1);
		await replacement!.start();
		expect(replacement!.pi.sendMessage.mock.calls.filter(([message]) => message.customType === "workflow.hiddenPrompt")).toHaveLength(1);
		expect(git(root, ["status", "--porcelain=v1"])).toBe("");
	});

	it("resumes the owned ledger and refuses to overwrite it with divergent primary edits", async () => {
		const root = fixture();
		const first = runtime(root);
		await first.run(`--no-clear ${planPath}`);
		const target = path.join(root, ".worktrees/startup", planPath);
		const progress = original.replace("[ ] **T1:", "[x] **T1:");
		fs.writeFileSync(target, progress);
		const resumed = runtime(root);
		await resumed.run(`--no-clear ${planPath}`);
		expect(resumed.pi.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ customType: "workflow.hiddenPrompt" }), expect.anything());
		expect(fs.readFileSync(target, "utf8")).toBe(progress);

		fs.writeFileSync(path.join(root, planPath), reviewed);
		const conflicting = runtime(root);
		const newSession = vi.fn();
		await conflicting.run(planPath, { newSession });
		expect(newSession).not.toHaveBeenCalled();
		const diagnostic = conflicting.pi.sendMessage.mock.calls.find(([message]) => message.customType === "workflow.plan-preflight")?.[0].content;
		expect(diagnostic).toContain("diverged");
		expect(diagnostic).toContain(target);
		expect(diagnostic).toContain(path.join(root, planPath));
		expect(fs.readFileSync(target, "utf8")).toBe(progress);
		expect(fs.readFileSync(path.join(root, planPath), "utf8")).toBe(reviewed);
	});

	it("does not restore an obsolete owned baseline over newer primary commits", async () => {
		const root = fixture();
		await runtime(root).run(`--no-clear ${planPath}`);
		const source = path.join(root, planPath);
		const target = path.join(root, ".worktrees/startup", planPath);
		fs.writeFileSync(source, reviewed);
		git(root, ["add", planPath]);
		git(root, ["commit", "-qm", "revise primary plan"]);
		const pending = `${reviewed}\nPending operator edit.\n`;
		fs.writeFileSync(source, pending);
		const attempt = runtime(root);
		const newSession = vi.fn();
		await attempt.run(planPath, { newSession });
		expect(newSession).not.toHaveBeenCalled();
		expect(attempt.pi.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
			customType: "workflow.plan-preflight", content: expect.stringContaining("baseline no longer match"),
		}), expect.anything());
		expect(fs.readFileSync(source, "utf8")).toBe(pending);
		expect(fs.readFileSync(target, "utf8")).toBe(original);
		expect(git(root, ["diff", "--cached", "--", planPath])).toBe("");
	});

	it.each(["tracked", "ignored"])("resumes %s archived plans after clear without recreating the active copy", async (sourceKind) => {
		const root = fixture();
		if (sourceKind === "ignored") {
			git(root, ["rm", "--cached", planPath]);
			fs.appendFileSync(path.join(root, ".gitignore"), ".specs/\n");
			git(root, ["add", ".gitignore"]);
			git(root, ["commit", "-qm", "keep plans local"]);
		}
		await runtime(root).run(`--no-clear ${planPath}`);
		const target = path.join(root, ".worktrees", "startup", planPath);
		const archive = path.join(root, ".worktrees", "startup", ".specs", "archive", "startup", "plan.md");
		const archived = original.replace("status: ready", "status: complete").replaceAll("[ ] **", "[x] **");
		fs.mkdirSync(path.dirname(archive), { recursive: true });
		fs.writeFileSync(archive, archived);
		fs.rmSync(target);
		const retry = runtime(root);
		const nextSession = SessionManager.inMemory(root);
		let replacement: ReturnType<typeof runtime> | undefined;
		await retry.run(planPath, { newSession: async (options: any) => {
			await options.setup(nextSession);
			replacement = runtime(root, nextSession);
			await replacement.start();
			return { cancelled: false };
		} });
		expect(replacement).toBeDefined();
		expect(fs.existsSync(target)).toBe(false);
		expect(fs.readFileSync(archive, "utf8")).toBe(archived);
		expect(fs.readFileSync(path.join(root, planPath), "utf8")).toBe(original);
		expect(replacement!.pi.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
			customType: "workflow.hiddenPrompt",
			content: expect.stringContaining("RECOVERY ONLY"),
		}), expect.anything());
		expect(replacement!.pi.getActiveTools()).toContain("plan_archive");
		expect(nextSession.getBranch()).toEqual(expect.arrayContaining([expect.objectContaining({
			type: "custom_message", customType: "workflow.do-it-receipt", display: true,
			content: expect.stringContaining("archive"),
		})]));
		expect(git(root, ["status", "--porcelain=v1"])).toBe("");
	});

	it("preserves the plan's Retention policy across handoff without an ownership override", async () => {
		const root = fixture();
		fs.appendFileSync(path.join(root, planPath), "\n## Retention\n- Closeout: Retain the committed workflow branch and worktree; do not merge into the primary branch.\n");
		git(root, ["add", planPath]);
		git(root, ["commit", "-qm", "retain fixture workflow"]);
		const nextSession = SessionManager.inMemory(root);
		let replacement: ReturnType<typeof runtime> | undefined;
		await runtime(root).run(planPath, { newSession: async (options: any) => {
			await options.setup(nextSession);
			replacement = runtime(root, nextSession);
			await replacement.start();
			return { cancelled: false };
		} });
		expect(replacement).toBeDefined();
		expect(replacement!.pi.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
			customType: "workflow.hiddenPrompt", content: expect.stringContaining("do not merge the workflow branch"),
		}), expect.anything());
		expect(nextSession.getBranch()).toEqual(expect.arrayContaining([expect.objectContaining({
			type: "custom_message", customType: "workflow.do-it-receipt", display: true,
			content: expect.stringContaining("closeout=retain"),
		})]));
	});

	it("does not clear on cancellation and asks for an empty task before setup", async () => {
		const root = fixture();
		const empty = runtime(root);
		const newSession = vi.fn();
		await empty.run("", { newSession });
		expect(newSession).not.toHaveBeenCalled();
		expect(fs.existsSync(path.join(root, ".worktrees"))).toBe(false);
		expect(empty.pi.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ customType: "workflow.do-it-receipt" }), expect.anything());
		expect(empty.ctx.ui.notify).toHaveBeenCalledWith("What should I do? Describe the task.", "info");

		const cancelled = runtime(root);
		await cancelled.run(planPath, { newSession: vi.fn(async (options: any) => {
			await options.setup(SessionManager.inMemory(root));
			return { cancelled: true };
		}) });
		expect(cancelled.pi.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
			customType: "workflow.plan-preflight",
			content: expect.stringContaining("Execution was not dispatched because session replacement was cancelled"),
		}), expect.anything());
		expect(cancelled.pi.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ customType: "workflow.hiddenPrompt" }), expect.anything());
		expect(fs.existsSync(path.join(root, ".worktrees", "startup.workflow.json"))).toBe(true);
		expect(fs.readFileSync(path.join(root, ".worktrees", "startup", planPath), "utf8")).toBe(original);
	});

	it.each(["active", "archived"])("does not dispatch changed %s plan bytes after session replacement", async (location) => {
		const root = fixture();
		let executionPath = path.join(root, ".worktrees/startup", planPath);
		if (location === "archived") {
			await runtime(root).run(`--no-clear ${planPath}`);
			const archive = path.join(root, ".worktrees/startup/.specs/archive/startup/plan.md");
			fs.mkdirSync(path.dirname(archive), { recursive: true });
			fs.writeFileSync(archive, original.replace("status: ready", "status: complete").replaceAll("[ ] **", "[x] **"));
			fs.rmSync(executionPath);
			executionPath = archive;
		}
		const old = runtime(root);
		const nextSession = SessionManager.inMemory(root);
		let replacement: ReturnType<typeof runtime> | undefined;
		await old.run(planPath, { newSession: async (options: any) => {
			await options.setup(nextSession);
			fs.writeFileSync(executionPath, reviewed);
			replacement = runtime(root, nextSession);
			await replacement.start();
			return { cancelled: false };
		} });
		expect(replacement).toBeDefined();
		expect(replacement!.pi.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
			customType: "workflow.plan-preflight", content: expect.stringContaining("changed after preparation"),
		}), expect.anything());
		expect(replacement!.pi.sendMessage.mock.calls.filter(([message]) => message.customType === "workflow.hiddenPrompt")).toHaveLength(0);
		await replacement!.start();
		expect(replacement!.pi.sendMessage).toHaveBeenCalledTimes(1);
	});
});
