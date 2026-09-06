import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import extensionStats, {
	collectExtensionUsageSnapshot,
} from "../extensions/extension-stats.ts";
import skillStats from "../extensions/skill-stats.ts";
import {
	enumerateJsonlFiles,
	extractUsageTokens,
	joinPromptsToNextAssistant,
	readJsonlFile,
} from "../lib/session-jsonl.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const tempDirs: string[] = [];
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

afterEach(async () => {
	if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
	for (const dir of tempDirs.splice(0))
		await fs.rm(dir, { recursive: true, force: true });
});

async function makeTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

async function writeLines(filePath: string, lines: string[]): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

function commandOutput(
	pi: ReturnType<typeof createMockPi>,
	name: string,
): string {
	const call = pi.sendMessage.mock.calls.find(
		([message]) => message.customType === name,
	);
	return String(call?.[0].content ?? "");
}

describe("shared session JSONL stats primitives", () => {
	it("normalizes usage fields and joins multipart prompts to the next assistant", async () => {
		const root = await makeTempDir("session-jsonl-");
		const filePath = path.join(root, "nested", "session.jsonl");
		const usage = {
			input: 1,
			output: "2",
			cacheRead: 3,
			cacheWrite: "4",
			"gen_ai.usage.input_tokens": 5,
			"gen_ai.usage.output_tokens": "6",
			"gen_ai.usage.cache_read_tokens": 7,
			"gen_ai.usage.cache_write_tokens": "8",
		};
		await writeLines(filePath, [
			"{malformed",
			JSON.stringify({
				type: "message",
				message: {
					role: "user",
					content: [
						{ type: "text", text: "part one" },
						{ type: "image" },
						{ type: "text", text: "part two" },
					],
				},
			}),
			JSON.stringify({
				type: "message",
				message: { role: "assistant", content: [], usage },
			}),
		]);

		let malformed = 0;
		const entries = [];
		for await (const entry of readJsonlFile(filePath, {
			onMalformedLine: () => malformed++,
		}))
			entries.push(entry);
		expect(malformed).toBe(1);
		expect(entries).toHaveLength(2);
		expect(extractUsageTokens(usage)).toBe(36);

		const joins = [];
		for await (const joined of joinPromptsToNextAssistant(filePath))
			joins.push(joined);
		expect(joins).toMatchObject([
			{ userText: "part one\npart two", usageTokens: 36 },
		]);
	});

	it("stops enumeration and reading when aborted", async () => {
		const root = await makeTempDir("session-jsonl-abort-");
		const filePath = path.join(root, "session.jsonl");
		await writeLines(filePath, [
			JSON.stringify({ value: 1 }),
			JSON.stringify({ value: 2 }),
		]);
		const enumerationController = new AbortController();
		enumerationController.abort();
		expect(
			await enumerateJsonlFiles(root, enumerationController.signal),
		).toEqual([]);

		const readingController = new AbortController();
		const entries = [];
		for await (const entry of readJsonlFile(filePath, {
			signal: readingController.signal,
		})) {
			entries.push(entry);
			readingController.abort();
		}
		expect(entries).toHaveLength(1);
	});

	it("surfaces filesystem and malformed-line callback failures", async () => {
		const root = await makeTempDir("session-jsonl-errors-");
		const notDirectory = path.join(root, "not-a-directory");
		await fs.writeFile(notDirectory, "file", "utf8");
		await expect(enumerateJsonlFiles(notDirectory)).rejects.toMatchObject({
			code: expect.stringMatching(/ENOTDIR|EINVAL/),
		});

		const malformed = path.join(root, "malformed.jsonl");
		await writeLines(malformed, ["{malformed"]);
		const consume = async () => {
			for await (const _entry of readJsonlFile(malformed, {
				onMalformedLine: () => {
					throw new Error("diagnostic callback failed");
				},
			})) {
				// no-op
			}
		};
		await expect(consume()).rejects.toThrow("diagnostic callback failed");
	});


	it("attributes the current /usage command to codex-status", async () => {
		const root = await makeTempDir("extension-usage-owner-");
		const agentDir = path.join(root, "agent");
		const sessionDir = path.join(root, "sessions");
		process.env.PI_CODING_AGENT_DIR = agentDir;
		await fs.mkdir(path.join(agentDir, "extensions"), { recursive: true });
		await fs.writeFile(
			path.join(agentDir, "extensions", "codex-status.ts"),
			'pi.registerCommand("usage", {});\n',
			"utf8",
		);
		await fs.writeFile(
			path.join(agentDir, "extensions", "usage.ts"),
			'pi.registerCommand("usage-stats", {});\n',
			"utf8",
		);
		const now = new Date();
		const sessionName = `${now.toISOString().replace(/:/g, "-").replace(".", "-")}_usage.jsonl`;
		await writeLines(path.join(sessionDir, sessionName), [
			JSON.stringify({
				type: "custom_message",
				customType: "slash-echo",
				content: "/usage",
				timestamp: now.toISOString(),
			}),
		]);
		const pi = createMockPi() as ReturnType<typeof createMockPi> & {
			getAllTools: () => never[];
		};
		pi.getAllTools = () => [];
		extensionStats(pi as unknown as ExtensionAPI);
		await pi._commands
			.find((command) => command.name === "extension-stats")
			?.handler(
				"",
				createMockCtx({
					cwd: root,
					sessionManager: { getSessionDir: () => sessionDir },
				}),
			);
		const output = commandOutput(pi, "extension-stats");
		expect(output).toContain("| usage/usage | 1 |");
		expect(output).not.toContain("| usage/usage-stats | 1 |");
		const snapshot = await collectExtensionUsageSnapshot(
			pi as unknown as ExtensionAPI,
			root,
			sessionDir,
		);
		expect(snapshot.commands.get("codex-status/usage")).toBe(1);
		expect(snapshot.extensions.get("codex-status")).toBe(1);
	});

	it("uses the command context session directory for all stats commands", async () => {
		const root = await makeTempDir("stats-custom-session-dir-");
		const agentDir = path.join(root, "agent");
		const customSessionDir = path.join(root, "custom-sessions");
		const cwd = path.join(root, "workspace");
		process.env.PI_CODING_AGENT_DIR = agentDir;

		const now = new Date();
		const customPrompt = "custom session prompt";
		const defaultPrompt = "default session prompt";
		const sessionName = `${now.toISOString().replace(/:/g, "-").replace(".", "-")}_custom-root.jsonl`;
		const customSkillEvent = {
			type: "custom",
			customType: "skill-load",
			data: {
				skill: "custom-root-skill",
				source: "explicit_slash_command",
				timestamp: now.toISOString(),
				turnId: "custom-root-turn",
			},
		};
		await writeLines(path.join(customSessionDir, sessionName), [
			JSON.stringify(customSkillEvent),
			JSON.stringify({
				type: "message",
				timestamp: now.toISOString(),
				message: { role: "user", content: customPrompt },
			}),
			JSON.stringify({
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", name: "grep" }],
					usage: { input: 11 },
				},
			}),
		]);
		await writeLines(path.join(agentDir, "sessions", sessionName), [
			JSON.stringify({
				...customSkillEvent,
				data: { ...customSkillEvent.data, skill: "default-root-skill" },
			}),
			JSON.stringify({
				type: "message",
				timestamp: now.toISOString(),
				message: { role: "user", content: defaultPrompt },
			}),
			JSON.stringify({
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "toolCall", name: "find" }],
					usage: { input: 97 },
				},
			}),
		]);

		const getSessionDir = vi.fn(() => customSessionDir);
		const ctx = createMockCtx({
			cwd,
			sessionManager: { getSessionDir },
		});
		const extensionPi = createMockPi() as ReturnType<typeof createMockPi> & {
			getAllTools: () => never[];
		};
		extensionPi.getAllTools = () => [];
		extensionStats(extensionPi as unknown as ExtensionAPI);
		await extensionPi._commands
			.find((command) => command.name === "extension-stats")
			?.handler("", ctx);

		const skillPi = createMockPi();
		skillStats(skillPi as unknown as ExtensionAPI);
		await skillPi._commands
			.find((command) => command.name === "skill-stats")
			?.handler("", ctx);

		const extensionOutput = commandOutput(extensionPi, "extension-stats");
		const skillOutput = commandOutput(skillPi, "skill-stats");
		expect(getSessionDir).toHaveBeenCalledTimes(2);
		expect(extensionOutput).toContain(
			`Sessions directory: ${customSessionDir}`,
		);
		expect(extensionOutput).toMatch(/grep[^\n]*\b1\b[^\n]*\b11\b/);
		expect(extensionOutput).not.toMatch(/find[^\n]*\b1\b[^\n]*\b97\b/);
		const snapshot = await collectExtensionUsageSnapshot(
			extensionPi as unknown as ExtensionAPI,
			cwd,
			customSessionDir,
		);
		expect(snapshot.tools.get("Pi/grep")).toBe(1);
		expect(skillOutput).toContain("custom-root-skill");
		expect(skillOutput).not.toContain("default-root-skill");
	});
});
