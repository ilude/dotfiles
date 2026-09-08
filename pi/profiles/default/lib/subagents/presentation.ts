import { Container, Markdown, Text } from "@earendil-works/pi-tui";
import type { ChildRecord } from "./rpc.ts";
import { duration } from "./status.ts";

const LIMIT = 420;

type Theme = any;
type RenderContext = any;

function markdownTheme(theme: Theme) {
  return {
    heading: (text: string) => theme.fg("mdHeading", text), link: (text: string) => theme.fg("mdLink", text),
    linkUrl: (text: string) => theme.fg("mdLinkUrl", text), code: (text: string) => theme.fg("mdCode", text),
    codeBlock: (text: string) => theme.fg("mdCodeBlock", text), codeBlockBorder: (text: string) => theme.fg("mdCodeBlockBorder", text),
    quote: (text: string) => theme.fg("mdQuote", text), quoteBorder: (text: string) => theme.fg("mdQuoteBorder", text),
    hr: (text: string) => theme.fg("mdHr", text), listBullet: (text: string) => theme.fg("mdListBullet", text),
    bold: (text: string) => theme.bold(text), italic: (text: string) => theme.italic?.(text) ?? text,
    strikethrough: (text: string) => theme.strikethrough?.(text) ?? text, underline: (text: string) => text,
  };
}

function value(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function clean(value: string, limit = LIMIT): string {
  const oneLine = value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
  return oneLine.length > limit ? `${oneLine.slice(0, Math.max(0, limit - 1))}…` : oneLine;
}

function identity(record: Partial<ChildRecord>): string {
  return record.displayName ? `${record.displayName} · ${record.agent ?? "subagent"}` : record.agent ?? "subagent";
}

function assignment(record: Partial<ChildRecord>): string {
  return clean(record.assignment || "No assignment text recorded");
}

function outcomeLabel(record: Partial<ChildRecord>): string {
  if (record.status === "waiting") {
    if (record.phase === "waiting-user") return "needs user input";
    if (record.phase === "waiting-parent") return "question for parent";
    return "waiting";
  }
  if (record.status !== "settled") {
    if (record.phase === "cleanup") return "cleaning up";
    if (record.phase === "tool") return record.toolName ? `using ${record.toolName}` : "using a tool";
    if (record.phase === "waiting-children") return "waiting for children";
    if (record.phase === "model") return "working";
    return record.phase ?? "starting";
  }
  return record.outcome ?? "settled";
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
  if (record.assignmentStartedAt) {
    const end = record.assignmentFinishedAt ? Date.parse(record.assignmentFinishedAt) : now;
    const started = Date.parse(record.assignmentStartedAt);
    const elapsed = Number.isFinite(started) ? duration(record.assignmentStartedAt, end) : "unknown";
    lines.push(`Elapsed: ${elapsed}`);
  }
  if (record.lastActivityAt) lines.push(`Last activity: ${duration(record.lastActivityAt, now)} ago`);
  return lines;
}

function recordFrom(value: unknown): Partial<ChildRecord> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<ChildRecord>;
  return typeof candidate.status === "string" && (typeof candidate.id === "string" || typeof candidate.agent === "string") ? candidate : undefined;
}

function resultText(result: any): string {
  if (!Array.isArray(result?.content)) return "";
  return result.content.filter((part: any) => part?.type === "text").map((part: any) => value(part.text)).join("\n");
}

function recordFromResult(result: any): Partial<ChildRecord> | undefined {
  return recordFrom(result?.details) ?? recordFrom(result?.details?.record);
}

function resultComponent(record: Partial<ChildRecord>, expanded: boolean, theme: Theme): any {
  const title = `${identity(record)} · ${outcomeLabel(record)}`;
  const lines = [theme.fg(record.status === "settled" && record.outcome !== "complete" ? "warning" : "accent", theme.bold(title))];
  if (record.assignment) lines.push(`Assignment: ${assignment(record)}`);
  if (record.model || record.effort || record.surface) lines.push(`Config: ${record.model ?? "default"} · effort ${record.effort ?? "default"} · ${record.surface ?? "unknown"}`);
  if (record.status !== "settled") {
    const activity = record.phase === "starting" ? "starting assignment" : record.phase === "model" ? "working" : record.phase === "tool" ? `using ${record.toolName || "a tool"}` : record.phase || "active";
    lines.push(`Activity: ${activity}`);
    if (record.lastActivityAt) lines.push(theme.fg("dim", `Last activity ${duration(record.lastActivityAt)} ago`));
    if (record.status === "waiting" && record.result) lines.push(`Question: ${clean(record.result)}`);
    if (record.waitState === "detached") lines.push(theme.fg("muted", "Wait detached; child continues."));
    if (record.waitState === "background") lines.push(theme.fg("muted", "Started in background; child continues."));
    lines.push(theme.fg("dim", `Elapsed ${duration(record.assignmentStartedAt ?? record.createdAt)}`));
  }
  if (record.error) lines.push(theme.fg("error", `Error: ${clean(record.error)}`));
  if (record.notice) lines.push(theme.fg("muted", clean(record.notice)));

  const output = value(record.result);
  if (output && record.status === "settled") {
    if (expanded) {
      const container = new Container();
      container.addChild(new Text(lines.join("\n"), 0, 0));
      container.addChild(new Markdown(output, 0, 0, markdownTheme(theme)));
      container.addChild(new Text(details(record).join("\n"), 0, 0));
      return container;
    }
    lines.push(`Result: ${clean(output)}`);
  } else if (expanded) {
    lines.push(...details(record));
  }
  return new Text(lines.join("\n"), 0, 0);
}

