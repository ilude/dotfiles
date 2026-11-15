import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_GATEWAY_URL, GATEWAY_SECRET_ID } from "./gateway-config.ts";
import { withinSignal } from "./acquisition.ts";

const directory = dirname(fileURLToPath(import.meta.url));

type Exec = (command: string, args: string[], options?: { timeout?: number; signal?: AbortSignal }) => Promise<{ code: number; killed: boolean; stdout: string; stderr: string }>;
export type GatewayCredentials = { endpoint: string; token: string };

const SEARCH_SECRET_IDS = {
	SERPER_API_KEY: "ea0291ce-1988-4eb4-b10c-b4c3001e6036",
	BRAVE_SEARCH_API_KEY: "368cdc8f-2b67-4e1c-8a8d-b4c3001e7a6f",
} as const;

let cached: GatewayCredentials | undefined;
let pending: Promise<GatewayCredentials> | undefined;
const searchKeyCache = new Map<keyof typeof SEARCH_SECRET_IDS, string>();
const searchKeyPending = new Map<keyof typeof SEARCH_SECRET_IDS, Promise<string>>();

function validate(endpoint: string, token: string): GatewayCredentials {
	let url: URL;
	try { url = new URL(endpoint); } catch { throw new Error("Invalid WEB_FETCH_GATEWAY_URL"); }
	if (url.protocol !== "https:" || url.username || url.password || !token)
		throw new Error("Gateway requires HTTPS and WEB_FETCH_GATEWAY_TOKEN");
	return { endpoint: url.href.replace(/\/$/, ""), token };
}

export async function gatewayCredentials(exec: Exec, signal?: AbortSignal): Promise<GatewayCredentials> {
	const environmentToken = process.env.WEB_FETCH_GATEWAY_TOKEN;
	if (environmentToken) return validate(process.env.WEB_FETCH_GATEWAY_URL ?? DEFAULT_GATEWAY_URL, environmentToken);
	if (cached) return cached;
	if (!pending) pending = (async () => {
		const result = await exec("uv", ["run", "--with", "bitwarden-sdk==2.1.0", "python", join(directory, "credential.py"), GATEWAY_SECRET_ID], { timeout: 20_000, signal });
		if (result.killed || result.code !== 0) throw new Error("BWS gateway credential unavailable");
		let record: unknown;
		try { record = JSON.parse(result.stdout); } catch { throw new Error("BWS returned an invalid gateway credential"); }
		if (!record || typeof record !== "object" || (record as { key?: unknown }).key !== "WEB_FETCH_GATEWAY_CLIENT")
			throw new Error("BWS returned the wrong gateway credential");
		let value: unknown;
		try { value = JSON.parse(String((record as { value?: unknown }).value ?? "")); }
		catch { throw new Error("BWS gateway credential has an invalid value"); }
		if (!value || typeof value !== "object" || typeof (value as { token?: unknown }).token !== "string")
			throw new Error("BWS gateway credential has an invalid value");
		const configured = value as { url?: unknown; token: string };
		const endpoint = process.env.WEB_FETCH_GATEWAY_URL ?? (typeof configured.url === "string" ? configured.url : DEFAULT_GATEWAY_URL);
		return validate(endpoint, configured.token);
	})();
	try { cached = await pending; return cached; } finally { pending = undefined; }
}

export async function searchApiKey(exec: Exec, name: keyof typeof SEARCH_SECRET_IDS, signal?: AbortSignal): Promise<string | undefined> {
	const environmentKey = process.env[name];
	if (environmentKey) return environmentKey;
	if (!process.env.BITWARDEN_ACCESS_KEY) return undefined;
	const existing = searchKeyCache.get(name);
	if (existing) return existing;
	let request = searchKeyPending.get(name);
	if (!request) {
		request = (async () => {
			const result = await exec("uv", ["run", "--with", "bitwarden-sdk==2.1.0", "python", join(directory, "credential.py"), SEARCH_SECRET_IDS[name]], { timeout: 20_000, signal });
			if (result.killed || result.code !== 0) throw new Error(`BWS ${name} unavailable`);
			let record: unknown;
			try { record = JSON.parse(result.stdout); } catch { throw new Error(`BWS returned an invalid ${name} record`); }
			if (!record || typeof record !== "object" || (record as { key?: unknown }).key !== name || typeof (record as { value?: unknown }).value !== "string" || !(record as { value: string }).value)
				throw new Error(`BWS returned the wrong ${name} record`);
			return (record as { value: string }).value;
		})();
		searchKeyPending.set(name, request);
	}
	try {
		const key = signal ? await withinSignal(request, signal) : await request;
		searchKeyCache.set(name, key);
		return key;
	} finally {
		if (searchKeyPending.get(name) === request) searchKeyPending.delete(name);
	}
}

