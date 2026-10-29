import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parseCurSnapshot, type CapturedCurSnapshot } from "./cur-snapshot.js";

export const CUR_QUERY_FUNCTION = "ccb-personal-cur-query";
export const CUR_QUERY_TIMEOUT = 330_000;
type Exec = (command: string, args: string[], options: { timeout: number; signal?: AbortSignal }) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Each invocation runs the fixed personal CUR query, not a cached S3 download. */
export async function queryPersonalCur(exec: Exec, profile?: string, signal?: AbortSignal): Promise<CapturedCurSnapshot> {
	const directory = await fs.mkdtemp(path.join(tmpdir(), "pi-cur-query-"));
	const file = path.join(directory, "response.json");
	// Capture at request start so observations made during the request stay in the delta.
	const capturedAt = new Date().toISOString();
	try {
		const result = await exec("aws", ["lambda", "invoke", "--region", "us-east-2", "--function-name", CUR_QUERY_FUNCTION, "--payload", "{}", "--cli-read-timeout", "310", ...(profile ? ["--profile", profile] : []), file], { timeout: CUR_QUERY_TIMEOUT, signal });
		if (result.code !== 0) throw new Error(`Personal CUR query failed: ${(result.stderr || result.stdout || `exit ${result.code}`).trim()}`);
		const metadata = JSON.parse(result.stdout);
		if (metadata.FunctionError || metadata.StatusCode !== 200) throw new Error(`Personal CUR query failed: ${metadata.FunctionError || `status ${metadata.StatusCode}`}`);
		return { ...parseCurSnapshot(JSON.parse(await fs.readFile(file, "utf8"))), capturedAt };
	} finally { await fs.rm(directory, { recursive: true, force: true }); }
}