export function renderSubagentCall(args: Record<string, unknown>, theme: Theme, _context: RenderContext): any {
  const action = args?.agent ? "launch" : value(args?.action || "control");
  const name = args?.agent ? `subagent · ${value(args.agent)}` : `subagent control · ${action}`;
  const lines = [theme.fg("toolTitle", theme.bold(name))];
  const instructions = value(args?.instructions);
  if (instructions) lines.push(`Assignment: ${clean(instructions)}`);
  if (args?.id) lines.push(`Target: ${clean(value(args.id), 120)}`);
  if (args?.message) lines.push(`Message: ${clean(value(args.message))}`);
  if (args?.agent) lines.push(`Wait: ${args?.background ? "background" : "foreground"}`);
  const requested = ["surface", "model", "effort", "background", "retain"].filter(key => args?.[key] !== undefined).map(key => `${key}=${clean(value(args[key]), 80)}`);
  if (requested.length) lines.push(`Requested: ${requested.join(" · ")}`);
  return new Text(lines.join("\n"), 0, 0);
}

export function renderSubagentControlCall(args: Record<string, unknown>, theme: Theme, context: RenderContext): any {
  return renderSubagentCall({ ...args, agent: undefined, action: args?.action ?? "control" }, theme, context);
}

export function renderSubagentResult(result: any, options: { expanded?: boolean; isPartial?: boolean }, theme: Theme, context: RenderContext): any {
  const record = recordFromResult(result);
  if (record) return resultComponent(record, !!options?.expanded, theme);
  if (options?.isPartial) return new Text(theme.fg("warning", "Subagent is working…"), 0, 0);
  const error = result?.details && typeof result.details.error === "string" ? result.details.error : undefined;
  if (error) return new Text(theme.fg("error", `Error: ${error}`), 0, 0);
  if (Array.isArray(result?.details)) {
    const lines = result.details.map((item: unknown) => {
      const row = recordFrom(item);
      return row ? `${identity(row)} · ${outcomeLabel(row)}${row.result ? ` · ${clean(row.result, 120)}` : ""}` : clean(value(item), 180);
    });
    return new Text(lines.length ? lines.join("\n") : "No subagents", 0, 0);
  }
  const text = resultText(result) || "No result";
  return new Text(theme.fg(context?.isError ? "error" : "muted", text), 0, 0);
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
    error: record.error,
    notice: record.notice,
  };
}

export function renderSubagentMessage(message: any, options: { expanded?: boolean; outputPad?: number }, theme: Theme): any {
  const text = typeof message?.content === "string" ? message.content : resultText(message);
  const firstBreak = text.indexOf("\n");
  const header = firstBreak < 0 ? text : text.slice(0, firstBreak);
  const body = firstBreak < 0 ? "" : text.slice(firstBreak + 1);
  const meta = message?.details as Record<string, unknown> | undefined;
  const title = meta?.displayName ? `Subagent ${meta.displayName}${meta.agent ? ` · ${meta.agent}` : ""}` : header;
  const container = new Container();
  container.addChild(new Text(theme.fg("accent", theme.bold(title)), options?.outputPad ?? 0, 0));
  if (body || !meta?.displayName) container.addChild(new Markdown(body || text, 0, 0, markdownTheme(theme)));
  if (options?.expanded && meta) {
    const extra = [`Status: ${value(meta.outcome || meta.status || "settled")}`];
    if (meta.assignment) extra.push(`Assignment: ${clean(value(meta.assignment))}`);
    if (meta.model || meta.effort) extra.push(`Model: ${value(meta.model || "default")} · effort: ${value(meta.effort || "default")}`);
    if (meta.surface) extra.push(`Surface: ${value(meta.surface)}`);
    if (meta.cwd) extra.push(`Cwd: ${value(meta.cwd)}`);
    if (meta.error) extra.push(`Error: ${clean(value(meta.error))}`);
    container.addChild(new Text(theme.fg("dim", extra.join("\n")), 0, 0));
  }
  return container;
}

export function progressResult(record: ChildRecord): { content: Array<{ type: "text"; text: string }>; details: ChildRecord } {
  return { content: [{ type: "text", text: `${identity(record)} · ${outcomeLabel(record)}` }], details: record };
}
