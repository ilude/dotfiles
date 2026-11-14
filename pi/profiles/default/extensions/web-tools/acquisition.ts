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
