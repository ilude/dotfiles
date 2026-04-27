/**
 * /permissions Operator Surface
 *
 * Reads the durable permission registry (pi/lib/permission-registry.ts) and
 * exposes a compact summary of session approvals plus recent allow/deny
 * decisions. Owned by .specs/pi-operator-layer-mvp/plan.md (T5).
 *
 * Commands:
 *   /permissions              -- summary: session approvals + recent decisions
 *   /permissions allows       -- recent allow decisions only
 *   /permissions denies       -- recent deny decisions only
 *   /permissions reset        -- clear all session approvals
 *   /permissions retry <id>   -- replay a previously denied action when a
 *                                replayPayload was captured. Re-records the
 *                                replay attempt as a new decision so audit
 *                                history shows both events.
 */

import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	type DecisionOutcome,
	getDecision,
	listRecentDecisions,
	listSessionApprovals,
	type PermissionDecision,
	recordDecision,
	resetSessionApprovals,
	type SessionApproval,
} from "../lib/permission-registry.js";

const RECENT_LIMIT = 20;
const ACTION_TRUNCATE = 60;
const SUMMARY_TRUNCATE = 80;

function shortId(id: string): string {
	return id.slice(0, 8);
}

function relativeTime(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "?";
	const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
	if (seconds < 60) return `${seconds}s ago`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}

function truncate(text: string | undefined, max: number): string {
	if (!text) return "";
	return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function formatSessionApprovalRow(a: SessionApproval): string {
	const reason = a.reason ? ` -- ${truncate(a.reason, 60)}` : "";
	return `  ${a.pattern}${reason}  -- ${relativeTime(a.grantedAt)}`;
}

export function formatDecisionRow(d: PermissionDecision): string {
	const action = truncate(d.action, ACTION_TRUNCATE);
	const summary = d.summary ? ` -- ${truncate(d.summary, SUMMARY_TRUNCATE)}` : "";
	const tag = `[${d.outcome}/${d.provenance}]`;
	return `  ${shortId(d.id)} ${tag} ${action}${summary}  -- ${relativeTime(d.recordedAt)}`;
}

export function formatPermissionsSummary(opts: {
	approvals: SessionApproval[];
	recent: PermissionDecision[];
}): string {
	const lines: string[] = ["permissions:"];
	lines.push(`  session approvals (${opts.approvals.length})`);
	if (opts.approvals.length === 0) {
		lines.push("    (none -- all rules come from damage-control-rules.yaml)");
	} else {
		for (const a of opts.approvals) lines.push(formatSessionApprovalRow(a));
	}

	const allows = opts.recent.filter((d) => d.outcome === "allow");
	const denies = opts.recent.filter((d) => d.outcome === "deny");

	lines.push("");
	lines.push(`  recent allows (${allows.length})`);
	if (allows.length === 0) lines.push("    (none recorded)");
	else for (const d of allows.slice(0, 10)) lines.push(formatDecisionRow(d));

	lines.push("");
	lines.push(`  recent denies (${denies.length})`);
	if (denies.length === 0) lines.push("    (none recorded)");
	else for (const d of denies.slice(0, 10)) lines.push(formatDecisionRow(d));

	return lines.join("\n");
}

interface ParsedSubcommand {
	verb: "summary" | "allows" | "denies" | "reset" | "retry";
	idArg?: string;
}

export function parsePermissionsArgs(args: string): ParsedSubcommand {
	const trimmed = args.trim();
	if (!trimmed) return { verb: "summary" };
	const parts = trimmed.split(/\s+/);
	const head = parts[0].toLowerCase();
	if (head === "allows" || head === "allow") return { verb: "allows" };
	if (head === "denies" || head === "deny") return { verb: "denies" };
	if (head === "reset") return { verb: "reset" };
	if (head === "retry") return { verb: "retry", idArg: parts[1] };
	return { verb: "summary" };
}

function filterDecisionsByOutcome(
	decisions: PermissionDecision[],
	outcome: DecisionOutcome,
): PermissionDecision[] {
	return decisions.filter((d) => d.outcome === outcome);
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("permissions", {
		description:
			"Show permission state -- session approvals + recent decisions. " +
			"Usage: /permissions | /permissions allows | /permissions denies | " +
			"/permissions reset | /permissions retry <id>.",
		handler: async (args, ctx) => {
			const parsed = parsePermissionsArgs(args);

			if (parsed.verb === "reset") {
				try {
					resetSessionApprovals();
					ctx.ui.notify("Session approvals cleared.", "info");
				} catch (err) {
					ctx.ui.notify(
						`Reset failed: ${err instanceof Error ? err.message : String(err)}`,
						"error",
					);
				}
				return;
			}

			if (parsed.verb === "retry") {
				if (!parsed.idArg) {
					ctx.ui.notify("Usage: /permissions retry <decision-id>", "warning");
					return;
				}
				const candidates = listRecentDecisions({ limit: 200 });
				const exact = candidates.find((d) => d.id === parsed.idArg);
				const prefix = exact
					? null
					: candidates.filter((d) => d.id.startsWith(parsed.idArg as string));
				const target = exact ?? (prefix && prefix.length === 1 ? prefix[0] : null);
				if (!target) {
					ctx.ui.notify(
						`No unique decision found for "${parsed.idArg}". Try /permissions denies for ids.`,
						"warning",
					);
					return;
				}
				if (target.outcome !== "deny") {
					ctx.ui.notify(
						`Only deny decisions can be retried (this one was ${target.outcome}).`,
						"warning",
					);
					return;
				}
				if (!target.replayPayload) {
					ctx.ui.notify(
						`Decision ${shortId(target.id)} has no replay payload; original action cannot be re-issued safely.`,
						"warning",
					);
					return;
				}
				const original = getDecision(target.id);
				try {
					recordDecision({
						action: target.action,
						outcome: "deny",
						provenance: "manual_once",
						summary: `Replay attempt of ${shortId(target.id)}`,
						replayPayload: target.replayPayload,
						metadata: { replayOf: target.id, original: original?.recordedAt },
					});
					ctx.ui.notify(
						`Replay recorded for ${shortId(target.id)}. Re-issue the original action through normal channels to actually retry; this records the operator's intent.`,
						"info",
					);
				} catch (err) {
					ctx.ui.notify(
						`Replay record failed: ${err instanceof Error ? err.message : String(err)}`,
						"error",
					);
				}
				return;
			}

			let approvals: SessionApproval[];
			let recent: PermissionDecision[];
			try {
				approvals = listSessionApprovals();
				recent = listRecentDecisions({ limit: RECENT_LIMIT });
			} catch (err) {
				ctx.ui.notify(
					`Failed to read permission registry: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
				return;
			}

			if (parsed.verb === "allows") {
				const allows = filterDecisionsByOutcome(recent, "allow");
				if (allows.length === 0) {
					ctx.ui.notify("No recent allow decisions recorded.", "info");
					return;
				}
				ctx.ui.notify(allows.map(formatDecisionRow).join("\n"), "info");
				return;
			}

			if (parsed.verb === "denies") {
				const denies = filterDecisionsByOutcome(recent, "deny");
				if (denies.length === 0) {
					ctx.ui.notify("No recent deny decisions recorded.", "info");
					return;
				}
				ctx.ui.notify(denies.map(formatDecisionRow).join("\n"), "info");
				return;
			}

			ctx.ui.notify(formatPermissionsSummary({ approvals, recent }), "info");
		},
	});
}
