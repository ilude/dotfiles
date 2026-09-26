import { afterEach, expect, it, vi } from "vitest";
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BeforeAgentStartEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt, normalizeBuildSystemPromptOptions } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";
import { SessionManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";
import register, { createHerdrPiTab, HerdrPiTabLaunchError, parseNewInstanceArgs } from "../extensions/session-launch.ts";

vi.mock("node:child_process", () => ({ execFile: vi.fn(), spawnSync: vi.fn() }));

const roots: string[] = [];

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetAllMocks();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
	vi.stubEnv("HERDR_ENV", "1");
	vi.stubEnv("HERDR_WORKSPACE_ID", "w9");
	const commands: Record<string, any> = {};
	const tools: Record<string, any> = {};
	register({
		on: vi.fn(),
		registerCommand(n: string, c: any) { commands[n] = c; },
		registerEntryRenderer() {},
		registerTool(tool: any) { tools[tool.name] = tool; },
	} as any);
	const ctx = {
		cwd: process.cwd(), ui: { notify: vi.fn() },
		sessionManager: { getLeafId: () => "leaf", createBranchedSession: vi.fn(() => "C:/branch path/session.jsonl") },
	};
	vi.mocked(execFile).mockImplementation((_command: any, args: any, _options: any, callback: any) => {
		const stdout = args[0] === "pane"
			? JSON.stringify({ result: { pane: { pane_id: "w9:p1", workspace_id: "w9" } } })
			: args[0] === "plugin"
				? JSON.stringify({ result: { plugin_pane: { pane: { tab_id: "w9:t4", pane_id: "w9:p4" } } } })
				: "";
		callback(null, { stdout, stderr: "" });
		return {} as any;
	});
	vi.mocked(spawnSync).mockImplementation((_command: any, args: any) => ({
		status: 0,
		stdout: args[1] === "create" ? JSON.stringify({ result: { root_pane: { pane_id: "w9:p4" } } }) : "",
		stderr: "",
	}) as any);
	return { commands, tools, ctx };
}

