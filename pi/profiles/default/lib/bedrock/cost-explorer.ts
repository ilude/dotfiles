import type { CostBaseline } from "./ledger.js";

export interface CostExplorerQuery {
	args: string[];
	month: string;
	periodStart: string;
	periodEnd: string;
	capturedAt: string;
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function period(now: Date) {
	const capturedAt = now.toISOString();
	const periodStart = `${capturedAt.slice(0, 7)}-01`;
	const tomorrow = new Date(now.getTime()); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
	return { month: capturedAt.slice(0, 7), periodStart, periodEnd: isoDate(tomorrow), capturedAt };
}
function commonArgs(profile?: string): string[] { return ["--region", "us-east-1", "--output", "json", "--no-cli-pager", ...(profile ? ["--profile", profile] : [])]; }
export function costExplorerServiceQuery(now = new Date(), profile?: string): CostExplorerQuery {
	const dates = period(now);
	return { ...dates, args: ["ce", "get-dimension-values", "--time-period", JSON.stringify({ Start: dates.periodStart, End: dates.periodEnd }), "--dimension", "SERVICE", "--search-string", "Amazon Bedrock Edition", ...commonArgs(profile)] };
}
export function parseBedrockServices(stdout: string): string[] {
	let payload: any; try { payload = JSON.parse(stdout); } catch { throw new Error("AWS Cost Explorer service discovery returned invalid JSON"); }
	const services = payload?.DimensionValues?.map((item: any) => item?.Value).filter((value: unknown): value is string => typeof value === "string" && value.includes("Amazon Bedrock Edition")) ?? [];
	if (!services.length) throw new Error("AWS Cost Explorer found no Amazon Bedrock Edition services for this month");
	return [...new Set<string>(services)];
}
export function costExplorerQuery(services: string[], now = new Date(), profile?: string): CostExplorerQuery {
	if (!services.length) throw new Error("At least one Bedrock Cost Explorer service is required");
	const dates = period(now);
	const args = ["ce", "get-cost-and-usage", "--time-period", JSON.stringify({ Start: dates.periodStart, End: dates.periodEnd }), "--granularity", "MONTHLY", "--metrics", "UnblendedCost", "--filter", JSON.stringify({ Dimensions: { Key: "SERVICE", Values: services } }), ...commonArgs(profile)];
	return { args, ...dates };
}

export function parseCostExplorerBaseline(stdout: string, query: Omit<CostExplorerQuery, "args">): CostBaseline {
	let payload: any;
	try { payload = JSON.parse(stdout); } catch { throw new Error("AWS Cost Explorer returned invalid JSON"); }
	const groups = payload?.ResultsByTime;
	if (!Array.isArray(groups) || groups.length === 0) throw new Error("AWS Cost Explorer returned no monthly result");
	const amounts = groups.map((item: any) => Number(item?.Total?.UnblendedCost?.Amount));
	if (amounts.some((amount: number) => !Number.isFinite(amount) || amount < 0)) throw new Error("AWS Cost Explorer returned an invalid UnblendedCost amount");
	return { schemaVersion: 1, month: query.month, amount: amounts.reduce((sum: number, amount: number) => sum + amount, 0), capturedAt: query.capturedAt, periodStart: query.periodStart, periodEnd: query.periodEnd, source: "aws-cost-explorer", metric: "UnblendedCost" };
}
