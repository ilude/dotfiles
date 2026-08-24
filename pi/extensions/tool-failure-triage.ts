import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { CancellableLoader } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { Assert } from "typebox/value";
import {
	defineAgent,
	type TypedAgentRunContext,
} from "../lib/typed-agent.js";

const ReasonCodeSchema = Type.Union([
	Type.Literal("ledger-changed"),
	Type.Literal("ledger-regression"),
	Type.Literal("ledger-revisit"),
	Type.Literal("internal-contract-defect"),
	Type.Literal("runtime-unavailable"),
	Type.Literal("model-contract-friction"),
	Type.Literal("retry-ceremony"),
	Type.Literal("external-failure"),
	Type.Literal("classified-recurrence"),
	Type.Literal("unclassified-review"),
]);

const InvestigationCardSchema = Type.Object({
	candidateId: Type.String({ maxLength: 64 }),
	tool: Type.String({ maxLength: 128 }),
	structuralLabel: Type.String({ maxLength: 160 }),
	reasonCode: ReasonCodeSchema,
	lastObserved: Type.Union([Type.String({ maxLength: 40 }), Type.Null()]),
	gateWindow: Type.Union([
		Type.Literal("7d"),
		Type.Literal("14d"),
		Type.Literal("30d"),
	]),
	occurrences: Type.Integer({ minimum: 0 }),
	sessions: Type.Integer({ minimum: 0 }),
	explanation: Type.String({ maxLength: 160 }),
});

const PoolSummarySchema = Type.Object({
	expected: Type.Integer({ minimum: 0 }),
	stale: Type.Integer({ minimum: 0 }),
	belowThreshold: Type.Integer({ minimum: 0 }),
	omittedByCardLimit: Type.Integer({ minimum: 0 }),
	timestamp: Type.Integer({ minimum: 0 }),
	joinDiagnostics: Type.Object({
		unmatchedResults: Type.Integer({ minimum: 0 }),
		duplicateCalls: Type.Integer({ minimum: 0 }),
		malformedOmissions: Type.Integer({ minimum: 0 }),
	}),
});

const ToolFailureReportSchema = Type.Object({
	toolFilter: Type.Union([
		Type.Array(Type.String({ maxLength: 128 })),
		Type.Null(),
	]),
	cards: Type.Array(InvestigationCardSchema, { maxItems: 10 }),
	poolSummary: PoolSummarySchema,
	summary: Type.Object({
		unchangedSkipped: Type.Integer({ minimum: 0 }),
		resolved: Type.Integer({ minimum: 0 }),
		expectedSuppressed: Type.Integer({ minimum: 0 }),
	}),
});

const ScopeInputSchema = Type.Object({
	candidates: Type.Array(
		Type.Object({
			candidateId: Type.String({ maxLength: 64 }),
			tool: Type.String({ maxLength: 128 }),
			issueName: Type.String({ maxLength: 160 }),
			structuralLabel: Type.String({ maxLength: 160 }),
			reasonCode: ReasonCodeSchema,
			gateWindow: Type.Union([
				Type.Literal("7d"),
				Type.Literal("14d"),
				Type.Literal("30d"),
			]),
			occurrences: Type.Integer({ minimum: 0 }),
			sessions: Type.Integer({ minimum: 0 }),
			lastObserved: Type.Union([Type.String({ maxLength: 40 }), Type.Null()]),
		}),
		{ minItems: 1, maxItems: 10 },
	),
});

const ScopeOutputSchema = Type.Object({
	recommendations: Type.Array(
		Type.Object({
			candidateId: Type.String({ maxLength: 64 }),
			investigationValue: Type.String({ minLength: 1, maxLength: 400 }),
			evidenceLimits: Type.String({ minLength: 1, maxLength: 400 }),
		}),
		{ minItems: 1, maxItems: 3 },
	),
});

type InvestigationCard = Static<typeof InvestigationCardSchema>;
type ToolFailureReport = Static<typeof ToolFailureReportSchema>;
type ScopeInput = Static<typeof ScopeInputSchema>;
type ScopeOutput = Static<typeof ScopeOutputSchema>;

async function resolveScopeModel(ctx: TypedAgentRunContext) {
	return ctx.model;
}