function realBranchFixture() {
	vi.stubEnv("HERDR_ENV", "1");
	vi.stubEnv("HERDR_WORKSPACE_ID", "w9");
	const root = mkdtempSync(join(tmpdir(), "session-launch-"));
	roots.push(root);
	const parent = SessionManager.create(root, join(root, "sessions"));
	parent.appendMessage({ role: "user", content: [{ type: "text", text: "before branch" }], timestamp: Date.now() } as any);
	parent.appendMessage({
		role: "assistant", content: [{ type: "text", text: "checkpoint" }], provider: "fixture", model: "fixture", api: "fixture",
		usage: { input: 0, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop", timestamp: Date.now(),
	} as any);
	const commands: Record<string, any> = {};
	const renderers: Record<string, any> = {};
	const hooks = new Map<string, (event: BeforeAgentStartEvent, ctx: ExtensionContext) => void>();
	const pi = {
		on(name: string, handler: (event: BeforeAgentStartEvent, ctx: ExtensionContext) => void) { hooks.set(name, handler); },
		registerCommand(n: string, c: any) { commands[n] = c; },
		registerEntryRenderer(n: string, renderer: any) { renderers[n] = renderer; },
		registerTool() {},
		appendEntry(type: string, data: unknown) { parent.appendCustomEntry(type, data); },
	};
	register(pi as any);
	const ctx = { cwd: root, ui: { notify: vi.fn() }, sessionManager: parent };
	vi.mocked(execFile).mockImplementation((_command: any, args: any, _options: any, callback: any) => {
		const stdout = args[0] === "pane"
			? JSON.stringify({ result: { pane: { pane_id: "w9:p1", workspace_id: "w9" } } })
			: args[0] === "plugin"
				? JSON.stringify({ result: { plugin_pane: { pane: { tab_id: "w9:t4", pane_id: "w9:p4" } } } })
				: "";
		callback(null, { stdout, stderr: "" });
		return {} as any;
	});
	const promptOptions = normalizeBuildSystemPromptOptions({ cwd: root, sections: { unrelated: "preserve me" } });
	function promptFor(manager: SessionManager) {
		hooks.get("before_agent_start")!({
			type: "before_agent_start", prompt: "Discuss a different task", systemPrompt: buildSystemPrompt(promptOptions), systemPromptOptions: promptOptions,
		}, { sessionManager: manager } as unknown as ExtensionContext);
		return { section: promptOptions.sections.session_branch, prompt: buildSystemPrompt(promptOptions) };
	}
	return { commands, ctx, parent, renderers, promptFor };
}

it("parses fresh and resumed new-instance arguments", () => {
	expect(parseNewInstanceArgs("")).toEqual({});
	expect(parseNewInstanceArgs("review work")).toEqual({ title: "review work" });
	expect(parseNewInstanceArgs("--resume-notes")).toEqual({ title: "--resume-notes" });
	expect(parseNewInstanceArgs("--resume 01a0aab6-5334-72a3-bc6e-79cfb0a2a2ee resumed work")).toEqual({
		session: "01a0aab6-5334-72a3-bc6e-79cfb0a2a2ee",
		title: "resumed work",
	});
	expect(() => parseNewInstanceArgs("--resume")).toThrow("Usage:");
});

it("launches an exact active-profile session from the tool using its saved cwd", async () => {
	vi.unstubAllEnvs();
	const root = mkdtempSync(join(tmpdir(), "session-launch-resume-"));
	roots.push(root);
	vi.stubEnv("PI_CODING_AGENT_DIR", root);
	const savedCwd = join(root, "saved-project");
	const sessions = join(root, "sessions", "--saved-project--");
	mkdirSync(sessions, { recursive: true });
	const session = "01a0aab6-5334-72a3-bc6e-79cfb0a2a2ee";
	writeFileSync(join(sessions, `2026-09-16T00-00-00-000Z_${session}.jsonl`), `${JSON.stringify({ type: "session", version: 3, id: session, cwd: savedCwd })}\n`);
	const { tools } = fixture();
	vi.unstubAllEnvs();
	vi.stubEnv("PI_CODING_AGENT_DIR", root);
	vi.stubEnv("HERDR_ENV", "0");
	vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);

	const result = await tools.session_launch.execute("call", { session, title: "resumed" }, undefined, undefined, { cwd: process.cwd() });

	expect(result.details).toMatchObject({ session, cwd: savedCwd, title: "resumed", launched: true });
	const args = vi.mocked(spawnSync).mock.calls[0]?.[1] as string[];
	expect(args).toContain(savedCwd);
	expect(args.join(" ")).toContain(session);
});

it("launches silently, awaits delayed plugin open, passes title ownership, focuses the exact tab, and leaves child title initialization authoritative", async () => {
	const { commands, ctx } = fixture();
	vi.mocked(execFile).mockImplementation((_command: any, args: any, _options: any, callback: any) => {
		if (args[0] === "pane") callback(null, { stdout: JSON.stringify({ result: { pane: { workspace_id: "w9" } } }), stderr: "" });
		else if (args[0] === "plugin") setTimeout(() => { callback(null, { stdout: JSON.stringify({ result: { plugin_pane: { pane: { tab_id: "w9:t4", pane_id: "w9:p4" } } } }), stderr: "" }); }, 10);
		else callback(null, { stdout: "", stderr: "" });
		return {} as any;
	});
	const pending = commands["new-instance"].handler("fresh", ctx);
	expect(ctx.ui.notify).not.toHaveBeenCalled();
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(ctx.ui.notify).not.toHaveBeenCalled();
	expect(vi.mocked(execFile)).toHaveBeenCalledTimes(2);
	await pending;
	expect(ctx.ui.notify).not.toHaveBeenCalled();
	const calls = vi.mocked(execFile).mock.calls.map(call => call[1] as string[]);
	expect(calls[0]).toEqual(["pane", "current", "--current"]);
	expect(calls[1]).toContain("PI_HERDR_SESSION_FILE=");
	expect(calls[1]).toContain("PI_HERDR_PLAN_PATH=");
	expect(calls[1]).toContain("PI_HERDR_TAB_TITLE=fresh");
	expect(calls[1]).toContain("PI_HERDR_TAB_TITLE_EXPLICIT=1");
	expect(calls.slice(2)).toEqual([["tab", "focus", "w9:t4"]]);
});

