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

export function outcomeText(record: ChildRecord): string {
  const stateText = record.status === "waiting"
    ? record.phase === "waiting-user" ? "needs user-only input; use escalate" : record.phase === "waiting-parent" ? "asks a factual question" : "waiting"
    : record.outcome ?? record.status;
  const lines = [`Subagent ${identity(record)} (${record.id}) ${stateText}:`];
  if (record.assignment) lines.push(`Assignment: ${clean(record.assignment)}`);
  if (record.result) lines.push(bounded(record.result));
  else if (!record.error) lines.push("No result");
  if (record.error) lines.push(`Error: ${bounded(record.error)}`);
  if (record.notice) lines.push(clean(record.notice));
  const started = record.assignmentStartedAt ?? record.createdAt;
  if (started) lines.push(`Started: ${started} · ${timing(record, Date.now())}`);
  return lines.join("\n");
}
