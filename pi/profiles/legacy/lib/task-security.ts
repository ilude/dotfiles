const REDACTION = "[REDACTED]";

const SECRET_PATTERNS: RegExp[] = [
	/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
	/\bAKIA[0-9A-Z]{16}\b/g,
	/\b(?:ghp|github_pat|sk|xox[baprs])-?[A-Za-z0-9_-]{20,}\b/g,
	/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
	/\bauthorization\s*:\s*(?:bearer|basic)\s+[^\s,;]+/gi,
];

export function redactTaskText(value: string): string {
	let out = value;
	for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, REDACTION);
	return out;
}

export function sanitizeTaskValue<T>(value: T): T {
	if (typeof value === "string") return redactTaskText(value) as T;
	if (Array.isArray(value)) return value.map((v) => sanitizeTaskValue(v)) as T;
	if (value && typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value))
			result[key] = sanitizeTaskValue(entry);
		return result as T;
	}
	return value;
}
