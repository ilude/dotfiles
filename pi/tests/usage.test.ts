import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:os")>();
	return {
		...original,
		homedir: () => process.env.PI_USAGE_TEST_HOME ?? original.homedir(),
	};
});

import usageExtension, { buildUsageReport } from "../extensions/usage.ts";
import { createMockCtx, createMockPi } from "./helpers/mock-pi.ts";

const tempDirs: string[] = [];
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalUsageTestHome = process.env.PI_USAGE_TEST_HOME;

async function makeTempDir(): Promise<string> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "usage-test-"));
	tempDirs.push(directory);
	return directory;
}

async function writeJsonl(
	filePath: string,
	records: readonly Record<string, unknown>[],
): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(
		filePath,
		`${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
		"utf8",
	);
}

async function writePricingCache(agentDir: string): Promise<void> {
	const cachePath = path.join(agentDir, "cache", "models-dev-api.json");
	await fs.mkdir(path.dirname(cachePath), { recursive: true });
	await fs.writeFile(
		cachePath,
		JSON.stringify({
			openai: {
				models: {
					gpt: {
						cost: { input: 1, output: 2, cache_read: 0.5 },
					},
				},
			},
		}),
		"utf8",
	);
}

afterEach(async () => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
	if (originalUsageTestHome === undefined)
		delete process.env.PI_USAGE_TEST_HOME;
	else process.env.PI_USAGE_TEST_HOME = originalUsageTestHome;
	for (const directory of tempDirs.splice(0))
		await fs.rm(directory, { recursive: true, force: true });
});

describe("usage extension", () => {
	it("streams configured sessions and preserves Codex token pricing without a network request", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
		const root = await makeTempDir();
		const agentDir = path.join(root, "agent");
		const sessionRoot = path.join(root, "sessions");
		const codexRoot = path.join(root, "codex");
		process.env.PI_CODING_AGENT_DIR = agentDir;
		process.env.PI_USAGE_TEST_HOME = root;
		await writePricingCache(agentDir);
		await writeJsonl(path.join(sessionRoot, "nested", "pi.jsonl"), [
			{
				type: "message",
				timestamp: "2026-07-14T11:00:00.000Z",
				message: {
					role: "assistant",
					provider: "openai",
					model: "gpt",
					usage: { input: 1_000_000, output: 0, cacheRead: 0 },
				},
			},
		]);
		await writeJsonl(path.join(codexRoot, "codex.jsonl"), [
			{ type: "turn_context", payload: { provider: "openai", model: "gpt" } },
			{
				timestamp: "2026-07-14T11:30:00.000Z",
				payload: {
					type: "token_count",
					info: {
						last_token_usage: {
							input_tokens: 1_000_000,
							output_tokens: 1_000_000,
							cached_input_tokens: 1_000_000,
						},
					},
				},
			},
		]);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const report = await buildUsageReport(false, sessionRoot, [codexRoot]);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(report).toContain("| Pi | openai/gpt | 1 | 1,000,000 |");
		expect(report).toContain(
			"| Codex CLI | openai/gpt | 1 | 1,000,000 | 1,000,000 | 1,000,000 | 3,000,000 | $3.50 |",
		);
		expect(report).toContain("Parsed files: Pi 1, Codex CLI 1.");
	});

	it("uses the command session root and displays the report without a provider turn", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
		const root = await makeTempDir();
		const agentDir = path.join(root, "agent");
		const customSessionRoot = path.join(root, "custom-sessions");
		process.env.PI_CODING_AGENT_DIR = agentDir;
		process.env.PI_USAGE_TEST_HOME = root;
		await writePricingCache(agentDir);
		await writeJsonl(path.join(agentDir, "sessions", "default.jsonl"), [
			{
				type: "message",
				timestamp: "2026-07-14T11:00:00.000Z",
				message: {
					role: "assistant",
					provider: "openai",
					model: "default-model",
					usage: { input: 999 },
				},
			},
		]);
		await writeJsonl(path.join(customSessionRoot, "custom.jsonl"), [
			{
				type: "message",
				timestamp: "2026-07-14T11:00:00.000Z",
				message: {
					role: "assistant",
					provider: "openai",
					model: "custom-model",
					usage: { input: 123 },
				},
			},
		]);
		vi.stubGlobal("fetch", vi.fn());
		const pi = createMockPi();
		const waitForIdle = vi.fn();
		const ctx = createMockCtx({
			waitForIdle,
			sessionManager: { getSessionDir: () => customSessionRoot },
		});
		usageExtension(pi as never);

		await pi._commands
			.find((command) => command.name === "usage-stats")
			?.handler("", ctx);

		expect(waitForIdle).not.toHaveBeenCalled();
		expect(pi.sendUserMessage).not.toHaveBeenCalled();
		expect(pi.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				customType: "usage-stats",
				display: true,
				content: expect.stringContaining("openai/custom-model"),
			}),
			{ triggerTurn: false },
		);
		const message = pi.sendMessage.mock.calls[0]?.[0];
		expect(message.content).not.toContain("openai/default-model");
	});
});
