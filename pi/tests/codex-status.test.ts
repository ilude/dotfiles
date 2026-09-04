import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import registerCodexStatusCommand, {
	accountIdFromToken,
	fetchCodexUsage,
	formatBedrockUsageSection,
	formatCodexCacheDiagnostic,
	formatCodexCacheUsageSection,
	formatCodexFooterStatus,
	formatUsage,
	summarizeCodexCacheMetrics,
	isBedrockProviderConfigured,
	resetCodexStatusStateForTests,
	resolveAuth,
	USAGE_ENDPOINT,
} from "../extensions/codex-status";
import { createMockCtx, createMockPi } from "./helpers/mock-pi";

const OLD_HOME = process.env.HOME;
const OLD_USERPROFILE = process.env.USERPROFILE;
const tempHomes = new Set<string>();

function fakeJwt(claims: Record<string, unknown>): string {
	const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
	return `header.${payload}.sig`;
}

function tempHome(): string {
	const home = mkdtempSync(join(tmpdir(), "codex-status-test-"));
	tempHomes.add(home);
	process.env.HOME = home;
	process.env.USERPROFILE = home;
	return home;
}

afterEach(() => {
	resetCodexStatusStateForTests();
	process.env.HOME = OLD_HOME;
	process.env.USERPROFILE = OLD_USERPROFILE;
	for (const home of tempHomes) {
		rmSync(home, { recursive: true, force: true });
	}
	tempHomes.clear();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("codex-status auth", () => {
	it("extracts ChatGPT account id from access-token claims", () => {
		const token = fakeJwt({
			"https://api.openai.com/auth": {
				chatgpt_account_id: "acct-from-token",
			},
		});

		expect(accountIdFromToken(token)).toBe("acct-from-token");
	});

	it("resolves Pi auth and prefers explicit accountId", async () => {
		const home = tempHome();
		await mkdir(join(home, ".pi", "agent"), { recursive: true });
		await writeFile(
			join(home, ".pi", "agent", "auth.json"),
			JSON.stringify({
				"openai-codex": {
					access: fakeJwt({
						"https://api.openai.com/auth": {
							chatgpt_account_id: "acct-from-token",
						},
					}),
					accountId: "acct-explicit",
				},
			}),
		);

		await expect(resolveAuth()).resolves.toMatchObject({
			source: "pi",
			accountId: "acct-explicit",
		});
	});

	it("falls back to Codex CLI auth", async () => {
		const home = tempHome();
		await mkdir(join(home, ".codex"), { recursive: true });
		await writeFile(
			join(home, ".codex", "auth.json"),
			JSON.stringify({
				tokens: {
					access_token: fakeJwt({
						"https://api.openai.com/auth": {
							chatgpt_account_id: "acct-codex-token",
						},
					}),
				},
			}),
		);

		await expect(resolveAuth()).resolves.toMatchObject({
			source: "codex",
			accountId: "acct-codex-token",
		});
	});

	it("detects whether Amazon Bedrock is configured in Pi auth", async () => {
		const home = tempHome();
		await mkdir(join(home, ".pi", "agent"), { recursive: true });
		await writeFile(
			join(home, ".pi", "agent", "auth.json"),
			JSON.stringify({ "openai-codex": { access: "token" } }),
		);
		await expect(isBedrockProviderConfigured()).resolves.toBe(false);

		await writeFile(
			join(home, ".pi", "agent", "auth.json"),
			JSON.stringify({
				"openai-codex": { access: "token" },
				"amazon-bedrock": { type: "api_key", key: "configured" },
			}),
		);
		await expect(isBedrockProviderConfigured()).resolves.toBe(true);
	});
});

describe("codex-status usage", () => {
	it("uses the current ChatGPT wham usage endpoint", () => {
		expect(USAGE_ENDPOINT).toBe("https://chatgpt.com/backend-api/wham/usage");
	});

	it("formats default and additional rate limits", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 4, 7, 19, 18, 0));

		const text = formatUsage(
			{
				email: "person@example.com",
				plan_type: "pro",
				rate_limit: {
					primary_window: {
						used_percent: 6,
						limit_window_seconds: 5 * 60 * 60,
						reset_at: new Date(2026, 4, 6, 18, 43, 0).getTime() / 1000,
					},
					secondary_window: {
						used_percent: 11,
						limit_window_seconds: 7 * 24 * 60 * 60,
						reset_at: new Date(2026, 4, 12, 19, 18, 0).getTime() / 1000,
					},
				},
				credits: { balance: "12" },
				additional_rate_limits: [
					{
						limit_name: "GPT-5.3-Codex-Spark",
						rate_limit: { primary_window: { used_percent: 0 } },
					},
				],
			},
			{
				source: "pi",
				path: "/tmp/auth.json",
				accessToken: "redacted",
			},
		);

		expect(text).not.toContain("Codex usage");
		expect(text).not.toContain("source:");
		expect(text).not.toContain("account:");
		expect(text).toContain("5h       6% used resets 6:43pm");
		expect(text).toContain("weekly   11% used resets 05/12 7:18pm");
		expect(text).toContain("credits: 12");
		expect(text).toContain("GPT-5.3-Codex-Spark");
		expect(text.trimEnd()).toMatch(
			/https:\/\/chatgpt\.com\/codex\/settings\/usage$/,
		);
	});

	it("labels a weekly primary window and reports the missing five-hour limit", () => {
		const text = formatUsage(
			{
				rate_limit: {
					primary_window: {
						used_percent: 5,
						limit_window_seconds: 7 * 24 * 60 * 60,
					},
					secondary_window: null,
				},
			},
			{ source: "pi", path: "/tmp/auth.json", accessToken: "redacted" },
		);

		expect(text).toContain("5h       disabled");
		expect(text).toContain("weekly   5% used");
		expect(text).not.toContain("5h       5% used");
	});

	it("colors window percent by elapsed-window pace", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 4, 7, 19, 18, 0));
		const reset_at = new Date(2026, 4, 12, 19, 18, 0).getTime() / 1000;
		const weeklyWindow = { limit_window_seconds: 7 * 24 * 60 * 60, reset_at };

		expect(
			formatUsage(
				{
					rate_limit: {
						secondary_window: { ...weeklyWindow, used_percent: 22 },
					},
				},
				{ source: "pi", path: "/tmp/auth.json", accessToken: "redacted" },
				{ color: true },
			),
		).toContain("\u001b[92m22%\u001b[0m used");
		expect(
			formatUsage(
				{
					rate_limit: {
						secondary_window: { ...weeklyWindow, used_percent: 31 },
					},
				},
				{ source: "pi", path: "/tmp/auth.json", accessToken: "redacted" },
				{ color: true },
			),
		).toContain("\u001b[33m31%\u001b[0m used");
		expect(
			formatUsage(
				{
					rate_limit: {
						secondary_window: { ...weeklyWindow, used_percent: 36 },
					},
				},
				{ source: "pi", path: "/tmp/auth.json", accessToken: "redacted" },
				{ color: true },
			),
		).toContain("\u001b[31m36%\u001b[0m used");

		const earlyWeeklyResetAt = new Date(2026, 4, 14, 19, 0, 0).getTime() / 1000;
		expect(
			formatUsage(
				{
					rate_limit: {
						secondary_window: {
							used_percent: 1,
							limit_window_seconds: 7 * 24 * 60 * 60,
							reset_at: earlyWeeklyResetAt,
						},
					},
				},
				{ source: "pi", path: "/tmp/auth.json", accessToken: "redacted" },
				{ color: true },
			),
		).toContain("\u001b[92m1%\u001b[0m used");

		const earlyUsageResetAt = new Date(2026, 4, 14, 18, 43, 0).getTime() / 1000;
		expect(
			formatUsage(
				{
					rate_limit: {
						secondary_window: {
							used_percent: 2,
							limit_window_seconds: 7 * 24 * 60 * 60,
							reset_at: earlyUsageResetAt,
						},
					},
				},
				{ source: "pi", path: "/tmp/auth.json", accessToken: "redacted" },
				{ color: true },
			),
		).toContain("\u001b[92m2%\u001b[0m used");

		const fiveHourResetAt = new Date(2026, 4, 7, 22, 18, 0).getTime() / 1000;
		expect(
			formatUsage(
				{
					rate_limit: {
						primary_window: {
							used_percent: 30,
							limit_window_seconds: 5 * 60 * 60,
							reset_at: fiveHourResetAt,
						},
					},
				},
				{ source: "pi", path: "/tmp/auth.json", accessToken: "redacted" },
				{ color: true },
			),
		).toContain("\u001b[92m30%\u001b[0m used");
		expect(
			formatUsage(
				{
					rate_limit: {
						primary_window: {
							used_percent: 0,
							limit_window_seconds: 5 * 60 * 60,
							reset_at: new Date(2026, 4, 8, 0, 18, 0).getTime() / 1000,
						},
					},
				},
				{ source: "pi", path: "/tmp/auth.json", accessToken: "redacted" },
				{ color: true },
			),
		).toContain("\u001b[92m0%\u001b[0m used");
	});

	it("formats the Codex footer slot by window duration", () => {
		expect(
			formatCodexFooterStatus({
				rate_limit: {
					primary_window: {
						used_percent: 42,
						limit_window_seconds: 5 * 60 * 60,
					},
					secondary_window: {
						used_percent: 61,
						limit_window_seconds: 7 * 24 * 60 * 60,
					},
				},
			}),
		).toBe("codex: 5h 42% | wk 61%");
		expect(
			formatCodexFooterStatus({
				rate_limit: {
					primary_window: {
						used_percent: 5,
						limit_window_seconds: 7 * 24 * 60 * 60,
					},
					secondary_window: null,
				},
			}),
		).toBe("codex: 5h 0% | wk 5%");
		expect(formatCodexFooterStatus({ rate_limit: {} })).toBe("codex: unknown");
	});

	it("colors disabled, idle, and growing five-hour footer usage", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 4, 7, 19, 18, 0));
		const resetAt = new Date(2026, 4, 7, 22, 18, 0).getTime() / 1000;

		expect(
			formatCodexFooterStatus(
				{
					rate_limit: {
						primary_window: {
							used_percent: 5,
							limit_window_seconds: 7 * 24 * 60 * 60,
						},
					},
				},
				{ color: true },
			),
		).toContain("5h \u001b[94m0%\u001b[0m");
		expect(
			formatCodexFooterStatus(
				{
					rate_limit: {
						primary_window: {
							used_percent: 0,
							limit_window_seconds: 5 * 60 * 60,
							reset_at: resetAt,
						},
					},
				},
				{ color: true },
			),
		).toContain("5h \u001b[92m0%\u001b[0m");
		expect(
			formatCodexFooterStatus(
				{
					rate_limit: {
						primary_window: {
							used_percent: 50,
							limit_window_seconds: 5 * 60 * 60,
							reset_at: resetAt,
						},
					},
				},
				{ color: true },
			),
		).toContain("5h \u001b[31m50%\u001b[0m");
	});

	it("reports bounded Codex cache metrics without zero-filling unavailable usage", () => {
		const events = [
			{
				schemaVersion: 1 as const,
				id: "event-1",
				ts: "2026-08-23T12:00:00.000Z",
				session: "session-1",
				event: "prompt_cache_request",
				data: {
					provider: "openai-codex",
					model: "gpt-5.6-sol",
					messageId: "message-1",
					input: 10,
					cacheRead: 8,
					cacheWrite: 2,
					contextChangedSincePreviousRequest: false,
					immediateToolsChangedSincePreviousRequest: false,
				},
			},
			{
				schemaVersion: 1 as const,
				id: "event-duplicate",
				ts: "2026-08-23T12:01:00.000Z",
				session: "session-1",
				event: "prompt_cache_request",
				data: {
					provider: "openai-codex",
					model: "gpt-5.6-sol",
					messageId: "message-1",
					input: 10,
					cacheRead: 8,
					cacheWrite: 2,
				},
			},
			{
				schemaVersion: 1 as const,
				id: "event-2",
				ts: "2026-08-23T12:02:00.000Z",
				session: "session-1",
				event: "prompt_cache_request",
				data: {
					provider: "openai-codex",
					model: "gpt-5.6-luna",
					messageId: "message-2",
					input: "unavailable",
					cacheRead: "unavailable",
					cacheWrite: "unavailable",
					contextChangedSincePreviousRequest: true,
					immediateToolsChangedSincePreviousRequest: true,
				},
			},
		] as const;
		const summary = summarizeCodexCacheMetrics(events);
		expect(summary).toMatchObject({
			windowSize: 2,
			withUsage: 1,
			unavailableUsage: 1,
			input: 10,
			cacheRead: 8,
			cacheWrite: 2,
			cacheReadShare: 8 / 18,
			stable: 1,
			contextChanges: 1,
			immediateToolChanges: 1,
			shapeFlagsUnavailable: 0,
		});
		const text = formatCodexCacheUsageSection(summary);
		expect(text).toBe(
			"OpenAI Codex cache (last 2 requests):\n" +
				"  cache-read: 44.4%\n" +
				"  model request mix:\n" +
				"    gpt-5.6-sol: 50%\n" +
				"    gpt-5.6-luna: 50%",
		);
	});

	it("formats bounded observational cache diagnostics with overlapping and missing flags", () => {
		const events = [
			{ id: "stable", input: 10, cacheRead: 90, context: false, tools: false },
			{ id: "context", input: 10, cacheRead: 0, context: true, tools: false },
			{ id: "tools", input: 10, cacheRead: 0, context: false, tools: true },
			{ id: "both", input: 10, cacheRead: 0, context: true, tools: true },
			{ id: "missing", input: "unavailable", cacheRead: "unavailable" },
		].map((item) => ({
			schemaVersion: 1 as const,
			id: item.id,
			ts: "2026-08-23T12:00:00.000Z",
			session: "session-1",
			event: "prompt_cache_request",
			data: {
				provider: "openai-codex",
				model: "gpt-5.6-sol",
				messageId: item.id,
				input: item.input,
				cacheRead: item.cacheRead,
				contextChangedSincePreviousRequest: item.context,
				immediateToolsChangedSincePreviousRequest: item.tools,
			},
		}));
		const summary = summarizeCodexCacheMetrics([...events, events[0]]);

		expect(summary).toMatchObject({
			windowSize: 5,
			withUsage: 4,
			unavailableUsage: 1,
			cacheReadShare: 90 / 130,
			stable: 1,
			contextChanges: 2,
			immediateToolChanges: 2,
			shapeFlagsUnavailable: 1,
		});
		expect(formatCodexCacheDiagnostic(summary)).toBe(
			"OpenAI Codex cache doctor (last 5 requests):\n" +
				"  cache-read: 69.2%\n" +
				"  request shape observations:\n" +
				"    stable: 1\n" +
				"    runtime context changed: 2\n" +
				"    immediate tools changed: 2\n" +
				"    shape flags unavailable: 1\n" +
				"  Change categories can overlap and cover only observed flags.\n" +
				"  These observations show correlation, not cause or cache savings.",
		);
	});

	it("reports an empty diagnostic window without zero-filling cache usage", () => {
		const text = formatCodexCacheDiagnostic(summarizeCodexCacheMetrics([]));
		expect(text).toContain("last 0 requests");
		expect(text).toContain("cache-read: unavailable");
		expect(text).toContain("shape flags unavailable: 0");
	});

	it("bounds cache diagnostics to the existing 100-request window", () => {
		const events = Array.from({ length: 101 }, (_, index) => ({
			schemaVersion: 1 as const,
			id: `event-${index}`,
			ts: "2026-08-23T12:00:00.000Z",
			event: "prompt_cache_request",
			data: {
				provider: "openai-codex",
				messageId: `message-${index}`,
				input: 1,
				cacheRead: 1,
				contextChangedSincePreviousRequest: false,
				immediateToolsChangedSincePreviousRequest: false,
			},
		}));

		expect(summarizeCodexCacheMetrics(events)).toMatchObject({
			windowSize: 100,
			stable: 100,
		});
	});

	it("groups unique first child requests by direct run join and preserves zero usage", () => {
		const events = [
			{
				schemaVersion: 1 as const,
				id: "run-event",
				ts: "2026-08-23T12:00:00.000Z",
				event: "orchestration_run",
				data: {
					workers: [
						{ runId: "fresh-run", taskId: "task-a", continuationStatus: "fresh" },
						{ runId: "continued-run", taskId: "task-b", continuationStatus: "continued" },
					],
				},
			},
			{
				schemaVersion: 1 as const,
				id: "root-cache",
				ts: "2026-08-23T12:01:00.000Z",
				event: "prompt_cache_request",
				data: { provider: "openai-codex", providerRequestOrdinal: 1, input: 0, cacheRead: 0 },
			},
			{
				schemaVersion: 1 as const,
				id: "fresh-cache",
				ts: "2026-08-23T12:02:00.000Z",
				event: "prompt_cache_request",
				data: { provider: "openai-codex", runId: "fresh-run", taskId: "task-a", continuationStatus: "fresh", providerRequestOrdinal: 1, input: 2, cacheRead: 8 },
			},
			{
				schemaVersion: 1 as const,
				id: "continued-cache",
				ts: "2026-08-23T12:03:00.000Z",
				event: "prompt_cache_request",
				data: { provider: "openai-codex", runId: "continued-run", taskId: "task-b", continuationStatus: "continued", providerRequestOrdinal: 1, input: "unavailable", cacheRead: "unavailable" },
			},
			{
				schemaVersion: 1 as const,
				id: "continued-second",
				ts: "2026-08-23T12:04:00.000Z",
				event: "prompt_cache_request",
				data: { provider: "openai-codex", runId: "continued-run", providerRequestOrdinal: 2, input: 1, cacheRead: 9 },
			},
		] as const;
		const summary = summarizeCodexCacheMetrics(events);
		expect(summary.firstRequestGroups).toEqual({
			root: expect.objectContaining({ requests: 1, withUsage: 1, input: 0, cacheRead: 0, cacheReadShare: "unavailable" }),
			freshChild: expect.objectContaining({ requests: 1, withUsage: 1, input: 2, cacheRead: 8, cacheReadShare: 0.8 }),
			continuedChild: expect.objectContaining({ requests: 1, withUsage: 0, unavailableUsage: 1 }),
		});
	});

	it("does not collapse legacy unavailable message IDs within one session", () => {
		const events = ["event-1", "event-2"].map((id) => ({
			schemaVersion: 1 as const,
			id,
			ts: "2026-08-23T12:00:00.000Z",
			session: "session-1",
			event: "prompt_cache_request",
			data: {
				provider: "openai-codex",
				model: "gpt-5.6-sol",
				messageId: "unavailable",
				input: 10,
				cacheRead: 8,
				cacheWrite: "unavailable",
				contextChangedSincePreviousRequest: false,
				immediateToolsChangedSincePreviousRequest: false,
			},
		}));

		const summary = summarizeCodexCacheMetrics(events);
		expect(summary).toMatchObject({
			windowSize: 2,
			withUsage: 2,
			cacheWrite: "unavailable",
		});
	});

	it("formats Bedrock month-to-date local estimates", () => {
		expect(
			formatBedrockUsageSection({
				month: "2026-07",
				inputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
				costTotal: 0,
				requestCount: 0,
				unpricedRequestCount: 0,
				models: [],
			}),
		).toBe("Bedrock: no usage recorded this month.");

		const text = formatBedrockUsageSection({
			month: "2026-07",
			inputTokens: 3_614_504,
			outputTokens: 174_925,
			cacheReadTokens: 11_351_065,
			cacheWriteTokens: 946_491,
			costTotal: 68.073485,
			requestCount: 6,
			unpricedRequestCount: 1,
			models: [
				{
					provider: "amazon-bedrock",
					model: "us.anthropic.claude-fable-5",
					inputTokens: 6,
					outputTokens: 28_577,
					cacheReadTokens: 0,
					cacheWriteTokens: 31_214,
					costTotal: 1.819085,
					requestCount: 3,
					unpricedRequestCount: 1,
				},
				{
					provider: "bedrock-mantle",
					model: "anthropic.claude-fable-5",
					inputTokens: 3_614_498,
					outputTokens: 146_348,
					cacheReadTokens: 11_351_065,
					cacheWriteTokens: 915_277,
					costTotal: 66.2544,
					requestCount: 2,
					unpricedRequestCount: 0,
				},
				{
					provider: "amazon-bedrock",
					model: "openai.gpt-5.6-luna",
					inputTokens: 10,
					outputTokens: 48,
					cacheReadTokens: 12_000,
					cacheWriteTokens: 32_000,
					costTotal: 0.004,
					requestCount: 1,
					unpricedRequestCount: 1,
				},
			],
		});

		expect(text).toBe(
			"Bedrock local estimate:\n  fable-5: $68.07 Tokens: 3.6M in, 174.9K out, 11.4M cache read, 946.5K cache write\n  Total:  $68.07",
		);
	});

	it("fetches usage with bearer token and account header", async () => {
		const home = tempHome();
		await mkdir(join(home, ".pi", "agent"), { recursive: true });
		await writeFile(
			join(home, ".pi", "agent", "auth.json"),
			JSON.stringify({
				"openai-codex": {
					access: fakeJwt({
						"https://api.openai.com/auth": {
							chatgpt_account_id: "acct-fetch",
						},
					}),
				},
			}),
		);
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ email: "person@example.com" }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(fetchCodexUsage()).resolves.toMatchObject({
			usage: { email: "person@example.com" },
		});
		expect(fetchMock).toHaveBeenCalledWith(
			USAGE_ENDPOINT,
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: expect.stringMatching(/^Bearer /),
					"chatgpt-account-id": "acct-fetch",
				}),
			}),
		);
	});
});

