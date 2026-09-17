import type { ChildRecord } from "./rpc.ts";

const PREVIEW_LIMIT = 240;
const RESULT_LIMIT = 24_000;

export function duration(since: string | undefined, now = Date.now()): string {
  if (!since) return "none observed";
  const started = Date.parse(since);
  const current = typeof now === "number" ? now : Date.now();
  if (!Number.isFinite(started) || !Number.isFinite(current)) return "unknown";
  const seconds = Math.max(0, Math.floor((current - started) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function clean(input: unknown, limit = PREVIEW_LIMIT): string {
  const text = typeof input === "string" ? input : input == null ? "" : String(input);
  const oneLine = text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
  return oneLine.length > limit ? `${oneLine.slice(0, Math.max(0, limit - 1))}…` : oneLine;
}

function bounded(input: unknown, limit = RESULT_LIMIT): string {
  const text = typeof input === "string" ? input : input == null ? "" : String(input);
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
}

function identity(record: Partial<ChildRecord>): string {
  return record.displayName ? `${record.displayName} · ${record.agent ?? "subagent"}` : record.agent ?? "subagent";
}

function timing(record: ChildRecord, now: number): string {
  const started = record.assignmentStartedAt ?? record.createdAt;
  if (!started) return "duration unknown";
  const finished = record.assignmentFinishedAt ?? (record.status === "settled" ? record.updatedAt : undefined);
  if (finished) return `duration ${duration(started, Date.parse(finished))}`;
  if (record.status === "settled") return "duration unknown";
  return `elapsed ${duration(started, now)}`;
}

function exchangeLabel(record: Pick<ChildRecord, "exchangeKind" | "exchangeId">): string {
  const kind = record.exchangeKind ?? "original";
  return `${kind} exchange${record.exchangeId ? ` ${record.exchangeId}` : ""}`;
}

function retainedState(record: ChildRecord): string | undefined {
  if (!record.retained) return undefined;
  if (record.processState === "exited") return "retained record closed; follow-up unavailable";
  return "retained and available for follow-up";
}

function stateText(record: ChildRecord): string {
  if (record.status === "waiting") {
    if (record.phase === "waiting-user") return "needs user-only input; use escalate";
    if (record.phase === "waiting-parent") return "waiting for parent reply; parent reply pending";
    return "waiting";
  }
  if (record.status !== "settled") {
    return record.exchangeKind && record.exchangeKind !== "original"
      ? `${record.exchangeKind} in progress`
      : record.phase === "redirecting" ? "redirecting current turn" : "working";
  }
  const outcome = record.outcome ?? "settled";
  if (record.exchangeKind && record.exchangeKind !== "original") return `${record.exchangeKind} ${outcome}`;
  if (outcome === "complete" && record.retained && record.processState !== "exited") return "completed, retained for follow-up";
  return outcome;
}

export function outcomeText(record: ChildRecord): string {
  if(record.questionResolution) return `Subagent ${identity(record)} parent question ${record.questionResolution.outcome} by ${record.questionResolution.by} (request ${record.questionResolution.requestId}).`;
  const lines = [`Subagent ${identity(record)} (${record.id}) ${stateText(record)}:`];
  if (record.exchangeId) {
    lines.push(`Exchange: ${exchangeLabel(record)}${record.exchangeKind && record.exchangeKind !== "original" ? "; original assignment is retained separately" : ""}.`);
  }
  if (record.assignment) lines.push(`Assignment: ${clean(record.assignment)}`);
  if (record.requestId) lines.push(`Request ID: ${record.requestId}`);
  if (record.result) lines.push(bounded(record.result));
  else if (!record.error && record.status === "settled") lines.push("No result");
  if (record.error) lines.push(`Error: ${bounded(record.error)}`);
  const retention = retainedState(record);
  if (retention) lines.push(`Conversation: ${retention}.`);
  if (record.cleanup && !record.cleanup.complete) {
    const detail = record.cleanup.errors.at(-1) ?? "owned resources remain open";
    lines.push(`Cleanup: unresolved (${clean(detail)})`);
  }
  if (record.notice) lines.push(clean(record.notice));
  const started = record.assignmentStartedAt ?? record.createdAt;
  if (started) lines.push(`Started: ${started} · ${timing(record, Date.now())}`);
  return lines.join("\n");
}
