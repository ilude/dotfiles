import type { Analysis, Decision, Evidence, ReviewResult } from "./types.ts";

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
      return { outcome: "user", origin: "review", reason: "Review returned an invalid false-positive dismissal; operator approval is required" };
    }
    const remaining = candidates.filter(m => !review.dismissedCandidates.includes(m.ruleId));
    if (remaining.length === 0 && review.verdict === "allow") return { outcome: "allow" };
    return { outcome: "user", origin: "review", reason: bounded(`Review needs operator approval: ${review.reason}`) };
  }
  return { outcome: "user", origin: "review", reason: bounded(`Review ${review.status}: ${review.reason}`) };
}
