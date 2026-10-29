import { expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { queryPersonalCur, CUR_QUERY_TIMEOUT } from "../lib/bedrock/cur-query.ts";

const snapshot = { schema_version: 1, source: "payer-cur2", billing_month: "2026-09", currency: "USD", generated_at: "2026-09-20T00:00:00Z", username: "mike.glenn", month_to_date: 58.82 };
it("invokes the narrow live query with the selected profile, captures locally, and removes temporary output", async () => {
	let output = "";
	const exec = vi.fn(async (_command: string, args: string[]) => { output = args.at(-1)!; await fs.writeFile(output, JSON.stringify(snapshot)); return { code: 0, stdout: '{"StatusCode":200}', stderr: "" }; });
	const signal = new AbortController().signal;
	const before = Date.now(); const result = await queryPersonalCur(exec, "billing", signal);
	expect(exec).toHaveBeenCalledWith("aws", ["lambda", "invoke", "--region", "us-east-2", "--function-name", "ccb-personal-cur-query", "--payload", "{}", "--cli-read-timeout", "310", "--profile", "billing", output], { timeout: CUR_QUERY_TIMEOUT, signal });
	expect(result.month_to_date).toBe(58.82); expect(Date.parse(result.capturedAt!)).toBeGreaterThanOrEqual(before); expect(result.capturedAt).not.toBe(result.generated_at);
	await expect(fs.stat(output)).rejects.toMatchObject({ code: "ENOENT" });
});
it.each([
	{ code: 1, stdout: "", stderr: "SSO expired" },
	{ code: 0, stdout: '{"StatusCode":200,"FunctionError":"Unhandled"}', stderr: "" },
	{ code: 0, stdout: '{"StatusCode":202}', stderr: "" },
])("rejects failed CLI or Lambda responses without accepting their payload", async result => {
	let output = "";
	await expect(queryPersonalCur(async (_command, args) => { output = args.at(-1)!; await fs.writeFile(output, JSON.stringify(snapshot)); return result; })).rejects.toThrow("Personal CUR query failed");
	await expect(fs.stat(output)).rejects.toMatchObject({ code: "ENOENT" });
});
