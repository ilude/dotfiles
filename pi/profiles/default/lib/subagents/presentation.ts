import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Text } from "@earendil-works/pi-tui";
import type { ChildRecord } from "./rpc.ts";
import { duration } from "./status.ts";

const COLLAPSED_LIMIT = 420;
const RESULT_LIMIT = 24_000;

type Theme = any;
type RenderContext = {
  args?: Record<string, unknown>;
  isError?: boolean;
  state?: Record<string, any>;
  lastComponent?: any;
  executionStarted?: boolean;
  expanded?: boolean;
  invalidate?: () => void;
};

function value(input: unknown): string {
  return typeof input === "string" ? input : input === undefined || input === null ? "" : String(input);
}

function oneLine(input: unknown, limit = COLLAPSED_LIMIT): string {
  const text = value(input).replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
}

function bounded(input: unknown, limit: number): string {
  const text = value(input).replace(/[\x00\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
}

function identity(record: Partial<ChildRecord>): string {
  return record.displayName ? `${record.displayName} · ${record.agent ?? "subagent"}` : record.agent ?? "subagent";
}

function assignment(record: Partial<ChildRecord>, expanded = false): string {
  return expanded
    ? bounded(record.assignment || "No assignment text recorded", Infinity)
    : oneLine(record.assignment || "No assignment text recorded");
}

function recordFrom(valueToInspect: unknown): Partial<ChildRecord> | undefined {
  if (!valueToInspect || typeof valueToInspect !== "object") return undefined;
  const candidate = valueToInspect as Partial<ChildRecord> & { record?: unknown };
  if (typeof candidate.status === "string" && (typeof candidate.id === "string" || typeof candidate.agent === "string")) return candidate;
  return recordFrom(candidate.record);
}

function recordFromResult(result: any): Partial<ChildRecord> | undefined {
  return recordFrom(result?.details) ?? recordFrom(result?.details?.record) ?? recordFrom(result);
}

function lastRecord(context: RenderContext): Partial<ChildRecord> | undefined {
  return recordFrom(context.state?.record);
}

function resultText(result: any): string {
  if (!Array.isArray(result?.content)) return "";
  return result.content.filter((part: any) => part?.type === "text").map((part: any) => value(part.text)).join("\n");
}

function outcomeLabel(record: Partial<ChildRecord>): string {
  if (record.phase === "cleanup") return `${record.outcome ? `${record.outcome} · ` : ""}cleaning up`;
  if (record.status === "waiting") {
    if (record.phase === "waiting-user") return "needs user input";
    if (record.phase === "waiting-parent") return "question for parent";
    return "waiting";
  }
  if (record.status !== "settled") {
    if (record.phase === "tool") return record.toolName ? `using ${record.toolName}` : "using a tool";
    if (record.phase === "waiting-children") return "waiting for children";
    if (record.phase === "model") return "working";
    return record.phase === "starting" ? "starting assignment" : record.phase ?? "starting assignment";
  }
  return record.outcome ?? "settled";
}

function assignmentTiming(record: Partial<ChildRecord>, now = Date.now()): string {
  const start = record.assignmentStartedAt ?? record.createdAt;
  if (!start) return "Duration: unknown";
  const finished = record.assignmentFinishedAt ?? (record.status === "settled" ? record.updatedAt : undefined);
  if (record.status === "settled" && !finished) return "Duration: unknown";
  const elapsed = duration(start, finished ? Date.parse(finished) : now);
  return finished ? `Duration: ${elapsed}` : `Elapsed: ${elapsed}`;
}

function startLine(record: Partial<ChildRecord>, now = Date.now()): string | undefined {
  const started = record.assignmentStartedAt ?? record.createdAt;
  if (!started) return undefined;
  return `Started: ${started} · ${assignmentTiming(record, now)}`;
}

function details(record: Partial<ChildRecord>, now = Date.now()): string[] {
  const lines = [
    `Role: ${record.agent ?? "unknown"}`,
    `Surface: ${record.surface ?? "unknown"}`,
    `Model: ${record.model ?? "default"} · effort: ${record.effort ?? "default"}`,
  ];
  if (record.cwd) lines.push(`Cwd: ${record.cwd}`);
  if (record.skills?.length) lines.push(`Skills: ${record.skills.join(", ")}`);
  if (record.parentId) lines.push(`Coordinator: ${record.parentId}`);
  if (record.waitState) lines.push(`Wait: ${record.waitState}`);
  const timing = startLine(record, now);
  if (timing) lines.push(timing);
  if (record.lastActivityAt && record.status !== "settled") lines.push(`Last activity: ${duration(record.lastActivityAt, now)} ago`);
  if (record.phase) lines.push(`Phase: ${record.phase}${record.toolName ? ` · ${record.toolName}` : ""}`);
  if (record.processState) lines.push(`Process: ${record.processState}${record.transportState ? ` · transport ${record.transportState}` : ""}`);
  return lines;
}

function activeDescription(record: Partial<ChildRecord>): string {
  if (record.userOwned) return "user intervention; parent control suspended";
  const state = outcomeLabel(record);
  if (record.status === "waiting" && record.result) return `Question: ${oneLine(record.result)}`;
  if (record.status !== "settled" && record.waitState === "detached") return `${state} · wait detached; child continues`;
  if (record.status !== "settled" && record.waitState === "background") return `${state} · started in background; child continues`;
  return state;
}

function callLines(args: Record<string, unknown>, record: Partial<ChildRecord> | undefined, theme: Theme, context: RenderContext): string {
  const isControl = !args?.agent;
  const action = value(args?.action || "control");
  const title = record
    ? `${isControl ? `subagent control · ${action}` : "subagent"} · ${identity(record)}`
    : isControl
      ? `subagent control · ${action}`
      : `subagent · ${value(args.agent)}`;
  const lines = [theme.fg("toolTitle", theme.bold(title))];
  if (record) {
    lines.push(`Role: ${record.agent ?? "unknown"}`);
    lines.push(`Assignment: ${assignment(record, context.expanded)}`);
    lines.push(`State: ${activeDescription(record)}`);
    const timing = startLine(record);
    if (timing) lines.push(timing);
    const model = record.model || value(args.model) || "default";
    const effort = record.effort || value(args.effort) || "default";
    const surface = record.surface || value(args.surface) || "unknown";
    lines.push(`Config: ${model} · effort ${effort} · ${surface}`);
    if (record.error) lines.push(theme.fg("error", `Error: ${oneLine(record.error)}`));
  } else {
    const instructions = value(args?.instructions);
    if (instructions) lines.push(`Assignment: ${context.expanded ? bounded(instructions, Infinity) : oneLine(instructions)}`);
    if (args?.id) lines.push(`Target: ${oneLine(args.id, 120)}`);
    if (args?.message) lines.push(`Message: ${oneLine(args.message)}`);
    if (args?.agent) lines.push(`Wait: ${args?.background ? "background" : "foreground"}`);
    const requested = ["surface", "model", "effort", "background", "retain"].filter(key => args?.[key] !== undefined).map(key => `${key}=${oneLine(args[key], 80)}`);
    if (requested.length) lines.push(`Requested: ${requested.join(" · ")}`);
    const startedAt = context.state?.startedAt;
    if (startedAt) lines.push(`Started: ${new Date(startedAt).toISOString()} · Elapsed: ${duration(new Date(startedAt).toISOString())}`);
  }
  return lines.join("\n");
}

function callComponent(args: Record<string, unknown>, theme: Theme, context: RenderContext): Text {
  const state = context.state ?? (context.state = {});
  if (context.executionStarted && state.startedAt === undefined) state.startedAt = Date.now();
  state.args = args;
  const record = lastRecord(context);
  const component = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
  state.callComponent = component;
  component.setText(callLines(args, record, theme, context));
  return component;
}

function updateCallComponent(result: any, theme: Theme, context: RenderContext): void {
  const state = context.state ?? (context.state = {});
  const record = recordFromResult(result);
  if (record) state.record = record;
  // lastComponent here belongs to the result renderer, not the call header.
  const component = state.callComponent;
  if (!component || !record) return;
  // Already inside the row's render pass. Scheduling another pass here can loop.
  component.setText(callLines(state.args ?? context.args ?? {}, record, theme, context));
}

function resultComponent(record: Partial<ChildRecord>, expanded: boolean, theme: Theme): any {
  const title = `${identity(record)} · ${outcomeLabel(record)}`;
  const lines = [theme.fg(record.status === "settled" && record.outcome !== "complete" ? "warning" : "accent", theme.bold(title))];
  if (record.status !== "settled") {
    lines.push(`Activity: ${activeDescription(record)}`);
    if (record.lastActivityAt) lines.push(theme.fg("dim", `Last activity ${duration(record.lastActivityAt)} ago`));
  }
  if (record.error) lines.push(theme.fg("error", `Error: ${expanded ? bounded(record.error, RESULT_LIMIT) : oneLine(record.error)}`));
  if (record.notice) lines.push(theme.fg("muted", oneLine(record.notice)));
  if (record.status === "waiting" && record.result) lines.push(`Question: ${oneLine(record.result)}`);
  const output = bounded(record.result, RESULT_LIMIT);
  if (output && record.status === "settled" && !expanded) lines.push(`Result: ${oneLine(output)}`);
  const timing = startLine(record);
  if (timing) lines.push(timing);

  if (!expanded) return new Text(lines.join("\n"), 0, 0);
  const container = new Container();
  container.addChild(new Text(lines.join("\n"), 0, 0));
  container.addChild(new Text(`Assignment:\n${assignment(record, true)}`, 0, 0));
  if (output) container.addChild(new Markdown(output, 0, 0, getMarkdownTheme()));
  container.addChild(new Text(details(record).join("\n"), 0, 0));
  return container;
}

export function renderSubagentCall(args: Record<string, unknown>, theme: Theme, context: RenderContext): any {
  return callComponent(args, theme, context);
}

export function renderSubagentControlCall(args: Record<string, unknown>, theme: Theme, context: RenderContext): any {
  return callComponent({ ...args, agent: undefined, action: args?.action ?? "control" }, theme, context);
}

export function renderSubagentResult(result: any, options: { expanded?: boolean; isPartial?: boolean }, theme: Theme, context: RenderContext): any {
  updateCallComponent(result, theme, context);
  const record = recordFromResult(result);
  if (record) return resultComponent(record, !!options?.expanded, theme);
  if (options?.isPartial) return new Text(theme.fg("warning", "Subagent is working…"), 0, 0);
  const error = result?.details && typeof result.details.error === "string" ? result.details.error : undefined;
  if (error) return new Text(theme.fg("error", `Error: ${oneLine(error, RESULT_LIMIT)}`), 0, 0);
  if (Array.isArray(result?.details)) {
    const rows = result.details.map((item: unknown) => {
      const row = recordFrom(item);
      return row ? `${identity(row)} · ${outcomeLabel(row)}${row.result ? ` · ${oneLine(row.result, 120)}` : ""}` : oneLine(item, 180);
    });
    return new Text(rows.length ? rows.join("\n") : "No subagents", 0, 0);
  }
  const text = resultText(result) || "No result";
  return new Text(theme.fg(context?.isError ? "error" : "muted", bounded(text, RESULT_LIMIT)), 0, 0);
}

export function presentationDetails(record: Partial<ChildRecord>): Record<string, unknown> {
  return {
    displayName: record.displayName,
    agent: record.agent,
    outcome: record.outcome,
    status: record.status,
    assignment: record.assignment,
    model: record.model,
    effort: record.effort,
    surface: record.surface,
    cwd: record.cwd,
    skills: record.skills,
    phase: record.phase,
    toolName: record.toolName,
    waitState: record.waitState,
    retained: record.retained,
    assignmentStartedAt: record.assignmentStartedAt,
    assignmentFinishedAt: record.assignmentFinishedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    processState: record.processState,
    transportState: record.transportState,
    parentId: record.parentId,
    userOwned: record.userOwned,
    lastActivityAt: record.lastActivityAt,
    result: record.result,
    error: record.error,
    notice: record.notice,
  };
}

export function renderSubagentMessage(message: any, options: { expanded?: boolean; outputPad?: number }, theme: Theme): any {
  const record = recordFromResult(message);
  if (record) return resultComponent(record, !!options?.expanded, theme);
  const text = typeof message?.content === "string" ? message.content : resultText(message);
  const firstBreak = text.indexOf("\n");
  const header = firstBreak < 0 ? text : text.slice(0, firstBreak);
  const body = firstBreak < 0 ? "" : text.slice(firstBreak + 1);
  const meta = message?.details as Record<string, unknown> | undefined;
  const title = meta?.displayName ? `Subagent ${value(meta.displayName)}${meta.agent ? ` · ${value(meta.agent)}` : ""}` : header;
  const container = new Container();
  container.addChild(new Text(theme.fg("accent", theme.bold(title)), options?.outputPad ?? 0, 0));
  if (body || !meta?.displayName) container.addChild(new Markdown(bounded(body || text, RESULT_LIMIT), 0, 0, getMarkdownTheme()));
  if (options?.expanded && meta) {
    const extra = [`Status: ${value(meta.outcome || meta.status || "settled")}`];
    if (meta.assignment) extra.push(`Assignment:\n${bounded(meta.assignment, Infinity)}`);
    if (meta.model || meta.effort) extra.push(`Model: ${value(meta.model || "default")} · effort: ${value(meta.effort || "default")}`);
    if (meta.surface) extra.push(`Surface: ${value(meta.surface)}`);
    if (meta.cwd) extra.push(`Cwd: ${value(meta.cwd)}`);
    if (meta.assignmentStartedAt) {
      const finish = typeof meta.assignmentFinishedAt === "string" ? Date.parse(meta.assignmentFinishedAt) : Date.now();
      extra.push(`Started: ${value(meta.assignmentStartedAt)} · ${meta.assignmentFinishedAt ? `Duration: ${duration(value(meta.assignmentStartedAt), finish)}` : `Elapsed: ${duration(value(meta.assignmentStartedAt))}`}`);
    }
    if (meta.result && !body) extra.push(`Result:\n${bounded(meta.result, RESULT_LIMIT)}`);
    if (meta.error) extra.push(`Error: ${oneLine(meta.error, RESULT_LIMIT)}`);
    container.addChild(new Text(theme.fg("dim", extra.join("\n")), 0, 0));
  }
  return container;
}

export function progressResult(record: ChildRecord): { content: Array<{ type: "text"; text: string }>; details: ChildRecord } {
  return { content: [{ type: "text", text: `${identity(record)} · ${activeDescription(record)} · ${assignmentTiming(record)}` }], details: record };
}
