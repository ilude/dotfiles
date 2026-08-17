export function formatLocalClock(timestamp: number): string {
	const date = new Date(timestamp);
	return [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
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
