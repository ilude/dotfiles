import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { onSessionStart } from "../lib/session-start-metrics.js";

export const SESSION_TIME_MESSAGE_TYPE = "session-time";

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

export function formatSessionTime(date: Date): string {
	const offsetMinutes = -date.getTimezoneOffset();
	const offsetSign = offsetMinutes >= 0 ? "+" : "-";
	const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
	const offsetRemainder = Math.abs(offsetMinutes) % 60;
	const local = [
		date.getFullYear(),
		"-",
		pad(date.getMonth() + 1),
		"-",
		pad(date.getDate()),
		"T",
		pad(date.getHours()),
		":",
		pad(date.getMinutes()),
		":",
		pad(date.getSeconds()),
		offsetSign,
		pad(offsetHours),
		":",
		pad(offsetRemainder),
	].join("");
	return `Current datetime: ${local}.`;
}

function hasSessionTime(entries: readonly SessionEntry[]): boolean {
	return entries.some(
		(entry) =>
			entry.type === "custom_message" &&
			entry.customType === SESSION_TIME_MESSAGE_TYPE,
	);
}

export default function registerSessionTime(pi: ExtensionAPI): void {
	onSessionStart(pi, import.meta.url, (_event, ctx) => {
		if (hasSessionTime(ctx.sessionManager.getEntries())) return;
		pi.sendMessage(
			{
				customType: SESSION_TIME_MESSAGE_TYPE,
				content: formatSessionTime(new Date()),
				display: false,
			},
			{ triggerTurn: false },
		);
	});
}
