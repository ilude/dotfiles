export function formatLocalClock(timestamp: number): string {
	const date = new Date(timestamp);
	return [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

export function formatTranscriptTiming(
	startedAt: number | undefined,
	durationMs: number | undefined,
): string | undefined {
	if (startedAt === undefined) return undefined;

	const started = `started ${formatLocalClock(startedAt)} local`;
	if (durationMs === undefined) return started;

	const seconds = Math.max(0, Math.round(durationMs / 1000));
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	const duration = minutes > 0 ? `${minutes}m${String(remainder).padStart(2, "0")}s` : `${remainder}s`;
	return `${started} | duration ${duration}`;
}

export function formatToolTiming(
	startedAt: number | undefined,
	timeoutSeconds: number | undefined,
): string | undefined {
	if (startedAt === undefined) return undefined;

	const started = `started ${formatLocalClock(startedAt)} local`;
	if (timeoutSeconds === undefined) return started;

	const timeoutAt = formatLocalClock(startedAt + timeoutSeconds * 1000);
	return `${started}, timeout ${timeoutSeconds}s at ${timeoutAt} local`;
}
