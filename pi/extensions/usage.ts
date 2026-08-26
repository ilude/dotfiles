// Source: https://github.com/davis7dotsh/my-pi-setup/blob/main/extensions/usage.ts
// Pulled from davis7dotsh/my-pi-setup main at file blob d0032ec53597d9d7f442af3eedc601068a155709.
// Keep this attribution so we can periodically compare against upstream for updates.
// Local changes: usage parsing and pricing are owned by the typed in-process reader
// in pi/lib/log-analytics/usage-analytics.ts.

import * as os from "node:os";
import * as path from "node:path";
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	aggregateUsage,
	loadUsagePricing,
	readHistoricalUsage,
	type UsageAggregate,
} from "../lib/log-analytics/usage-analytics.ts";
import { resolveSessionRoot } from "../lib/session-jsonl.ts";

const WINDOWS = [1, 7, 30, 90] as const;

function money(value: number): string {
	return `$${(Math.ceil(value * 100) / 100).toFixed(2)}`;
}

function row(item: UsageAggregate): string {
	return `| ${item.source} | ${item.model} | ${item.turns.toLocaleString()} | ${item.input.toLocaleString()} | ${item.output.toLocaleString()} | ${item.cached.toLocaleString()} | ${item.total.toLocaleString()} | ${money(item.price)} |`;
}

export async function buildUsageReport(
	refreshPricing = false,
	sessionRoot = resolveSessionRoot(),
	codexRoots: readonly string[] = [
		path.join(os.homedir(), ".codex", "sessions"),
		path.join(os.homedir(), ".codex", "archived_sessions"),
	],
): Promise<string> {
	const usage = await readHistoricalUsage(sessionRoot, codexRoots);
	const { prices, note } = await loadUsagePricing(refreshPricing);
	const lines = [`Generated: ${new Date().toISOString()}`];
	for (const days of WINDOWS) {
		const items = aggregateUsage(usage.records, days, prices);
		const total: UsageAggregate = {
			source: "Pi",
			model: "",
			turns: 0,
			input: 0,
			output: 0,
			cached: 0,
			total: 0,
			price: 0,
		};
		for (const item of items) {
			total.turns += item.turns;
			total.input += item.input;
			total.output += item.output;
			total.cached += item.cached;
			total.total += item.total;
			total.price += item.price;
		}
		lines.push(
			`\n## Last ${days} day${days === 1 ? "" : "s"}`,
			"| Source | Model | Messages/Turns | Input | Output | Cached In | Total Tokens | Price |",
			"|---|---|---:|---:|---:|---:|---:|---:|",
			...items.map(row),
			`| **Total** |  | **${total.turns.toLocaleString()}** | **${total.input.toLocaleString()}** | **${total.output.toLocaleString()}** | **${total.cached.toLocaleString()}** | **${total.total.toLocaleString()}** | **${money(total.price)}** |`,
		);
	}
	lines.push(
		"\n## Pricing notes",
		`- models.dev cache: ${note}.`,
		`- Parsed files: Pi ${usage.piFiles.length}, Codex CLI ${usage.codexFiles.length}. Records counted: ${usage.records.length.toLocaleString()}.`,
		`- Skipped malformed JSONL lines: Pi ${usage.skipped.Pi}, Codex CLI ${usage.skipped["Codex CLI"]}.`,
		"- Codex CLI token_count uses last_token_usage; reasoning_output_tokens is assumed included in output/total when present.",
		"- Cached output/write tokens are intentionally not reported.",
	);
	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "usage_report",
		label: "Pi Usage Report",
		description:
			"Parse local Pi and Codex CLI session logs and return token/cost usage tables.",
		parameters: Type.Object({
			refreshPricing: Type.Optional(
				Type.Boolean({
					description: "Force-refresh models.dev pricing cache.",
				}),
			),
		}),
		async execute(_toolCallId, params) {
			const markdown = await buildUsageReport(params.refreshPricing ?? false);
			return {
				content: [{ type: "text", text: markdown }],
				details: { markdown },
			};
		},
	});

	pi.registerCommand("usage-stats", {
		description:
			"Summarize Pi/Codex token usage and cost for the last 1, 7, 30, and 90 days",
		handler: async (args, ctx) => {
			const refreshPricing = args.trim() === "--refresh-pricing";
			ctx.ui.notify("Usage report started.", "info");
			const markdown = await buildUsageReport(
				refreshPricing,
				ctx.sessionManager.getSessionDir(),
			);
			pi.sendMessage(
				{
					customType: "usage-stats",
					content: markdown,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}
