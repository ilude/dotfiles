import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_GATEWAY_URL, GATEWAY_SECRET_ID } from "./gateway-config.ts";

const directory = dirname(fileURLToPath(import.meta.url));

type Exec = (command: string, args: string[], options?: { timeout?: number; signal?: AbortSignal }) => Promise<{ code: number; killed: boolean; stdout: string; stderr: string }>;
export type GatewayCredentials = { endpoint: string; token: string };

let cached: GatewayCredentials | undefined;
let pending: Promise<GatewayCredentials> | undefined;

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

export function resetGatewayCredentialCacheForTest(): void { cached = undefined; pending = undefined; }
