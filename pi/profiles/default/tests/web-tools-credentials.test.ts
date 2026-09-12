import { afterEach, expect, it, vi } from "vitest";
import { gatewayCredentials, resetGatewayCredentialCacheForTest, searchApiKey } from "../extensions/web-tools/credentials.ts";
import { DEFAULT_GATEWAY_URL, GATEWAY_SECRET_ID } from "../extensions/web-tools/gateway-config.ts";

afterEach(() => { vi.unstubAllEnvs(); resetGatewayCredentialCacheForTest(); });

it("loads the exact BWS record once and uses its token with the default endpoint", async () => {
	const exec = vi.fn(async () => ({ code: 0, killed: false, stderr: "", stdout: JSON.stringify({
		key: "WEB_FETCH_GATEWAY_CLIENT", value: JSON.stringify({ url: DEFAULT_GATEWAY_URL, token: "bws-token" }),
	}) }));
	expect(await gatewayCredentials(exec)).toEqual({ endpoint: DEFAULT_GATEWAY_URL, token: "bws-token" });
	expect(await gatewayCredentials(exec)).toEqual({ endpoint: DEFAULT_GATEWAY_URL, token: "bws-token" });
	expect(exec).toHaveBeenCalledOnce();
	expect(exec).toHaveBeenCalledWith("uv", ["run", "--with", "bitwarden-sdk==2.1.0", "python", expect.stringMatching(/credential\.py$/), GATEWAY_SECRET_ID], expect.objectContaining({ timeout: 20_000 }));
});

it("keeps explicit environment credentials as overrides", async () => {
	vi.stubEnv("WEB_FETCH_GATEWAY_URL", "https://override.example/");
	vi.stubEnv("WEB_FETCH_GATEWAY_TOKEN", "environment-token");
	const exec = vi.fn();
	expect(await gatewayCredentials(exec)).toEqual({ endpoint: "https://override.example", token: "environment-token" });
	expect(exec).not.toHaveBeenCalled();
});

it("loads and caches exact search API records from BWS", async () => {
	vi.stubEnv("BITWARDEN_ACCESS_KEY", "machine-token");
	const exec = vi.fn(async () => ({ code: 0, killed: false, stderr: "", stdout: JSON.stringify({ key: "SERPER_API_KEY", value: "serper-secret" }) }));
	expect(await searchApiKey(exec, "SERPER_API_KEY")).toBe("serper-secret");
	expect(await searchApiKey(exec, "SERPER_API_KEY")).toBe("serper-secret");
	expect(exec).toHaveBeenCalledOnce();
	expect(exec.mock.calls[0][1]).toContain("ea0291ce-1988-4eb4-b10c-b4c3001e6036");
});

it("uses search environment overrides without contacting BWS", async () => {
	vi.stubEnv("BITWARDEN_ACCESS_KEY", "machine-token");
	vi.stubEnv("BRAVE_SEARCH_API_KEY", "environment-secret");
	const exec = vi.fn();
	expect(await searchApiKey(exec, "BRAVE_SEARCH_API_KEY")).toBe("environment-secret");
	expect(exec).not.toHaveBeenCalled();
});
