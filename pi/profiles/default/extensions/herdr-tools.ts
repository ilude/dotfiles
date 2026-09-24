import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { resumeHerdrSession } from "../lib/herdr-resume.ts";
import { Type } from "typebox";
import { compactPane, createHerdrCli, herdrContext, inspectPane, inspectShell, OUTPUT_LIMIT, result, type HerdrCli } from "../lib/herdr-cli.ts";
import { herdrAgentAction, type HerdrAgentAction } from "../lib/herdr-agent.ts";
import { deactivateTools } from "../lib/tool-activation.js";
import { focusedPane } from "../lib/subagents/herdr-layout-api.ts";

const choice = <T extends string>(values: T[]) => Type.Union(values.map(value => Type.Literal(value)));
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value.slice(0, OUTPUT_LIMIT) : JSON.stringify(value).slice(0, OUTPUT_LIMIT) }], details: {} });
function required(value: string | undefined, label: string): string {
  if (!value?.trim() || value.includes("\0")) throw new Error(`${label} required`);
  return value;
}
export async function checkedCommand(pi: Pick<ExtensionAPI, "events">, cli: HerdrCli, pane: string, command: string, id: string, ctx: ExtensionContext, signal?: AbortSignal) {
  const before = await inspectShell(cli, pane, signal);
  let decision: Promise<{ block: true; reason: string } | undefined> | undefined;
  pi.events.emit("herdr:check-command", {
    event: { type: "tool_call", toolName: before.language, toolCallId: id, input: { command } },
    ctx: { ...ctx, cwd: before.cwd, signal },
    accept: (value: typeof decision) => { decision = value; },
  });
  if (!decision) throw new Error("Damage Control command gate unavailable; nothing submitted");
  const denied = await decision;
  if (denied?.block) throw new Error(denied.reason);
  const after = await inspectShell(cli, pane, signal);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Shell changed after safety decision; nothing submitted");
  await cli(["pane", "run", pane, command], { signal });
  return text({ pane, submitted: true });
}
export default function herdrTools(pi: ExtensionAPI, cli: HerdrCli = createHerdrCli()) {
  pi.on("session_start", () => {
    deactivateTools(pi, ["herdr_agent"]);
  });
  pi.registerTool({
    name: "herdr_layout", label: "Herdr layout",
    description: "Inspect/create process panes, tabs, or workspaces, or resume a Pi session UUID in a focused tab or separate workspace. Resume uses the saved cwd and active profile, checks startup, and returns created IDs.",
    parameters: Type.Object({
      action: choice(["list", "split", "tab", "workspace", "resume"]),
      session: Type.Optional(Type.String({ description: "Existing session UUID, required for resume" })),
      placement: Type.Optional(choice(["tab", "workspace"])), direction: Type.Optional(choice(["right", "down"])),
      cwd: Type.Optional(Type.String()), label: Type.Optional(Type.String({ maxLength: 80 })), focus: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const caller = herdrContext();
      if (params.action === "resume") {
        return text(await resumeHerdrSession(required(params.session, "session"), join(getAgentDir(), "sessions"), cli, signal, params.placement || "tab"));
      }
      if (params.action === "list") {
        const panes = result(await cli(["pane", "list"], { signal })).panes;
        if (!Array.isArray(panes)) throw new Error("Herdr omitted connected pane inventory");
        const inventory = panes.slice(0, 80).map((pane: unknown) => {
          if (!pane || typeof pane !== "object" || Array.isArray(pane)) throw new Error("Herdr returned an invalid pane inventory entry");
          const item = pane as Record<string, unknown>;
          if (typeof item.pane_id !== "string" || !item.pane_id) throw new Error("Herdr pane inventory omitted exact pane ID");
          for (const key of ["tab_id", "workspace_id"]) if (typeof item[key] !== "string" || !item[key]) throw new Error(`Herdr pane inventory omitted exact ${key}`);
          const agent = item.agent_name ?? item.agent;
          const kind = item.agent_kind ?? item.kind;
          const state = item.agent_status ?? item.status ?? item.state;
          const process = item.foreground_process ?? item.foreground_process_name ?? item.process_name;
          const pid = item.foreground_pid ?? item.shell_pid;
          return {
            pane: item.pane_id, tab: item.tab_id, workspace: item.workspace_id,
            ...(typeof item.label === "string" ? { label: item.label } : {}),
            ...(typeof (item.foreground_cwd ?? item.cwd) === "string" ? { cwd: item.foreground_cwd ?? item.cwd } : {}),
            ...(typeof agent === "string" ? { agent } : {}), ...(typeof kind === "string" ? { kind } : {}),
            ...(typeof state === "string" ? { state } : {}), ...(typeof process === "string" ? { process } : {}),
            ...(typeof pid === "number" ? { pid } : {}), ...(typeof item.focused === "boolean" ? { focused: item.focused } : {}),
          };
        });
        return text({ panes: inventory, total: panes.length, truncated: panes.length > inventory.length });
      }
      const cwd = params.cwd || ctx.cwd;
      const args = params.action === "split"
        ? ["pane", "split", "--pane", caller.pane, "--direction", params.direction || "right", "--cwd", cwd, "--no-focus"]
        : params.action === "workspace"
          ? ["workspace", "create", "--cwd", cwd, ...(params.label ? ["--label", params.label] : []), params.focus ? "--focus" : "--no-focus"]
          : ["tab", "create", "--workspace", caller.workspace, "--cwd", cwd, "--no-focus"];
      const response = result(await cli(args, { signal }));
      const pane = response.pane || response.root_pane;
      const compact = compactPane(pane);
      if (params.action === "workspace") {
        const workspace = response.workspace?.workspace_id;
        const tab = response.tab?.tab_id;
        if (!workspace || !tab) throw new Error("Herdr omitted workspace or tab identity");
        return text({ ...compact, workspace, tab, focused: params.focus === true });
      }
      return text(compact);
    },
  });
  pi.registerTool({
    name: "herdr_agent", label: "Herdr agent",
    description: "Inspect and control any exact live agent in the connected Herdr server: list/get/read, prompt, wait for lifecycle state, or send logical keys. Agents are addressed by unique live name or current pane ID. Reads and output are bounded; timeouts and cancellation do not prove whether a submitted prompt took effect, so inspect before retrying.",
    parameters: Type.Object({
      action: choice(["list", "get", "read", "prompt", "wait", "sendKeys"]),
      target: Type.Optional(Type.String({ description: "Exact live agent name or current pane ID; required except for list" })),
      message: Type.Optional(Type.String({ maxLength: 8000 })),
      wait: Type.Optional(Type.Boolean({ description: "For prompt, wait for Herdr lifecycle activity and a settled result" })),
      until: Type.Optional(choice(["idle", "working", "blocked", "done", "unknown"])),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 120 })),
      lines: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
      keys: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 32 }), { minItems: 1, maxItems: 16 })),
    }),
    async execute(_id, params, signal) {
      return text(await herdrAgentAction(cli, params as HerdrAgentAction, signal));
    },
  });
  pi.registerTool({
    name: "herdr_pane", label: "Herdr pane",
    description: "Read, run, wait, rename, move, interrupt, or close a process pane. Move places it in a new tab in an existing workspace and preserves focus by default. Run requires an idle Bash/PowerShell shell. Interrupt and close target an exact existing pane; Pi refuses control of its own pane.",
    parameters: Type.Object({
      action: choice(["read", "run", "wait", "rename", "move", "interrupt", "close"]), pane: Type.String(),
      command: Type.Optional(Type.String({ maxLength: 32000 })), label: Type.Optional(Type.String({ maxLength: 80 })),
      workspace: Type.Optional(Type.String({ description: "Destination workspace ID, required for move" })), focus: Type.Optional(Type.Boolean()),
      match: Type.Optional(Type.String({ maxLength: 1000 })), lines: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 120 })),

    }),
    async execute(id, params, signal, _update, ctx) {
      const caller = herdrContext(); const pane = required(params.pane, "pane");
      const inspected = await inspectPane(cli, pane, signal);
      if (params.action === "read") return text(await cli(["pane", "read", pane, "--source", "recent-unwrapped", "--lines", String(params.lines || 80)], { signal }));
      if (params.action === "wait") {
        const timeout = (params.timeoutSeconds || 30) * 1000;
        const response = result(await cli(["pane", "wait-output", pane, "--match", required(params.match, "match"), "--timeout", String(timeout)], { timeoutMs: timeout + 2000, signal }));
        return text({ pane, matched: response.matched_line, output: response.read?.text?.slice(-8000) });
      }
      if (params.action === "close" || params.action === "interrupt") {
        const liveCallerPane = await focusedPane(cli);
        if (pane === liveCallerPane) throw new Error("Refusing to control Pi's own pane");
      } else if (pane === caller.pane) {
        throw new Error("Refusing to control Pi's own pane");
      }
      if (params.action === "run") return checkedCommand(pi, cli, pane, required(params.command, "command"), id, ctx, signal);
      if (params.action === "rename") { await cli(["pane", "rename", pane, required(params.label, "label")], { signal }); return text({ pane, renamed: true }); }
      if (params.action === "move") {
        const workspace = required(params.workspace, "workspace");
        if (inspected.workspace_id === workspace) throw new Error("Destination must be a different workspace");
        const response = result(await cli(["pane", "move", pane, "--new-tab", "--workspace", workspace, ...(params.label ? ["--label", params.label] : []), params.focus ? "--focus" : "--no-focus"], { signal }));
        const moved = response.move_result?.pane;
        if (moved?.workspace_id !== workspace) throw new Error("Herdr move returned the wrong destination workspace");
        const compact = compactPane(moved);
        return text({ ...compact, previousPane: response.move_result.previous_pane_id, previousTab: response.move_result.previous_tab_id, focused: params.focus === true });
      }
      if (params.action === "close") {
        await cli(["pane", "close", pane], { signal });
        return text({ pane, closed: true });
      }
      await cli(["pane", "send-keys", pane, "ctrl+c"], { signal });
      return text({ pane, interruptSubmitted: true, next: "Inspect process/output before assuming it stopped." });
    },
  });
}
