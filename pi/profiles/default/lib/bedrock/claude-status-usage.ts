import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import type { CostBaseline } from "./ledger.js";

export const CLAUDE_STATUS_USAGE_FILE = path.join(homedir(), ".claude", "bedrock-status-usage.json");

interface ClaudeUsageState {
	version: 1;
	increments: Array<{ month: string; at: string; amount: number }>;
}

function validMonth(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}$/.test(value); }

export async function readClaudeLocalContribution(month: string, baseline?: CostBaseline, file = CLAUDE_STATUS_USAGE_FILE): Promise<number> {
	let value: unknown;
	try { value = JSON.parse(await fs.readFile(file, "utf8")); }
	catch { return 0; }
	if (!value || typeof value !== "object" || (value as any).version !== 1 || !Array.isArray((value as any).increments)) return 0;
	const state = value as ClaudeUsageState;
	const cutoff = baseline?.month === month ? Date.parse(baseline.capturedAt) : undefined;
	return state.increments.reduce((total, increment) => {
		if (!increment || !validMonth(increment.month) || increment.month !== month || typeof increment.at !== "string" || !Number.isFinite(increment.amount) || increment.amount <= 0) return total;
		const timestamp = Date.parse(increment.at);
		if (!Number.isFinite(timestamp) || (cutoff !== undefined && timestamp <= cutoff)) return total;
		return total + increment.amount;
	}, 0);
}