it("branches through an independent real manager and persists reciprocal visible evidence", async () => {
	const { commands, ctx, parent, renderers } = realBranchFixture();
	const parentId = parent.getSessionId();
	const parentFile = parent.getSessionFile()!;
	const pendingBranch = commands.branch.handler("branch", ctx);
	const branchPoint = parent.getLeafEntry()!;
	await pendingBranch;
	const branchOpen = vi.mocked(execFile).mock.calls.find(call => (call[1] as string[])[0] === "plugin")![1] as string[];

	expect(parent.getSessionId()).toBe(parentId);
	expect(parent.getSessionFile()).toBe(parentFile);
	expect(existsSync(parentFile)).toBe(true);
	const parentMarker = parent.getEntries().find(entry => entry.type === "custom" && entry.customType === "session-branch")!;
	expect(parentMarker).toMatchObject({ data: {
		role: "parent", parentSessionId: parentId, parentSessionFile: parentFile,
		branchPointEntryId: branchPoint.id, branchPointTimestamp: branchPoint.timestamp,
	} });
	const childFile = (parentMarker as any).data.childSessionFile as string;
	const childId = (parentMarker as any).data.childSessionId as string;
	expect(childFile).not.toBe(parentFile);
	expect(branchOpen).toContain(`PI_HERDR_SESSION_FILE=${childFile}`);
	expect(existsSync(childFile)).toBe(true);
	const child = SessionManager.open(childFile, parent.getSessionDir());
	expect(child.getSessionId()).toBe(childId);
	expect(child.getHeader()?.parentSession).toBe(parentFile);
	expect(child.buildSessionContext().messages.map(message => (message as any).content?.[0]?.text)).toEqual(["before branch", "checkpoint"]);
	expect(child.getBranch().some(entry => entry.id === branchPoint.id)).toBe(true);
	const childMarker = child.getEntries().find(entry => entry.type === "custom" && entry.customType === "session-branch")!;
	expect(childMarker).toMatchObject({ data: { role: "child", parentSessionId: parentId, childSessionId: childId, childSessionFile: childFile, branchPointEntryId: branchPoint.id, branchPointTimestamp: branchPoint.timestamp } });
	expect(child.buildSessionContext().messages).not.toContainEqual(expect.objectContaining({ customType: "session-branch" }));
	expect(parent.buildSessionContext().messages).not.toContainEqual(expect.objectContaining({ customType: "session-branch" }));

	parent.appendMessage({ role: "user", content: [{ type: "text", text: "parent subsequent" }], timestamp: Date.now() } as any);
	child.appendMessage({ role: "user", content: [{ type: "text", text: "child subsequent" }], timestamp: Date.now() } as any);
	const reopenedParent = SessionManager.open(parentFile, parent.getSessionDir());
	const reopenedChild = SessionManager.open(childFile, parent.getSessionDir());
	const parentBytes = readFileSync(parentFile, "utf8");
	const childBytes = readFileSync(childFile, "utf8");
	expect(parentBytes).toContain("parent subsequent");
	expect(parentBytes).not.toContain("child subsequent");
	expect(childBytes).toContain("child subsequent");
	expect(childBytes).not.toContain("parent subsequent");
	expect(reopenedParent.getEntries().some(entry => entry.type === "custom" && entry.customType === "session-branch" && (entry.data as any).role === "parent")).toBe(true);
	expect(reopenedChild.getEntries().some(entry => entry.type === "custom" && entry.customType === "session-branch" && (entry.data as any).role === "child")).toBe(true);
	expect(reopenedParent.buildSessionContext().messages.map(message => (message as any).content?.[0]?.text)).toContain("parent subsequent");
	expect(reopenedChild.buildSessionContext().messages.map(message => (message as any).content?.[0]?.text)).toContain("child subsequent");

	const theme = { fg: (_color: string, text: string) => text };
	const expected = `[branch child] ${new Date(branchPoint.timestamp).toLocaleString().replaceAll(",", "")}`;
	const rendered = renderers["session-branch"](childMarker, { expanded: false }, theme).render(240).join("\n").trimEnd();
	expect(rendered).toBe(expected);
	expect(rendered).not.toContain(parentFile);
	expect(rendered).not.toContain(childFile);
	const expanded = renderers["session-branch"](childMarker, { expanded: true }, theme).render(240).join("\n").trimEnd();
	expect(expanded).toBe(expected);

	vi.mocked(execFile).mockClear();
	const receipt = await createHerdrPiTab(process.cwd(), "do-it", undefined, ".specs/example/plan.md");
	expect(receipt).toEqual({ tabId: "w9:t4", paneId: "w9:p4" });
	const planOpen = vi.mocked(execFile).mock.calls.find(call => (call[1] as string[])[0] === "plugin")![1] as string[];
	expect(planOpen).toContain("PI_HERDR_PLAN_PATH=.specs/example/plan.md");
	expect(planOpen).toContain("PI_HERDR_TAB_LABEL=do-it");
	expect(planOpen).not.toContain("run");
	expect(planOpen).toContain("--no-focus");
});

