import { readCurSnapshot } from "./cur-snapshot.js";
import { summarize, formatUsage } from "./ledger.js";
import { readClaudeLocalContribution } from "./claude-status-usage.js";

/** CUR is the only AWS baseline here. Historical CloudWatch files stay untouched. */
export async function summarizeBilling() {
	const month = new Date().toISOString().slice(0, 7);
	const cached = await readCurSnapshot();
	const cur = cached?.billing_month === month ? cached : undefined;
	// Pre-automatic caches have no local capture time. Keep their posted value
	// until the immediate live refresh establishes a local delta boundary.
	const capturedAt = cur ? cur.capturedAt ?? new Date().toISOString() : undefined;
	const summary = await summarize(month, { amount: cur?.month_to_date ?? 0, capturedAt });
	const claude = await readClaudeLocalContribution(month, capturedAt ? { month, capturedAt } : undefined);
	return { summary, claude, cur, total: summary.baseline + summary.cost + claude };
}
export async function formatBillingUsage(): Promise<string> {
	const { summary, claude, cur } = await summarizeBilling();
	return [formatUsage(summary, claude), ...(cur ? [`  CUR query: ${cur.generated_at}`, `  Local delta since: ${cur.capturedAt ?? "next successful live query"}`] : [])].join("\n");
}
