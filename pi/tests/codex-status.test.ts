import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import registerCodexStatusCommand, {
	accountIdFromToken,
	fetchCodexUsage,
	formatBedrockUsageSection,
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
					model: "gpt-5.6-sol",
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
		});
		const text = formatCodexCacheUsageSection(summary);
		expect(text).toContain("cache-read share of observed input: 44.4%");
		expect(text).toContain("usage unavailable: 1");
		expect(text).not.toContain("subscription");
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
			requestCount: 5,
			unpricedRequestCount: 0,
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
					unpricedRequestCount: 0,
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
			],
		});

		expect(text).toBe(
			"Bedrock:\n  fable-5: $68.07 3.6M in, 174.9K out\n  Total:  $68.07",
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
