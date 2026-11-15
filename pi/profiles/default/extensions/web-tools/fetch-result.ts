import { Type } from "typebox";
import type { JsonData } from "./structured.ts";

export const FetchAttemptSchema = Type.Object({
	backend: Type.Union([Type.Literal("local"), Type.Literal("direct"), Type.Literal("trawl"), Type.Literal("jina"), Type.Literal("firecrawl"), Type.Literal("browserbase-static"), Type.Literal("browserbase-rendered")]),
	outcome: Type.Union([Type.Literal("useful"), Type.Literal("partial"), Type.Literal("failed"), Type.Literal("cancelled")]),
	elapsedMs: Type.Optional(Type.Number({ minimum: 0 })),
	status: Type.Optional(Type.Integer({ minimum: 100, maximum: 599 })),
});
export type FetchAttempt = {
	backend: "local" | "direct" | "trawl" | "jina" | "firecrawl" | "browserbase-static" | "browserbase-rendered";
	outcome: "useful" | "partial" | "failed" | "cancelled";
	elapsedMs?: number;
	status?: number;
};
export type FetchReceipt = {
	backend: FetchAttempt["backend"];
	content: string;
	finalUrl: string | null;
	truncated: boolean;
	attempts: FetchAttempt[];
	quality?: string;
	format?: "markdown" | "json";
	data?: JsonData;
	dataOmittedReason?: "size-limit";
	session?: { id: string; released: boolean };
	cache?: { state?: "hit" | "miss"; cachedAt?: string };
};
export type LocalFetchResult = FetchReceipt & { backend: "local" | "jina" };
function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Project only acquisition facts, never arbitrary backend payload fields. */
export function fetchAttempts(value: unknown): FetchAttempt[] {
	if (!Array.isArray(value) || value.length > 3) throw new Error("Invalid fetch attempts");
	return value.map((value): FetchAttempt => {
		const attempt = record(value);
		if (!attempt || (attempt.backend !== "local" && attempt.backend !== "direct" && attempt.backend !== "trawl" && attempt.backend !== "jina" && attempt.backend !== "firecrawl" && attempt.backend !== "browserbase-static" && attempt.backend !== "browserbase-rendered")
			|| (attempt.outcome !== "useful" && attempt.outcome !== "partial" && attempt.outcome !== "failed" && attempt.outcome !== "cancelled")) throw new Error("Invalid fetch attempt");
		const elapsed = attempt.elapsedMs ?? attempt.elapsed_ms;
		const status = attempt.status ?? attempt.http_status;
		return {
			backend: attempt.backend, outcome: attempt.outcome,
			...(typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0 ? { elapsedMs: elapsed } : {}),
			...(typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
		};
	});
}

export function parseLocalFetch(stdout: string): LocalFetchResult {
	let value: unknown;
	try { value = JSON.parse(stdout); }
	catch { throw new Error("Local fetch returned an invalid JSON result"); }
	const result = record(value);
	if (!result || result.version !== 1 || (result.backend !== "local" && result.backend !== "jina")
		|| typeof result.content !== "string" || !result.content.trim() || result.content.length > 50_100
		|| typeof result.truncated !== "boolean" || (result.finalUrl !== null && typeof result.finalUrl !== "string")) throw new Error("Local fetch returned an invalid result");
	if (typeof result.finalUrl === "string") {
		let url: URL;
		try { url = new URL(result.finalUrl); } catch { throw new Error("Local fetch returned an invalid final URL"); }
		if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Local fetch returned an invalid final URL");
	}
	return {
		backend: result.backend, content: result.content, finalUrl: result.finalUrl,
		truncated: result.truncated, attempts: fetchAttempts(result.attempts),
	};
}
