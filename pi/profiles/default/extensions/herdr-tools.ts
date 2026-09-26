import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { basename, join } from "node:path";
import { resumeHerdrSession } from "../lib/herdr-resume.ts";
import { Type } from "typebox";
import { compactPane, createHerdrCli, herdrContext, inspectPane, inspectShell, OUTPUT_LIMIT, result, type HerdrCli } from "../lib/herdr-cli.ts";
import { herdrAgentAction, type HerdrAgentAction } from "../lib/herdr-agent.ts";
import { deactivateTools } from "../lib/tool-activation.js";
import { focusedPane } from "../lib/subagents/herdr-layout-api.ts";

const choice = <T extends string>(values: T[]) => Type.Union(values.map(value => Type.Literal(value)));
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value.slice(0, OUTPUT_LIMIT) : JSON.stringify(value).slice(0, OUTPUT_LIMIT) }], details: {} });
const resultText = (value: { content: Array<{ type: string; text?: string }> }) => value.content.filter(part => part.type === "text").map(part => part.text || "").join("\n");
const parsedResult = (value: { content: Array<{ type: string; text?: string }> }): unknown => {
  const raw = resultText(value);
  try { return JSON.parse(raw); } catch { return raw; }
};
const short = (value: unknown, limit = 80): string => {
  const line = String(value ?? "").replace(/\s+/g, " ").trim();
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
};
const pathName = (value: unknown): string | undefined => typeof value === "string" && value ? basename(value.replace(/[\\/]+$/, "")) : undefined;
const visibleTarget = (value: unknown): string | undefined => typeof value === "string" && value && !value.includes(":") ? value : undefined;
const previewOutput = (value: unknown, expanded: boolean): string => {
  const output = String(value ?? "").trim();
  if (!output) return "";
  const lines = output.split("\n");
  const shown = expanded ? lines : lines.slice(0, 8);
  return `${shown.join("\n")}${!expanded && lines.length > shown.length ? `\n… ${lines.length - shown.length} more lines` : ""}`;
};
function renderCall(kind: "agent" | "layout" | "pane", args: Record<string, unknown>, theme: any) {
  const action = String(args.action || "inspect").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const subject = kind === "agent" ? visibleTarget(args.target) : undefined;
  const detail = action === "wait" && args.match ? ` · ${short(args.match)}` : subject ? ` · ${subject}` : "";
  return new Text(`${theme.fg("toolTitle", theme.bold(`herdr ${kind} · ${action}`))}${theme.fg("muted", detail)}`, 0, 0);
}
function renderDetails(raw: string, summary: string, expanded: boolean, theme: any) {
  const visible = expanded && raw.trim() && raw.trim() !== summary.trim() ? `${summary}\n\n${theme.fg("muted", raw)}` : summary;
  return new Text(theme.fg("toolOutput", visible), 0, 0);
}
function errorSummary(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const error = (data as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return undefined;
  const fields = error as Record<string, unknown>;
  return typeof fields.message === "string" ? fields.message : undefined;
}
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
    renderCall(args, theme) { return renderCall("layout", args, theme); },
    renderResult(value, { expanded }, theme, context) {
      const raw = resultText(value); const data = parsedResult(value);
      if (context.isError) return renderDetails(raw, errorSummary(data) || raw, expanded, theme);
      if (!data || typeof data !== "object" || Array.isArray(data)) return renderDetails(raw, raw, expanded, theme);
      const item = data as Record<string, any>;
      let summary: string;
      if (context.args.action === "list" && Array.isArray(item.panes)) {
        const rows = item.panes.slice(0, expanded ? item.panes.length : 8).map((pane: Record<string, unknown>) => {
          const name = pane.agent || pane.label || pathName(pane.cwd) || pane.process || "unlabeled pane";
          const state = pane.state ? ` · ${pane.state}` : "";
          const focus = pane.focused ? " · focused" : "";
          return `${name}${state}${focus}`;
        });
        summary = rows.length ? `${item.total} panes\n${rows.join("\n")}${!expanded && item.total > rows.length ? `\n… ${item.total - rows.length} more` : ""}` : "No panes.";
      } else if (context.args.action === "resume") {
        summary = `${item.ready ? "resumed" : "resume started"}${pathName(item.cwd) ? ` · ${pathName(item.cwd)}` : ""}${item.state ? ` · ${item.state}` : ""}`;
      } else {
        summary = `created${context.args.label ? ` · ${context.args.label}` : pathName(context.args.cwd) ? ` · ${pathName(context.args.cwd)}` : ""}${item.focused ? " · focused" : ""}`;
      }
      return renderDetails(raw, summary, expanded, theme);
    },
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
    renderCall(args, theme) { return renderCall("agent", args, theme); },
    renderResult(value, { expanded }, theme, context) {
      const raw = resultText(value); const data = parsedResult(value);
      if (context.isError) return renderDetails(raw, errorSummary(data) || raw, expanded, theme);
      if (!data || typeof data !== "object" || Array.isArray(data)) return renderDetails(raw, raw, expanded, theme);
      const item = data as Record<string, any>; let summary: string;
      if (context.args.action === "list" && Array.isArray(item.agents)) {
        const rows = item.agents.slice(0, expanded ? item.agents.length : 8).map((agent: Record<string, unknown>) => `${agent.name || "unnamed agent"}${agent.status ? ` · ${agent.status}` : ""}`);
        summary = rows.length ? `${item.total} agents\n${rows.join("\n")}${!expanded && item.total > rows.length ? `\n… ${item.total - rows.length} more` : ""}` : "No live agents.";
      } else if (context.args.action === "read") summary = previewOutput(item.output, expanded) || "No recent output.";
      else if (context.args.action === "get") summary = `${item.name || visibleTarget(context.args.target) || "agent"}${item.status ? ` · ${item.status}` : ""}${pathName(item.cwd) ? `\n${item.cwd}` : ""}`;
      else if (context.args.action === "wait") summary = `reached ${item.response || context.args.until || "requested state"}`;
      else if (context.args.action === "prompt") summary = item.waited ? "prompt completed" : "prompt submitted";
      else summary = "keys submitted";
      return renderDetails(raw, summary, expanded, theme);
    },
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
    renderCall(args, theme) { return renderCall("pane", args, theme); },
    renderResult(value, { expanded }, theme, context) {
      const raw = resultText(value); const data = parsedResult(value);
      if (context.isError) return renderDetails(raw, errorSummary(data) || raw, expanded, theme);
      if (context.args.action === "read") return renderDetails(raw, previewOutput(raw, expanded) || "No recent output.", expanded, theme);
      if (!data || typeof data !== "object" || Array.isArray(data)) return renderDetails(raw, raw, expanded, theme);
      const item = data as Record<string, any>; let summary: string;
      if (context.args.action === "wait") summary = `${item.matched ? `matched “${short(item.matched)}”` : "output matched"}${item.output ? `\n${previewOutput(item.output, expanded)}` : ""}`;
      else if (context.args.action === "run") summary = "command submitted";
      else if (context.args.action === "rename") summary = `renamed${context.args.label ? ` · ${context.args.label}` : ""}`;
      else if (context.args.action === "move") summary = `moved${context.args.label ? ` · ${context.args.label}` : ""}${item.focused ? " · focused" : ""}`;
      else if (context.args.action === "close") summary = "closed";
      else summary = "interrupt submitted\nInspect the process before assuming it stopped.";
      return renderDetails(raw, summary, expanded, theme);
    },
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
