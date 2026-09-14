import { afterEach, expect, it, vi } from "vitest";
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";
import register, { createHerdrPiTab, HerdrPiTabLaunchError } from "../extensions/session-launch.ts";

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
	register({
		registerCommand(n: string, c: any) { commands[n] = c; },
		registerEntryRenderer() {},
	} as any);
	const ctx = {
		cwd: process.cwd(), ui: { notify: vi.fn() },
		sessionManager: { getLeafId: () => "leaf", createBranchedSession: vi.fn(() => "C:/branch path/session.jsonl") },
	};
	vi.mocked(execFile).mockImplementation((_command: any, args: any, _options: any, callback: any) => {
		const stdout = args[0] === "plugin"
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
	return { commands, ctx };
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
	const pi = {
		registerCommand(n: string, c: any) { commands[n] = c; },
		registerEntryRenderer(n: string, renderer: any) { renderers[n] = renderer; },
		appendEntry(type: string, data: unknown) { parent.appendCustomEntry(type, data); },
	};
	register(pi as any);
	const ctx = { cwd: root, ui: { notify: vi.fn() }, sessionManager: parent };
	vi.mocked(execFile).mockImplementation((_command: any, args: any, _options: any, callback: any) => {
		const stdout = args[0] === "plugin"
			? JSON.stringify({ result: { plugin_pane: { pane: { tab_id: "w9:t4", pane_id: "w9:p4" } } } })
			: "";
		callback(null, { stdout, stderr: "" });
		return {} as any;
	});
	return { commands, ctx, parent, renderers };
}

it("awaits delayed plugin open, passes title ownership, focuses the exact tab, and leaves child title initialization authoritative", async () => {
	const { commands, ctx } = fixture();
	vi.mocked(execFile).mockImplementationOnce((_command: any, _args: any, _options: any, callback: any) => {
		setTimeout(() => { callback(null, { stdout: JSON.stringify({ result: { plugin_pane: { pane: { tab_id: "w9:t4", pane_id: "w9:p4" } } } }), stderr: "" }); }, 10);
		return {} as any;
	});
	const pending = commands["new-instance"].handler("fresh", ctx);
	expect(ctx.ui.notify).toHaveBeenCalledWith("/new-instance fresh", "info");
	expect(vi.mocked(execFile)).not.toHaveBeenCalled();
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(ctx.ui.notify).toHaveBeenCalledWith("Opening new Pi instance in a Herdr tab: fresh", "info");
	expect(vi.mocked(execFile)).toHaveBeenCalledTimes(1);
	await pending;
	const calls = vi.mocked(execFile).mock.calls.map(call => call[1] as string[]);
	expect(calls[0]).toContain("PI_HERDR_SESSION_FILE=");
	expect(calls[0]).toContain("PI_HERDR_PLAN_PATH=");
	expect(calls[0]).toContain("PI_HERDR_TAB_TITLE=fresh");
	expect(calls[0]).toContain("PI_HERDR_TAB_TITLE_EXPLICIT=1");
	expect(calls.slice(1)).toEqual([["tab", "focus", "w9:t4"]]);
});

it("branches through an independent real manager and persists reciprocal visible evidence", async () => {
	const { commands, ctx, parent, renderers } = realBranchFixture();
	const parentId = parent.getSessionId();
	const parentFile = parent.getSessionFile()!;
	const branchPoint = parent.getLeafEntry()!;
	await commands.branch.handler("branch", ctx);
	const branchOpen = vi.mocked(execFile).mock.calls[0][1] as string[];

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

	const rendered = renderers["session-branch"](childMarker, { expanded: false }, { fg: (_color: string, text: string) => text }).render(240).join("\n");
	expect(rendered).toContain("[branch child]");
	expect(rendered).toContain(parentFile);
	expect(rendered).toContain(childFile);
	expect(rendered).toContain(branchPoint.id);
	expect(rendered).toContain(branchPoint.timestamp);

	vi.mocked(execFile).mockClear();
	const receipt = await createHerdrPiTab(process.cwd(), "do-it", undefined, ".specs/example/plan.md");
	expect(receipt).toEqual({ tabId: "w9:t4", paneId: "w9:p4" });
	const planOpen = vi.mocked(execFile).mock.calls[0][1] as string[];
	expect(planOpen).toContain("PI_HERDR_PLAN_PATH=.specs/example/plan.md");
	expect(planOpen).toContain("PI_HERDR_TAB_LABEL=do-it");
	expect(planOpen).not.toContain("run");
	expect(planOpen).toContain("--no-focus");
});

it("opens in an explicitly supplied workspace instead of the caller workspace", async () => {
	fixture();
	await createHerdrPiTab(process.cwd(), "fresh", undefined, undefined, false, "w10");
	const open = vi.mocked(execFile).mock.calls[0][1] as string[];
	expect(open.slice(open.indexOf("--workspace"), open.indexOf("--workspace") + 2)).toEqual(["--workspace", "w10"]);
});

it("reports missing workspace as a safe prelaunch failure", async () => {
	vi.stubEnv("HERDR_ENV", "1");
	vi.stubEnv("HERDR_WORKSPACE_ID", "");
	await expect(createHerdrPiTab(process.cwd(), "fresh")).rejects.toMatchObject({
		mayHaveLaunched: false, tabId: undefined, paneId: undefined,
	});
	expect(execFile).not.toHaveBeenCalled();
});

it.each(["ENOENT", "EACCES"])("allows a safe retry when the CLI never started (%s)", async code => {
	fixture();
	vi.mocked(execFile).mockImplementationOnce((_command: any, _args: any, _options: any, callback: any) => {
		callback(Object.assign(new Error("Cannot start CLI"), { code }));
		return {} as any;
	});
	await expect(createHerdrPiTab(process.cwd(), "fresh")).rejects.toMatchObject({ mayHaveLaunched: false });
	expect(execFile).toHaveBeenCalledTimes(1);
});

it("marks timeout as ambiguous and does not retry", async () => {
	fixture();
	vi.mocked(execFile).mockImplementationOnce((_command: any, _args: any, _options: any, callback: any) => {
		callback(Object.assign(new Error("timed out"), { killed: true, code: "ETIMEDOUT" }));
		return {} as any;
	});
	const error = await createHerdrPiTab(process.cwd(), "fresh").catch(value => value);
	expect(error).toBeInstanceOf(HerdrPiTabLaunchError);
	expect(error).toMatchObject({ mayHaveLaunched: true });
	expect(execFile).toHaveBeenCalledTimes(1);
});

it("returns known receipt details when focus fails", async () => {
	const operation = "focus";
	fixture();
	vi.mocked(execFile).mockImplementationOnce((_command: any, args: any, _options: any, callback: any) => callback(null, { stdout: JSON.stringify({ result: { plugin_pane: { pane: { tab_id: "w9:t4", pane_id: "w9:p4" } } } }), stderr: "" }));
	vi.mocked(execFile).mockImplementation((_command: any, args: any, _options: any, callback: any) => {
		if (args[1] === operation) callback(new Error(`${operation} failed`));
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
	const open = vi.mocked(execFile).mock.calls[0][1] as string[];
	expect(open).toContain("PI_HERDR_TAB_TITLE_EXPLICIT=0");
});

it("keeps plain terminal launch synchronous and shell-based", async () => {
	const { commands, ctx } = fixture();
	await commands["new-terminal"].handler("shell", ctx);
	expect(vi.mocked(spawnSync).mock.calls[0][1]).toContain("create");
	expect(vi.mocked(spawnSync).mock.calls[0][1]).not.toContain("plugin");
});