describe("/cache-doctor command", () => {
	it("displays a TUI-only local report without a provider request or session message", async () => {
		tempHome();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const mockPi = createMockPi();
		registerCodexStatusCommand(
			mockPi as Parameters<typeof registerCodexStatusCommand>[0],
		);
		const command = mockPi._commands.find(({ name }) => name === "cache-doctor");
		const ctx = createMockCtx();

		await command?.handler("", ctx);

		expect(command).toBeDefined();
		expect(ctx.ui.notify).toHaveBeenNthCalledWith(
			1,
			"Cache diagnosis started.",
			"info",
		);
		expect(ctx.ui.notify).toHaveBeenNthCalledWith(
			2,
			expect.stringContaining("OpenAI Codex cache doctor"),
			"info",
		);
		expect(mockPi.sendMessage).not.toHaveBeenCalled();
		expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("/usage command", () => {
	it("fetches startup status once and reuses it across session replacement", async () => {
		const home = tempHome();
		await mkdir(join(home, ".pi", "agent"), { recursive: true });
		await writeFile(
			join(home, ".pi", "agent", "auth.json"),
			JSON.stringify({
				"openai-codex": { access: fakeJwt({}), accountId: "acct-session" },
			}),
		);
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				rate_limit: { primary_window: { used_percent: 12 } },
			}),
		}));
		vi.stubGlobal("fetch", fetchMock);
		const mockPi = createMockPi();
		registerCodexStatusCommand(
			mockPi as Parameters<typeof registerCodexStatusCommand>[0],
		);
		const hook = mockPi._getHook("session_start")[0];

		const startupCtx = createMockCtx();
		await hook.handler({ reason: "startup" }, startupCtx);
		await vi.waitFor(() => {
			expect(startupCtx.ui.setStatus).toHaveBeenCalledWith(
				"codex",
				expect.any(String),
			);
		});
		expect(startupCtx.ui.notify).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const newCtx = createMockCtx();
		await hook.handler({ reason: "new" }, newCtx);
		await vi.waitFor(() => {
			expect(newCtx.ui.setStatus).toHaveBeenCalledWith(
				"codex",
				expect.any(String),
			);
		});
		expect(newCtx.ui.notify).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await mockPi._getHook("session_shutdown")[0].handler({}, newCtx);
	});

	it("does not auto-show status on reload or resume", async () => {
		const mockPi = createMockPi();
		registerCodexStatusCommand(
			mockPi as Parameters<typeof registerCodexStatusCommand>[0],
		);
		const hook = mockPi._getHook("session_start")[0];

		for (const reason of ["reload", "resume", "fork", "clear"]) {
			const ctx = createMockCtx();
			await hook.handler({ reason }, ctx);
			expect(ctx.ui.notify).not.toHaveBeenCalled();
		}
	});
});
