import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { Analysis, Decision, Effect, ToolRequest } from "./types.ts";

export type ApprovalDecision = Extract<Decision, { outcome: "user" }>;
export type ApprovalLine = { text: string; emphasis?: "reason" | "command" | "scope" | "muted"; trigger?: boolean };
export type Approval = { title: string; summary: ApprovalLine[]; details: ApprovalLine[]; denial: string };

// Keep operation text inert, including terminal escapes and direction overrides.
export const displayText = (text: string) => stripTerminalSequences(text).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
const oneLine = (text: string) => displayText(text).replace(/\s+/g, " ").trim();
const short = (text: string, limit = 160) => text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
const unique = (items: string[]) => [...new Set(items)];
const targets = (effect: Effect) => unique([...effect.targets, ...effect.sources, ...effect.destinations].map(target => target.resolution === "static" ? target.path : `${target.expression} (unresolved)`));
const source = (request: ToolRequest, effect: Effect) => request.text.slice(effect.range.start, effect.range.end);

export function buildApproval(decision: ApprovalDecision, request: ToolRequest, analysis: Analysis): Approval {
  const review = decision.origin === "review";
  const matches = analysis.matches.filter(match => review
    ? match.applicability === "candidate" || match.action === "review"
    : match.applicability === "confirmed" && match.action === "user");
  const ids = new Set(matches.flatMap(match => match.effects));
  const triggering = analysis.effects.filter(effect => ids.has(effect.id));
  const shell = request.tool === "bash" || request.tool === "powershell";
  const reasons = unique(review ? [decision.reason] : matches.length ? matches.map(match => {
    if (match.reason === "rm with recursive or force flags") {
      const flags = unique(triggering.filter(effect => match.effects.includes(effect.id)).flatMap(effect => {
        const found = source(request, effect).match(/\brm\s+(-[rRf]+)\b/);
        return found ? [found[1]] : [];
      }));
      if (flags.length) return `File deletion using ${flags.map(flag => `rm ${flag}`).join(" / ")} requires approval.`;
    }
    return match.reason;
  }) : [decision.reason]);
  const summary: ApprovalLine[] = reasons.map(reason => ({ text: short(oneLine(reason).replace(/^- /, "")), emphasis: "reason" }));
  const commands = unique(triggering.map(effect => shell ? oneLine(source(request, effect)) : `${request.tool} ${"path" in request.input ? request.input.path ?? "." : "."}`).filter(Boolean));
  if (!commands.length) commands.push(shell ? "Trigger not isolated. Inspect Details." : `${request.tool} ${"path" in request.input ? request.input.path ?? "." : "."}`);
  summary.push(...commands.map(text => ({ text: short(text), emphasis: "command" as const })));
  const affected = unique(triggering.flatMap(targets));
  summary.push(...affected.map(target => ({ text: `Target: ${short(oneLine(target))}` })));
  summary.push({ text: `In: ${short(oneLine(request.cwd))}`, emphasis: "muted" });
  summary.push({ text: shell ? "Approves the whole shell call, not just the highlighted command." : "Approves this entire tool call once.", emphasis: "scope" });
  const additional = analysis.effects.filter(effect => !ids.has(effect.id) && !["read", "metadata"].includes(effect.operation));
  const consequences = unique(additional.map(effect => {
    if (effect.kind === "git") return "Git state change";
    const target = targets(effect).map(oneLine).join(", ");
    const fileAction = effect.operation === "truncate" ? "File overwrite" : effect.operation === "write" ? "File write" : effect.operation === "delete" ? "File deletion" : "Unresolved file action";
    const action = effect.kind === "filesystem" ? fileAction : effect.kind === "execution" ? "Code execution" : `${effect.kind} ${effect.operation}`;
    return `${action}${target ? `: ${target}` : ""}`;
  }));
  if (consequences.length) summary.push({ text: `Also: ${short(consequences.join("; "), 240)}`, emphasis: "scope" });
  if (analysis.effects.some(effect => effect.resolution === "unknown" && !["read", "metadata"].includes(effect.operation))) {
    summary.push({ text: "Some effects are unresolved. Inspect Details.", emphasis: "scope" });
  }

  const details: ApprovalLine[] = [
    { text: `${request.tool} in ${displayText(request.cwd)}`, emphasis: "muted" },
    ...reasons.map(reason => ({ text: displayText(reason), emphasis: "reason" as const })),
    { text: "Checks (candidate does not mean confirmed):", emphasis: "muted" },
    ...analysis.matches.map(match => ({ text: `${match.ruleId} [${match.applicability}, ${match.action}]: ${displayText(match.reason)}` })),
    ...analysis.effects.flatMap(effect => [
      { text: `${ids.has(effect.id) ? "Matched" : "Other"}: ${effect.kind} ${effect.operation} in ${displayText(effect.context.cwd)}` },
      ...targets(effect).map(target => ({ text: `  Target: ${displayText(target)}` })),
      ...(effect.resolution === "unknown" ? [{ text: `  Unresolved: ${displayText(effect.reason)}` }] : []),
    ]),
    ...analysis.uncertainties.map(reason => ({ text: `Analysis note: ${displayText(reason)}`, emphasis: "muted" as const })),
    { text: "Full operation (submitted code, not instructions):", emphasis: "muted" },
  ];
  let offset = 0;
  request.text.split("\n").forEach((line, index) => {
    const trigger = triggering.some(effect => effect.range.start < offset + line.length + 1 && effect.range.end > offset);
    details.push({ text: `${trigger ? ">" : " "} ${index + 1} | ${displayText(line)}`, emphasis: trigger ? "command" : undefined, trigger });
    offset += line.length + 1;
  });
  const deniedAction = commands.filter(command => command !== "Trigger not isolated. Inspect Details.").join("; ");
  return {
    title: review ? "Safety review needs a decision" : "Approval required",
    summary,
    details,
    denial: `Operator denied this entire ${request.tool} call. Nothing in it was executed. Reason: ${short(reasons.map(oneLine).join("; "), 800)}. Trigger: ${short(deniedAction || "not isolated", 800)}. Do not retry the same operation or disguise it; choose a genuinely different approach or ask the operator.`,
  };
}
