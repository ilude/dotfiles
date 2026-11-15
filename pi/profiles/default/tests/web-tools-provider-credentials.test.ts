import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { join } from "node:path";
import { invalidateProviderApiKey, providerApiKey, resetGatewayCredentialCacheForTest } from "../extensions/web-tools/credentials.ts";
const read = vi.hoisted(() => vi.fn());
const run = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", () => ({ readFile: read }));
vi.mock("node:child_process", () => ({ execFile: run }));
type Done = (error: Error | null, stdout: string) => void;
const records = [{ key: "UNRELATED_PRIVATE_RECORD", value: "not returned" }, { key: "FIRECRAWL_API_KEY", value: "fixture-firecrawl" }];
beforeEach(() => {
	resetGatewayCredentialCacheForTest();
	vi.stubEnv("FIRECRAWL_API_KEY", ""); vi.stubEnv("BITWARDEN_ACCESS_KEY", "machine-fixture");
	vi.stubEnv("BWS_ACCESS_TOKEN", "prior-token"); vi.stubEnv("BWS_SERVER_URL", "https://prior.example");
	read.mockReset().mockResolvedValue(JSON.stringify({ bws: { project_id: "project-fixture", api_server: "https://vault.example/api" } }));
	run.mockReset().mockImplementation((_command: string, _args: string[], _options: unknown, done: Done) => done(null, JSON.stringify(records)));
});
afterEach(() => { vi.unstubAllEnvs(); resetGatewayCredentialCacheForTest(); });
it("uses an environment override without reading the locator or spawning BWS", async () => {
	vi.stubEnv("FIRECRAWL_API_KEY", "environment-fixture");
	expect(await providerApiKey("FIRECRAWL_API_KEY")).toBe("environment-fixture");
	expect(read).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
});
it("selects one exact record with child-local BWS settings and caches only success", async () => {
	const signal = new AbortController().signal;
	expect(await providerApiKey("FIRECRAWL_API_KEY", signal)).toBe("fixture-firecrawl");
	expect(await providerApiKey("FIRECRAWL_API_KEY", signal)).toBe("fixture-firecrawl");
	expect(String(read.mock.calls[0][0]).endsWith(join("config", "bws", "settings.local.json"))).toBe(true);
	expect(run).toHaveBeenCalledOnce();
	expect(run.mock.calls[0].slice(0, 2)).toEqual(["bws", ["secret", "list", "project-fixture", "--output", "json"]]);
	expect(run.mock.calls[0][2]).toMatchObject({ signal, timeout: 20_000, env: { BWS_ACCESS_TOKEN: "machine-fixture", BWS_SERVER_URL: "https://vault.example" } });
	expect(process.env.BWS_ACCESS_TOKEN).toBe("prior-token"); expect(process.env.BWS_SERVER_URL).toBe("https://prior.example");
	invalidateProviderApiKey("FIRECRAWL_API_KEY", "fixture-firecrawl");
	expect(await providerApiKey("FIRECRAWL_API_KEY")).toBe("fixture-firecrawl");
	expect(run).toHaveBeenCalledTimes(2);
});
it("does not retain duplicate-record failures or expose captured private records", async () => {
	run.mockImplementationOnce((_command: string, _args: string[], _options: unknown, done: Done) => done(null, JSON.stringify([...records, records[1]])));
	await expect(providerApiKey("FIRECRAWL_API_KEY")).rejects.toThrow("BWS FIRECRAWL_API_KEY unavailable");
	expect(await providerApiKey("FIRECRAWL_API_KEY")).toBe("fixture-firecrawl");
	expect(run).toHaveBeenCalledTimes(2);
});
it("releases an aborted pending lookup so a later call can succeed without reload", async () => {
	run.mockImplementationOnce(() => {});
	const controller = new AbortController();
	const pending = providerApiKey("FIRECRAWL_API_KEY", controller.signal);
	// Resolve the file-read microtask so the uncooperative mocked child starts.
	await Promise.resolve(); await Promise.resolve();
	controller.abort();
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	expect(await providerApiKey("FIRECRAWL_API_KEY")).toBe("fixture-firecrawl");
});
