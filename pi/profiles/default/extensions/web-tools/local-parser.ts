import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AcquisitionError, acquisitionBudget, withinSignal } from "./acquisition.ts";
import { parseLocalFetch, type LocalFetchResult } from "./fetch-result.ts";

/** Reuse the existing isolated Readability process without fetching the input URL. */
export async function parseHtml(html: string, url: string, maxChars: number, budget: ReturnType<typeof acquisitionBudget>): Promise<LocalFetchResult> {
	const script = fileURLToPath(new URL("./fetch.js", import.meta.url));
	try {
		const work = new Promise<string>((resolve, reject) => {
			const child = execFile(process.execPath, [script, url, "--html-stdin", "--json", "--backend", "direct", "--max-chars", String(maxChars), "--budget-ms", String(Math.min(60_000, budget.remaining()))], {
				encoding: "utf8", signal: budget.signal, timeout: budget.remaining(), maxBuffer: 256 * 1024,
			}, (error, stdout) => error ? reject(error) : resolve(stdout));
			child.stdin?.on("error", reject); child.stdin?.end(html);
		});
		return parseLocalFetch(await withinSignal(work, budget.signal));
	} catch {
		budget.signal.throwIfAborted();
		throw new AcquisitionError("empty", "Readable page extraction unavailable");
	}
}
