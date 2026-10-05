import type { Analysis, Decision, Evidence, ReviewResult, ToolRequest } from "./types.ts";
import { effectCandidate, type BrowserEffect } from "../browser-effect-contract.ts";
import type { Context } from "./context.ts";

/** Attach only concrete selected sinks. Browser controls are checked with actual
 * target/frame facts by the executor bus, not selector text at tool_call. */
export function contextualEffect(context: Context, request: ToolRequest, analysis: Analysis, rawInput: unknown): BrowserEffect | undefined {
  // A GET query and PowerShell -Body transmit too, even when the existing
  // shell parser labels the request metadata rather than upload.
  const outbound = analysis.effects.filter(e => e.kind === "network");
  if (!outbound.length || request.tool === "browser_page" || request.tool === "browser_session") return;
  const payload = JSON.stringify(rawInput);
  const sources = context.privateSources(payload);
  const destination = outbound.flatMap(e => [...e.destinations, ...e.targets]).find(t => t.resolution === "static" && /^[a-z][a-z0-9+.-]*:\/\//i.test(t.path));
  let origin = "https://unknown-destination.invalid", resource = "unknown";
  if (destination?.resolution === "static") {
    try { const url = new URL(destination.path); origin = url.origin === "null" ? "https://onclave-peer.invalid" : url.origin; resource = `${url.pathname}`; } catch { /* unknown sink */ }
  }
  // Routine URL reads/searches remain quiet without matched private evidence.
  if (!sources.length && request.tool !== "onclave_message") return;
  return { id: request.callId, identity: context.identity, kind: request.tool === "onclave_message" ? "message" : "export", action: request.tool,
    target: { origin, visibility: "public" }, destination: { origin, resource, visibility: "public" },
    payload: { kind: "redacted", sourceObservationIds: sources.map(s => s.id), containsProtectedData: sources.length > 0 },
    expectedEffect: `Send ${sources.length ? "private browser-derived data" : "a message"} to the selected destination`, taskScoped: false };
}

export function applyContextualEffect(analysis: Analysis, evidence: Evidence): void {
  if (!evidence.browser) return;
  const decision = effectCandidate(evidence.browser);
  // Replace only selected custom contextual candidates, never filesystem or
  // native policy boundaries. An exact binding is not a global bypass.
  analysis.matches = analysis.matches.filter(m => !m.ruleId.startsWith("custom-effect:"));
  if (decision.outcome !== "allow") analysis.matches.push({ ruleId: "browser-task-alignment", applicability: "confirmed", action: decision.outcome === "deny" ? "block" : "review", reason: decision.reason, effects: analysis.effects.map(e => e.id) });
  evidence.untrusted.matches = analysis.matches;
}

const bounded = (text: string) => text.slice(0, 3000);

function reasons(matches: Analysis["matches"]): string {
  return bounded([...new Set(matches.map(match => match.reason))].map(reason => `- ${reason}`).join("\n"));
}

export function decide(analysis: Analysis, evidence: Evidence, review?: ReviewResult): Decision {
  if (analysis.health.status === "failed") return { outcome: "block", reason: bounded(`Required enforcement unavailable: ${analysis.health.reason}`) };
  const confirmed = analysis.matches.filter(m => m.applicability === "confirmed");
  const blocks = confirmed.filter(match => match.action === "block");
  if (blocks.length) return { outcome: "block", reason: reasons(blocks) };
  const approvals = confirmed.filter(match => match.action === "user");
  if (approvals.length) return { outcome: "user", reason: reasons(approvals) };

  const candidates = analysis.matches.filter(m => m.applicability === "candidate");
  const needsReview = candidates.length > 0 || confirmed.some(m => m.action === "review");
  if (!needsReview) return { outcome: "allow" };
  if (!review) return { outcome: "review", evidence };

  if (review.status === "valid") {
    const sent = new Set(evidence.untrusted.matches.filter(m => m.applicability === "candidate").map(m => m.ruleId));
    if (review.dismissedCandidates.some(id => !sent.has(id) || confirmed.some(m => m.ruleId === id))) {
      return { outcome: "user", origin: "review", reviewDisposition: "failure", review, reason: "Review returned an invalid false-positive dismissal; operator approval is required" };
    }
    const remaining = candidates.filter(m => !review.dismissedCandidates.includes(m.ruleId));
    if (remaining.length === 0 && review.verdict === "allow") return { outcome: "allow" };
    return { outcome: "user", origin: "review", reviewDisposition: "ask", review, reason: bounded(`Review needs operator approval: ${review.reason}`) };
  }
  return { outcome: "user", origin: "review", reviewDisposition: "failure", review, reason: bounded(`Review ${review.status}: ${review.reason}`) };
}