it("restores only the current child's monitoring boundary from persisted metadata after compaction and reload", async () => {
	const { commands, ctx, parent, promptFor } = realBranchFixture();
	expect(promptFor(parent).section).toBeUndefined();
	await commands.branch.handler("branch", ctx);
	const marker = parent.getEntries().find(entry => entry.type === "custom" && entry.customType === "session-branch");
	if (marker?.type !== "custom") throw new Error("Missing branch marker");
	const data = marker.data as { childSessionFile: string; parentSessionId: string; branchPointEntryId: string };
	const child = SessionManager.open(data.childSessionFile, parent.getSessionDir());
	const initial = promptFor(child);
	expect(initial.section).toContain(data.parentSessionId);
	expect(initial.section).toContain(data.branchPointEntryId);
	expect(initial.section).toContain("unless the user asks to continue them here");
	expect(initial.section).toContain("Scheduling remains available for this child's own work");
	expect(initial.prompt).toContain(`<session_branch>\n${initial.section}\n</session_branch>`);
	expect(initial.prompt).toContain("preserve me");
	expect(Buffer.byteLength(initial.section)).toBeLessThan(800);
	expect(promptFor(child)).toEqual(initial);

	const retained = child.appendMessage({ role: "user", content: "Discuss a different task", timestamp: Date.now() });
	child.appendCompaction("Inherited deployment monitoring was pending.", retained, 1000);
	// A later parent-role marker must not erase this session's own child boundary.
	child.appendCustomEntry("session-branch", {
		schemaVersion: 1, role: "parent", parentSessionId: child.getSessionId(), parentSessionFile: data.childSessionFile,
		childSessionId: "grandchild", childSessionFile: "grandchild.jsonl", branchPointEntryId: retained, branchPointTimestamp: new Date().toISOString(),
	});
	const reopened = SessionManager.open(data.childSessionFile, parent.getSessionDir());
	const reloadedExtension = realBranchFixture();
	expect(reloadedExtension.promptFor(reopened).section).toBe(initial.section);
	expect(promptFor(parent).section).toBeUndefined();
	expect(promptFor(parent).prompt).not.toContain("<session_branch>");
	expect(promptFor(SessionManager.inMemory()).section).toBeUndefined();
});

it("uses the caller pane's current workspace instead of its stale launch environment", async () => {
	fixture();
	vi.stubEnv("HERDR_WORKSPACE_ID", "w-old");
	await createHerdrPiTab(process.cwd(), "fresh");
	const calls = vi.mocked(execFile).mock.calls.map(call => call[1] as string[]);
	expect(calls[0]).toEqual(["pane", "current", "--current"]);
	const open = calls.find(args => args[0] === "plugin")!;
	expect(open.slice(open.indexOf("--workspace"), open.indexOf("--workspace") + 2)).toEqual(["--workspace", "w9"]);
});

