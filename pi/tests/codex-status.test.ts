import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import registerCodexStatusCommand, {
	accountIdFromToken,
	fetchCodexUsage,
	formatBedrockUsageSection,
	formatCodexFooterStatus,
	formatUsage,
	isBedrockProviderConfigured,
	resolveAuth,
	USAGE_ENDPOINT,
} from "../extensions/codex-status";
import { createMockCtx, createMockPi } from "./helpers/mock-pi";

const OLD_HOME = process.env.HOME;
const OLD_USERPROFILE = process.env.USERPROFILE;

function fakeJwt(claims: Record<string, unknown>): string {
	const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
	return `header.${payload}.sig`;
}

function tempHome(): string {
	const home = mkdtempSync(join(tmpdir(), "codex-status-test-"));
	process.env.HOME = home;
	process.env.USERPROFILE = home;
	return home;
}

afterEach(() => {
	process.env.HOME = OLD_HOME;
	process.env.USERPROFILE = OLD_USERPROFILE;
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
		).toBe("codex 5h 42% | wk 61%");
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
		).toBe("codex 5h disabled | wk 5%");
		expect(formatCodexFooterStatus({ rate_limit: {} })).toBe("codex: unknown");
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
			inputTokens: 3_614_498,
			outputTokens: 146_348,
			cacheReadTokens: 11_351_065,
			cacheWriteTokens: 915_277,
			costTotal: 66.2544,
			requestCount: 2,
			unpricedRequestCount: 0,
			models: [
				{
					provider: "amazon-bedrock",
					model: "us.anthropic.claude-fable-5",
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
			"Bedrock:\n  fable-5: $66.25 3.6M in, 146.3K out\n  Total:  $66.25",
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
	it("registers usage command", () => {
		const mockPi = createMockPi();
		registerCodexStatusCommand(
			mockPi as Parameters<typeof registerCodexStatusCommand>[0],
		);
		expect(
			mockPi._commands.find((command) => command.name === "usage"),
		).toBeDefined();
	});

	it("shows status on startup only", async () => {
		const home = tempHome();
		await mkdir(join(home, ".pi", "agent"), { recursive: true });
		await writeFile(
			join(home, ".pi", "agent", "auth.json"),
			JSON.stringify({
				"openai-codex": { access: fakeJwt({}), accountId: "acct-session" },
			}),
		);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					rate_limit: { primary_window: { used_percent: 12 } },
				}),
			})),
		);
		const mockPi = createMockPi();
		registerCodexStatusCommand(
			mockPi as Parameters<typeof registerCodexStatusCommand>[0],
		);
		const hook = mockPi._getHook("session_start")[0];

		const startupCtx = createMockCtx();
		await hook.handler({ reason: "startup" }, startupCtx);
		await vi.waitFor(() => {
			expect(startupCtx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("Codex:"),
				"info",
			);
		});

		const newCtx = createMockCtx();
		await hook.handler({ reason: "new" }, newCtx);
		expect(newCtx.ui.notify).not.toHaveBeenCalled();
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
