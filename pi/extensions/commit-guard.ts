/**
 * Commit Guard Extension
 *
 * Intercepts bash tool_call events and enforces safe git commit practices:
 *   - Blocks --no-verify (bypasses pre-commit hooks)
 *   - Blocks commits missing -m (no message)
 *   - Blocks commits with non-conventional commit message format
 *   - Allows --amend without -m (legitimate use case)
 */

import {
	type ExtensionAPI,
	type BashToolCallEvent,
} from "@mariozechner/pi-coding-agent";

const GIT_COMMIT_RE = /\bgit\s+commit\b/;
const CONVENTIONAL_COMMIT_RE = /^(feat|fix|docs|chore|refactor|test|perf|ci|build)(\(.+\))?: .+/;

type BlockResult = { block: true; reason: string } | undefined;

function checkNoVerify(command: string): BlockResult {
	if (!command.includes("--no-verify")) return undefined;
	return {
		block: true,
		reason: "Pre-commit hooks are a safety net — don't bypass with --no-verify",
	};
}

function checkMissingMessage(command: string): BlockResult {
	if (command.includes("-m")) return undefined;
	return {
		block: true,
		reason: "Commit message required. Use: git commit -m 'type(scope): description'",
	};
}

function checkMessageFormat(command: string): BlockResult {
	const msgMatch = command.match(/-m\s+["']([^"']+)["']/);
	if (!msgMatch) return undefined;
	const message = msgMatch[1];
	if (CONVENTIONAL_COMMIT_RE.test(message)) return undefined;
	return {
		block: true,
		reason:
			`Commit message "${message}" does not follow conventional format. ` +
			"Use: type(scope): description — where type is one of feat|fix|docs|chore|refactor|test|perf|ci|build",
	};
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event, _ctx) => {
		if (event.toolName !== "bash") return undefined;

		const bashEvent = event as BashToolCallEvent;
		const command = bashEvent.input.command ?? "";

		if (!GIT_COMMIT_RE.test(command)) return undefined;

		const noVerifyResult = checkNoVerify(command);
		if (noVerifyResult) return noVerifyResult;

		// --amend without -m is legitimate; skip the -m and format checks
		if (command.includes("--amend")) return undefined;

		const missingMsgResult = checkMissingMessage(command);
		if (missingMsgResult) return missingMsgResult;

		return checkMessageFormat(command);
	});
}
