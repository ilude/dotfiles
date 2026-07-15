import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import extensionStats, {
	collectExtensionUsageSnapshot,
} from "../extensions/extension-stats.ts";
import routerStats from "../extensions/router-stats.ts";
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

	it("keeps router-stats and extension-stats usage attribution in parity", async () => {
		const root = await makeTempDir("stats-parity-");
		const agentDir = path.join(root, "agent");
		const cwd = path.join(root, "workspace");
		process.env.PI_CODING_AGENT_DIR = agentDir;

		const prompt = "route this\nwith context";
		const promptHash = createHash("sha256").update(prompt).digest("hex");
		const now = new Date();
		const usage = {
			input: "1",
			output: 2,
			cacheRead: "3",
			cacheWrite: 4,
			"gen_ai.usage.input_tokens": "5",
			"gen_ai.usage.output_tokens": 6,
			"gen_ai.usage.cache_read_tokens": "7",
			"gen_ai.usage.cache_write_tokens": 8,
		};
		const sessionName = `${now.toISOString().replace(/:/g, "-").replace(".", "-")}_parity.jsonl`;
		await writeLines(path.join(agentDir, "sessions", sessionName), [
			"{malformed",
			JSON.stringify({
				type: "message",
				timestamp: now.toISOString(),
				message: {
					role: "user",
					content: [
						{ type: "text", text: "route this" },
						{ type: "text", text: "with context" },
					],
				},
			}),
			JSON.stringify({
				type: "message",
				message: { role: "assistant", content: [], usage },
			}),
		]);
		await writeLines(
			path.join(cwd, "pi", "prompt-routing", "logs", "routing_log.jsonl"),
			[
				"not-json",
				JSON.stringify({
					ts: now.getTime() / 1000,
					prompt_hash: promptHash,
					prompt_excerpt: prompt,
					primary: { model_size: "medium", effort: "high" },
				}),
			],
		);

		const ctx = createMockCtx({
			cwd,
			sessionManager: { getSessionDir: () => path.join(agentDir, "sessions") },
		});
		const routerPi = createMockPi();
		routerStats(routerPi as unknown as ExtensionAPI);
		await routerPi._commands
			.find((command) => command.name === "router-stats")
			?.handler("", ctx);

		const extensionPi = createMockPi() as ReturnType<typeof createMockPi> & {
			getAllTools: () => never[];
		};
		extensionPi.getAllTools = () => [];
		extensionStats(extensionPi as unknown as ExtensionAPI);
		await extensionPi._commands
			.find((command) => command.name === "extension-stats")
			?.handler("", ctx);

		expect(commandOutput(routerPi, "router-stats")).toContain(
			"1 routed prompts; 36 est. tokens",
		);
		expect(commandOutput(extensionPi, "extension-stats")).toContain(
			"| prompt-router/route | 1 | 36 |",
		);
	});

	it("pairs repeated prompt hashes by occurrence without multiplying tokens", async () => {
		const root = await makeTempDir("router-repeat-");
		const sessionDir = path.join(root, "sessions");
		const cwd = path.join(root, "workspace");
		const now = new Date();
		const prompt = "repeat this route";
		const promptHash = createHash("sha256").update(prompt).digest("hex");
		const sessionName = `${now.toISOString().replace(/:/g, "-").replace(".", "-")}_repeat.jsonl`;
		await writeLines(path.join(sessionDir, sessionName), [
			JSON.stringify({
				type: "message",
				timestamp: now.toISOString(),
				message: { role: "user", content: prompt },
			}),
			JSON.stringify({
				type: "message",
				message: { role: "assistant", content: [], usage: { input: 10 } },
			}),
			JSON.stringify({
				type: "message",
				timestamp: now.toISOString(),
				message: { role: "user", content: prompt },
			}),
			JSON.stringify({
				type: "message",
				message: { role: "assistant", content: [], usage: { input: 20 } },
			}),
		]);
		await writeLines(
			path.join(cwd, "pi", "prompt-routing", "logs", "routing_log.jsonl"),
			[10, 20].map((tokens) =>
				JSON.stringify({
					ts: now.getTime() / 1000,
					prompt_hash: promptHash,
					prompt_excerpt: `${prompt} ${tokens}`,
					primary: { model_size: "medium", effort: "high" },
				}),
			),
		);
		const ctx = createMockCtx({
			cwd,
			sessionManager: { getSessionDir: () => sessionDir },
		});
		const pi = createMockPi();
		routerStats(pi as unknown as ExtensionAPI);
		await pi._commands
			.find((command) => command.name === "router-stats")
			?.handler("", ctx);
		expect(commandOutput(pi, "router-stats")).toContain(
			"2 routed prompts; 30 est. tokens",
		);
	});

	it("reconciles keyed and unkeyed trace token evidence by occurrence", async () => {
		const root = await makeTempDir("extension-trace-");
		const agentDir = path.join(root, "agent");
		const sessionDir = path.join(root, "sessions");
		const cwd = path.join(root, "workspace");
		process.env.PI_CODING_AGENT_DIR = agentDir;
		const now = new Date();
		const prompt = "trace-backed route";
		const promptHash = createHash("sha256").update(prompt).digest("hex");
		const secondPrompt = "session fallback route";
		const secondPromptHash = createHash("sha256")
			.update(secondPrompt)
			.digest("hex");
		const sessionName = `${now.toISOString().replace(/:/g, "-").replace(".", "-")}_trace.jsonl`;
		await writeLines(path.join(sessionDir, sessionName), [
			JSON.stringify({
				type: "message",
				timestamp: now.toISOString(),
				message: { role: "user", content: prompt },
			}),
			JSON.stringify({
				type: "message",
				message: { role: "assistant", content: [], usage: { input: 36 } },
			}),
			JSON.stringify({
				type: "message",
				timestamp: now.toISOString(),
				message: { role: "user", content: secondPrompt },
			}),
			JSON.stringify({
				type: "message",
				message: { role: "assistant", content: [], usage: { input: 12 } },
			}),
		]);
		await writeLines(
			path.join(cwd, "pi", "prompt-routing", "logs", "routing_log.jsonl"),
			[
				JSON.stringify({
					ts: now.getTime() / 1000,
					prompt_hash: promptHash,
					prompt_excerpt: prompt,
					primary: { model_size: "medium", effort: "high" },
				}),
				JSON.stringify({
					ts: now.getTime() / 1000,
					prompt_hash: secondPromptHash,
					prompt_excerpt: secondPrompt,
					primary: { model_size: "small", effort: "low" },
				}),
			],
		);
		await writeLines(path.join(agentDir, "traces", "trace.jsonl"), [
			JSON.stringify({
				turn_id: "turn-1",
				event_type: "routing_decision",
				timestamp: now.toISOString(),
				payload: { prompt_hash: promptHash },
			}),
			JSON.stringify({
				turn_id: "turn-1",
				event_type: "assistant_message",
				payload: { usage: { input: 36 } },
			}),
			JSON.stringify({
				turn_id: "turn-2",
				event_type: "routing_decision",
				timestamp: now.toISOString(),
			}),
			JSON.stringify({
				turn_id: "turn-2",
				event_type: "assistant_message",
				payload: { usage: { input: 12 } },
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
					cwd,
					sessionManager: { getSessionDir: () => sessionDir },
				}),
			);
		const output = commandOutput(pi, "extension-stats");
		expect(output).toContain("| prompt-router/route | 2 | 48 |");
		expect(output).toContain("Router token fallback: 1 unkeyed trace turn");
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
		await writeLines(
			path.join(cwd, "pi", "prompt-routing", "logs", "routing_log.jsonl"),
			[
				JSON.stringify({
					ts: now.getTime() / 1000,
					prompt_hash: createHash("sha256").update(customPrompt).digest("hex"),
					prompt_excerpt: customPrompt,
					primary: { model_size: "medium", effort: "high" },
				}),
				JSON.stringify({
					ts: now.getTime() / 1000,
					prompt_hash: createHash("sha256").update(defaultPrompt).digest("hex"),
					prompt_excerpt: defaultPrompt,
					primary: { model_size: "small", effort: "low" },
				}),
			],
		);

		const getSessionDir = vi.fn(() => customSessionDir);
		const ctx = createMockCtx({
			cwd,
			sessionManager: { getSessionDir },
		});
		const routerPi = createMockPi();
		routerStats(routerPi as unknown as ExtensionAPI);
		await routerPi._commands
			.find((command) => command.name === "router-stats")
			?.handler("", ctx);

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

		const routerOutput = commandOutput(routerPi, "router-stats");
		const extensionOutput = commandOutput(extensionPi, "extension-stats");
		const skillOutput = commandOutput(skillPi, "skill-stats");
		expect(getSessionDir).toHaveBeenCalledTimes(3);
		expect(routerOutput).toContain("2 routed prompts; 11 est. tokens");
		expect(routerOutput).not.toContain("108 est. tokens");
		expect(extensionOutput).toContain(
			`Sessions directory: ${customSessionDir}`,
		);
		expect(extensionOutput).toContain("| grep | 1 | 11 |");
		expect(extensionOutput).not.toContain("| find | 1 | 97 |");
		const snapshot = await collectExtensionUsageSnapshot(
			extensionPi as unknown as ExtensionAPI,
			cwd,
			customSessionDir,
		);
		expect(snapshot.tools.get("Pi/grep")).toBe(1);
		expect(skillOutput).toContain("| custom-root-skill |");
		expect(skillOutput).not.toContain("| default-root-skill |");
	});
});
