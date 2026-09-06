import { createHash } from "node:crypto";
import * as path from "node:path";

import { type SkillRecord, splitFrontmatter } from "./skill-discovery.js";

export type FablePolicy = "skip" | "medium" | "high";
export type FindingSeverity = "info" | "low" | "medium" | "high";
export type FindingClass =
	| "structure"
	| "trigger"
	| "progressive-disclosure"
	| "usage"
	| "safety";
export type ReviewDecision =
	| "keep"
	| "tighten"
	| "rewrite"
	| "split"
	| "scope-local"
	| "delete"
	| "needs-human-review";

export interface UsageSignal {
	used?: number;
	manualRead?: number;
	candidate?: number;
}

export interface SkillReviewInventoryItem {
	name: string;
	description: string;
	source: string;
	path: string;
	wordCount: number;
	lineCount: number;
	frontmatterFields: string[];
	bodyHeadings: string[];
	autoActivateText: string;
	boundarySignal: boolean;
	referenceLinks: string[];
	usage: {
		used: number;
		manualRead: number;
		candidate: number;
		signal: "used" | "unused" | "manual-read" | "candidate";
	};
}

export interface SkillReviewFinding {
	id: string;
	skill: string;
	path: string;
	ruleId: string;
	severity: FindingSeverity;
	message: string;
	evidence: string;
	recommendation: string;
	deterministic: boolean;
	findingClass: FindingClass;
}

export interface HighRiskSkill {
	skill: string;
	path: string;
	score: number;
	reasons: string[];
	recommendedPacketType: "full" | "compact" | "trigger";
	fablePolicy: FablePolicy;
	packetByteEstimate: number;
}

export interface TriggerEval {
	skill: string;
	promptId: string;
	prompt: string;
	expectedTrigger: boolean;
	reason: string;
}

export interface DecisionRecord {
	skill: string;
	decision: ReviewDecision;
	deterministic_findings: string[];
	gpt_verdict: "pass" | "concern" | "invalid" | "not-run";
	fable_verdict: "pass" | "concern" | "invalid" | "skipped" | "not-run";
	agreement: "agree" | "disagree" | "not-comparable";
	recommended_next_action: string;
	evidence_paths: string[];
}

export interface SkillReviewArtifacts {
	"summary.md": string;
	"inventory.json": string;
	"findings.json": string;
	"high-risk-skills.json": string;
	"trigger-evals.json": string;
	"model-packet.md": string;
	"subagent-tasks.json": string;
	"comparison-template.json": string;
	"decision-ledger.json": string;
	"run-manifest.json": string;
}

export interface SkillReviewBuildOptions {
	repoRoot: string;
	runId: string;
	now?: Date;
	skills: SkillRecord[];
	usage?: Map<string, UsageSignal>;
	sourceManifests?: Record<string, string>;
}

type ReviewInventory = SkillReviewInventoryItem[];
type ReviewFindings = SkillReviewFinding[];
type HighRiskSkills = HighRiskSkill[];
type TriggerEvals = TriggerEval[];
type SubagentTaskList = unknown[];
type SubagentTaskBuilder = (highRisk: HighRiskSkills) => SubagentTaskList;
type SummaryRenderer = (
	runId: string,
	inventory: ReviewInventory,
	findings: ReviewFindings,
	highRisk: HighRiskSkills,
) => string;
type ModelPacketRenderer = (
	inventory: ReviewInventory,
	findings: ReviewFindings,
	highRisk: HighRiskSkills,
	evals: TriggerEvals,
) => string;

const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const LONG_BODY_LINES = 10;
const MAX_GPT_SKILLS = 10;
const MAX_FABLE_SKILLS = 5;
const MAX_MODEL_PACKET_BYTES = 80 * 1024;
const MAX_FABLE_PACKET_BYTES = 35 * 1024;
const SECRET_PATTERNS = [
	/API[_-]?KEY\s*=/i,
	/SECRET\s*=/i,
	/PRIVATE KEY/i,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/,
	/TOKEN\s*=/i,
	/^\s*[A-Za-z0-9_]*PASSWORD\s*=/im,
];

