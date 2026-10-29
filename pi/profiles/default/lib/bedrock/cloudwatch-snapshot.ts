import type { CostBaseline } from "./ledger.js";

const common = (profile?: string) => ["--region", "us-east-2", "--output", "json", "--no-cli-pager", ...(profile ? ["--profile", profile] : [])];
export const callerArgs = (profile?: string) => ["sts", "get-caller-identity", ...common(profile)];
export const dashboardArgs = (profile?: string) => ["cloudwatch", "get-dashboard", "--dashboard-name", "ccb-bedrock-usage", ...common(profile)];

function parseObject(stdout: string, label: string): Record<string, unknown> {
 let value: unknown;
 try { value = JSON.parse(stdout); } catch { throw new Error(`${label} returned invalid JSON`); }
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned invalid JSON`);
 return value as Record<string, unknown>;
}

function personalIdentity(principal: string): { accountId: string; userName: string } {
 const match = principal.match(/^arn:aws:(?:iam::(\d{12}):user\/(?:[^/]+\/)*|sts::(\d{12}):assumed-role\/[^/]+\/)([A-Za-z0-9+=,.@_-]+)$/);
 if (!match) throw new Error("Bedrock reconciliation requires an IAM user or named role session");
 return { accountId: match[1] ?? match[2], userName: match[3] };
}

export function parseCaller(stdout: string): string {
 const { Arn } = parseObject(stdout, "AWS STS");
 if (typeof Arn !== "string") throw new Error("AWS STS did not return a personal identity");
 personalIdentity(Arn);
 return Arn;
}

export function queryArgs(dashboard: string, principal: string, now = new Date(), profile?: string): string[] {
 const outer = parseObject(dashboard, "CloudWatch dashboard");
 if (typeof outer.DashboardBody !== "string") throw new Error("CloudWatch dashboard body was invalid");
 const body = parseObject(outer.DashboardBody, "CloudWatch dashboard body");
 const widgets = Array.isArray(body.widgets) ? body.widgets : [];
 const widget = widgets.find((value: unknown) => value && typeof value === "object" && "properties" in value && value.properties && typeof value.properties === "object" && "title" in value.properties && value.properties.title === "Estimated Bedrock Cost by User");
 const properties = widget?.properties;
 const query: unknown = properties?.query;
 if (typeof query !== "string") throw new Error("CloudWatch Bedrock cost query was unavailable");
 const total = "| stats coalesce(sum(inputCost), 0) + coalesce(sum(outputCost), 0) + coalesce(sum(cacheWriteCost), 0) + coalesce(sum(cacheReadCost), 0) as estimatedCost, count() as invocations";
 const grouped = `${total} by userArn`;
 if (!query.includes(grouped)) throw new Error("CloudWatch Bedrock cost query had an unexpected contract");
 // Match the person, not just one IAM/SSO ARN, before aggregating and limiting.
 const { accountId, userName } = personalIdentity(principal);
 const escapedName = userName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
 const pattern = `^arn:aws:(iam::${accountId}:user/(?:[^/]+/)*|sts::${accountId}:assumed-role/[^/]+/)${escapedName}$`.replaceAll("/", "\\/");
 const personalQuery = query.replace(grouped, `| filter userArn like /${pattern}/\n${total}`).split(/\r?\n/).map(line => line.trim()).filter(Boolean).filter(line => !line.startsWith("SOURCE ")).map(line => line.replace(/^\|\s*/, "")).join(" | ");
 const start = Math.floor(Date.parse(`${now.toISOString().slice(0, 7)}-01T00:00:00Z`) / 1000);
 const end = Math.floor(now.getTime() / 1000);
 return ["logs", "start-query", "--log-group-name", "/aws/bedrock/ccb", "--start-time", String(start), "--end-time", String(end), "--query-string", personalQuery, ...common(profile)];
}

export function parseQueryId(stdout: string): string {
 const value = parseObject(stdout, "CloudWatch Logs query start");
 if (typeof value.queryId !== "string") throw new Error("CloudWatch Logs query did not return an ID");
 return value.queryId;
}
export const resultsArgs = (id: string, profile?: string) => ["logs", "get-query-results", "--query-id", id, ...common(profile)];

export function parseResults(stdout: string, principal: string, capturedAt: string): { pending: boolean; baseline?: CostBaseline } {
 const value = parseObject(stdout, "CloudWatch Logs results");
 if (value.status === "Scheduled" || value.status === "Running") return { pending: true };
 if (value.status !== "Complete") throw new Error(`CloudWatch Logs query failed: ${value.status || "unknown status"}`);
 if (!Array.isArray(value.results) || value.results.length > 1) throw new Error("CloudWatch result was not a personal total");
 const row: unknown = value.results[0];
 const fields: Record<string, string> = {};
 if (row !== undefined) {
  if (!Array.isArray(row)) throw new Error("CloudWatch result contained invalid fields");
  for (const field of row) {
   if (!field || typeof field !== "object" || typeof field.field !== "string" || typeof field.value !== "string") throw new Error("CloudWatch result contained invalid fields");
   fields[field.field] = field.value;
  }
  if (fields.userArn !== undefined) throw new Error("CloudWatch result was grouped by sign-in identity instead of person");
 }
 const amount = row === undefined ? 0 : Number(fields.estimatedCost);
 const invocations = row === undefined ? 0 : Number(fields.invocations);
 if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(invocations) || invocations < 0) throw new Error("CloudWatch result contained invalid totals");
 const { accountId, userName } = personalIdentity(principal);
 return { pending: false, baseline: { schemaVersion: 1, month: capturedAt.slice(0, 7), principal, scope: "user", accountId, userName, amount, invocations, capturedAt, source: "cloudwatch-bedrock-invocation-logs" } };
}