type ProviderKey = "FIRECRAWL_API_KEY" | "BROWSERBASE_API_KEY";
const providerKeys = new Map<ProviderKey, string>();
const providerPending = new Map<ProviderKey, Promise<string>>();

async function namedProviderKey(name: ProviderKey, signal?: AbortSignal): Promise<string> {
	// The source checkout owns the ignored workstation locator. Never copy it
	// into an execution worktree or create a provider-specific credential store.
	const value: unknown = JSON.parse(await readFile(join(directory, "../../../../../config/bws/settings.local.json"), { encoding: "utf8", signal }));
	if (!value || typeof value !== "object" || !("bws" in value) || !value.bws || typeof value.bws !== "object"
		|| !("project_id" in value.bws) || typeof value.bws.project_id !== "string" || !value.bws.project_id
		|| !("api_server" in value.bws) || typeof value.bws.api_server !== "string") throw new Error("BWS workstation locator unavailable");
	const project = value.bws.project_id;
	const server = new URL(value.bws.api_server);
	if (!["https:", "http:"].includes(server.protocol) || server.username || server.password) throw new Error("Invalid BWS workstation locator");
	const stdout = await new Promise<string>((resolve, reject) => {
		// A direct child can be cancelled without leaving a uv/Python/BWS
		// grandchild. Environment changes remain child-local.
		execFile("bws", ["secret", "list", project, "--output", "json"], {
			encoding: "utf8", signal, timeout: 20_000, maxBuffer: 2 * 1024 * 1024,
			env: { ...process.env, BWS_ACCESS_TOKEN: process.env.BITWARDEN_ACCESS_KEY, BWS_SERVER_URL: server.href.replace(/\/$/, "").replace(/\/api$/, "") },
		}, (error, stdout) => error ? reject(new Error(`BWS ${name} unavailable`)) : resolve(stdout));
	});
	const records: unknown = JSON.parse(stdout);
	if (!Array.isArray(records)) throw new Error("Invalid BWS provider response");
	const matches = records.filter((record: unknown): record is { key: string; value: unknown } =>
		record !== null && typeof record === "object" && "key" in record && record.key === name && "value" in record);
	if (matches.length !== 1 || typeof matches[0].value !== "string" || !matches[0].value) throw new Error(`Expected one nonempty ${name} record`);
	return matches[0].value;
}

export function invalidateProviderApiKey(name: ProviderKey, rejectedKey: string): void {
	if (providerKeys.get(name) === rejectedKey) providerKeys.delete(name);
}

export async function providerApiKey(name: ProviderKey, signal?: AbortSignal): Promise<string | undefined> {
	const environment = process.env[name];
	if (environment) return environment;
	if (!process.env.BITWARDEN_ACCESS_KEY) return undefined;
	const cached = providerKeys.get(name);
	if (cached) return cached;
	let pending = providerPending.get(name);
	if (!pending) {
		pending = namedProviderKey(name, signal).catch(() => { throw new Error(`BWS ${name} unavailable; check the workstation locator and CLI`); });
		providerPending.set(name, pending);
	}
	try {
		const key = signal ? await withinSignal(pending, signal) : await pending;
		providerKeys.set(name, key); return key;
	} finally { if (providerPending.get(name) === pending) providerPending.delete(name); }
}

export function resetGatewayCredentialCacheForTest(): void {
	cached = undefined;
	pending = undefined;
	searchKeyCache.clear();
	searchKeyPending.clear();
	providerKeys.clear(); providerPending.clear();
}
