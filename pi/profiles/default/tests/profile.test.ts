import { afterEach, expect, it, vi } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { activeProfileName } from "../lib/profile.ts";
import sessionLaunch from "../extensions/session-launch.ts";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => ({ status: 0, stdout: "" })) }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it.each([
	["C:\\Users\\operator\\.pi\\profiles\\work", "work"],
	["/home/operator/.pi/profiles/default/", "default"],
	["~/.pi/profiles/review", "review"],
])("derives a profile label from native directory resolution: %s", (directory, label) => {
	vi.stubEnv("PI_CODING_AGENT_DIR", directory);
	expect(activeProfileName()).toBe(label);
	if (directory.startsWith("~")) expect(getAgentDir()).toBe(join(homedir(), ".pi", "profiles", "review"));
});

it("retains the native agent fallback", () => {
	vi.stubEnv("PI_CODING_AGENT_DIR", "");
	expect(activeProfileName()).toBe("agent");
});

it("passes the active profile to a new instance without launching a real terminal", async () => {
	vi.stubEnv("PI_CODING_AGENT_DIR", join(homedir(), ".pi", "profiles", "work"));
	vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_WORKSPACE_ID", "test-workspace");
	vi.mocked(spawnSync).mockReturnValueOnce({ status: 0, stdout: JSON.stringify({ result: { plugin_pane: { pane: { tab_id: "test-tab" } } } }) } as ReturnType<typeof spawnSync>);
	const commands = new Map<string, any>();
	sessionLaunch({ registerCommand: (name: string, command: unknown) => commands.set(name, command) } as unknown as ExtensionAPI);
	await commands.get("new-instance").handler("", { cwd: process.cwd(), ui: { notify: vi.fn() } });
	const launchArgs = vi.mocked(spawnSync).mock.calls[0]?.[1] as string[];
	expect(launchArgs.slice(0, 4)).toEqual(["plugin", "pane", "open", "--plugin"]);
	expect(launchArgs).toContain(`PI_HERDR_PROFILE_DIR=${join(homedir(), ".pi", "profiles", "work")}`);
	expect(vi.mocked(spawnSync).mock.calls[1]?.[1]).toEqual(["tab", "rename", "test-tab", expect.any(String)]);
});
