import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { Analysis, Decision, Effect, ReviewResult, ToolRequest } from "./types.ts";

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

// These are presentation names for policy identities, not new policy rules.
const policyName = (reason: string) => /rm with recursive|rm with --recursive|rm with --force/i.test(reason) ? "Forced or recursive deletion" : oneLine(reason);
const timeoutDuration = (review: ReviewResult): string | undefined => {
  if (review.status !== "timeout") return undefined;
  const deadlineMs = review.diagnostics?.deadlineMs;
  const reasonMs = review.reason.match(/(?:after|exceeded its)\s+(\d+(?:\.\d+)?)\s*ms\b/i)?.[1];
  const reasonSeconds = review.reason.match(/(?:after|exceeded its)\s+(\d+(?:\.\d+)?)\s*seconds?\b/i)?.[1];
  const configuredMs = deadlineMs !== undefined && Number.isFinite(deadlineMs) && deadlineMs > 0 ? deadlineMs : undefined;
  const milliseconds = configuredMs ?? (reasonMs === undefined ? undefined : Number(reasonMs));
  if (milliseconds !== undefined && Number.isFinite(milliseconds) && milliseconds > 0) {
    const seconds = milliseconds / 1000;
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} seconds`;
  }
  return reasonSeconds === undefined ? undefined : `${reasonSeconds} seconds`;
};
const judgeLine = (review: ReviewResult): string => {
  if (review.status === "timeout") {
    const duration = timeoutDuration(review);
    return `Judge: Review timed out${duration ? ` after ${duration}` : ""}. No verdict returned.`;
  }
  if (review.status === "valid") return `Judge: ${oneLine(review.reason)}`;
  if (review.status === "unavailable") return `Judge: Review unavailable. ${oneLine(review.reason)}`;
  if (review.status === "invalid") return `Judge: Review returned no usable verdict. ${oneLine(review.reason)}`;
  return `Judge: Review was cancelled. ${oneLine(review.reason)}`;
};

export function buildApproval(decision: ApprovalDecision, request: ToolRequest, analysis: Analysis): Approval {
  const review = decision.origin === "review";
  const matches = analysis.matches.filter(match => review
    ? match.applicability === "candidate" || match.action === "review"
    : match.applicability === "confirmed" && match.action === "user");
  const ids = new Set(matches.flatMap(match => match.effects));
  const triggering = analysis.effects.filter(effect => ids.has(effect.id));
  const shell = request.tool === "bash" || request.tool === "powershell";
  const policies = unique(matches.map(match => policyName(match.reason)));
  const summary: ApprovalLine[] = policies.map(name => ({ text: `Policy: ${short(name)}`, emphasis: "reason" }));
  const commands = unique(triggering.map(effect => shell ? oneLine(source(request, effect)) : `${request.tool} ${"path" in request.input ? request.input.path ?? "." : "."}`).filter(Boolean));
  if (!commands.length) commands.push(shell ? "Command: Trigger not isolated. Inspect Details." : `${request.tool} ${"path" in request.input ? request.input.path ?? "." : "."}`);
  summary.push(...commands.map(text => ({ text: `Command: ${short(text.replace(/^Command:\s*/, ""))}`, emphasis: "command" as const })));
  const affected = unique(triggering.flatMap(targets));
  summary.push(...affected.map(target => ({ text: `Target: ${short(oneLine(target))}` })));
  if (decision.review) summary.push({ text: judgeLine(decision.review), emphasis: "reason" });
  summary.push({ text: shell ? "Approves the whole shell call." : "Approves this entire tool call once.", emphasis: "scope" });

  const details: ApprovalLine[] = [
    { text: `${request.tool} in ${displayText(request.cwd)}`, emphasis: "muted" },
    ...analysis.matches.map(match => ({ text: `Policy ${match.ruleId} [${match.applicability}, ${match.action}]: ${displayText(match.reason)}` })),
    ...(decision.review ? [{ text: judgeLine(decision.review), emphasis: "reason" as const }] : []),
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
  const deniedAction = commands.map(command => command.replace(/^Command:\s*/, "")).filter(command => !command.startsWith("Trigger not isolated")).join("; ");
  return {
    title: "Damage Control approval",
    summary,
    details,
    denial: `Operator denied this entire ${request.tool} call. Nothing in it was executed. Trigger: ${short(deniedAction || "not isolated", 800)}. Do not retry the same operation or disguise it; choose a genuinely different approach or ask the operator.`,
  };
}
