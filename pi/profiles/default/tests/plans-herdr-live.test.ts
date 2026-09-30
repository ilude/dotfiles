import { describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { executePlans } from "../extensions/plans.ts";
import { getThemeByName } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { isolatedPlanHerdr, type Pane, type Agent, type Workspace } from "./fixtures/plan-herdr-live.ts";

describe.skipIf(process.env.PI_PLANS_HERDR_LIVE !== "1")("isolated prepared plan real-Pi acceptance", () => {
  it("opens a native grouped worktree and one focused real Pi session in its task cwd", async () => {
    const fixture = await isolatedPlanHerdr();
    const { scratch, repo, env, entry, fixtureProfile, cli } = fixture;
    const previous = { ...process.env };
    try {
      mkdirSync(join(repo, ".specs/acceptance"), { recursive: true });
      writeFileSync(join(repo, ".specs/acceptance/plan.md"), "# Live acceptance\n");
      writeFileSync(join(repo, ".specs/acceptance/support.txt"), "uncommitted supporting content\n");
      const receiptFile = join(scratch, "started.json");
      // A real Pi command handler consumes bootstrap delivery. No provider call or plan implementation.
      writeFileSync(join(fixtureProfile, "extensions/acceptance.ts"), `import {writeFileSync} from 'node:fs';
export default function(pi) { pi.registerCommand('do-it', {description:'Deterministic live fixture', handler: async(args,ctx) => {
writeFileSync(${JSON.stringify(receiptFile)}, JSON.stringify({args,cwd:ctx.cwd,sessionId:ctx.sessionManager.getSessionId(),sessionFile:ctx.sessionManager.getSessionFile(),pid:process.pid}));
ctx.ui.notify('LIVE PLAN RECEIPT READY','info'); }}); }`);
      const origin = (await cli<{ result: { workspace: Workspace; tab: { tab_id: string }; root_pane: Pane } }>(["workspace", "create", "--cwd", repo, "--label", "plan acceptance origin", "--no-focus"])).result;
      await cli(["tab", "focus", origin.tab.tab_id]);
      for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
      Object.assign(process.env, env, { PI_CODING_AGENT_DIR: fixtureProfile, HERDR_ENV: "1", HERDR_WORKSPACE_ID: origin.workspace.workspace_id, HERDR_TAB_ID: origin.tab.tab_id, HERDR_PANE_ID: origin.root_pane.pane_id });
      const frames: string[] = [];
      type Picker = { render: (width: number) => string[]; handleInput: (input: string) => void };
      const custom = vi.fn((factory: (tui: unknown, theme: unknown, keys: unknown, done: (value: unknown) => void) => Picker) => new Promise(done => {
        let picker: Picker;
        const tui = { terminal: { rows: 35 }, requestRender() { frames.push(picker.render(100).map(stripTerminalSequences).join("\n")); } };
        picker = factory(tui, getThemeByName("dark"), {}, done);
        picker.handleInput("d"); picker.handleInput("d"); picker.handleInput("r");
      }));
      await executePlans({ mode: "tui", cwd: repo, ui: { custom, notify: vi.fn() } } as unknown as ExtensionCommandContext, { sendUserMessage: vi.fn() });
      expect(custom).toHaveBeenCalledOnce();
      expect(frames.some(frame => frame.includes("Launching new tab..."))).toBe(true);
      expect(frames.some(frame => frame.includes("Plans · Details"))).toBe(false);
      const task = join(repo, ".worktrees/acceptance");
      expect(readFileSync(join(task, ".specs/acceptance/support.txt"), "utf8")).toBe("uncommitted supporting content\n");
      let receipt: { args: string; cwd: string; sessionId: string; sessionFile: string; pid: number } | undefined;
      await vi.waitFor(() => {
        receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
        expect(receipt?.args).toBe(".specs/acceptance/plan.md");
      }, { timeout: 30_000, interval: 200 });
      expect(resolve(receipt!.cwd)).toBe(resolve(task));
      expect(receipt!.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      const agents = (await cli<{ result: { agents: Agent[] } }>(["agent", "list"])).result.agents;
      const agent = agents.find(candidate => candidate.agent_session?.value === receipt!.sessionFile);
      expect(agent, JSON.stringify(agents)).toBeDefined();
      const pane = (await cli<{ result: { pane: Pane } }>(["pane", "get", agent!.pane_id])).result.pane;
      expect(pane.workspace_id).not.toBe(origin.workspace.workspace_id);
      const grouped = await cli<{ result: unknown }>(["worktree", "list", "--workspace", origin.workspace.workspace_id]);
      // The native API, not a label, must carry the real checkout and branch provenance.
      expect(JSON.stringify(grouped.result).replaceAll("\\\\", "/")).toContain(task.replaceAll("\\", "/"));
      expect(JSON.stringify(grouped.result)).toContain("task/acceptance");
      const workspace = (await cli<{ result: { workspace: Workspace } }>(["workspace", "get", pane.workspace_id])).result.workspace;
      expect(workspace.active_tab_id).toBe(pane.tab_id);
      const panes = (await cli<{ result: { panes: Pane[] } }>(["pane", "list", "--workspace", pane.workspace_id])).result.panes;
      expect(panes.map(candidate => candidate.pane_id)).toEqual([pane.pane_id]);
      const processes = await cli<{ result: { process_info: { foreground_processes: { pid: number; argv: string[] }[] } } }>(["pane", "process-info", "--pane", pane.pane_id]);
      expect(processes.result.process_info.foreground_processes.some(p => p.pid === receipt!.pid && p.argv.includes(entry))).toBe(true);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
      await fixture.close();
    }
  }, 90_000);
});
