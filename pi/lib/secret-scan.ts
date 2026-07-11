export const SECRET_REDACTION = "[REDACTED]";

export type SecretKind =
	| "aws-access-key"
	| "bearer-token"
	| "github-token"
	| "openai-token"
	| "private-key"
	| "secret-assignment";

export interface SecretFinding {
	kind: SecretKind;
	line: number;
	column: number;
	offset: number;
	length: number;
	redacted: string;
}

interface SecretPattern {
	kind: SecretKind;
	pattern: RegExp;
}

const TOKEN_BOUNDARY_LEFT = "(?<![A-Za-z0-9_-])";
const TOKEN_BOUNDARY_RIGHT = "(?![A-Za-z0-9_-])";

const SECRET_PATTERNS: readonly SecretPattern[] = [
	{
		kind: "aws-access-key",
		pattern: new RegExp(
			`${TOKEN_BOUNDARY_LEFT}AKIA[A-Z0-9]{16}${TOKEN_BOUNDARY_RIGHT}`,
			"g",
		),
	},
	{
		kind: "github-token",
		pattern: new RegExp(
			`${TOKEN_BOUNDARY_LEFT}(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})${TOKEN_BOUNDARY_RIGHT}`,
			"g",
		),
	},
	{
		kind: "openai-token",
		pattern: new RegExp(
			`${TOKEN_BOUNDARY_LEFT}sk-[A-Za-z0-9_-]{10,}${TOKEN_BOUNDARY_RIGHT}`,
			"g",
		),
	},
	{
		kind: "bearer-token",
		pattern:
			/(?<![A-Za-z0-9_-])Bearer\s+[A-Za-z0-9._~+/-]{10,}(?![A-Za-z0-9_-])/gi,
	},
	{
		kind: "secret-assignment",
		pattern:
			/(?<![A-Za-z0-9_-])api[_-]?key(?![A-Za-z0-9_-])\s*["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{6,}/gi,
	},
	{
		kind: "private-key",
		pattern:
			/(?<![A-Za-z0-9_-])-----BEGIN(?: (?:[A-Z0-9]+ )*PRIVATE KEY| [A-Z]+)?-----/g,
	},
];

function location(
	text: string,
	index: number,
): Pick<SecretFinding, "line" | "column"> {
	const before = text.slice(0, index);
	const lines = before.split("\n");
	return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

export function scanSecrets(text: string): SecretFinding[] {
	const findings: Array<SecretFinding & { index: number }> = [];
	for (const { kind, pattern } of SECRET_PATTERNS) {
		pattern.lastIndex = 0;
		for (const match of text.matchAll(pattern)) {
			const index = match.index;
			findings.push({
				kind,
				...location(text, index),
				offset: index,
				length: match[0].length,
				redacted: SECRET_REDACTION,
				index,
			});
		}
	}
	return findings
		.sort(
			(left, right) =>
				left.index - right.index || left.kind.localeCompare(right.kind),
		)
		.map(({ index: _index, ...finding }) => finding);
}
