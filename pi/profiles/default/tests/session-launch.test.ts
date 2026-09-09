import { afterEach, expect, it, vi } from "vitest";
import { execFile, spawnSync } from "node:child_process";
import register, { createHerdrPiTab, HerdrPiTabLaunchError } from "../extensions/session-launch.ts";

vi.mock("node:child_process", () => ({ execFile: vi.fn(), spawnSync: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

function fixture() {
	vi.stubEnv("HERDR_ENV", "1");
	vi.stubEnv("HERDR_WORKSPACE_ID", "w9");
	const commands: Record<string, any> = {};
	register({ registerCommand(n: string, c: any) { commands[n] = c; } } as any);
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

it("awaits delayed plugin open, focuses the exact tab, renames it, and returns both IDs", async () => {
	const { commands, ctx } = fixture();
	vi.mocked(execFile).mockImplementationOnce((_command: any, _args: any, _options: any, callback: any) => {
		setTimeout(() => { callback(null, { stdout: JSON.stringify({ result: { plugin_pane: { pane: { tab_id: "w9:t4", pane_id: "w9:p4" } } } }), stderr: "" }); }, 10);
		return {} as any;
	});
	const pending = commands["new-instance"].handler("fresh", ctx);
	expect(vi.mocked(execFile)).toHaveBeenCalledTimes(1);
	await pending;
	const calls = vi.mocked(execFile).mock.calls.map(call => call[1] as string[]);
	expect(calls[0]).toContain("PI_HERDR_SESSION_FILE=");
	expect(calls[0]).toContain("PI_HERDR_PLAN_PATH=");
	expect(calls.slice(1)).toEqual([["tab", "focus", "w9:t4"], ["tab", "rename", "w9:t4", "fresh"]]);
});

it("preserves branch session and plan inputs", async () => {
	const { commands, ctx } = fixture();
	await commands.branch.handler("branch", ctx);
	const branchOpen = vi.mocked(execFile).mock.calls[0][1] as string[];
	expect(branchOpen).toContain("PI_HERDR_SESSION_FILE=C:/branch path/session.jsonl");
	expect(branchOpen).toContain("PI_HERDR_PLAN_PATH=");
	vi.mocked(execFile).mockClear();
	const receipt = await createHerdrPiTab(process.cwd(), "do-it", undefined, ".specs/example/plan.md");
	expect(receipt).toEqual({ tabId: "w9:t4", paneId: "w9:p4" });
	const planOpen = vi.mocked(execFile).mock.calls[0][1] as string[];
	expect(planOpen).toContain("PI_HERDR_PLAN_PATH=.specs/example/plan.md");
	expect(planOpen).not.toContain("run");
});

it("reports missing workspace as a safe prelaunch failure", async () => {
	vi.stubEnv("HERDR_ENV", "1");
	vi.stubEnv("HERDR_WORKSPACE_ID", "");
	await expect(createHerdrPiTab(process.cwd(), "fresh")).rejects.toMatchObject({
		mayHaveLaunched: false, tabId: undefined, paneId: undefined,
	});
	expect(execFile).not.toHaveBeenCalled();
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

it.each(["focus", "rename"])("returns known receipt details when %s fails", async operation => {
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

it("keeps plain terminal launch synchronous and shell-based", async () => {
	const { commands, ctx } = fixture();
	await commands["new-terminal"].handler("shell", ctx);
	expect(vi.mocked(spawnSync).mock.calls[0][1]).toContain("create");
	expect(vi.mocked(spawnSync).mock.calls[0][1]).not.toContain("plugin");
});
