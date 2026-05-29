import { describe, expect, it, vi } from "vitest";
import { analyzeCommandAst } from "../extensions/damage-control/ast-analyzer.ts";
import {
	evaluateDangerousCommand,
	parseDamageControlRules,
} from "../extensions/damage-control.ts";
import type {
	AstAnalysisConfig,
	DangerousCommand,
} from "../extensions/damage-control-rules.ts";

const astConfig: AstAnalysisConfig = {
	enabled: true,
	timeoutMs: 500,
	safeCommands: ["echo"],
	dangerousCommands: ["rm", "mv", "chmod"],
};

const rmRule: DangerousCommand = {
	pattern: "rm recursive force",
	regex: "\\brm\\s+.*-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*",
	reason: "Recursive force delete can cause irreversible data loss",
	tools: ["bash"],
};

const anchoredRmRule: DangerousCommand = {
	...rmRule,
	regex: "^rm\\s+-rf\\s+",
};

describe("damage-control AST analyzer", () => {
	it("parses AST configuration from Pi rules", () => {
		const rules = parseDamageControlRules(`
astAnalysis:
  enabled: true
  timeoutMs: 50
  safeCommands:
    - echo
  dangerousCommands:
    - rm
dangerous_commands: []
zero_access_paths: []
no_delete_paths: []
`);

		expect(rules.astAnalysis).toEqual({
			enabled: true,
			timeoutMs: 50,
			safeCommands: ["echo"],
			dangerousCommands: ["rm"],
		});
	});

	it("allows disabled AST analysis", async () => {
		await expect(
			analyzeCommandAst("bash -c 'rm -rf /tmp/x'", [rmRule], {
				enabled: false,
			}),
		).resolves.toEqual({ decision: "allow" });
	});

	it("uses a safe-command fast path", async () => {
		await expect(
			analyzeCommandAst("echo rm -rf /tmp/x", [rmRule], astConfig),
		).resolves.toEqual({ decision: "allow" });
	});

	it("blocks a destructive command hidden behind bash -c", async () => {
		const result = await analyzeCommandAst(
			"bash -c 'rm -rf /tmp/x'",
			[rmRule],
			astConfig,
		);

		expect(result).toEqual({
			decision: "block",
			reason: "Recursive force delete can cause irreversible data loss",
		});
	});

	it("blocks destructive commands in subshells and pipelines", async () => {
		await expect(
			analyzeCommandAst("(rm -rf /tmp/x)", [rmRule], astConfig),
		).resolves.toMatchObject({ decision: "block" });
		await expect(
			analyzeCommandAst("echo ok | rm -rf /tmp/x", [rmRule], astConfig),
		).resolves.toMatchObject({ decision: "block" });
	});

	it("recurses into literal eval", async () => {
		await expect(
			analyzeCommandAst("eval 'rm -rf /tmp/x'", [rmRule], astConfig),
		).resolves.toMatchObject({ decision: "block" });
	});

	it("asks on dynamic eval and source", async () => {
		await expect(
			analyzeCommandAst("eval $CMD", [rmRule], astConfig),
		).resolves.toMatchObject({ decision: "ask" });
		await expect(
			analyzeCommandAst("source $SCRIPT", [rmRule], astConfig),
		).resolves.toMatchObject({ decision: "ask" });
	});

	it("asks on unsafe variable expansion in configured dangerous commands", async () => {
		const result = await analyzeCommandAst("rm $TARGET", [rmRule], astConfig);

		expect(result).toEqual({
			decision: "ask",
			reason: "Variable expansion in rm arguments: $TARGET",
		});
	});

	it("allows safe variable expansion in configured dangerous commands", async () => {
		await expect(
			analyzeCommandAst("rm $HOME/file.txt", [rmRule], astConfig),
		).resolves.toEqual({ decision: "allow" });
	});

	it("is veto-only and never downgrades an existing regex block", async () => {
		const result = await evaluateDangerousCommand("rm -rf /tmp/x", [rmRule], {
			toolName: "bash",
			astAnalysis: astConfig,
		});

		expect(result).toEqual({
			block: true,
			reason:
				'Blocked dangerous command (matched "rm recursive force"): Recursive force delete can cause irreversible data loss',
		});
	});

	it("integrates as a second pass for nested shell content missed by regex-only matching", async () => {
		const regexOnly = await evaluateDangerousCommand(
			"bash -c 'rm -rf /tmp/x'",
			[anchoredRmRule],
			{
				toolName: "bash",
				astAnalysis: { enabled: false },
			},
		);
		const withAst = await evaluateDangerousCommand(
			"bash -c 'rm -rf /tmp/x'",
			[anchoredRmRule],
			{
				toolName: "bash",
				astAnalysis: astConfig,
			},
		);

		expect(regexOnly).toBeUndefined();
		expect(withAst).toEqual({
			block: true,
			reason:
				'Blocked dangerous command (matched "AST analysis"): Recursive force delete can cause irreversible data loss',
		});
	});

	it("integrates ask semantics through confirmation", async () => {
		const confirm = vi.fn(async () => false);
		const result = await evaluateDangerousCommand("eval $CMD", [rmRule], {
			toolName: "bash",
			astAnalysis: astConfig,
			hasUI: true,
			ui: { confirm },
		});

		expect(confirm).toHaveBeenCalledWith(
			"Confirm dangerous command",
			"eval with dynamic argument $CMD - value unknown at analysis time",
		);
		expect(result).toEqual({
			block: true,
			reason:
				'Confirmation required for dangerous command (matched "AST analysis"): eval with dynamic argument $CMD - value unknown at analysis time',
		});
	});
});
