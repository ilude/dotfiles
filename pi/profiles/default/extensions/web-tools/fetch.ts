import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AcquisitionError, acquisitionBudget, withinSignal, type AcquisitionFailure } from "./acquisition.ts";
import { GatewayCircuit } from "./circuit.ts";
import { gatewayCredentials } from "./credentials.ts";
import { GatewayError, gatewayText, requestGateway } from "./gateway.ts";
import { classifyUrl } from "./destinations.js";
import { fetchAttempts, parseLocalFetch, type FetchReceipt, type FetchAttempt } from "./fetch-result.ts";
import { fetchFirecrawl } from "./firecrawl.ts";
import { fetchBrowserbase } from "./browserbase.ts";
import { renderBrowserbase } from "./browserbase-render.ts";
import { prepareExtraction } from "./structured.ts";
export type FetchSelection = "auto" | "direct" | "trawl" | "jina" | "firecrawl" | "browserbase-static" | "browserbase-rendered";
type Exec = Parameters<typeof gatewayCredentials>[0];
type Request = { url: string; maxChars: number; backend?: FetchSelection; render?: boolean; format?: "markdown" | "json"; schema?: Record<string, unknown> };
const directory = dirname(fileURLToPath(import.meta.url));
function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function failureKind(value: unknown): value is AcquisitionFailure { return typeof value === "string" && ["transport", "timeout", "rate-limit", "quota", "credentials", "unavailable", "challenge", "empty", "invalid-response", "invalid-request", "unsupported", "not-found", "authentication"].includes(value); }
function localFailure(stderr: string, killed: boolean): { error: AcquisitionError; attempts: FetchAttempt[] } {
	try {
		const data = record(JSON.parse(stderr)), error = record(data?.error);
		if (error && failureKind(error.kind) && typeof error.message === "string") return { error: new AcquisitionError(error.kind, error.message), attempts: fetchAttempts(data?.attempts) };
	} catch { /* A process/loader failure has no trusted acquisition receipt. */ }
	return { error: new AcquisitionError(killed ? "timeout" : "unavailable", killed ? "Web fetch timed out" : "Local acquisition failed"), attempts: [] };
}

