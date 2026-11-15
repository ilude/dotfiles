export type AcquisitionFailure = "transport" | "timeout" | "rate-limit" | "quota" | "credentials" | "unavailable" | "challenge" | "empty" | "invalid-response" | "invalid-request" | "unsupported" | "not-found" | "authentication";
export class AcquisitionError extends Error {
	readonly kind: AcquisitionFailure;
	readonly retryAfterMs: number | undefined;
	constructor(kind: AcquisitionFailure, message: string, retryAfterMs?: number) {
		super(message); this.kind = kind; this.retryAfterMs = retryAfterMs;
	}
	get eligible(): boolean { return !["invalid-request", "not-found", "authentication"].includes(this.kind); }
}

/** Small in-memory retry state for the concrete allowance meters used by clients. */
export class AllowanceBackoff<Scope extends string> {
	private readonly blocked = new Map<Scope, { key: string; until: number; error: AcquisitionError }>();
	check(scope: Scope, key: string): void {
		const state = this.blocked.get(scope);
		if (state?.key === key && state.until > Date.now()) throw state.error;
	}
	note(scope: Scope, key: string, error: AcquisitionError): void {
		if (["quota", "rate-limit", "unsupported"].includes(error.kind)) this.blocked.set(scope, { key, until: Date.now() + (error.retryAfterMs ?? 30_000), error });
	}
}

export function retryAfterMilliseconds(response: Response): number | undefined {
	const value = response.headers?.get("retry-after");
	if (!value) return undefined;
	const seconds = Number(value);
	const ms = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Date.parse(value) - Date.now();
	return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

export async function readJsonResponse(response: Response, signal: AbortSignal, provider: string): Promise<unknown> {
	const reader = response.body?.getReader();
	if (!reader) throw new AcquisitionError("invalid-response", `${provider} returned an empty response`);
	let bytes = 0;
	const chunks: Uint8Array[] = [];
	try {
		while (true) {
			const next = await withinSignal(reader.read(), signal);
			if (next.done) break;
			bytes += next.value.byteLength;
			if (bytes > 2 * 1024 * 1024) throw new AcquisitionError("invalid-response", `${provider} response exceeded the acquisition byte limit`);
			chunks.push(next.value);
		}
		try { return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")); }
		catch { throw new AcquisitionError("invalid-response", `${provider} returned invalid JSON`); }
	} finally {
		void reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

/** Acquisition deadlines exclude subsequent screening and user approval. */
export function acquisitionBudget(milliseconds: number, parent?: AbortSignal) {
	const deadline = performance.now() + milliseconds;
	const signal = AbortSignal.any([...(parent ? [parent] : []), AbortSignal.timeout(milliseconds)]);
	const remaining = () => Math.max(1, Math.floor(deadline - performance.now()));
	return {
		signal, remaining,
		attempt: (milliseconds: number) => AbortSignal.any([signal, AbortSignal.timeout(Math.min(milliseconds, remaining()))]),
	};
}

export async function withinSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	let cancel: () => void = () => {};
	const aborted = new Promise<never>((_, reject) => { cancel = () => reject(signal.reason); signal.addEventListener("abort", cancel, { once: true }); });
	const pending = Promise.race([work, aborted]);
	if (signal.aborted) cancel();
	try { return await pending; } finally { signal.removeEventListener("abort", cancel); }
}
