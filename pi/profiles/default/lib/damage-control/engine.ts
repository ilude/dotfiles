import type { Analysis, Decision, Evidence, ReviewResult } from "./types.ts";

const bounded = (text: string) => text.slice(0, 3000);

// These operations have a bounded, rebuildable consequence even when their
// spelling looks destructive. Keep the detector in the policy so it can still
// be audited, but do not turn a cache/empty-directory/obfuscation mechanic
// into an approval requirement. A command with another effect or match does
// not qualify for this allowance.
const establishedRoutineRules = new Set([
  "legacy-015", "legacy-045", "legacy-216", "legacy-217", "legacy-218", "legacy-221",
  "legacy-317", "legacy-318", "legacy-331",
]);
function isEstablishedRoutine(analysis: Analysis): boolean {
  const confirmed = analysis.matches.filter(match => match.applicability === "confirmed");
  if (!confirmed.length || confirmed.some(match => !establishedRoutineRules.has(match.ruleId))) return false;
  return analysis.effects.every(effect => effect.operation === "execute" || effect.operation === "unknown" || (
    effect.kind === "filesystem" && effect.operation === "delete" && effect.resolution === "static"
  ));
}
function reasons(matches: Analysis["matches"]): string {
  return bounded([...new Set(matches.map(match => match.reason))].map(reason => `- ${reason}`).join("\n"));
}

export function decide(analysis: Analysis, evidence: Evidence, review?: ReviewResult): Decision {
  if (analysis.health.status === "failed") return { outcome: "block", reason: bounded(`Required enforcement unavailable: ${analysis.health.reason}`) };
  const confirmed = analysis.matches.filter(m => m.applicability === "confirmed");
  if (isEstablishedRoutine(analysis)) return { outcome: "allow" };
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
      return { outcome: "user", origin: "review", reason: "Review returned an invalid false-positive dismissal; operator approval is required" };
    }
    const remaining = candidates.filter(m => !review.dismissedCandidates.includes(m.ruleId));
    if (remaining.length === 0 && review.verdict === "allow") return { outcome: "allow" };
    return { outcome: "user", origin: "review", reason: bounded(`Review needs operator approval: ${review.reason}`) };
  }
  return { outcome: "user", origin: "review", reason: bounded(`Review ${review.status}: ${review.reason}`) };
}