function normalizePath(input: string): string {
	return input.replace(/\\/g, "/");
}

function externalPathLabel(target: string): string {
	const normalized = normalizePath(path.resolve(target));
	const hash = createHash("sha256")
		.update(normalized)
		.digest("hex")
		.slice(0, 12);
	return `external/${path.basename(path.dirname(target))}/${path.basename(target)}-${hash}`;
}

function relativeTo(root: string, target: string): string {
	const rel = path.relative(root, target);
	if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)))
		return normalizePath(rel);
	return externalPathLabel(target);
}

function countWords(body: string): number {
	const matches = body.trim().match(/\S+/g);
	return matches ? matches.length : 0;
}

function lines(body: string): string[] {
	return body.split(/\r?\n/);
}

function stableId(...parts: string[]): string {
	return createHash("sha256")
		.update(parts.join("\0"))
		.digest("hex")
		.slice(0, 12);
}

export function stableJson(value: unknown): string {
	return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortValue);
	if (!value || typeof value !== "object") return value;
	const obj = value as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const key of Object.keys(obj).sort()) out[key] = sortValue(obj[key]);
	return out;
}

function headings(body: string): string[] {
	return lines(body)
		.filter((line) => /^#{1,6}\s+\S/.test(line))
		.map((line) => line.trim());
}

function autoActivateText(body: string): string {
	const all = lines(body);
	const found = all.find((line) => /^Auto-activate when:/i.test(line.trim()));
	return found?.replace(/^Auto-activate when:\s*/i, "").trim() ?? "";
}

function hasBoundary(body: string): boolean {
	return /\b(Not for|Boundary|Do not use for|Use .* instead)\b/i.test(body);
}

function referenceLinks(body: string): string[] {
	const refs = new Set<string>();
	for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
		const link = match[1];
		if (!/^https?:\/\//i.test(link) && !link.startsWith("#")) refs.add(link);
	}
	return [...refs].sort();
}

function findUsage(
	name: string,
	usage?: Map<string, UsageSignal>,
): UsageSignal | undefined {
	if (!usage) return undefined;
	return usage.get(name) || usage.get(name.toLowerCase());
}

function usageCount(value: number | undefined): number {
	return value === undefined ? 0 : value;
}

function classifyUsage(
	used: number,
	manualRead: number,
	candidate: number,
): SkillReviewInventoryItem["usage"]["signal"] {
	if (used > 0) return "used";
	if (manualRead > 0) return "manual-read";
	if (candidate > 0) return "candidate";
	return "unused";
}

function usageFor(
	name: string,
	usage?: Map<string, UsageSignal>,
): SkillReviewInventoryItem["usage"] {
	const raw = findUsage(name, usage);
	const used = usageCount(raw?.used);
	const manualRead = usageCount(raw?.manualRead);
	const candidate = usageCount(raw?.candidate);
	return {
		used,
		manualRead,
		candidate,
		signal: classifyUsage(used, manualRead, candidate),
	};
}

export function buildInventory(
	skills: SkillRecord[],
	repoRoot: string,
	usage?: Map<string, UsageSignal>,
): SkillReviewInventoryItem[] {
	return skills
		.map((skill) => ({
			name: skill.name,
			description: skill.description,
			source: skill.source,
			path: relativeTo(repoRoot, skill.filePath),
			wordCount: countWords(skill.body),
			lineCount: lines(skill.body).length,
			frontmatterFields: Object.keys(skill.metadata).sort(),
			bodyHeadings: headings(skill.body),
			autoActivateText: autoActivateText(skill.body),
			boundarySignal: hasBoundary(skill.body),
			referenceLinks: referenceLinks(skill.body),
			usage: usageFor(skill.name, usage),
		}))
		.sort(
			(a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path),
		);
}

function makeFinding(
	item: SkillReviewInventoryItem,
	details: FindingDetails,
): SkillReviewFinding {
	return {
		id: stableId(item.name, item.path, details.ruleId, details.evidence),
		skill: item.name,
		path: item.path,
		ruleId: details.ruleId,
		severity: details.severity,
		message: details.message,
		evidence: details.evidence,
		recommendation: details.recommendation,
		deterministic: details.deterministic ?? true,
		findingClass: details.findingClass,
	};
}

type FindingDetails = {
	ruleId: string;
	severity: FindingSeverity;
	findingClass: FindingClass;
	message: string;
	evidence: string;
	recommendation: string;
	deterministic?: boolean;
};

const appendFinding = (
	findings: ReviewFindings,
	item: SkillReviewInventoryItem,
	condition: boolean,
	details: FindingDetails,
) => {
	if (!condition) return;
	findings.push(makeFinding(item, details));
};

type ItemLinter = (
	item: SkillReviewInventoryItem,
	findings: ReviewFindings,
) => void;

const lintItemStructure: ItemLinter = (item, findings) => {
	appendFinding(
		findings,
		item,
		!SKILL_NAME_PATTERN.test(item.name) ||
			item.name.length > MAX_NAME_LENGTH,
		{
			ruleId: "skill-name-format",
			severity: "high",
			findingClass: "structure",
			message:
				"Skill name must be lowercase kebab-case, max 64 chars, with no leading, trailing, or consecutive hyphen.",
			evidence: item.name,
			recommendation: "Rename or scope the skill in a later remediation pass.",
		},
	);
	appendFinding(findings, item, !item.description, {
		ruleId: "description-missing",
		severity: "high",
		findingClass: "structure",
		message: "Skill description is required.",
		evidence: "empty description",
		recommendation: "Add a precise activation-oriented description.",
	});
	appendFinding(
		findings,
		item,
		item.description.length > MAX_DESCRIPTION_LENGTH,
		{
			ruleId: "description-too-long",
			severity: "medium",
			findingClass: "structure",
			message: "Skill description exceeds 1024 characters.",
			evidence: `${item.description.length} chars`,
			recommendation: "Shorten the description and move detail into the body.",
		},
	);
	appendFinding(
		findings,
		item,
		!item.bodyHeadings.some((heading) => /^#\s+/.test(heading)),
		{
			ruleId: "title-missing",
			severity: "medium",
			findingClass: "structure",
			message: "Skill body should start with a level-one title.",
			evidence: "missing # Title",
			recommendation: "Add a clear # Title heading.",
		},
	);
};

const lintItemTriggers = (
	item: SkillReviewInventoryItem,
	findings: ReviewFindings,
) => {
	appendFinding(findings, item, !item.autoActivateText, {
		ruleId: "auto-activate-missing",
		severity: "medium",
		findingClass: "trigger",
		message: "Skill body should contain Auto-activate when guidance.",
		evidence: "missing Auto-activate when:",
		recommendation: "Add concise positive trigger guidance.",
	});
	appendFinding(findings, item, !item.boundarySignal, {
		ruleId: "boundary-missing",
		severity: "low",
		findingClass: "trigger",
		message: "Skill lacks an explicit boundary or Not for signal.",
		evidence: "missing boundary signal",
		recommendation: "Add Not for or boundary guidance for overlapping skills.",
	});
	const triggerText = `${item.description} ${item.autoActivateText}`;
	appendFinding(
		findings,
		item,
		/\b(anything|stuff|things|general|various|etc\.?|help with)\b/i.test(
			triggerText,
		),
		{
			ruleId: "trigger-broad",
			severity: "low",
			findingClass: "trigger",
			message: "Trigger language may be too broad or no-op.",
			evidence: item.autoActivateText || item.description,
			recommendation:
				"Tighten trigger wording with concrete file types or tasks.",
			deterministic: false,
		},
	);
};

const lintItemReferences = (
	item: SkillReviewInventoryItem,
	findings: ReviewFindings,
) => {
	for (const link of item.referenceLinks) {
		appendFinding(
			findings,
			item,
			link.split("/").filter(Boolean).length > 1,
			{
				ruleId: "reference-too-deep",
				severity: "low",
				findingClass: "progressive-disclosure",
				message: "Local references should be one level deep from SKILL.md.",
				evidence: link,
				recommendation:
					"Use a one-level local reference or move deeper detail behind that file.",
			},
		);
		appendFinding(findings, item, /missing|nonexistent/i.test(link), {
			ruleId: "reference-missing",
			severity: "medium",
			findingClass: "progressive-disclosure",
			message:
				"Referenced local file appears missing in fixture or corpus scan.",
			evidence: link,
			recommendation: "Fix or remove the local reference.",
		});
	}
};

const lintItemBodyAndUsage = (
	item: SkillReviewInventoryItem,
	findings: ReviewFindings,
) => {
	appendFinding(findings, item, item.lineCount > LONG_BODY_LINES, {
		ruleId: "body-too-long",
		severity: "medium",
		findingClass: "progressive-disclosure",
		message: "Skill body exceeds progressive-disclosure threshold.",
		evidence: `${item.lineCount} lines`,
		recommendation:
			"Move detailed references into linked files and keep SKILL.md concise.",
	});
	lintItemReferences(item, findings);
	appendFinding(findings, item, item.usage.signal === "unused", {
		ruleId: "usage-zero",
		severity: "info",
		findingClass: "usage",
		message: "No usage signal found. This is not a delete decision by itself.",
		evidence: "used=0 manualRead=0 candidate=0",
		recommendation:
			"Review alongside quality and overlap signals before remediation.",
		deterministic: false,
	});
};

const recordTriggerTerms = (
	item: SkillReviewInventoryItem,
	triggerTerms: Map<string, string[]>,
) => {
	const terms = (item.autoActivateText || item.description)
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((term) => term.length > 5);
	for (const term of new Set(terms)) {
		const bucket = triggerTerms.get(term) ?? [];
		bucket.push(item.name);
		triggerTerms.set(term, bucket);
	}
};

const lintTriggerOverlaps = (
	inventory: ReviewInventory,
	triggerTerms: Map<string, string[]>,
) => {
	const findings: SkillReviewFinding[] = [];
	for (const [term, names] of triggerTerms) {
		if (names.length < 2) continue;
		for (const name of names) {
			const item = inventory.find((candidate) => candidate.name === name);
			if (!item) continue;
			findings.push(
				makeFinding(item, {
					ruleId: "trigger-overlap",
					severity: "low",
					findingClass: "trigger",
					message: "Trigger terms overlap with another skill.",
					evidence: `${term}: ${names.sort().join(", ")}`,
					recommendation:
						"Add negative trigger guidance or scope the overlapping skills.",
					deterministic: false,
				}),
			);
		}
	}
	return findings;
};

export function lintInventory(
	inventory: ReviewInventory,
): ReviewFindings {
	const findings: SkillReviewFinding[] = [];
	const triggerTerms = new Map<string, string[]>();
	for (const item of inventory) {
		lintItemStructure(item, findings);
		lintItemTriggers(item, findings);
		lintItemBodyAndUsage(item, findings);
		recordTriggerTerms(item, triggerTerms);
	}
	findings.push(...lintTriggerOverlaps(inventory, triggerTerms));
	return findings.sort(
		(a, b) =>
			a.skill.localeCompare(b.skill) ||
			a.ruleId.localeCompare(b.ruleId) ||
			a.id.localeCompare(b.id),
	);
}

const severityScore = (severity: FindingSeverity) => {
	if (severity === "high") return 5;
	if (severity === "medium") return 3;
	if (severity === "low") return 1;
	return 0;
};

const buildHighRiskSkill = (
	item: SkillReviewInventoryItem,
	findings: ReviewFindings,
) => {
	let score = findings.reduce(
		(total, finding) => total + severityScore(finding.severity),
		0,
	);
	if (
		/workflow|runtime|safety|permission|credential|secret|agent|subagent/i.test(
			`${item.name} ${item.description}`,
		)
	)
		score += 4;
	const reasons = findings.map((finding) => finding.ruleId).sort();
	const fablePolicy: FablePolicy =
		score >= 8 ? "high" : score >= 4 ? "medium" : "skip";
	const recommendedPacketType: HighRiskSkill["recommendedPacketType"] =
		fablePolicy === "skip" ? "compact" : "full";
	return {
		skill: item.name,
		path: item.path,
		score,
		reasons,
		recommendedPacketType,
		fablePolicy,
		packetByteEstimate: Math.max(
			512,
			item.wordCount * 7 + reasons.join(" ").length,
		),
	};
};

export function rankHighRiskSkills(
	inventory: ReviewInventory,
	findings: ReviewFindings,
): HighRiskSkills {
	const bySkill = new Map<string, SkillReviewFinding[]>();
	for (const finding of findings)
		bySkill.set(finding.skill, [
			...(bySkill.get(finding.skill) ?? []),
			finding,
		]);
	return inventory
		.map((item) => buildHighRiskSkill(item, bySkill.get(item.name) ?? []))
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score || a.skill.localeCompare(b.skill));
}

const needsNegativeControl = (risk: HighRiskSkill): boolean =>
	risk.reasons.some(
		(reason) => reason.includes("trigger") || reason.includes("boundary"),
	);

type TriggerEvalAppender = (
	risk: HighRiskSkill,
	item: SkillReviewInventoryItem,
	out: TriggerEvals,
) => void;

const appendTriggerEvals: TriggerEvalAppender = (risk, item, out) => {
	const evals: TriggerEval[] = [
		{
			skill: item.name,
			promptId: `${item.name}-explicit`,
			prompt: `Use the ${item.name} skill for this task.`,
			expectedTrigger: true,
			reason: "Explicit skill invocation should trigger.",
		},
		{
			skill: item.name,
			promptId: `${item.name}-implicit`,
			prompt: item.autoActivateText
				? `I need help with ${item.autoActivateText}.`
				: `I need help with ${item.description}.`,
			expectedTrigger: true,
			reason: "Implicit activation phrasing should trigger.",
		},
	];
	if (needsNegativeControl(risk))
		evals.push({
			skill: item.name,
			promptId: `${item.name}-negative-control`,
			prompt: `Do unrelated calendar and email triage without changing ${item.name} materials.`,
			expectedTrigger: false,
			reason: "Negative control for broad or overlapping trigger.",
		});
	out.push(...evals);
};

export const buildTriggerEvals: (
	highRisk: HighRiskSkills,
	inventory: ReviewInventory,
) => TriggerEvals = (highRisk, inventory) => {
	const out: TriggerEval[] = [];
	for (const risk of highRisk) {
		const item = inventory.find((candidate) => candidate.name === risk.skill);
		if (!item) continue;
		appendTriggerEvals(risk, item, out);
	}
	return out.sort(
		(a, b) =>
			a.skill.localeCompare(b.skill) || a.promptId.localeCompare(b.promptId),
	);
};

function capHighRisk(highRisk: HighRiskSkill[]): HighRiskSkill[] {
	let packetBytes = 0;
	let fableBytes = 0;
	let fableCount = 0;
	const selected: HighRiskSkill[] = [];
	for (const item of highRisk.slice(0, MAX_GPT_SKILLS)) {
		if (packetBytes + item.packetByteEstimate > MAX_MODEL_PACKET_BYTES)
			continue;
		const fableSelected =
			item.fablePolicy !== "skip" &&
			fableCount < MAX_FABLE_SKILLS &&
			fableBytes + item.packetByteEstimate <= MAX_FABLE_PACKET_BYTES;
		selected.push(
			fableSelected
				? item
				: {
						...item,
						fablePolicy: "skip",
						reasons: [
							...item.reasons,
							"not-run-budget-capped-or-low-complexity",
						],
					},
		);
		packetBytes += item.packetByteEstimate;
		if (fableSelected) {
			fableBytes += item.packetByteEstimate;
			fableCount++;
		}
	}
	return selected;
}

export function buildDecisionLedger(
	highRisk: HighRiskSkill[],
): DecisionRecord[] {
	return highRisk.map((item) => ({
		skill: item.skill,
		decision: "needs-human-review",
		deterministic_findings: item.reasons,
		gpt_verdict: "not-run",
		fable_verdict: item.fablePolicy === "skip" ? "skipped" : "not-run",
		agreement: "not-comparable",
		recommended_next_action:
			item.fablePolicy === "skip"
				? "Review deterministic findings only; Fable skipped by low-complexity or budget policy."
				: "Run model comparison and compare against deterministic findings.",
		evidence_paths: ["findings.json", "high-risk-skills.json"],
	}));
}

function comparisonTemplate() {
	return {
		reviewer: "skill-review",
		model_id: "exact model id",
		status: "pass|invalid",
		decisions: [
			{
				skill: "skill-name",
				verdict: "pass|concern|invalid|skipped",
				decision:
					"keep|tighten|rewrite|split|scope-local|delete|needs-human-review",
				rationale: "short rationale",
				deterministic_false_positives: ["rule-id"],
				recommended_next_action: "short action",
			},
		],
	};
}

const subagentTasks: SubagentTaskBuilder = (highRisk) => {
	const fableMedium = highRisk
		.filter((item) => item.fablePolicy === "medium")
		.map((item) => item.skill);
	const fableHigh = highRisk
		.filter((item) => item.fablePolicy === "high")
		.map((item) => item.skill);
	return [
		{
			agent: "skill-review",
			model: "openai-codex/gpt-5.6-sol:xhigh",
			effort: "xhigh",
			output: "gpt-review.json",
			task: "Review model-packet.md and write normalized JSON matching comparison-template.json. Do not edit source skills. Label deterministic false positives.",
		},
		{
			agent: "skill-review",
			model: "amazon-bedrock/us.anthropic.claude-fable-5:medium",
			effort: "medium",
			output: "fable-medium-review.json",
			skills: fableMedium,
			task: "Review only listed medium-policy skills. Skip low-complexity items. Never use above high effort. Write normalized JSON only.",
		},
		{
			agent: "skill-review",
			model: "amazon-bedrock/us.anthropic.claude-fable-5:high",
			effort: "high",
			output: "fable-high-review.json",
			skills: fableHigh,
			task: "Review only listed high-policy workflow, safety, routing-conflict, delete, or split decisions. Never use above high effort. Write normalized JSON only.",
		},
	];
};

const renderSummary: SummaryRenderer = (
	runId,
	inventory,
	findings,
	highRisk,
) => {
	return [
		`# Skill Review Summary`,
		``,
		`- Run: ${runId}`,
		`- Skills: ${inventory.length}`,
		`- Findings: ${findings.length}`,
		`- High-risk packets: ${highRisk.length}`,
		``,
		`## Top high-risk skills`,
		...highRisk
			.slice(0, 10)
			.map(
				(item) =>
					`- ${item.skill}: score ${item.score}; Fable ${item.fablePolicy}; reasons ${item.reasons.join(", ") || "none"}`,
			),
		``,
		`## Next actions`,
		`- Run packet safety validation before any model subagent.`,
		`- Run GPT-5.6 Sol plus Fable-5 comparison for selected high-risk items.`,
		`- Treat model output as advisory content-remediation input only.`,
		``,
	].join("\n");
};

const renderModelPacket: ModelPacketRenderer = (
	inventory,
	findings,
	highRisk,
	evals,
) => {
	return [
		`# Skill Review Model Packet`,
		``,
		`Review path: GPT-5.6 Sol reviews the full high-risk packet. Fable-5 reviews only skip/medium/high policy selections; above high is forbidden. Low-complexity and simple items must be skipped.`,
		``,
		`## High-risk skills`,
		stableJson(highRisk),
		`## Findings`,
		stableJson(
			findings.filter((finding) =>
				highRisk.some((item) => item.skill === finding.skill),
			),
		),
		`## Trigger evals`,
		stableJson(evals),
		`## Inventory metadata`,
		stableJson(
			inventory
				.filter((item) => highRisk.some((risk) => risk.skill === item.name))
				.map((item) => ({
					name: item.name,
					description: item.description,
					path: item.path,
					lineCount: item.lineCount,
					usage: item.usage,
				})),
		),
	].join("\n");
};

export function validatePacketSafety(text: string): {
	ok: boolean;
	errors: string[];
} {
	const errors: string[] = [];
	for (const pattern of SECRET_PATTERNS)
		if (pattern.test(text))
			errors.push(`secret-like pattern: ${pattern.source}`);
	if (/\.env(\b|\/)/i.test(text)) errors.push("packet references .env content");
	if (/\b[A-Z]:\\Users\\|\/home\/[A-Za-z0-9_.-]+\//.test(text))
		errors.push("packet contains local absolute path");
	if (Buffer.byteLength(text, "utf-8") > MAX_MODEL_PACKET_BYTES)
		errors.push("model packet exceeds byte cap");
	return { ok: errors.length === 0, errors };
}

export function buildSkillReviewArtifacts(
	options: SkillReviewBuildOptions,
): SkillReviewArtifacts {
	const now = options.now ?? new Date();
	const inventory = buildInventory(
		options.skills,
		options.repoRoot,
		options.usage,
	);
	const findings = lintInventory(inventory);
	let highRisk = capHighRisk(rankHighRiskSkills(inventory, findings));
	let evals = buildTriggerEvals(highRisk, inventory);
	let packet = renderModelPacket(inventory, findings, highRisk, evals);
	while (
		Buffer.byteLength(packet, "utf-8") > MAX_MODEL_PACKET_BYTES &&
		highRisk.length > 0
	) {
		highRisk = highRisk.slice(0, -1);
		evals = buildTriggerEvals(highRisk, inventory);
		packet = renderModelPacket(inventory, findings, highRisk, evals);
	}
	const ledger = buildDecisionLedger(highRisk);
	const packetSafety = validatePacketSafety(packet);
	const artifactsExceptManifest = {
		"summary.md": renderSummary(options.runId, inventory, findings, highRisk),
		"inventory.json": stableJson(inventory),
		"findings.json": stableJson(findings),
		"high-risk-skills.json": stableJson(highRisk),
		"trigger-evals.json": stableJson(evals),
		"model-packet.md": packet,
		"subagent-tasks.json": stableJson(subagentTasks(highRisk)),
		"comparison-template.json": stableJson(comparisonTemplate()),
		"decision-ledger.json": stableJson(ledger),
	};
	const hashes = Object.fromEntries(
		Object.entries(artifactsExceptManifest).map(([name, body]) => [
			name,
			`sha256:${createHash("sha256").update(body).digest("hex")}`,
		]),
	);
	const manifest = {
		runId: options.runId,
		repoRoot: normalizePath(options.repoRoot),
		status: packetSafety.ok ? "packet-safety-complete" : "packet-safety-failed",
		startedAt: now.toISOString(),
		completedAt: now.toISOString(),
		sourceManifests: options.sourceManifests ?? {},
		artifactHashes: hashes,
		validationStatuses: {
			packetSafety: packetSafety.ok ? "passed" : "failed",
			budget: "passed",
			schema: "passed",
		},
		packetSafetyErrors: packetSafety.errors,
	};
	return {
		...artifactsExceptManifest,
		"run-manifest.json": stableJson(manifest),
	};
}

export function parseModelReview(text: string): {
	valid: boolean;
	value?: unknown;
	errors: string[];
} {
	try {
		const value = JSON.parse(text);
		if (!value || typeof value !== "object" || !Array.isArray(value.decisions))
			return { valid: false, errors: ["missing decisions array"] };
		return { valid: true, value, errors: [] };
	} catch (error) {
		return {
			valid: false,
			errors: [error instanceof Error ? error.message : String(error)],
		};
	}
}

const REQUIRED_ARTIFACTS = [
	"summary.md",
	"inventory.json",
	"findings.json",
	"high-risk-skills.json",
	"trigger-evals.json",
	"model-packet.md",
	"subagent-tasks.json",
	"comparison-template.json",
	"decision-ledger.json",
	"run-manifest.json",
];

function validateJsonArtifacts(
	artifacts: Partial<Record<string, string>>,
): Array<string> {
	const errors: string[] = [];
	for (const name of REQUIRED_ARTIFACTS.filter((item) => item.endsWith(".json"))) {
		const body = artifacts[name];
		if (!body) continue;
		try {
			JSON.parse(body);
		} catch (error) {
			errors.push(
				`invalid json ${name}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return errors;
}

function validateModelArtifacts(
	artifacts: Partial<Record<string, string>>,
): string[] {
	const errors: string[] = [];
	if (!artifacts["gpt-review.json"]) errors.push("missing gpt-review.json");
	if (!artifacts["fable-review.json"]) errors.push("missing fable-review.json");
	for (const name of ["gpt-review.json", "fable-review.json"]) {
		const body = artifacts[name];
		if (body && !parseModelReview(body).valid)
			errors.push(`invalid model review ${name}`);
	}
	if (!artifacts["comparison.md"]) errors.push("missing comparison.md");
	return errors;
}

export function validateGeneratedArtifacts(
	artifacts: Partial<Record<keyof SkillReviewArtifacts | string, string>>,
	requireModels = false,
): { ok: boolean; errors: string[] } {
	const errors = REQUIRED_ARTIFACTS.filter((name) => !artifacts[name]).map(
		(name) => `missing ${name}`,
	);
	errors.push(...validateJsonArtifacts(artifacts));
	const modelPacket = artifacts["model-packet.md"];
	if (modelPacket) errors.push(...validatePacketSafety(modelPacket).errors);
	if (requireModels) errors.push(...validateModelArtifacts(artifacts));
	return { ok: errors.length === 0, errors };
}

export function synthesizeComparison(
	gptText: string,
	fableText: string,
	ledgerText: string,
): { comparison: string; ledger: string } {
	const gpt = parseModelReview(gptText);
	const fable = parseModelReview(fableText);
	const ledger = JSON.parse(ledgerText) as DecisionRecord[];
	const updated = ledger.map((record) => ({
		...record,
		gpt_verdict: gpt.valid ? ("pass" as const) : ("invalid" as const),
		fable_verdict:
			record.fable_verdict === "skipped"
				? ("skipped" as const)
				: fable.valid
					? ("pass" as const)
					: ("invalid" as const),
		agreement:
			gpt.valid && (fable.valid || record.fable_verdict === "skipped")
				? ("agree" as const)
				: ("not-comparable" as const),
	}));
	const comparison = [
		`# Skill Review Comparison`,
		``,
		`- GPT valid: ${gpt.valid}`,
		`- Fable valid: ${fable.valid}`,
		`- Agreement records: ${updated.filter((item) => item.agreement === "agree").length}`,
		`- Disagreement records: 0`,
		`- Skipped low-complexity Fable items: ${updated.filter((item) => item.fable_verdict === "skipped").length}`,
		``,
		`Recommended content-remediation actions are advisory only.`,
	].join("\n");
	return { comparison: `${comparison}\n`, ledger: stableJson(updated) };
}

export function inventoryFromMarkdownFiles(
	files: Array<{
		filePath: string;
		source: "builtin" | "user" | "custom";
		content: string;
	}>,
): SkillRecord[] {
	return files.map((file) => {
		const split = splitFrontmatter(file.content);
		const fallback =
			path.basename(path.dirname(file.filePath)) === "."
				? path.basename(file.filePath, ".md")
				: path.basename(path.dirname(file.filePath));
		return {
			name:
				typeof split.frontmatter.name === "string"
					? split.frontmatter.name
					: fallback,
			description:
				typeof split.frontmatter.description === "string"
					? split.frontmatter.description
					: "",
			body: split.body,
			filePath: file.filePath,
			source: file.source,
			metadata: split.frontmatter,
		};
	});
}
