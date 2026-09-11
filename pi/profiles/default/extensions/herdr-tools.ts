import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { resumeHerdrSession } from "../lib/herdr-resume.ts";
import { Type } from "typebox";
import { compactPane, createHerdrCli, herdrContext, inspectPane, inspectShell, OUTPUT_LIMIT, result, type HerdrCli } from "../lib/herdr-cli.ts";

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
  const owned = new Set<string>();
  pi.on("session_start", () => owned.clear());
  pi.registerTool({
    name: "herdr_layout", label: "Herdr layout",
    description: "Inspect/create process panes, or resume a Pi session UUID in a new focused tab with one call. Resume uses the saved cwd and active profile, checks startup, and returns tab/pane IDs. Split/tab preserve focus.",
    parameters: Type.Object({ action: choice(["list", "split", "tab", "resume"]), session: Type.Optional(Type.String({ description: "Existing session UUID, required for resume" })), direction: Type.Optional(choice(["right", "down"])), cwd: Type.Optional(Type.String()) }),
    async execute(_id, params, signal, _update, ctx) {
      const caller = herdrContext();
      if (params.action === "resume") {
        return text(await resumeHerdrSession(required(params.session, "session"), join(getAgentDir(), "sessions"), cli, signal));
      }
      if (params.action === "list") {
        const panes = result(await cli(["pane", "list", "--workspace", caller.workspace], { signal })).panes;
        return text(panes.slice(0, 40).map(compactPane));
      }
      const cwd = params.cwd || ctx.cwd;
      const args = params.action === "split"
        ? ["pane", "split", "--pane", caller.pane, "--direction", params.direction || "right", "--cwd", cwd, "--no-focus"]
        : ["tab", "create", "--workspace", caller.workspace, "--cwd", cwd, "--no-focus"];
      const response = result(await cli(args, { signal }));
      const pane = response.pane || response.root_pane;
      const compact = compactPane(pane); owned.add(compact.pane);
      return text(compact);
    },
  });
  pi.registerTool({
    name: "herdr_pane", label: "Herdr pane",
    description: "Read, run, wait, rename, interrupt, or close a process pane. Run requires an idle Bash/PowerShell shell; close requires ownership and confirmation.",
    parameters: Type.Object({
      action: choice(["read", "run", "wait", "rename", "interrupt", "close"]), pane: Type.String(),
      command: Type.Optional(Type.String({ maxLength: 32000 })), label: Type.Optional(Type.String({ maxLength: 80 })),
      match: Type.Optional(Type.String({ maxLength: 1000 })), lines: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
      timeoutSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 120 })), confirm: Type.Optional(Type.Boolean()),
    }),
    async execute(id, params, signal, _update, ctx) {
      const caller = herdrContext(); const pane = required(params.pane, "pane");
      await inspectPane(cli, pane, signal);
      if (params.action === "read") return text(await cli(["pane", "read", pane, "--source", "recent-unwrapped", "--lines", String(params.lines || 80)], { signal }));
      if (params.action === "wait") {
        const timeout = (params.timeoutSeconds || 30) * 1000;
        const response = result(await cli(["pane", "wait-output", pane, "--match", required(params.match, "match"), "--timeout", String(timeout)], { timeoutMs: timeout + 2000, signal }));
        return text({ pane, matched: response.matched_line, output: response.read?.text?.slice(-8000) });
      }
      if (pane === caller.pane) throw new Error("Refusing to control Pi's own pane");
      if (params.action === "run") return checkedCommand(pi, cli, pane, required(params.command, "command"), id, ctx, signal);
      if (params.action === "rename") { await cli(["pane", "rename", pane, required(params.label, "label")], { signal }); return text({ pane, renamed: true }); }
      if (!owned.has(pane)) throw new Error("Pane was not created by this session; refusing interruption/closure");
      if (params.action === "close") {
        if (params.confirm !== true) throw new Error("close requires confirm=true");
        await cli(["pane", "close", pane], { signal }); owned.delete(pane);
        return text({ pane, closed: true });
      }
      await cli(["pane", "send-keys", pane, "ctrl+c"], { signal });
      return text({ pane, interruptSubmitted: true, next: "Inspect process/output before assuming it stopped." });
    },
  });
}
