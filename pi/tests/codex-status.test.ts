import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import registerCodexStatusCommand, {
	accountIdFromToken,
	fetchCodexUsage,
	formatUsage,
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
});

describe("codex-status usage", () => {
	it("uses the current ChatGPT wham usage endpoint", () => {
		expect(USAGE_ENDPOINT).toBe("https://chatgpt.com/backend-api/wham/usage");
	});

	it("formats default and additional rate limits", () => {
		const text = formatUsage(
			{
				email: "person@example.com",
				plan_type: "pro",
				rate_limit: {
					primary_window: {
						used_percent: 6,
						reset_at: new Date(2026, 4, 6, 18, 43, 0).getTime() / 1000,
					},
					secondary_window: {
						used_percent: 11,
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
		expect(text).toContain("5h           6% used resets 6:43pm");
		expect(text).toContain("weekly      11% used resets 05/12 7:18pm");
		expect(text).toContain("credits: 12");
		expect(text).toContain("GPT-5.3-Codex-Spark");
		expect(text.trimEnd()).toMatch(
			/https:\/\/chatgpt\.com\/codex\/settings\/usage$/,
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

describe("/status command", () => {
	it("registers status command", () => {
		const mockPi = createMockPi();
		registerCodexStatusCommand(
			mockPi as Parameters<typeof registerCodexStatusCommand>[0],
		);
		expect(
			mockPi._commands.find((command) => command.name === "status"),
		).toBeDefined();
	});

	it("shows status on startup and new sessions", async () => {
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

		for (const reason of ["startup", "new"]) {
			const ctx = createMockCtx();
			await hook.handler({ reason }, ctx);
			await vi.waitFor(() => {
				expect(ctx.ui.notify).toHaveBeenCalledWith(
					expect.stringContaining("Codex:"),
					"info",
				);
			});
		}
	});

	it("shows status when /clear input passes through", async () => {
		const home = tempHome();
		await mkdir(join(home, ".pi", "agent"), { recursive: true });
		await writeFile(
			join(home, ".pi", "agent", "auth.json"),
			JSON.stringify({
				"openai-codex": { access: fakeJwt({}), accountId: "acct-clear" },
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
		const hook = mockPi._getHook("input")[0];
		const ctx = createMockCtx();

		await expect(hook.handler({ text: " /clear " }, ctx)).resolves.toEqual({
			action: "continue",
		});
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("Codex:"),
			"info",
		);
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
