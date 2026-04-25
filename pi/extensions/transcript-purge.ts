/**
 * Transcript Purge Extension
 *
 * Registers the `/transcript-purge` command. Removes trace+spill files older
 * than the supplied age (default: all). Reads the trace directory from
 * `~/.pi/agent/settings.json` via the shared loader in pi/lib/transcript.ts.
 *
 * Usage examples:
 *   /transcript-purge          -- delete every trace+spill file
 *   /transcript-purge 7d       -- keep only files newer than 7 days
 *   /transcript-purge 24h      -- keep only files newer than 24 hours
 *   /transcript-purge 30m      -- keep only files newer than 30 minutes
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadSettings, sweepRetention } from "../lib/transcript.js";

const UNIT_MS: Record<string, number> = {
	ms: 1,
	s: 1_000,
	m: 60_000,
	h: 60 * 60_000,
	d: 24 * 60 * 60_000,
};

/**
 * Parse `7d`, `24h`, `30m`, `1500ms`, or a bare number (ms). Returns null when
 * the input is empty/unparseable -- the caller treats that as "delete all".
 */
export function parseAgeArgument(raw: string): number | null {
	const trimmed = raw.trim().toLowerCase();
	if (!trimmed) return null;
	const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/);
	if (!match) return null;
	const value = Number(match[1]);
	if (!Number.isFinite(value) || value < 0) return null;
	const unit = match[2] ?? "ms";
	const multiplier = UNIT_MS[unit];
	if (!multiplier) return null;
	return value * multiplier;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("transcript-purge", {
		description:
			"Delete trace+spill files older than the given age (default: all). Examples: /transcript-purge, /transcript-purge 7d, /transcript-purge 24h",
		handler: async (args, ctx) => {
			const settings = loadSettings();
			const maxAgeMs = parseAgeArgument(args);
			const result = await sweepRetention(
				settings.path,
				settings.retentionDays,
				maxAgeMs ?? 0,
			);
			const summary =
				`transcript-purge: removed ${result.removedFiles} trace file(s) and ${result.removedSpillDirs} spill dir(s) ` +
				`from ${settings.path}` +
				(maxAgeMs === null ? " (all)" : ` (older than ${args.trim()})`);
			ctx.ui.notify(summary, "info");
		},
	});
}
