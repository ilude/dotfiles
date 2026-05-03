import type { MessageValidationResult } from "./types";

const TYPES = ["feat", "fix", "docs", "chore", "refactor", "test", "perf", "ci", "build"] as const;
const CONVENTIONAL_RE = new RegExp(`^(${TYPES.join("|")})(\\([^)]+\\))?: [a-z0-9].{0,71}$`);

export function validateCommitMessage(message: string): MessageValidationResult {
	const subject = message.split(/\r?\n/, 1)[0]?.trim() ?? "";
	if (!subject) return { valid: false, error: "Commit message subject is required." };
	if (!CONVENTIONAL_RE.test(subject)) {
		return {
			valid: false,
			error: `Subject must be conventional: ${TYPES.join("|")}(scope?): description`,
		};
	}
	return { valid: true };
}
