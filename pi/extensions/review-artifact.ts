import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { formatToolError } from "../lib/extension-utils.js";
import { activateTools, deactivateTools } from "../lib/tool-activation.js";

const MAX_FINDINGS = 5;
const MAX_FIELD_CHARS = 800;
const REVIEW_DIR_RE =
	/(?:^|[\\/])\.specs[\\/](?:archive[\\/])?[^\\/]+[\\/]review-\d+$/;
const ARTIFACT_RE = /^[A-Za-z0-9._-]+\.md$/;
const SEVERITIES = new Set(["critical", "high", "medium", "low"]);
const REVIEW_ARTIFACT_INTENT =
	/(?:review_artifact_write|\.specs[\\/].+[\\/]review-\d+)/i;

interface Finding {
	severity: string;
	evidence: string;
	required_fix: string;
	category?: string;
	confidence?: string;
}

function hasPathTraversal(value: string): boolean {
	return value.split(/[\\/]+/).some((part) => part === "..");
}

function escapeYaml(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderArtifact(reviewer: string, findings: Finding[]): string {
	const lines = [
		"---",
		`reviewer: ${reviewer}`,
		"status: complete",
		`finding_count: ${findings.length}`,
		"---",
		"",
		"# Findings",
		"",
	];

	for (const finding of findings) {
		lines.push(`- severity: ${finding.severity}`);
		if (finding.category)
			lines.push(`  category: "${escapeYaml(finding.category)}"`);
		if (finding.confidence) lines.push(`  confidence: ${finding.confidence}`);
		lines.push(`  evidence: "${escapeYaml(finding.evidence)}"`);
		lines.push(`  required_fix: "${escapeYaml(finding.required_fix)}"`);
	}

	return `${lines.join("\n")}\n`;
}

function validateFindings(findings: Finding[]): string | null {
	if (!Array.isArray(findings)) return "findings must be an array";
	if (findings.length > MAX_FINDINGS)
		return `findings must contain at most ${MAX_FINDINGS} items`;
	for (const [index, finding] of findings.entries()) {
		if (!SEVERITIES.has(finding.severity))
			return `finding ${index + 1}: invalid severity`;
		if (!finding.evidence?.trim())
			return `finding ${index + 1}: evidence is required`;
		if (!finding.required_fix?.trim())
			return `finding ${index + 1}: required_fix is required`;
		for (const field of [
			"evidence",
			"required_fix",
			"category",
			"confidence",
		] as const) {
			const value = finding[field];
			if (value && value.length > MAX_FIELD_CHARS)
				return `finding ${index + 1}: ${field} exceeds ${MAX_FIELD_CHARS} chars`;
		}
	}
	return null;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", () => {
		deactivateTools(pi, ["review_artifact_write"]);
	});
	pi.on("before_agent_start", (event) => {
		if (!REVIEW_ARTIFACT_INTENT.test(event.prompt)) return undefined;
		activateTools(pi, ["review_artifact_write"]);
		return undefined;
	});

	pi.registerTool({
		name: "review_artifact_write",
		label: "Review Artifact Write",
		description:
			"Write a constrained /review-it reviewer artifact under an assigned review directory. " +
			"Use only for reviewer findings; validates path safety, schema, and size limits.",
		promptSnippet:
			"Write bounded /review-it reviewer findings to the assigned artifact path",
		promptGuidelines: [
			"Use only when acting as a /review-it reviewer.",
			"Write only to the artifact file assigned by the coordinator.",
			"Provide at most 5 findings with severity, evidence, and required_fix.",
		],
		parameters: Type.Object({
			reviewDir: Type.String({
				description: "Review directory, e.g. .specs/name/review-1",
			}),
			reviewer: Type.String({
				description: "Reviewer id/persona for frontmatter",
			}),
			artifactName: Type.String({
				description: "Artifact markdown filename, e.g. security-reviewer.md",
			}),
			findings: Type.Array(
				Type.Object({
					severity: Type.Union([
						Type.Literal("critical"),
						Type.Literal("high"),
						Type.Literal("medium"),
						Type.Literal("low"),
					]),
					evidence: Type.String({ maxLength: MAX_FIELD_CHARS }),
					required_fix: Type.String({ maxLength: MAX_FIELD_CHARS }),
					category: Type.Optional(Type.String({ maxLength: MAX_FIELD_CHARS })),
					confidence: Type.Optional(
						Type.Union([
							Type.Literal("high"),
							Type.Literal("medium"),
							Type.Literal("low"),
						]),
					),
				}),
				{ maxItems: MAX_FINDINGS },
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (
				params.reviewDir.includes("\0") ||
				params.artifactName.includes("\0")
			) {
				return formatToolError("review_artifact_write: path contains NUL byte");
			}
			if (
				path.isAbsolute(params.reviewDir) ||
				path.isAbsolute(params.artifactName)
			) {
				return formatToolError(
					"review_artifact_write: absolute paths are not allowed",
				);
			}
			if (
				hasPathTraversal(params.reviewDir) ||
				hasPathTraversal(params.artifactName)
			) {
				return formatToolError(
					"review_artifact_write: path traversal is not allowed",
				);
			}
			if (!ARTIFACT_RE.test(params.artifactName)) {
				return formatToolError(
					"review_artifact_write: artifactName must be a simple .md filename",
				);
			}

			const reviewDir = path.normalize(
				path.join(process.cwd(), params.reviewDir),
			);
			if (!REVIEW_DIR_RE.test(reviewDir)) {
				return formatToolError(
					"review_artifact_write: reviewDir must be under .specs/<slug>/review-N",
				);
			}

			const artifactPath = path.join(reviewDir, params.artifactName);
			const relativeArtifactPath = path
				.relative(process.cwd(), artifactPath)
				.replace(/\\/g, "/");
			if (
				relativeArtifactPath.startsWith("..") ||
				path.isAbsolute(relativeArtifactPath)
			) {
				return formatToolError(
					"review_artifact_write: artifact path escapes repository",
				);
			}

			const validationError = validateFindings(params.findings as Finding[]);
			if (validationError)
				return formatToolError(`review_artifact_write: ${validationError}`);

			await fs.promises.mkdir(reviewDir, { recursive: true });
			const content = renderArtifact(
				params.reviewer,
				params.findings as Finding[],
			);
			await fs.promises.writeFile(artifactPath, content, "utf8");

			return {
				content: [
					{ type: "text" as const, text: `WROTE: ${relativeArtifactPath}` },
				],
				details: {
					artifactPath: relativeArtifactPath,
					findingCount: params.findings.length,
				},
			};
		},
	});
}
