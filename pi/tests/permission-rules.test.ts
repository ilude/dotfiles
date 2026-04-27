import { describe, expect, it } from "vitest";
import {
	findMatchingRule,
	matchesPermissionRule,
	parsePermissionRule,
	parsePermissionRules,
} from "../lib/permission-rules.js";

function expectRule(result: ReturnType<typeof parsePermissionRule>) {
	if ("message" in result) throw new Error(`expected rule, got error: ${result.message}`);
	return result;
}

describe("parsePermissionRule", () => {
	it("parses Tool(glob)", () => {
		const r = expectRule(parsePermissionRule("Bash(git *)"));
		expect(r.tool).toBe("Bash");
		expect(r.pattern).toBe("git *");
		expect(r.regex).toBeDefined();
	});

	it("parses Tool with no pattern", () => {
		const r = expectRule(parsePermissionRule("Bash"));
		expect(r.tool).toBe("Bash");
		expect(r.pattern).toBeUndefined();
		expect(r.regex).toBeUndefined();
	});

	it("rejects empty input", () => {
		const result = parsePermissionRule("");
		expect("message" in result).toBe(true);
	});

	it("rejects empty parens", () => {
		const result = parsePermissionRule("Bash()");
		expect("message" in result).toBe(true);
	});

	it("rejects malformed input", () => {
		expect("message" in parsePermissionRule("Bash(unclosed")).toBe(true);
		expect("message" in parsePermissionRule("123Tool")).toBe(true);
	});

	it("preserves source for error reporting", () => {
		const r = expectRule(parsePermissionRule("  Read(*.ts)  "));
		expect(r.source).toBe("Read(*.ts)");
	});
});

describe("parsePermissionRules (batch)", () => {
	it("partitions valid and invalid sources", () => {
		const result = parsePermissionRules([
			"Bash(git *)",
			"oops bad",
			"Read(*.ts)",
			"",
		]);
		expect(result.rules.length).toBe(2);
		expect(result.errors.length).toBe(2);
	});
});

describe("matchesPermissionRule -- Bash", () => {
	const rule = expectRule(parsePermissionRule("Bash(git *)"));

	it("matches `git status`", () => {
		expect(matchesPermissionRule(rule, "Bash", "git status")).toBe(true);
	});

	it("matches `git push --force`", () => {
		expect(matchesPermissionRule(rule, "Bash", "git push --force")).toBe(true);
	});

	it("does NOT match `sudo git status` (no anchor escape via prefix)", () => {
		expect(matchesPermissionRule(rule, "Bash", "sudo git status")).toBe(false);
	});

	it("does NOT match a different tool", () => {
		expect(matchesPermissionRule(rule, "Read", "git status")).toBe(false);
	});

	it("is case-insensitive on tool name", () => {
		expect(matchesPermissionRule(rule, "bash", "git status")).toBe(true);
		expect(matchesPermissionRule(rule, "BASH", "git status")).toBe(true);
	});
});

describe("matchesPermissionRule -- path tools", () => {
	it("matches *.ts", () => {
		const rule = expectRule(parsePermissionRule("Read(*.ts)"));
		expect(matchesPermissionRule(rule, "Read", "src/index.ts")).toBe(true);
		expect(matchesPermissionRule(rule, "Read", "lib/util.tsx")).toBe(false);
	});

	it("normalizes Windows backslashes", () => {
		const rule = expectRule(parsePermissionRule("Read(src/*.ts)"));
		expect(matchesPermissionRule(rule, "Read", "src\\index.ts")).toBe(true);
	});

	it("** matches multi-segment paths", () => {
		const rule = expectRule(parsePermissionRule("Write(.claude/**)"));
		expect(matchesPermissionRule(rule, "Write", ".claude/agents/foo.md")).toBe(true);
		expect(matchesPermissionRule(rule, "Write", ".claude/CLAUDE.md")).toBe(true);
		expect(matchesPermissionRule(rule, "Write", "src/index.ts")).toBe(false);
	});

	it("rule with no pattern matches anything for that tool", () => {
		const rule = expectRule(parsePermissionRule("Find"));
		expect(matchesPermissionRule(rule, "Find", "anything")).toBe(true);
		expect(matchesPermissionRule(rule, "Find")).toBe(true);
	});
});

describe("findMatchingRule", () => {
	it("returns the first matching rule by source order", () => {
		const { rules } = parsePermissionRules(["Bash(git *)", "Bash(npm *)"]);
		const m = findMatchingRule(rules, "Bash", "git status");
		expect(m?.pattern).toBe("git *");
	});

	it("returns undefined when no rule matches", () => {
		const { rules } = parsePermissionRules(["Bash(git *)"]);
		expect(findMatchingRule(rules, "Bash", "ls -la")).toBeUndefined();
	});
});

describe("backwards-compatibility with damage-control patterns", () => {
	it("damage-control glob patterns translate to Bash() rules", () => {
		// Existing damage-control entries are unstructured strings; the new
		// syntax wraps them in Tool(glob). The matcher result for command
		// substrings is now anchored, so existing rules tighten -- spot-check
		// a representative pattern from damage-control-rules.yaml.
		const rule = expectRule(parsePermissionRule("Bash(rm -rf *)"));
		expect(matchesPermissionRule(rule, "Bash", "rm -rf /")).toBe(true);
		expect(matchesPermissionRule(rule, "Bash", "rm -rf node_modules")).toBe(true);
		expect(matchesPermissionRule(rule, "Bash", "ls -la")).toBe(false);
	});
});
