import type { ChildRecord } from "./rpc.ts";
export function duration(since: string | undefined, now = Date.now()): string {
  if (!since) return "none observed";
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  if (!Number.isFinite(seconds)) return "unknown";
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
const clean = (value: string) => value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
function identity(r: ChildRecord): string {
  return r.displayName ? `${r.displayName} · ${r.agent}` : r.agent;
}
export function statusLines(records: ChildRecord[], now = Date.now()): string[] {
  const active = records.filter(r => r.status !== "settled" || r.phase === "cleanup");
  const ended = records.filter(r => r.status === "settled" && r.phase !== "cleanup").slice(-3);
  // Pi accepts at most ten string-array widget lines. Reserve room for terminal
  // errors instead of allowing active rows to push failures beyond that limit.
  const shown = [...active.slice(0, 3), ...ended];
  if (!shown.length) return [];
  const terminalCount=records.length-active.length;
  const lines = [`Subagents: ${active.length} active${active.length>3?" (3 shown)":""}, ${terminalCount} settled${terminalCount>3?" (latest 3 shown)":""}  /subagents inspect|wait|cancel <id>`];
  for (const r of shown) {
    if(lines.length+(r.error?2:1)>10)break;
    const state = r.phase === "cleanup" ? "cleanup" : r.status === "settled" ? r.outcome ?? "settled" : r.phase ?? r.status;
    const summary=`${r.id.slice(0, 8)} ${identity(r)} [${r.surface}] ${state}${r.toolName ? `: ${r.toolName}` : ""}`;
    lines.push(clean(r.status==="settled"&&r.phase!=="cleanup" ? summary : `${summary} | elapsed ${duration(r.assignmentStartedAt ?? r.createdAt, now)} | activity ${r.lastActivityAt ? `${duration(r.lastActivityAt, now)} ago` : "none observed"} | process ${r.processState} / transport ${r.transportState ?? "unknown"}${r.waitState === "detached" ? " | wait detached; child continues" : ""}`));
    if (r.error) lines.push(`  ${clean(r.error).slice(0, 240)}`);
  }
  return lines;
}
export function outcomeText(r: ChildRecord): string {
  const state = r.status === "waiting" ? (r.phase === "waiting-user" ? "needs user-only input; use escalate" : "asks a factual question") : r.outcome ?? r.status;
  return `Subagent ${identity(r)} (${r.id}) ${state}:\n${r.result || ""}${r.error ? `${r.result ? "\n" : ""}Error: ${r.error}` : ""}${!r.result && !r.error ? "No result" : ""}${r.notice ? `\n${r.notice}` : ""}`;
}
