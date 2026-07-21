import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	evaluateDangerousCommand,
	evaluateScopedDelete,
} from "../extensions/damage-control-engine.ts";
import {
	loadRules,
	type DangerousCommand,
} from "../extensions/damage-control-rules.ts";

const cwd = process.cwd();
const scopedRules = { no_delete_paths: ["package.json"] };
const rmRule: DangerousCommand = {
	pattern: "(?<!git\\s)(?<!docker\\s)\\brm\\s+(-[^\\s]*)*-[rRf]",
	regex: "(?<!git\\s)(?<!docker\\s)\\brm\\s+(-[^\\s]*)*-[rRf]",
	reason: "rm with recursive or force flags",
	action: "ask",
	tools: ["bash"],
};

function evaluate(command: string) {
	return evaluateScopedDelete(command, cwd, scopedRules);
}

describe("scoped delete", () => {
	it.each([
		["allows a relative target", "rm -rf build", "allow"],
		["asks for parent traversal", "rm -rf ../build", "ask"],
		["asks for home expansion", "rm -rf ~/build", "ask"],
		[
			"asks for a non-scratch absolute target",
			"rm -rf /var/cache/build",
			"ask",
		],
		["allows a /tmp target", "rm -rf /tmp/pi-scratch", "allow"],
		["asks for a drive-letter target", "rm -rf C:/temp/build", "ask"],
		["allows a relative glob", "rm -rf build/*", "allow"],
		["asks for the cwd", "rm -rf .", "ask"],
		["asks for .git", "rm -rf .git", "ask"],
		["asks for .pi", "rm -rf .pi", "ask"],
		["asks for a no-delete path", "rm -rf package.json", "ask"],
		["asks for an unparseable delete", "rm -rf", "ask"],
		["asks for brace expansion", ["rm", "-rf", "{build,cache}"].join(" "), "ask"],
		["asks for concatenated shell words", ["rm", "-rf", "''/etc"].join(" "), "ask"],
		["asks for escaped shell words", ["rm", "-rf", "\\./build"].join(" "), "ask"],
		["asks for unsupported shell syntax", ["rm", "-rf", "$(printf build)"].join(" "), "ask"],
		["asks for unmodelled syntax outside the delete", ["rm", "-rf", "build", "&&", "printf", "done"].join(" "), "ask"],
		["asks for an ssh payload", "ssh host 'rm -rf build'", "ask"],
		[
			"allows a docker payload",
			"docker run image sh -c 'rm -rf build'",
			"allow",
		],
		[
			"asks for mixed contained and external targets",
			"rm -rf build /var/cache/build",
			"ask",
		],
		[
			"asks when a later compound rm segment escapes the workspace",
			"rm -rf build && rm -rf ../outside",
			"ask",
		],
		["asks for an unquoted ssh payload delete", "ssh host rm -rf build", "ask"],
		[
			"asks for an unquoted scp payload delete",
			"scp local host:rm -rf build",
			"ask",
		],
	] as const)("%s", (_name, command, expected) => {
		expect(evaluate(command)).toBe(expected);
	});

	it("asks when an existing target prefix is a symlink", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-scoped-delete-"));
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), "pi-scoped-outside-"));
		try {
			fs.symlinkSync(outside, path.join(root, "link"), "junction");
			expect(evaluateScopedDelete("rm -rf link/*", root, scopedRules)).toBe(
				"ask",
			);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	it.each([
		"rm -rf build",
		"rm -r build",
		"rm build",
		"rm --recursive build",
		"rm --force build",
	])("auto-allows each native scoped-delete ask form: %s", async (command) => {
			const rules = loadRules().rules.dangerous_commands;
			const onAutoAllowed = vi.fn();

			await expect(
				evaluateDangerousCommand(command, rules, {
					toolName: "bash",
					cwd,
					noDeletePaths: [],
					onAutoAllowed,
				}),
			).resolves.toBeUndefined();
			expect(onAutoAllowed).toHaveBeenCalledOnce();
		},
	);

	it("allows a scoped delete only for an explicit delete rule", async () => {
		const onAutoAllowed = vi.fn();
		await expect(
			evaluateDangerousCommand("rm -rf build", [rmRule], {
				toolName: "bash",
				cwd,
				noDeletePaths: scopedRules.no_delete_paths,
				onAutoAllowed,
			}),
		).resolves.toBeUndefined();
		expect(onAutoAllowed).toHaveBeenCalledWith({
			rule: rmRule.pattern,
			reason: rmRule.reason,
		});
	});

	it("keeps a docker payload interactive when another rule matches", async () => {
		const result = await evaluateDangerousCommand(
			"docker run image sh -c 'rm -rf build && cat .env'",
			[
				rmRule,
				{
					pattern: "env file",
					regex: "\\.env\\b",
					reason: "secret file",
					action: "ask",
					tools: ["bash"],
				},
			],
			{ toolName: "bash", cwd },
		);
		expect(result?.block).toBe(true);
	});
});
