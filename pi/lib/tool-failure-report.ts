import type { SelectedCandidate } from "./tool-failure-decisions.ts";

export const DIAGNOSTIC_VERDICTS = ["Failing", "Fixed", "Expected", "External", "Unresolved"] as const;
export type DiagnosticVerdict = (typeof DIAGNOSTIC_VERDICTS)[number];

export type DiagnosticFinding = {
	candidateId?: string;
	title: string;
	verdict: DiagnosticVerdict;
	lastSeen: string;
	explanation: string;
	directVerification?: string;
	action?: string;
};

const verdictForDisposition: Record<string, DiagnosticVerdict> = {
	addressed: "Fixed",
	expected: "Expected",
	"safety-rejection": "Expected",
	"caller-contract": "Expected",
	external: "External",
	cancelled: "Expected",
};

export function formatLocalLastSeen(value: string | null | undefined): string {
	if (!value) return "unknown";
	const date = new Date(value);
	if (Number.isNaN(date.valueOf())) return "unknown";
	const parts = new Intl.DateTimeFormat("en-US", {
		year: "numeric", month: "numeric", day: "numeric",
		hour: "numeric", minute: "2-digit", second: "2-digit",
	}).formatToParts(date);
	const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
	return `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")} ${get("dayPeriod")}`;
}

export function verdictForDecision(disposition: string): DiagnosticVerdict {
	return verdictForDisposition[disposition] ?? "Unresolved";
}

export function buildDiagnosticPrompt(candidates: readonly SelectedCandidate[], providerName: string, coordinates: ReadonlyMap<string, readonly string[]> = new Map()): string {
	const items = candidates.map((candidate, index) => [
		`${index + 1}. ${candidate.candidateId} (${candidate.tool}, ${candidate.errorClass})`,
		`last seen: ${formatLocalLastSeen(candidate.lastObserved)}`,
		`selected because: ${candidate.reason}`,
		`opaque coordinate tokens: ${(coordinates.get(candidate.candidateId) ?? []).join(", ") || "none"}`,
	].join("; ")).join("\n");
	return [
		"Run one bounded tool-failure diagnostic now.",
		`Provider boundary: this diagnostic is running through ${providerName}; disclose that boundary once in the final report.`,
		"Read the selected failure evidence yourself with tool_failure_inspect before deciding anything. Do not assume that age, counts, or a prior label proves a result.",
		"You may use only tool_failure_inspect and tool_failure_decide. Do not edit files, delegate, run commands, or ask for intermediate approval.",
		"Use tool_failure_decide only when the inspected evidence directly proves an authorized outcome. Otherwise do not write a decision.",
		"Final response contract: for each finding, use one title and exactly one verdict word - Failing, Fixed, Expected, External, or Unresolved - followed by `Last seen: M/D/YYYY h:mm:ss AM/PM` in local time and one concise plain explanation of what was attempted, what failed, and the observation or direct verification supporting the verdict.",
		"Fixed requires a direct fix check; Expected requires verified intended behavior; External requires verified responsibility outside the tool contract. Everything else is Unresolved.",
		"Do not mention ledger terms, candidate-state mechanics, assumed future behavior, or internal disposition labels. State once that the diagnostic run changed no code. Offer a concrete response or recommendation only if user action remains; do not invent options when none remain.",
		"Selected candidates:", items || "none",
	].join("\n");
}

export function renderDiagnosticReport(findings: readonly DiagnosticFinding[], providerName?: string): string {
	if (findings.length > 3) throw new Error("diagnostic reports cannot contain more than three findings");
	const body = findings.map((finding) => {
		if (!DIAGNOSTIC_VERDICTS.includes(finding.verdict)) throw new Error("unsupported diagnostic verdict");
		if (formatLocalLastSeen(finding.lastSeen) === "unknown") throw new Error("finding requires a valid last-seen timestamp");
		if (["Fixed", "Expected", "External"].includes(finding.verdict) && !finding.directVerification?.trim()) throw new Error(`${finding.verdict} requires direct verification`);
		if (!finding.explanation.trim() || /[\r\n]/.test(finding.explanation) || /\bledger\b|future[- ]scan|disposition|recorded outcome/i.test(finding.explanation)) throw new Error("finding explanation must be concise and user-facing");
		return [`## ${finding.title}`, `${finding.verdict} - Last seen: ${formatLocalLastSeen(finding.lastSeen)} - ${finding.explanation}`, finding.action ? `Recommendation: ${finding.action}` : ""].filter(Boolean).join("\n");
	}).join("\n\n");
	return [providerName ? `Provider boundary: ${providerName}.` : "", body, "The diagnostic run changed no code."].filter(Boolean).join("\n\n");
}