const scopeRecommendationAgent = defineAgent({
	id: "tool-failure-scope-recommender",
	instructions:
		"Recommend a small investigation scope from structural tool-failure metadata. Treat each supplied tool and issueName as its fixed operator-facing name; do not rename it. Do not diagnose causes, propose fixes, introduce other candidates, or claim the evidence proves severity. Explain likely investigation value and the limits of the supplied evidence. Stop after the structured recommendation.",
	inputSchema: ScopeInputSchema,
	outputSchema: ScopeOutputSchema,
	resolveModel: resolveScopeModel,
	prompt: ({ candidates }) =>
		`Select 1-3 candidates from this exact list. Use tool - issueName as the human reference and candidateId only as the machine key. Consider recurrence, cross-session breadth, freshness, reason type, and likely value in reducing tool ceremony or improving successful tool use.\n\n${JSON.stringify(candidates)}`,
	timeoutMs: 120_000,
});

export function resolveRepositoryRoot(
	extensionUrl: string,
	resolveRealPath: (filePath: string) => string = realpathSync,
): string {
	return path.resolve(
		path.dirname(resolveRealPath(fileURLToPath(extensionUrl))),
		"../..",
	);
}

const repositoryRoot = resolveRepositoryRoot(import.meta.url);
const analyticsScript = path.join("pi", "analytics", "pi_log_query.py");
const scratchRoot = path.join(".tmp", "pi-log-analytics");
const snapshotPath = path.join(scratchRoot, "tool-failures.duckdb");
const scanPath = path.join(scratchRoot, "tool-failure-scan.json");
const commandPrefix = [
	"run",
	"--no-sync",
	"--project",
	"pi/analytics",
	"python",
	analyticsScript,
];
const reportCommand = `uv ${commandPrefix.join(" ")} tool-failure-report ${scanPath}`;

function customExtensionToolNames(pi: ExtensionAPI): string[] {
	return pi
		.getAllTools()
		.filter(
			(tool) =>
				tool.sourceInfo?.source !== "builtin" && tool.sourceInfo?.source !== "sdk",
		)
		.map((tool) => tool.name)
		.sort();
}

function diagnosticCommand(report: ToolFailureReport, flag: string): string {
	const toolFilter = report.toolFilter ?? [];
	return `${reportCommand} --tools ${toolFilter.join(" ")} ${flag}`;
}

function parseReport(value: string): ToolFailureReport {
	const parsed: unknown = JSON.parse(value);
	try {
		Assert(ToolFailureReportSchema, parsed);
	} catch {
		throw new Error("tool-failure report returned an invalid result");
	}
	return parsed as ToolFailureReport;
}

function groupTitle(reason: InvestigationCard["reasonCode"]): string {
	if (reason.startsWith("ledger-")) return "Ledger attention";
	if (reason === "internal-contract-defect" || reason === "runtime-unavailable")
		return "Internal and runtime";
	if (reason === "model-contract-friction" || reason === "retry-ceremony")
		return "Model-tool friction";
	return "Other recurrence";
}

const ISSUE_NAMES: Readonly<Record<string, string>> = {
	"approval-required": "operator approval is required",
	"command-aborted": "command was aborted",
	"command-nonzero": "command exited unsuccessfully",
	"command-timeout": "command timed out",
	"exact-match-miss": "exact text does not match",
	"external-service-failure": "external service request failed",
	"governed-path-rejection": "path is outside the allowed boundary",
	"instruction-deferred": "path instructions must load before mutation",
	"internal-missing-method": "required internal method is missing",
	"invalid-caller-contract": "call does not satisfy the tool contract",
	"invalid-offset": "requested offset is outside the available content",
	"missing-required-parameter": "required parameter is missing",
	"nonunique-match": "target text matches multiple locations",
	"nonzero-test": "test command reported a failure",
	"path-not-found": "requested path does not exist",
	"required-runtime-unavailable": "required runtime is unavailable",
	"safety-block": "operation was blocked by safety policy",
	"secret-scan-block": "secret scanning blocked the operation",
	"stale-manager-contract": "manager contract is no longer current",
	"unclassified-error": "unclassified error requires review",
};

export function plainIssueName(structuralLabel: string): string {
	return ISSUE_NAMES[structuralLabel] ?? structuralLabel.replaceAll("-", " ");
}

