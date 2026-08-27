import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CancellableLoader } from "@earendil-works/pi-tui";
import { handoffRecoverableLocalFailure } from "../lib/recovery-handoff.js";
import { createBoundedInspection, type BoundedInspection, type InspectionProof } from "../lib/tool-failure-inspection.ts";
import { withAnalyticsSession } from "../lib/log-analytics/api.ts";
import { scanToolFailures, selectedFailureCoordinates, type SessionEntry } from "../lib/tool-failure-classifier.ts";
import { appendDecision, candidateLedgerState, loadDecisionLedger, normalizeEvidence, EVIDENCE_TYPES, EVIDENCE_TEXT_MAX_LENGTH, type SelectedCandidate, type Decision, type EvidenceItem } from "../lib/tool-failure-decisions.ts";
import { buildDiagnosticPrompt } from "../lib/tool-failure-report.ts";
import { startDiagnosticTurn, registerDiagnosticTurnLifecycle, DIAGNOSTIC_INSPECTION_TOOL_NAME, DIAGNOSTIC_DECISION_TOOL_NAME } from "../lib/tool-failure-diagnostic-turn.ts";
import { registerSlashCommand } from "../lib/slash-command-echo.js";

export function resolveRepositoryRoot(extensionUrl: string): string {
	return path.resolve(path.dirname(new URL(extensionUrl).pathname), "../..");
}

function customExtensionToolNames(pi: ExtensionAPI): Set<string> {
	return new Set(pi.getAllTools().filter((tool) => tool.sourceInfo?.source !== "builtin" && tool.sourceInfo?.source !== "sdk").map((tool) => tool.name));
}

type DiagnosticRun = { scan: ReturnType<typeof scanToolFailures>; selected: SelectedCandidate[]; inspection: BoundedInspection; proof?: InspectionProof };

async function readSessionEntries(root: string, signal: AbortSignal | undefined): Promise<SessionEntry[]> {
	const result = await withAnalyticsSession({ root, sources: ["session_entries"], signal }, (session) => session.query({
		sql: `SELECT _source_file AS filename, _record_key AS id, _timestamp AS timestamp, record FROM session_entries ORDER BY _source_file, _record_key`,
		maxRows: 100_000,
		maxBytes: 64 * 1024 * 1024,
	}));
	if (result.truncated) throw new Error("tool-failure session query exceeded its bound");
	return result.rows.map((row) => {
		let record = row.record;
		if (typeof record === "string") {
			try { record = JSON.parse(record) as unknown; } catch { record = undefined; }
		}
		const envelope = record && typeof record === "object" && !Array.isArray(record) ? record as Record<string, unknown> : {};
		const message = envelope.type === "message" && envelope.message && typeof envelope.message === "object" ? envelope.message : envelope;
		return { filename: String(row.filename), id: String(row.id), timestamp: row.timestamp == null ? null : String(row.timestamp), message };
	});
}

async function executeFindFails(pi: ExtensionAPI, ctx: ExtensionContext, signal: AbortSignal | undefined, setProgress: (message: string) => void, setRun: (run: DiagnosticRun | undefined) => void): Promise<boolean> {
	if (signal?.aborted) throw new Error("This operation was aborted");
	setProgress("Querying the canonical session entries...");
	const sessionRoot = ctx.sessionManager.getSessionDir();
	const scanRows = await readSessionEntries(path.dirname(sessionRoot), signal);
	const scan = scanToolFailures(scanRows);

		const ledgerPath = path.join(process.env.PI_AGENT_DIR ?? path.join(process.env.HOME ?? process.cwd(), ".pi", "agent"), "tool-failures", "decisions.jsonl");
		const ledger = await loadDecisionLedger(ledgerPath);
		const state = candidateLedgerState(scan, ledger.records);
		const tools = customExtensionToolNames(pi);
		const selected = state.actionable.filter((item) => tools.has(item.tool));
		if (!selected.length) return false;
		const selectedCoordinates = selectedFailureCoordinates(scan, scanRows, selected.map((item) => item.candidateId));
		const inspection = createBoundedInspection(ctx.cwd, { transcriptRoots: [sessionRoot], selectedCoordinates: [...selectedCoordinates.values()].flat(), limits: { maxItemsPerTurn: 12, maxBytesPerTurn: 24_576 } });
		const turn = startDiagnosticTurn(pi, ctx.sessionManager.getSessionId(), () => setRun(undefined));
		signal?.addEventListener("abort", () => turn.settle(), { once: true });
		setRun({ scan, selected, inspection });
		try {
			if (signal?.aborted) throw new Error("This operation was aborted");
			setProgress("Starting the bounded diagnostic turn...");
			await pi.sendUserMessage(buildDiagnosticPrompt(selected, "the active provider", new Map([...selectedCoordinates.entries()].map(([candidateId, coordinates]) => [candidateId, coordinates.map((coordinate) => coordinate.token ?? "")]))));
		} catch (error) {
			turn.settle();
			throw error;
		}
	return true;
}

