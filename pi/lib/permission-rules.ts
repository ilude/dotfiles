/**
 * Permission rules -- Claude Code-style pattern syntax.
 *
 * Owned by .specs/pi-platform-alignment/plan.md (Phase 1 T2). Provides a
 * parser and matcher for patterns like `Bash(git *)`, `Read(*.ts)`,
 * `Write(.claude/**)`. Used by damage-control today and by the (deferred)
 * config-driven hook engine in the future.
 *
 * Pattern grammar:
 *
 *   Tool(<glob>)
 *   Tool         (no glob -- matches the tool itself)
 *
 * - `Tool` is a tool name (Bash, Read, Write, Edit, Find, Ls, ...). Case-
 *   sensitive in the rule, but the matcher accepts the canonical lower-case
 *   form too.
 * - `<glob>` uses `*` (single segment, multi-char) and `**` (multi-segment)
 *   wildcards. Brace groups (`{a,b}`) are NOT supported in this MVP.
 * - For Bash, the glob matches the command string from the start. So
 *   `Bash(git *)` matches "git status" but not "sudo git status".
 * - For path tools (Read, Write, Edit, Find, Ls), the glob matches the
 *   target path with POSIX-style separators (the matcher normalizes
 *   backslashes).
 *
 * Anti-patterns and unsupported forms degrade to a parse error rather than
 * silently matching nothing.
 */

export interface PermissionRule {
	tool: string;
	pattern?: string;
	regex?: RegExp;
	source: string;
}

export type PermissionRuleParseError = {
	source: string;
	message: string;
};

export interface ParsedPermissionRules {
	rules: PermissionRule[];
	errors: PermissionRuleParseError[];
}

const RULE_PATTERN = /^\s*([A-Za-z][A-Za-z0-9_-]*)(?:\(([^)]*)\))?\s*$/;

/**
 * Compile a glob to a RegExp. `*` matches any non-newline char run (including
 * none), `**` matches the same plus path separators -- in practice both
 * collapse to `.*` at the regex level since we always anchor.
 */
function globToRegex(glob: string): RegExp {
	let out = "^";
	for (let i = 0; i < glob.length; i++) {
		const ch = glob[i];
		if (ch === "*") {
			// `**` is treated identically to `*` here -- the matcher already
			// normalizes path separators, and we anchor at the start so a
			// single `*` consumes everything to end-of-string.
			if (glob[i + 1] === "*") i++;
			out += ".*";
			continue;
		}
		if (ch === "?") {
			out += ".";
			continue;
		}
		// Escape regex metachars
		if (/[.+^$()|[\]\\{}]/.test(ch)) {
			out += `\\${ch}`;
			continue;
		}
		out += ch;
	}
	out += "$";
	return new RegExp(out);
}

export function parsePermissionRule(source: string): PermissionRule | PermissionRuleParseError {
	const trimmed = source.trim();
	if (!trimmed) return { source, message: "empty rule" };
	const match = trimmed.match(RULE_PATTERN);
	if (!match) {
		return { source, message: `cannot parse rule (expected Tool or Tool(glob), got "${trimmed}")` };
	}
	const tool = match[1];
	const inner = match[2];
	const rule: PermissionRule = { tool, source: trimmed };
	if (inner !== undefined) {
		const pattern = inner.trim();
		if (!pattern) return { source, message: "empty pattern in parentheses" };
		rule.pattern = pattern;
		try {
			rule.regex = globToRegex(pattern);
		} catch (err) {
			return { source, message: `glob compile failed: ${err instanceof Error ? err.message : String(err)}` };
		}
	}
	return rule;
}

export function parsePermissionRules(sources: readonly string[]): ParsedPermissionRules {
	const rules: PermissionRule[] = [];
	const errors: PermissionRuleParseError[] = [];
	for (const src of sources) {
		const result = parsePermissionRule(src);
		if ("message" in result) errors.push(result);
		else rules.push(result);
	}
	return { rules, errors };
}

/**
 * Test whether a candidate action matches a rule.
 *
 * `tool` is the tool name (case-insensitive). `target` is the action body --
 * for Bash this is the command string, for path tools it is the resolved
 * path. The path matcher normalizes backslashes to forward slashes.
 */
export function matchesPermissionRule(
	rule: PermissionRule,
	tool: string,
	target?: string,
): boolean {
	if (rule.tool.toLowerCase() !== tool.toLowerCase()) return false;
	if (!rule.pattern) return true;
	const normalized = (target ?? "").replace(/\\/g, "/");
	return Boolean(rule.regex?.test(normalized));
}

/**
 * Find the first matching rule. Returns undefined if none match. Useful for
 * permission resolvers that want allow/deny precedence based on rule order.
 */
export function findMatchingRule(
	rules: readonly PermissionRule[],
	tool: string,
	target?: string,
): PermissionRule | undefined {
	for (const rule of rules) {
		if (matchesPermissionRule(rule, tool, target)) return rule;
	}
	return undefined;
}
