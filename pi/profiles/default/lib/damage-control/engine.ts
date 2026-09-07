import type { Analysis, Decision, Evidence, ReviewResult } from "./types.ts";

const bounded = (text: string) => text.slice(0, 3000);
function reasons(analysis: Analysis): string {
  return bounded([...new Set(analysis.matches.map(m => `${m.ruleId}: ${m.reason}`).concat(analysis.uncertainties))].join("\n"));
}

export function decide(analysis: Analysis, evidence: Evidence, review?: ReviewResult): Decision {
  if (analysis.health.status === "failed") return { outcome: "block", reason: bounded(`Required enforcement unavailable: ${analysis.health.reason}`) };
  const confirmed = analysis.matches.filter(m => m.applicability === "confirmed");
  if (confirmed.some(m => m.action === "block")) return { outcome: "block", reason: reasons(analysis) };
  if (confirmed.some(m => m.action === "user")) return { outcome: "user", reason: reasons(analysis) };

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