/** Acquisition only. Screening/approval happens after this returns, never inside fallback. */
export function createFetch(exec: Exec) {
	const circuit = new GatewayCircuit();
	return async (input: Request, parent?: AbortSignal): Promise<FetchReceipt & { recovery?: string }> => {
		const budget = acquisitionBudget(60_000, parent), backend = input.backend ?? "auto";
		const destination = await withinSignal(classifyUrl(input.url), budget.signal);
		budget.signal.throwIfAborted();
		if (input.render && ["direct", "browserbase-static"].includes(backend)) throw new AcquisitionError("unsupported", "Selected backend does not render JavaScript");
		if (destination.privateOrLocal && (input.render || !["auto", "direct"].includes(backend))) throw new AcquisitionError("invalid-request", "Remote backends are disabled for local/private URLs");
		const extraction = prepareExtraction(input.format, input.schema, input.maxChars);
		if (extraction) {
			if (destination.privateOrLocal) throw new AcquisitionError("invalid-request", "Remote extraction is disabled for local/private URLs");
			if (backend !== "auto" && backend !== "firecrawl") throw new AcquisitionError("unsupported", "Selected backend does not support schema extraction");
			return fetchFirecrawl(input.url, input.maxChars, budget, extraction);
		}
		if (backend === "firecrawl") return fetchFirecrawl(input.url, input.maxChars, budget);
		if (backend === "browserbase-static") return fetchBrowserbase(input.url, input.maxChars, budget);
		if (backend === "browserbase-rendered") return renderBrowserbase(input.url, input.maxChars, budget);
		const reasons: string[] = [], attempts: FetchAttempt[] = [];
		const attach = (receipt: FetchReceipt) => ({ ...receipt, attempts: [...attempts, ...receipt.attempts], ...(reasons.length ? { recovery: reasons.join("; ") } : {}) });
		if (!destination.privateOrLocal) {
			let credentials;
			try { credentials = await withinSignal(gatewayCredentials(exec, budget.signal), budget.signal); }
			catch { budget.signal.throwIfAborted(); if (backend === "trawl" || backend === "jina") throw new AcquisitionError("credentials", "Gateway credential unavailable"); reasons.push("credential-unavailable"); }
			if (credentials) {
				circuit.configure(credentials.endpoint, credentials.token);
				if (backend !== "auto" || circuit.acquire()) {
					try {
						const selected = input.render ? "trawl" : backend;
						const reply = await requestGateway(credentials.endpoint, credentials.token, { url: input.url, max_chars: input.maxChars, backend: selected }, budget.signal);
						circuit.reachable();
						if (reply.backend !== "direct" && reply.backend !== "trawl" && reply.backend !== "jina") throw new AcquisitionError("invalid-response", "Gateway returned an unsupported backend");
						if (selected !== "auto" && reply.backend !== selected) throw new AcquisitionError("invalid-response", "Gateway substituted the requested backend");
						return attach({ backend: reply.backend, content: gatewayText(reply), finalUrl: reply.final_url, quality: reply.quality, truncated: reply.truncated ?? false, attempts: fetchAttempts(reply.attempts) });
					} catch (cause) {
						if (parent?.aborted) { circuit.cancelled(); parent.throwIfAborted(); }
						budget.signal.throwIfAborted();
						if (!(cause instanceof GatewayError)) throw cause;
						if (cause.kind === "availability") circuit.unavailable(); else circuit.reachable();
						if (backend !== "auto") throw cause;
						if (cause.failure) { const error = new AcquisitionError(cause.failure, cause.message); if (!error.eligible) throw error; }
						else if (cause.kind !== "availability") throw cause;
						reasons.push("gateway-unavailable");
					}
				} else reasons.push("circuit-open");
			}
		}
		budget.signal.throwIfAborted();
		const localBackend = input.render ? "jina" : backend;
		const local = await withinSignal(exec(process.execPath, [join(directory, "fetch.js"), input.url, "--json", "--max-chars", String(input.maxChars), "--backend", localBackend, "--budget-ms", String(Math.max(1, budget.remaining() - 250))], { timeout: budget.remaining(), signal: parent }), budget.signal);
		parent?.throwIfAborted(); budget.signal.throwIfAborted();
		let failed: { error: AcquisitionError; attempts: FetchAttempt[] };
		if (!local.killed && local.code === 0) {
			try { return attach(parseLocalFetch(local.stdout)); }
			catch (error) { failed = { error: new AcquisitionError("invalid-response", error instanceof Error ? error.message : "Invalid local acquisition result"), attempts: [] }; }
		} else failed = localFailure(local.stderr, local.killed);
		attempts.push(...failed.attempts);
		if (backend !== "auto" || destination.privateOrLocal || !failed.error.eligible) throw failed.error;
		reasons.push(failed.error.message);
		const providers: Array<{ backend: FetchReceipt["backend"]; acquire: () => Promise<FetchReceipt> }> = [];
		// Static HTTP is suitable before a new dynamic scrape, without assuming
		// the accounts have interchangeable quotas or dollar costs.
		if (!input.render) providers.push({ backend: "browserbase-static", acquire: () => fetchBrowserbase(input.url, input.maxChars, budget) });
		providers.push({ backend: "firecrawl", acquire: () => fetchFirecrawl(input.url, input.maxChars, budget) });
		providers.push({ backend: "browserbase-rendered", acquire: () => renderBrowserbase(input.url, input.maxChars, budget) });
		for (const provider of providers) {
			budget.signal.throwIfAborted(); const started = performance.now();
			try { return attach(await provider.acquire()); }
			catch (cause) {
				budget.signal.throwIfAborted();
				if (!(cause instanceof AcquisitionError) || !cause.eligible) throw cause;
				attempts.push({ backend: provider.backend, outcome: "failed", elapsedMs: Math.round(performance.now() - started) });
				reasons.push(`${provider.backend}:${cause.kind}`);
			}
		}
		throw new AcquisitionError("unavailable", `No fetch acquisition available: ${reasons.join("; ")}`);
	};
}
