import { afterEach, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import register from "../extensions/session-launch.ts";
vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
function fixture() {
  vi.stubEnv("HERDR_ENV", "1"); vi.stubEnv("HERDR_WORKSPACE_ID", "w9");
  const commands: Record<string, any> = {};
  register({ registerCommand(n: string, c: any) { commands[n] = c; } } as any);
  const ctx = { cwd: process.cwd(), ui: { notify: vi.fn() }, sessionManager: { getLeafId: () => "leaf", createBranchedSession: vi.fn(() => "C:/branch path/session.jsonl") } };
  vi.mocked(spawnSync).mockImplementation((_cmd, args: any) => ({ status: 0, stdout: args[0] === "plugin" ? JSON.stringify({ result: { plugin_pane: { pane: { tab_id: "w9:t4" } } } }) : JSON.stringify({ result: { root_pane: { pane_id: "w9:p4" } } }), stderr: "" }) as any);
  return { commands, ctx };
}
it("launches fresh/branched Pi via plugin argv and renames the exact returned tab", async () => {
  const { commands, ctx } = fixture();
  await commands["new-instance"].handler("fresh", ctx);
  await commands.branch.handler("branch", ctx);
  const args = vi.mocked(spawnSync).mock.calls.map(c => c[1] as string[]);
  expect(args[0]).toContain("PI_HERDR_SESSION_FILE=");
  expect(args[2]).toContain("PI_HERDR_SESSION_FILE=C:/branch path/session.jsonl");
  expect(args[0]).not.toContain("--target-pane");
  expect(args[0]).toContain("--focus");
  expect(args[1]).toEqual(["tab", "rename", "w9:t4", "fresh"]);
  expect(args.some(a => a.includes("run"))).toBe(false);
});
it("keeps plain terminal launch as a shell tab", async () => {
  const { commands, ctx } = fixture();
  await commands["new-terminal"].handler("shell", ctx);
  expect(vi.mocked(spawnSync).mock.calls[0][1]).toContain("create");
  expect(vi.mocked(spawnSync).mock.calls[0][1]).not.toContain("plugin");
});
it("retains branch path and does not retry on uncertain launch failure", async () => {
  const { commands, ctx } = fixture();
  vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: "", stderr: "timeout" } as any);
  await expect(commands.branch.handler("branch", ctx)).rejects.toThrow("Branch retained: C:/branch path/session.jsonl");
  expect(spawnSync).toHaveBeenCalledTimes(1);
});
