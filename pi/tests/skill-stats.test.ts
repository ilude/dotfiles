import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import skillStats, {
	collectSkillStats,
	renderSkillStatsMarkdown,
} from "../extensions/skill-stats.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	for (const dir of tempDirs.splice(0))
		await fs.rm(dir, { recursive: true, force: true });
});

async function makeSessionRoot(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-stats-"));
	tempDirs.push(dir);
	return dir;
}

async function writeJsonl(
	root: string,
	name: string,
	records: unknown[],
): Promise<void> {
	await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
	await fs.writeFile(
		path.join(root, name),
		`${records.map((r) => JSON.stringify(r)).join("\n")}\n{bad-json`,
		"utf-8",
	);
}

describe("/skill-stats extension", () => {
	it("registers the command", () => {
		const pi = createMockPi();
		skillStats(pi as unknown as ExtensionAPI);
		expect(pi._commands.find((c) => c.name === "skill-stats")).toBeDefined();
	});

	it("aggregates structured, prompt, and manual-read evidence safely", async () => {
		const root = await makeSessionRoot();
		await writeJsonl(root, "2026-05-07T00-00-00-000Z_a.jsonl", [
			{
				type: "custom",
				customType: "skill-load",
				data: {
					schemaVersion: 1,
					skill: "docs",
					source: "explicit_slash_command",
					timestamp: "2026-05-07T00:00:00.000Z",
					turnId: "1",
				},
			},
			{
				type: "custom_message",
				customType: "slash-echo",
				content: "/docs topic",
				timestamp: "2026-05-07T00:00:00.000Z",
			},
			{
				type: "message",
				timestamp: "2026-05-07T00:00:00.000Z",
				message: {
					role: "user",
					content:
						'<skill name="docs">expanded</skill> please /skill:python test',
				},
			},
			{
				type: "message",
				timestamp: "2026-05-07T00:00:00.000Z",
				message: {
					role: "toolResult",
					content: [
						{
							type: "text",
							text: '<skill name="example">docs</skill> /skill:example',
						},
					],
				},
			},
			{
				type: "message",
				timestamp: "2026-05-07T00:00:00.000Z",
				message: {
					role: "assistant",
					content: [
						{
							type: "toolCall",
							name: "read",
							arguments: {
								path: "/home/person/.pi/agent/skills/secret/SKILL.md",
							},
						},
					],
				},
			},
			{
				type: "custom",
				customType: "skill-load",
				data: {
					schemaVersion: 1,
					skill: "inventory",
					source: "prompt_skill_inventory",
					timestamp: "2026-05-07T00:00:00.000Z",
				},
			},
			{
				type: "custom",
				customType: "skill-load",
				data: {
					schemaVersion: 1,
					source: "explicit_slash_command",
					timestamp: "2026-05-07T00:00:00.000Z",
				},
			},
		]);

		const { result, errorMarkdown } = await collectSkillStats("1 7 30 all", {
			sessionRoot: root,
			now: new Date("2026-05-07T12:00:00.000Z"),
		});
		expect(errorMarkdown).toBeUndefined();
		expect(result?.usage.get("1")?.get("docs")).toBe(3);
		expect(result?.usage.get("1")?.get("python")).toBe(1);
		expect(result?.usage.get("1")?.has("secret")).toBe(false);
		expect(result?.usage.get("1")?.has("example")).toBe(false);
		expect(result?.candidates.get("secret")).toBe(1);
		expect(result?.candidates.get("prompt_skill_inventory")).toBe(1);
		expect(result?.diagnostics.get("malformed_json")).toBe(1);
		expect(result).toBeDefined();
		if (!result) throw new Error("expected skill stats result");
		const markdown = renderSkillStatsMarkdown(result);
		expect(markdown).toContain(`Session root: ${root}`);
		expect(markdown).toContain("## Unused skills");
		expect(markdown).toContain("| Skill | Location | Count | Description |");
		expect(markdown).toContain("| Skill | Location | Description |");
		expect(markdown).not.toContain("/home/person");
	});

	it("returns usage markdown for invalid args", async () => {
		const root = await makeSessionRoot();
		const { errorMarkdown } = await collectSkillStats("0", {
			sessionRoot: root,
		});
		expect(errorMarkdown).toContain("/skill-stats usage");
	});
});
