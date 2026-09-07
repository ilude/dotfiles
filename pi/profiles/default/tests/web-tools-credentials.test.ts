import { afterEach, expect, it, vi } from "vitest";
import { gatewayCredentials, resetGatewayCredentialCacheForTest } from "../extensions/web-tools/credentials.ts";
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
