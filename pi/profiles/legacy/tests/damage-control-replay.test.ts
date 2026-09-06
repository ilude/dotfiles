import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const piRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const replayScript = path.join(piRoot, "scripts", "damage-control-replay.mjs");
const loader = path.join(piRoot, "scripts", "ts-strip-loader.mjs");
const loaderUrl = new URL(`file:///${loader.replaceAll("\\", "/")}`).href;
const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

describe("damage-control replay script", () => {
	it("replays synthetic interactive rm events through scoped-delete decisions", () => {
		const directory = fs.mkdtempSync(
			path.join(os.tmpdir(), "pi-damage-control-replay-"),
		);
		temporaryDirectories.push(directory);
		const eventsPath = path.join(directory, "events.jsonl");
		const policyPath = path.join(directory, "patterns.yaml");
		const cwd = process.cwd();
		fs.writeFileSync(
			policyPath,
			[
				"dangerous_commands:",
				"  - pattern: '(?<!git\\s)(?<!docker\\s)\\brm\\s+(-[^\\s]*)*-[rRf]'",
				"    regex: '(?<!git\\s)(?<!docker\\s)\\brm\\s+(-[^\\s]*)*-[rRf]'",
				"    reason: rm with recursive or force flags",
				"    action: ask",
				"    tools: [bash]",
				"zero_access_paths: []",
				"no_delete_paths: [dist]",
			].join("\n"),
			"utf-8",
		);
		fs.writeFileSync(
			eventsPath,
			[
				{
					schemaVersion: 1,
					id: "prompt-shown",
					decisionType: "prompt_shown",
					toolName: "bash",
					hasUI: true,
					redactedAction: "rm -rf build",
					redactedActionTruncated: false,
					redactedActionLossy: false,
					cwd,
				},
				{
					schemaVersion: 1,
					id: "approved-in-cwd",
					decisionType: "ask_approved",
					toolName: "bash",
					hasUI: true,
					redactedAction: "rm -rf build",
					redactedActionTruncated: false,
					redactedActionLossy: false,
					cwd,
				},
				{
					schemaVersion: 1,
					id: "legacy-complete-looking",
					decisionType: "ask_approved",
					toolName: "bash",
					hasUI: true,
					redactedAction: "rm -rf build",
					cwd,
				},
				{
					schemaVersion: 1,
					id: "denied-in-cwd",
					decisionType: "ask_denied",
					toolName: "bash",
					hasUI: true,
					redactedAction: "rm -rf dist",
					redactedActionTruncated: false,
					redactedActionLossy: false,
					cwd,
				},
				{
					schemaVersion: 1,
					id: "denied-protected",
					decisionType: "ask_denied",
					toolName: "bash",
					hasUI: true,
					redactedAction: "rm -rf .pi",
					redactedActionTruncated: false,
					redactedActionLossy: false,
					cwd,
				},
				{
					schemaVersion: 1,
					id: "redacted",
					decisionType: "ask_approved",
					toolName: "bash",
					hasUI: true,
					redactedAction: "rm -rf [redacted-secret-path]",
					cwd,
				},
				{
					schemaVersion: 1,
					id: "truncated",
					decisionType: "ask_approved",
					toolName: "bash",
					hasUI: true,
					redactedAction: "rm -rf build",
					redactedActionTruncated: true,
					cwd,
				},
				{
					schemaVersion: 1,
					id: "headless",
					decisionType: "ask_denied",
					toolName: "bash",
					hasUI: false,
					redactedAction: "rm -rf build",
					cwd,
				},
			]
				.map((event) => JSON.stringify(event))
				.join("\n") + "\n",
			"utf-8",
		);

		const result = spawnSync(
			process.execPath,
			["--loader", loaderUrl, replayScript, eventsPath],
			{
				cwd: piRoot,
				encoding: "utf-8",
				env: {
					...process.env,
					PI_DAMAGE_CONTROL_POLICY_PATH: policyPath,
				},
			},
		);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("interactive rm-family events: 6");
		expect(result.stdout).toMatch(
			/ask_approved\s+\|\s+1\s+\|\s+0\s+\|\s+0\s+\|\s+3/,
		);
		expect(result.stdout).toMatch(
			/ask_denied\s+\|\s+0\s+\|\s+2\s+\|\s+0\s+\|\s+0/,
		);
		expect(result.stdout).not.toContain("DENIED WOULD AUTO-ALLOW");
		expect(result.stdout).toContain(
			"Limitation: redacted or unparseable actions are reported as unparseable and fail closed.",
		);
	});
});