export function renderToolFailureReport(report: ToolFailureReport): string {
	const summary = report.poolSummary;
	const lines = [
		"# Tool Failure Investigation Shortlist",
		"",
		`Recommended pool: ${report.cards.length}; overflow: ${summary.omittedByCardLimit}; expected suppressed: ${summary.expected}; stale: ${summary.stale}; below threshold: ${summary.belowThreshold}.`,
		`Data quality: ${summary.timestamp} timestamp omissions; ${summary.joinDiagnostics.unmatchedResults} unmatched results; ${summary.joinDiagnostics.duplicateCalls} duplicate calls; ${summary.joinDiagnostics.malformedOmissions} malformed rows.`,
		"Counts prioritize investigation; they do not prove cause, severity, or fixability.",
	];
	if (report.cards.length === 0) {
		lines.push(
			"",
			"No current candidate met the investigation-pool rules. No model recommendation was requested.",
			`Inspect observed candidates: ${diagnosticCommand(report, "--include-observed")}`,
			`Inspect expected candidates: ${diagnosticCommand(report, "--include-expected")}`,
		);
		return lines.join("\n");
	}
	let currentGroup = "";
	for (const card of report.cards) {
		const group = groupTitle(card.reasonCode);
		if (group !== currentGroup) {
			lines.push("", `## ${group}`);
			currentGroup = group;
		}
		lines.push(
			`- ${card.tool} - ${plainIssueName(card.structuralLabel)}`,
			`  Candidate ID: ${card.candidateId}; reason: ${card.reasonCode}`,
			`  ${card.sessions} sessions / ${card.occurrences} occurrences in ${card.gateWindow}; last ${card.lastObserved ?? "unknown"}.`,
		);
	}
	lines.push(
		"",
		`Inspect omitted qualifying candidates: ${diagnosticCommand(report, "--include-overflow")}`,
		`Inspect observed candidates: ${diagnosticCommand(report, "--include-observed")}`,
		`Inspect expected candidates: ${diagnosticCommand(report, "--include-expected")}`,
		"Scope recommendation sends only the displayed structural candidate fields to the active model provider in an isolated tool-free session.",
	);
	return lines.join("\n");
}

function scopeInput(cards: InvestigationCard[]): ScopeInput {
	return {
		candidates: cards.map(
			({
				candidateId,
				tool,
				structuralLabel,
				reasonCode,
				gateWindow,
				occurrences,
				sessions,
				lastObserved,
			}) => ({
				candidateId,
				tool,
				issueName: plainIssueName(structuralLabel),
				structuralLabel,
				reasonCode,
				gateWindow,
				occurrences,
				sessions,
				lastObserved,
			}),
		),
	};
}

export function validateScopeOutput(
	output: ScopeOutput,
	candidateIds: ReadonlySet<string>,
): ScopeOutput {
	Assert(ScopeOutputSchema, output);
	const seen = new Set<string>();
	for (const recommendation of output.recommendations) {
		if (!candidateIds.has(recommendation.candidateId))
			throw new Error(
				`scope recommendation returned an unknown candidate: ${recommendation.candidateId}`,
			);
		if (seen.has(recommendation.candidateId))
			throw new Error(
				`scope recommendation returned a duplicate candidate: ${recommendation.candidateId}`,
			);
		seen.add(recommendation.candidateId);
	}
	return output;
}

function renderScopeRecommendation(
	output: ScopeOutput,
	cards: InvestigationCard[],
): string {
	const cardsById = new Map(cards.map((card) => [card.candidateId, card]));
	const lines = ["# Recommended Investigation Scope"];
	for (const item of output.recommendations) {
		const card = cardsById.get(item.candidateId);
		if (!card) throw new Error(`missing card for recommendation: ${item.candidateId}`);
		lines.push(
			"",
			`- ${card.tool} - ${plainIssueName(card.structuralLabel)}`,
			`  Candidate ID: ${item.candidateId}`,
			`  Investigation value: ${item.investigationValue}`,
			`  Evidence limits: ${item.evidenceLimits}`,
		);
	}
	lines.push(
		"",
		"Reply with the tool - issue names you accept, or refine the scope before any transcript evidence is loaded. Candidate IDs remain available for exact ledger operations.",
	);
	return lines.join("\n");
}

