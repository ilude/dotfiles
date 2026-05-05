// Source: https://github.com/davis7dotsh/my-pi-setup/blob/main/extensions/tps-tracker.ts
// Pulled from davis7dotsh/my-pi-setup main at file blob 5c198dc30baa96a64a6ee55a18a9a59a9b7ac7d0.
// Keep this attribution so we can periodically compare against upstream for updates.

/**
 * TPS Tracker Extension
 *
 * Tracks tokens per second during model generation and reports
 * final TPS statistics at the end of each agent run.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	/** Timestamp when the current assistant message event started. Used as a fallback. */
	let messageStart: number | null = null;
	/** Timestamp of the first streamed output delta for the current assistant message. */
	let streamStart: number | null = null;
	/** Estimated streamed output tokens for live display before providers report final usage. */
	let estimatedStreamedTokens = 0;
	/** Cumulative official output tokens across all assistant messages in this agent run. */
	let totalOutputTokens = 0;
	/** Cumulative time (ms) spent actually streaming output deltas (excludes tool execution and first-token latency). */
	let totalStreamMs = 0;
	/** Cumulative time (ms) from assistant message start to first streamed output delta. */
	let totalFirstTokenLatencyMs = 0;
	/** Assistant messages that produced a first streamed output delta. */
	let firstTokenLatencySamples = 0;

	pi.on("agent_start", async (_event, ctx) => {
		totalOutputTokens = 0;
		totalStreamMs = 0;
		totalFirstTokenLatencyMs = 0;
		firstTokenLatencySamples = 0;
		messageStart = null;
		streamStart = null;
		estimatedStreamedTokens = 0;
		if (!ctx.hasUI) return;
		const theme = ctx.ui.theme;
		ctx.ui.setStatus("tps", theme.fg("dim", "⏱ generating..."));
	});

	pi.on("message_start", async (event) => {
		if (event.message.role !== "assistant") return;
		messageStart = Date.now();
		streamStart = null;
		estimatedStreamedTokens = 0;
	});

	pi.on("message_update", async (event, ctx) => {
		if (event.message.role !== "assistant") return;

		const streamEvent = event.assistantMessageEvent;
		const isOutputDelta =
			streamEvent.type === "text_delta" ||
			streamEvent.type === "thinking_delta" ||
			streamEvent.type === "toolcall_delta";

		if (!isOutputDelta) return;

		const now = Date.now();
		if (streamStart === null) {
			streamStart = now;
			if (messageStart !== null) {
				totalFirstTokenLatencyMs += Math.max(0, now - messageStart);
				firstTokenLatencySamples += 1;
			}
		}
		estimatedStreamedTokens += Math.max(0, streamEvent.delta.length / 4);

		const elapsed = (now - streamStart) / 1000;
		const officialTokens = event.message.usage?.output ?? 0;
		const currentTokens =
			officialTokens > 0 ? officialTokens : estimatedStreamedTokens;

		if (elapsed > 0 && currentTokens > 0 && ctx.hasUI) {
			const tps = Math.round(currentTokens / elapsed);
			const tokenLabel =
				officialTokens > 0
					? `${officialTokens} tok`
					: `~${Math.round(estimatedStreamedTokens)} tok`;
			const latency =
				messageStart === null ? undefined : (streamStart - messageStart) / 1000;
			const latencyLabel =
				latency === undefined ? "" : `, first ${latency.toFixed(1)}s`;
			const theme = ctx.ui.theme;
			ctx.ui.setStatus(
				"tps",
				`${theme.fg("accent", `${tps} tok/s`)} ${theme.fg("dim", `(${tokenLabel} / ${elapsed.toFixed(1)}s${latencyLabel})`)}`,
			);
		}
	});

	pi.on("message_end", async (event) => {
		if (event.message.role !== "assistant") return;

		const messageTokens = event.message.usage?.output ?? 0;
		const timingStart = streamStart ?? messageStart;
		if (!timingStart || messageTokens <= 0) {
			messageStart = null;
			streamStart = null;
			estimatedStreamedTokens = 0;
			return;
		}

		totalOutputTokens += messageTokens;
		totalStreamMs += Math.max(0, Date.now() - timingStart);

		messageStart = null;
		streamStart = null;
		estimatedStreamedTokens = 0;
	});

	pi.on("agent_end", async (_event, ctx) => {
		const elapsed = totalStreamMs / 1000;
		const tps =
			totalOutputTokens > 0 && elapsed > 0
				? Math.round(totalOutputTokens / elapsed)
				: 0;
		const avgFirstTokenLatency =
			firstTokenLatencySamples > 0
				? totalFirstTokenLatencyMs / firstTokenLatencySamples / 1000
				: undefined;

		if (!ctx.hasUI) return;
		const theme = ctx.ui.theme;
		const icon = theme.fg("success", "✓");
		const tpsLabel =
			tps > 0 ? theme.fg("accent", `${tps} tok/s`) : theme.fg("dim", "N/A");
		const latencyDetail =
			avgFirstTokenLatency === undefined
				? ""
				: `, ${avgFirstTokenLatency.toFixed(1)}s avg first token`;
		const detail = theme.fg(
			"dim",
			`${totalOutputTokens} tokens in ${elapsed.toFixed(1)}s streaming${latencyDetail}`,
		);

		ctx.ui.notify(`${icon} ${tpsLabel}  ${detail}`, "info");
		ctx.ui.setStatus("tps", theme.fg("dim", `done — ${tpsLabel}`));
	});
}