function notifyWorking(ctx: ExtensionContext, message: string): void { ctx.ui.notify(ctx.mode === "tui" ? ctx.ui.theme.fg("accent", ctx.ui.theme.bold(message)) : message, "info"); }

export default function toolFailureTriageExtension(pi: ExtensionAPI) {
	let currentRun: DiagnosticRun | undefined;
	registerDiagnosticTurnLifecycle(pi as never);
	const inspectTool = { name: DIAGNOSTIC_INSPECTION_TOOL_NAME, description: "Read one selected redacted tool-failure coordinate.", parameters: { type: "object", properties: { coordinate: { type: "string" } }, required: ["coordinate"] }, execute: async (_callId: string, params: { coordinate: string }) => { if (!currentRun) throw new Error("no diagnostic inspection is active"); return { content: [{ type: "text", text: await currentRun.inspection.readSelectedTranscript(params.coordinate) }] }; } };
	const decideTool = { name: DIAGNOSTIC_DECISION_TOOL_NAME, description: "Append one evidence-proven decision for the current selected diagnostic candidates.", parameters: { type: "object", properties: { candidateId: { type: "string" }, disposition: { type: "string", enum: ["safety-rejection", "caller-contract", "cancelled", "external", "addressed"] }, reason: { type: "string", minLength: 1, maxLength: 240 }, evidence: { type: "array", items: { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: EVIDENCE_TYPES }, text: { type: "string", minLength: 1, maxLength: EVIDENCE_TEXT_MAX_LENGTH } }, required: ["type", "text"] } }, effectiveAfter: { type: "string" }, revisitAfter: { type: "string" } }, required: ["candidateId", "disposition", "reason", "evidence"] }, execute: async (_callId: string, params: { candidateId: string; disposition: Decision["disposition"]; reason: string; evidence: EvidenceItem[]; effectiveAfter?: string; revisitAfter?: string }) => { if (!currentRun) throw new Error("no diagnostic decision is active"); if (!currentRun.selected.some((candidate) => candidate.candidateId === params.candidateId)) throw new Error("candidate is not selected for this diagnostic turn"); const proof = currentRun.inspection.issueProof(currentRun.scan, currentRun.selected.map((candidate) => candidate.candidateId)); currentRun.proof = proof; const persistedDisposition: Decision["disposition"] = params.disposition === "safety-rejection" ? "expected" : params.disposition;
			const decision = await appendDecision(path.join(process.env.PI_AGENT_DIR ?? path.join(process.env.HOME ?? process.cwd(), ".pi", "agent"), "tool-failures", "decisions.jsonl"), currentRun.scan, params.candidateId, persistedDisposition, params.reason, normalizeEvidence(params.evidence), { effectiveAfter: params.effectiveAfter, revisitAfter: params.revisitAfter, proof }); return { content: [{ type: "text", text: `Decision recorded for ${decision.candidateId}.` }] }; } };
	pi.registerTool(inspectTool as never);
	pi.registerTool(decideTool as never);
	registerSlashCommand(pi)("find-fails", {
		description: "Investigate recurring custom-tool failures",
		handler: async (args: string, ctx: ExtensionContext) => {
			if (args.trim()) { ctx.ui.notify("Usage: /find-fails", "warning"); return; }
			notifyWorking(ctx, "Finding tool failures...");
			const run = (signal: AbortSignal | undefined, progress: (message: string) => void) => executeFindFails(pi, ctx, signal, progress, (runState) => { currentRun = runState; });
			if (ctx.mode === "tui") {
				await ctx.ui.custom((tui, theme, _keybindings, done) => {
					const loader = new CancellableLoader(tui, (text) => theme.fg("accent", text), (text) => theme.fg("text", theme.bold(text)), "Finding tool failures...");
					loader.onAbort = () => done("cancelled");
				run(loader.signal, (message) => { loader.setMessage(message); tui.requestRender(); }).then((started) => { if (!started) ctx.ui.notify("No tool-failure findings are currently due for inspection.", "info"); done("completed"); }).catch((error) => { if (!loader.signal.aborted) ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); done("completed"); });
					return loader;
				});
				return;
			}
			try { const started = await run(ctx.signal, () => {}); if (!started) ctx.ui.notify("No tool-failure findings are currently due for inspection.", "info"); } catch (error) { const message = error instanceof Error ? error.message : String(error); handoffRecoverableLocalFailure(pi, { command: "/find-fails", failure: message, cwd: ctx.cwd, context: "The local tool-failure authority stopped before producing its bounded result." }); ctx.ui.notify(message, "error"); }
		},
	});
}

export { DIAGNOSTIC_INSPECTION_TOOL_NAME };