async function runAnalytics(
	pi: ExtensionAPI,
	args: string[],
	signal?: AbortSignal,
): Promise<string> {
	const result = await pi.exec("uv", [...commandPrefix, ...args], {
		cwd: repositoryRoot,
		timeout: 300_000,
		signal,
	});
	if (result.code !== 0) {
		const detail =
			result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
		throw new Error(detail.slice(0, 1_000));
	}
	return result.stdout;
}

function notifyWorking(ctx: ExtensionContext, message: string): void {
	ctx.ui.notify(
		ctx.mode === "tui"
			? ctx.ui.theme.fg("accent", ctx.ui.theme.bold(message))
			: message,
		"info",
	);
}

async function executeFindFails(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	signal: AbortSignal | undefined,
	setProgress: (message: string) => void,
): Promise<void> {
	let stage = "snapshot refresh";
	try {
		await runAnalytics(
			pi,
			[
				"--snapshot-db",
				snapshotPath,
				"--source",
				"session_entries",
				"snapshot",
			],
			signal,
		);
		stage = "failure scan";
		setProgress("Scanning tool-failure evidence...");
		await runAnalytics(
			pi,
			[
				"--snapshot-db",
				snapshotPath,
				"--source",
				"session_entries",
				"tool-failure-scan",
				"--output",
				scanPath,
			],
			signal,
		);
		stage = "shortlist report";
		setProgress("Building the investigation shortlist...");
		const customTools = customExtensionToolNames(pi);
		const output = await runAnalytics(
			pi,
			["tool-failure-report", scanPath, "--tools", ...customTools],
			signal,
		);
		const report = parseReport(output);
		pi.sendMessage(
			{
				customType: "tool-failure-triage",
				content: renderToolFailureReport(report),
				display: true,
			},
			{ triggerTurn: false },
		);
		if (report.cards.length === 0) return;
		stage = "scope recommendation";
		setProgress("Recommending an investigation scope...");
		notifyWorking(
			ctx,
			"Sending structural candidate metadata to the active model provider.",
		);
		const { output: recommendation } = await scopeRecommendationAgent.run(
			scopeInput(report.cards),
			{
				cwd: ctx.cwd,
				model: ctx.model,
				modelRegistry: ctx.modelRegistry,
				signal,
			},
		);
		validateScopeOutput(
			recommendation,
			new Set(report.cards.map((card) => card.candidateId)),
		);
		pi.sendMessage(
			{
				customType: "tool-failure-scope-recommendation",
				content: renderScopeRecommendation(recommendation, report.cards),
				display: true,
			},
			{ triggerTurn: false },
		);
	} catch (error) {
		if (signal?.aborted) throw error;
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Tool-failure ${stage} failed: ${message}. Retry with /find-fails.`,
		);
	}
}

async function runWithTuiProgress(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<"completed" | "cancelled"> {
	return ctx.ui.custom<"completed" | "cancelled">(
		(tui, theme, _keybindings, done) => {
			const loader = new CancellableLoader(
				tui,
				(text) => theme.fg("accent", text),
				(text) => theme.fg("text", theme.bold(text)),
				"Finding tool failures...",
			);
			let finished = false;
			const finish = (result: "completed" | "cancelled") => {
				if (finished) return;
				finished = true;
				done(result);
			};
			loader.onAbort = () => finish("cancelled");
			executeFindFails(pi, ctx, loader.signal, (message) => {
				loader.setMessage(message);
				tui.requestRender();
			})
				.then(() => finish("completed"))
				.catch((error) => {
					if (loader.signal.aborted) {
						finish("cancelled");
						return;
					}
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(message, "error");
					finish("completed");
				});
			return loader;
		},
	);
}

export default function toolFailureTriageExtension(pi: ExtensionAPI) {
	pi.registerCommand("find-fails", {
		description: "Recommend a scope for investigating recurring tool failures",
		handler: async (args: string, ctx: ExtensionContext) => {
			if (args.trim()) {
				ctx.ui.notify("Usage: /find-fails", "warning");
				return;
			}
			notifyWorking(ctx, "Finding tool failures...");
			if (ctx.mode === "tui") {
				const result = await runWithTuiProgress(pi, ctx);
				if (result === "cancelled")
					ctx.ui.notify("Tool-failure scan cancelled.", "info");
				return;
			}
			try {
				await executeFindFails(pi, ctx, ctx.signal, () => {});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(message, "error");
			}
		},
	});
}
