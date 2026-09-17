import { getMarkdownTheme, keyHint } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Text } from "@earendil-works/pi-tui";
import type { DispatchMetadata } from "./control-result.ts";
import type { ChildRecord } from "./rpc.ts";
import { duration } from "./status.ts";

const COLLAPSED_LIMIT = 420;
const PROMPT_LIMIT = 160;
const RESULT_LIMIT = 24_000;

type Theme = any;
type PresentedRecord = Partial<ChildRecord> & { dispatch?: DispatchMetadata };

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

function localTimestamp(input: string | number): string {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function recordFrom(valueToInspect: unknown): PresentedRecord | undefined {
  if (!valueToInspect || typeof valueToInspect !== "object") return undefined;
  const candidate = valueToInspect as PresentedRecord & { record?: unknown };
  if (typeof candidate.status === "string" && (typeof candidate.id === "string" || typeof candidate.agent === "string")) return candidate;
  return recordFrom(candidate.record);
}

function recordFromResult(result: any): PresentedRecord | undefined {
  return recordFrom(result?.details) ?? recordFrom(result?.details?.record) ?? recordFrom(result);
}

function lastRecord(context: RenderContext): PresentedRecord | undefined {
  return recordFrom(context.state?.record);
}

function resultText(result: any): string {
  if (!Array.isArray(result?.content)) return "";
  return result.content.filter((part: any) => part?.type === "text").map((part: any) => value(part.text)).join("\n");
}

function outcomeLabel(record: PresentedRecord): string {
  if (record.questionResolution) return `question ${record.questionResolution.outcome}`;
  if (record.phase === "cleanup") return `${record.outcome ? `${record.outcome} · ` : ""}cleaning up`;
  if (record.status === "waiting") {
    if (record.phase === "waiting-user") return "needs user input";
    if (record.phase === "waiting-parent") return "question for parent";
    return "waiting";
  }
  if (record.status !== "settled") {
    if (record.exchangeKind && record.exchangeKind !== "original") return `${record.exchangeKind} in progress`;
    if (record.phase === "redirecting") return "redirecting current turn";
    if (record.phase === "tool") return record.toolName ? `using ${record.toolName}` : "using a tool";
    if (record.phase === "waiting-children") return "waiting for children";
    if (record.phase === "model") return "working";
    return record.phase === "starting" ? "starting assignment" : record.phase ?? "starting assignment";
  }
  if (record.exchangeKind && record.exchangeKind !== "original") return `${record.exchangeKind} ${record.outcome ?? "settled"}`;
  if (record.outcome === "complete" && record.retained && record.processState !== "exited") return "completed, retained for follow-up";
  if (record.retained && record.processState === "exited") return `${record.outcome ?? "settled"} · conversation closed`;
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

function terminalLine(record: Partial<ChildRecord>): string | undefined {
  if (record.status !== "settled") return undefined;
  const finished = record.assignmentFinishedAt ?? record.updatedAt;
  if (!finished) return undefined;
  const label = record.outcome === "complete" ? "Completed" : "Failed";
  return `${label} ${localTimestamp(finished)}`;
}

function startLine(record: Partial<ChildRecord>, now = Date.now()): string | undefined {
  const started = record.assignmentStartedAt ?? record.createdAt;
  if (!started) return undefined;
  return `Started: ${localTimestamp(started)} · ${assignmentTiming(record, now)}`;
}

function details(record: Partial<ChildRecord>): string[] {
  const lines = [`Surface: ${record.surface ?? "unknown"}`];
  if (record.cwd) lines.push(`Cwd: ${record.cwd}`);
  if (record.skills?.length) lines.push(`Skills: ${record.skills.join(", ")}`);
  if (record.parentId) lines.push(`Coordinator: ${record.parentId}`);
  if (record.waitState) lines.push(`Wait: ${record.waitState}`);
  if (record.processState || record.transportState) {
    lines.push(`Process: ${record.processState ?? "unknown"}${record.transportState ? ` · transport ${record.transportState}` : ""}`);
  }
  return lines;
}

function activeDescription(record: Partial<ChildRecord>): string {
  if (record.userOwned) return "user intervention; parent control suspended";
  if (record.phase === "redirecting") return "redirecting current turn";
  const state = outcomeLabel(record);
  if (record.questionResolution) return `Question ${record.questionResolution.outcome}: ${oneLine(record.result)}`;
  if (record.status === "waiting" && record.result) return `Question: ${oneLine(record.result)}`;
  if (record.requestId && record.result) return `Question: ${oneLine(record.result)}`;
  if (record.status !== "settled" && record.waitState === "detached") return `${state} · wait detached; child continues`;
  if (record.status !== "settled" && record.waitState === "background") return `${state} · started in background; child continues`;
  return state;
}

function callLines(args: Record<string, unknown>, record: Partial<ChildRecord> | undefined, theme: Theme, context: RenderContext): string {
  const isControl = !args?.agent;
  const action = value(args?.action || "control");
  if (isControl) {
    const title = record ? `subagent control · ${action} · ${identity(record)}` : `subagent control · ${action}`;
    const lines = [theme.fg("toolTitle", theme.bold(title))];
    if (args?.id) lines.push(`Target: ${oneLine(args.id, 120)}`);
    if (args?.message) lines.push(`Message: ${oneLine(args.message)}`);
    return lines.join("\n");
  }

  const name = record?.displayName ?? "pending";
  const role = record?.agent ?? (value(args.agent) || "subagent");
  const model = record?.model || value(args.model) || "default";
  const effort = record?.effort || value(args.effort) || "default";
  const started = record?.assignmentStartedAt ?? record?.createdAt ?? context.state?.startedAt;
  const header = `Subagent ${name}  ${role}  ${model}[${effort}]  ${started ? localTimestamp(started) : "starting"}`;
  const prompt = value(args?.instructions) || value(record?.assignment);
  const lines = [theme.fg("toolTitle", theme.bold(header))];
  if (prompt) lines.push(bounded(prompt, RESULT_LIMIT));
  const terminal = record ? terminalLine(record) : undefined;
  if (terminal) lines.push(terminal);
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

function lifecycleLine(record: PresentedRecord): string {
  const name = record.displayName ?? record.agent ?? "Subagent";
  if (record.dispatch) return `${name}: ${record.dispatch.operation} accepted`;
  if (record.questionResolution) return `${name}'s question was ${record.questionResolution.outcome}`;
  if (record.status === "waiting" && record.phase === "waiting-user") return `${name} needs user input${record.result ? `: ${oneLine(record.result)}` : ""}`;
  if (record.status === "waiting" && record.result) return `${name} asked: ${oneLine(record.result)}`;
  if (record.status !== "settled" && record.waitState === "detached") return `${name}: wait detached; child continues`;
  if (record.status !== "settled" && record.waitState === "background") return `${name}: started in background; child continues`;
  if (record.status === "settled") {
    const event = record.outcome === "failed" ? "failed" : record.outcome === "cancelled" ? "was cancelled" : "completed";
    return `${name} ${event}${record.error ? `: ${oneLine(record.error)}` : ""}`;
  }
  return `${name}: ${activeDescription(record)}`;
}

function resultComponent(record: PresentedRecord, expanded: boolean, theme: Theme, includeIdentity = false): any {
  // The launch row owns identity, model, timing and prompt. Paired result rows only add state and output.
  const state = outcomeLabel(record);
  const title = includeIdentity ? `${identity(record)} · ${state}` : state;
  const titleColor = record.status === "settled" && record.outcome === "failed"
    ? "error"
    : record.status === "settled" && record.outcome !== "complete"
      ? "warning"
      : "accent";
  const lines = [theme.fg(titleColor, theme.bold(title))];
  if (record.dispatch) {
    lines.push(`Dispatch: accepted · ${record.dispatch.operation} · completion not reported`);
  }
  if (record.exchangeId) {
    lines.push(`Exchange: ${record.exchangeKind ?? "original"} · ${record.exchangeId}`);
  }
  if (record.exchangeKind && record.exchangeKind !== "original") {
    lines.push("Original assignment result is retained separately.");
  }
  if (includeIdentity) {
    lines.push(`Model: ${record.model ?? "default"} [${record.effort ?? "default"}]`);
    const prompt = value(record.assignment);
    if (prompt) lines.push(expanded ? `Prompt:\n${bounded(prompt, Infinity)}` : `Prompt: ${oneLine(prompt, PROMPT_LIMIT)} ${theme.fg("dim", keyHint("app.tools.expand", "for full prompt"))}`);
    const timing = startLine(record);
    if (timing) lines.push(timing);
  }
  if (record.status !== "settled") {
    const activity = record.userOwned
      ? "user intervention; parent control suspended"
      : record.waitState === "detached"
        ? "wait detached; child continues"
        : record.waitState === "background"
          ? "started in background; child continues"
          : undefined;
    if (activity) lines.push(`Activity: ${activity}`);
    if (record.lastActivityAt) lines.push(theme.fg("dim", `Last activity ${duration(record.lastActivityAt)} ago`));
  }
  if (record.error) lines.push(theme.fg("error", `Error: ${expanded ? bounded(record.error, RESULT_LIMIT) : oneLine(record.error)}`));
  if (record.notice) lines.push(theme.fg("muted", oneLine(record.notice)));
  if (record.requestId) lines.push(`Request ID: ${record.requestId}`);
  else if (record.questionResolution) lines.push(`Request ID: ${record.questionResolution.requestId}`);
  if (!expanded && record.status === "waiting" && record.result) lines.push(`Question: ${oneLine(record.result)}`);
  const output = bounded(record.result, RESULT_LIMIT);
  if (output && record.status === "settled" && !expanded) lines.push(`Result: ${oneLine(output)}`);

  if (!expanded) return new Text(lines.join("\n"), 0, 0);
  const container = new Container();
  container.addChild(new Text(lines.join("\n"), 0, 0));
  const original = record.originalAssignment;
  const hasSeparateOriginal = !!original && record.exchangeId !== undefined && record.exchangeId !== original.exchangeId;
  if (hasSeparateOriginal && original) {
    const originalLines = [
      "Original assignment",
      `Prompt: ${bounded(original.assignment, Infinity)}`,
      `Outcome: ${original.outcome}`,
      `Started: ${original.startedAt}`,
      `Finished: ${original.finishedAt}`,
      `Exchange: original · ${original.exchangeId}`,
    ];
    container.addChild(new Text(originalLines.join("\n"), 0, 0));
    if (original.result) container.addChild(new Markdown(`Original result:\n\n${bounded(original.result, RESULT_LIMIT)}`, 0, 0, getMarkdownTheme()));
    if (original.error) container.addChild(new Text(`Original error: ${bounded(original.error, RESULT_LIMIT)}`, 0, 0));
  }
  if (output) container.addChild(new Markdown(`${hasSeparateOriginal ? "Current exchange result:\n\n" : ""}${output}`, 0, 0, getMarkdownTheme()));
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
  context.expanded = !!options?.expanded;
  updateCallComponent(result, theme, context);
  const record = recordFromResult(result);
  if (record) {
    const passedPrompt = value(context.state?.args?.instructions ?? context.args?.instructions);
    const displayRecord = passedPrompt ? { ...record, assignment: passedPrompt } : record;
    if (context.state?.args?.agent && context.state?.callComponent) {
      if (options?.expanded) return resultComponent(displayRecord, true, theme);
      if (record.status === "settled") return new Text("", 0, 0);
      return new Text(lifecycleLine(displayRecord), 0, 0);
    }
    if (!options?.expanded) return new Text(lifecycleLine(displayRecord), 0, 0);
    return resultComponent(displayRecord, true, theme);
  }
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
    id: record.id,
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
    requestId: record.requestId,
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
    exchangeId: record.exchangeId,
    exchangeKind: record.exchangeKind,
    originalAssignment: record.originalAssignment ? { ...record.originalAssignment } : undefined,
    cleanup: record.cleanup ? { ...record.cleanup, errors: [...record.cleanup.errors] } : undefined,
    paneState: record.paneState,
    launcherState: record.launcherState,
    questionResolution: record.questionResolution,
  };
}

export function renderSubagentMessage(message: any, options: { expanded?: boolean; outputPad?: number }, theme: Theme): any {
  const record = recordFromResult(message);
  if (record) {
    if (options?.expanded) return resultComponent(record, true, theme, true);
    return new Text(lifecycleLine(record), options?.outputPad ?? 0, 0);
  }
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
    if (meta.assignment) extra.push(`Prompt:\n${bounded(meta.assignment, Infinity)}`);
    if (meta.model || meta.effort) extra.push(`Model: ${value(meta.model || "default")} [${value(meta.effort || "default")}]`);
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
