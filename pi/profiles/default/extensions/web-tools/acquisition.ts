export type AcquisitionFailure = "transport" | "timeout" | "rate-limit" | "quota" | "credentials" | "unavailable" | "challenge" | "empty" | "invalid-response" | "invalid-request" | "unsupported" | "not-found" | "authentication";
export class AcquisitionError extends Error {
	readonly kind: AcquisitionFailure;
	readonly retryAfterMs: number | undefined;
	constructor(kind: AcquisitionFailure, message: string, retryAfterMs?: number) {
		super(message); this.kind = kind; this.retryAfterMs = retryAfterMs;
	}
	get eligible(): boolean { return !["invalid-request", "not-found", "authentication"].includes(this.kind); }
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
