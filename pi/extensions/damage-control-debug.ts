import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function isDamageControlDebugEnabled(): boolean {
	const value = process.env.PI_DAMAGE_CONTROL_DEBUG;
	return value === "1" || value?.toLowerCase() === "true";
}

export function redactSummary(value: string): string {
	return value
		.replace(/https?:\/\/[^\s@]+@/gi, "https://[redacted]@")
		.replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[redacted]")
		.replace(
			/(token|api[_-]?key|key|secret|password)=([^\s&]+)/gi,
			"$1=[redacted]",
		)
		.replace(
			/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
			"[redacted-key-material]",
		)
		.replace(/\.env\b/g, "[redacted-env-file]")
		.replace(/id_ed25519|id_rsa|\.pem|\.key/g, "[redacted-secret-path]")
		.slice(0, 200);
}

function redactValue(value: unknown): unknown {
	if (typeof value === "string") return redactSummary(value);
	if (Array.isArray(value)) return value.map(redactValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
				key,
				redactValue(entry),
			]),
		);
	}
	return value;
}

export function debugLog(
	event: string,
	data: Record<string, unknown> = {},
): void {
	if (!isDamageControlDebugEnabled()) return;
	try {
		const cwd =
			typeof process.cwd === "function" ? process.cwd() : os.homedir();
		const projectLog = path.join(cwd, ".pi", "damage-control-debug.log");
		const homeLog = path.join(
			os.homedir(),
			".pi",
			"agent",
			"damage-control-debug.log",
		);
		const line = `${JSON.stringify({
			ts: new Date().toISOString(),
			event,
			pid: process.pid,
			cwd,
			...(redactValue(data) as Record<string, unknown>),
		})}\n`;
		for (const logPath of new Set([projectLog, homeLog])) {
			try {
				fs.mkdirSync(path.dirname(logPath), { recursive: true });
				fs.appendFileSync(logPath, line, { encoding: "utf-8" });
			} catch {
				// Debug logging must never affect safety flow.
			}
		}
	} catch {
		// Debug logging must never affect safety flow.
	}
}

export function debugDecision(
	stage: string,
	toolName: string,
	rawAction: string,
	decision?: { block: true; reason: string },
	extra: Record<string, unknown> = {},
): void {
	debugLog(stage, {
		toolName,
		actionSummary: redactSummary(rawAction),
		decision: decision ? "block" : "allow",
		reason: decision?.reason,
		...extra,
	});
}

export default function damageControlDebugModule(): void {
	// No-op default keeps Pi top-level extension auto-discovery from failing.
}