it("opens in an explicitly supplied workspace without inspecting the caller", async () => {
	fixture();
	await createHerdrPiTab(process.cwd(), "fresh", undefined, undefined, false, "w10");
	const calls = vi.mocked(execFile).mock.calls.map(call => call[1] as string[]);
	expect(calls.some(args => args[0] === "pane")).toBe(false);
	const open = calls.find(args => args[0] === "plugin")!;
	expect(open.slice(open.indexOf("--workspace"), open.indexOf("--workspace") + 2)).toEqual(["--workspace", "w10"]);
});

it("reports an unavailable current workspace as a safe prelaunch failure", async () => {
	fixture();
	vi.mocked(execFile).mockImplementationOnce((_command: any, _args: any, _options: any, callback: any) => {
		callback(null, { stdout: JSON.stringify({ result: { pane: {} } }), stderr: "" });
		return {} as any;
	});
	await expect(createHerdrPiTab(process.cwd(), "fresh")).rejects.toMatchObject({ mayHaveLaunched: false });
	expect(execFile).toHaveBeenCalledTimes(1);
});

it.each(["ENOENT", "EACCES"])("allows a safe retry when the CLI never started (%s)", async code => {
	fixture();
	vi.mocked(execFile).mockImplementation((_command: any, args: any, _options: any, callback: any) => {
		if (args[0] === "pane") callback(null, { stdout: JSON.stringify({ result: { pane: { workspace_id: "w9" } } }), stderr: "" });
		else callback(Object.assign(new Error("Cannot start CLI"), { code }));
		return {} as any;
	});
	await expect(createHerdrPiTab(process.cwd(), "fresh")).rejects.toMatchObject({ mayHaveLaunched: false });
	expect(execFile).toHaveBeenCalledTimes(2);
});

it("marks timeout as ambiguous and does not retry", async () => {
	fixture();
	vi.mocked(execFile).mockImplementation((_command: any, args: any, _options: any, callback: any) => {
		if (args[0] === "pane") callback(null, { stdout: JSON.stringify({ result: { pane: { workspace_id: "w9" } } }), stderr: "" });
		else callback(Object.assign(new Error("timed out"), { killed: true, code: "ETIMEDOUT" }));
		return {} as any;
	});
	const error = await createHerdrPiTab(process.cwd(), "fresh").catch(value => value);
	expect(error).toBeInstanceOf(HerdrPiTabLaunchError);
	expect(error).toMatchObject({ mayHaveLaunched: true });
	expect(execFile).toHaveBeenCalledTimes(2);
});

it("returns known receipt details when focus fails", async () => {
	const operation = "focus";
	fixture();
	vi.mocked(execFile).mockImplementation((_command: any, args: any, _options: any, callback: any) => {
		if (args[0] === "pane") callback(null, { stdout: JSON.stringify({ result: { pane: { workspace_id: "w9" } } }), stderr: "" });
		else if (args[0] === "plugin") callback(null, { stdout: JSON.stringify({ result: { plugin_pane: { pane: { tab_id: "w9:t4", pane_id: "w9:p4" } } } }), stderr: "" });
		else if (args[1] === operation) callback(new Error(`${operation} failed`));
		else callback(null, { stdout: "", stderr: "" });
		return {} as any;
	});
	const error = await createHerdrPiTab(process.cwd(), "fresh").catch(value => value);
	expect(error).toMatchObject({ mayHaveLaunched: true, tabId: "w9:t4", paneId: "w9:p4" });
	expect(String(error)).toContain("Do not relaunch");
});

it("marks default launch titles as automatic provenance", async () => {
	const { commands, ctx } = fixture();
	await commands["new-instance"].handler("", ctx);
	const open = vi.mocked(execFile).mock.calls.find(call => (call[1] as string[])[0] === "plugin")![1] as string[];
	expect(open).toContain("PI_HERDR_TAB_TITLE_EXPLICIT=0");
});

it("keeps plain terminal launch synchronous and shell-based", async () => {
	const { commands, ctx } = fixture();
	await commands["new-terminal"].handler("shell", ctx);
	expect(vi.mocked(spawnSync).mock.calls[0][1]).toContain("create");
	expect(vi.mocked(spawnSync).mock.calls[0][1]).not.toContain("plugin");
});
