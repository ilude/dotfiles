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

const rmForceAskRule: DangerousCommand = {
	pattern: "rm force",
	regex:
		"\\brm\\s+(?=[^|;&]*?(?:-[A-Za-z]*f[A-Za-z]*|--force)\\b)(?![^|;&]*?(?:-[A-Za-z]*r[A-Za-z]*|--recursive)\\b)",
	reason:
		"Force delete bypasses normal interactive safeguards and can remove files irreversibly",
	action: "ask",
	tools: ["bash"],
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

	it("allows read-only git inspection commands", async () => {
		await expect(
			analyzeCommandAst("git worktree list", [rmRule], astConfig),
		).resolves.toEqual({ decision: "allow" });
		await expect(
			analyzeCommandAst(
				"git status --short --branch && git rev-parse --short HEAD && git log -1 --oneline",
				[rmRule],
				astConfig,
			),
		).resolves.toEqual({ decision: "allow" });
	});

	it("allows piped bun stdin execution without an AST warning", async () => {
		await expect(
			evaluateDangerousCommand(
				"printf 'console.log(1)\\n' | bun run -",
				[rmRule],
				{
					toolName: "bash",
					astAnalysis: { ...astConfig, timeoutMs: 50 },
				},
			),
		).resolves.toBeUndefined();
		await expect(
			evaluateDangerousCommand(
				"printf 'console.log(1)\n' | bun run -",
				[rmRule],
				{
					toolName: "bash",
					astAnalysis: { ...astConfig, timeoutMs: 50 },
				},
			),
		).resolves.toBeUndefined();
	});

	it("asks before running bun stdin scripts with filesystem operations", async () => {
		await expect(
			evaluateDangerousCommand(
				'printf \'require("fs").rmSync("target")\' | bun run -',
				[rmRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toEqual({
			block: true,
			reason:
				'Confirmation required for dangerous command (matched "bun stdin script"): Bun stdin script contains filesystem or process operations - confirm command is safe',
		});
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

	it("allows proven mktemp file cleanup without asking on variable expansion", async () => {
		await expect(
			analyzeCommandAst(
				'tmpfile="$(mktemp)"\nsome_command > "$tmpfile"\nrm -f -- "$tmpfile"',
				[rmForceAskRule],
				astConfig,
			),
		).resolves.toEqual({ decision: "allow" });
	});

	it("skips the rm force ask rule for proven mktemp file cleanup", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpfile="$(mktemp)"; rm -f -- "$tmpfile"',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toBeUndefined();
	});

	it("skips the recursive force rule only for proven mktemp directory cleanup", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpdir="$(mktemp -d)"; rm -rf -- "$tmpdir"',
				[rmRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toBeUndefined();
	});

	it("allows mktemp template variants for proven file cleanup", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpfile="$(mktemp -t pi-output.XXXXXX)"; rm -f -- "$tmpfile"',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toBeUndefined();
		await expect(
			evaluateDangerousCommand(
				'tmpfile="$(mktemp /tmp/pi-output.XXXXXX)"; rm -f -- "$tmpfile"',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toBeUndefined();
	});

	it("allows proven temp cleanup inside an EXIT trap", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpfile="$(mktemp)"; trap \'rm -f -- "$tmpfile"\' EXIT',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toBeUndefined();
	});

	it("allows files derived under a proven mktemp directory", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpdir="$(mktemp -d)"; outfile="$tmpdir/output.txt"; rm -f -- "$outfile"; rm -rf -- "$tmpdir"',
				[rmForceAskRule, rmRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toBeUndefined();
		await expect(
			evaluateDangerousCommand(
				'tmpdir="$(mktemp -d)"; outfile="${tmpdir}/output.txt"; rm -f -- "$outfile"',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toBeUndefined();
	});

	it("keeps asking when temp cleanup mixes in an unproven target", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpfile="$(mktemp)"; rm -f -- "$tmpfile" ~/.ssh/id_rsa',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toMatchObject({ block: true });
	});

	it("keeps asking when a temp variable is reassigned before cleanup", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpfile="$(mktemp)"; tmpfile="$HOME/.ssh/id_rsa"; rm -f -- "$tmpfile"',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toMatchObject({ block: true });
	});

	it("keeps asking on fallback expansion cleanup targets", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpfile="$(mktemp)"; rm -f -- "${tmpfile:-/}"',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toMatchObject({ block: true });
	});

	it("keeps asking on unsafe temp-directory child paths", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpdir="$(mktemp -d)"; outfile="$tmpdir/../target"; rm -f -- "$outfile"',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toMatchObject({ block: true });
	});

	it("keeps asking when a trap cleanup mixes in an unproven target", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpfile="$(mktemp)"; trap \'rm -f -- "$tmpfile" ~/.ssh/id_rsa\' EXIT',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toMatchObject({ block: true });
	});

	it("keeps asking when a temp file is executed as a payload", async () => {
		await expect(
			evaluateDangerousCommand(
				'tmpfile="$(mktemp)"; bash "$tmpfile"; rm -f -- "$tmpfile"',
				[rmForceAskRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toMatchObject({ block: true });
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
			"bash -c 'rm -rf ./build'",
			[anchoredRmRule],
			{
				toolName: "bash",
				astAnalysis: { enabled: false },
			},
		);
		const withAst = await evaluateDangerousCommand(
			"bash -c 'rm -rf ./build'",
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

	it("allows read-only xargs shell snippets after inspecting the shell body", async () => {
		const xargsShellRule: DangerousCommand = {
			pattern: "xargs shell c",
			regex: "\\bxargs\\s+.*\\b(?:bash|sh|zsh|ksh|dash|csh|tcsh|fish)\\s+-c\\b",
			reason:
				"xargs with shell -c can execute arbitrary commands from dynamic input",
			tools: ["bash"],
		};

		await expect(
			evaluateDangerousCommand(
				'find deployment/env -maxdepth 3 -type f -print | sort | xargs -I{} sh -c \'echo --- {}; sed -n "1,90p" "{}"\'',
				[xargsShellRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toBeUndefined();
	});

	it("still blocks xargs shell snippets with destructive shell bodies", async () => {
		const xargsShellRule: DangerousCommand = {
			pattern: "xargs shell c",
			regex: "\\bxargs\\s+.*\\b(?:bash|sh|zsh|ksh|dash|csh|tcsh|fish)\\s+-c\\b",
			reason:
				"xargs with shell -c can execute arbitrary commands from dynamic input",
			tools: ["bash"],
		};

		await expect(
			evaluateDangerousCommand(
				"find . -type f -print | xargs -I{} sh -c 'rm -rf {}'",
				[xargsShellRule],
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toMatchObject({ block: true });
	});

	it("does not let the xargs read-only exception bypass other matching rules", async () => {
		const rules: DangerousCommand[] = [
			{
				pattern: "xargs shell c",
				regex:
					"\\bxargs\\s+.*\\b(?:bash|sh|zsh|ksh|dash|csh|tcsh|fish)\\s+-c\\b",
				reason:
					"xargs with shell -c can execute arbitrary commands from dynamic input",
				tools: ["bash"],
			},
			{
				pattern: "secret file read",
				regex: "\\bcat\\b[^|;&]*(?:\\.env\\b)",
				reason: "Reads secret-bearing files that must not be exposed",
				tools: ["bash"],
			},
		];

		await expect(
			evaluateDangerousCommand(
				"find . -type f -print | xargs -I{} sh -c 'cat .env'",
				rules,
				{ toolName: "bash", astAnalysis: astConfig },
			),
		).resolves.toMatchObject({ block: true });
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
