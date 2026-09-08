import type { CostBaseline } from "./ledger.js";

export interface PersonalSnapshotQuery {
	callerArgs: string[];
	invokeArgs: (outputFile: string) => string[];
}

const awsArgs = (profile?: string) => ["--region", "us-east-2", "--output", "json", "--no-cli-pager", ...(profile ? ["--profile", profile] : [])];

export function personalSnapshotQuery(profile?: string): PersonalSnapshotQuery {
	return {
		callerArgs: ["sts", "get-caller-identity", ...awsArgs(profile)],
		invokeArgs: outputFile => ["lambda", "invoke", "--function-name", process.env.PI_BEDROCK_USAGE_FUNCTION || "ccb-per-user-cost-alert", "--payload", JSON.stringify({ action: "personal-snapshot" }), "--cli-binary-format", "raw-in-base64-out", outputFile, ...awsArgs(profile)],
	};
}

export function parseCallerArn(stdout: string): string {
	let value: unknown;
	try { value = JSON.parse(stdout); } catch { throw new Error("AWS STS returned invalid JSON"); }
	const arn = (value as { Arn?: unknown })?.Arn;
	if (typeof arn !== "string" || !/^arn:aws:iam::\d{12}:user\/.+/.test(arn)) throw new Error("Personal Bedrock reconciliation requires an IAM user caller ARN");
	return arn;
}

export function parsePersonalSnapshot(stdout: string, callerArn: string, cutoff: string): CostBaseline {
	let value: any;
	try { value = JSON.parse(stdout); } catch { throw new Error("Personal Bedrock snapshot returned invalid JSON"); }
	if (value?.schemaVersion !== 1 || value?.source !== "payer-cur-2-athena" || value?.principal !== callerArn) throw new Error("Personal Bedrock snapshot principal or source did not match the AWS caller");
	if (!/^\d{4}-\d{2}$/.test(value.billingMonth) || typeof value.displayName !== "string" || !Number.isFinite(value.amount) || value.amount < 0 || !Number.isFinite(Date.parse(value.generatedAt)) || (value.latestUsageAt !== null && !Number.isFinite(Date.parse(value.latestUsageAt)))) throw new Error("Personal Bedrock snapshot response was malformed");
	if (!Array.isArray(value.models) || value.models.some((model: any) => typeof model?.name !== "string" || !Number.isFinite(model?.amount) || model.amount < 0)) throw new Error("Personal Bedrock snapshot model totals were malformed");
	return { schemaVersion: 1, month: value.billingMonth, principal: value.principal, displayName: value.displayName, amount: value.amount, models: value.models, source: value.source, generatedAt: value.generatedAt, latestUsageAt: value.latestUsageAt, localCutoff: cutoff };
}
