import https from "node:https";

export type FetchBackend = "auto" | "direct" | "trawl" | "jina";
export type GatewayReply = {
	ok: boolean; request_id: string; requested_url: string; final_url: string | null;
	fetched_at: string; elapsed_ms: number; attempts: Array<Record<string, unknown>>;
	backend?: string; title?: string | null; content?: string; format?: string;
	quality?: string; truncated?: boolean; warnings?: string[];
	error?: { code: string; message: string };
};
export class GatewayError extends Error {
	readonly kind: "availability" | "configuration" | "acquisition";
	constructor(kind: GatewayError["kind"], message: string) { super(message); this.kind = kind; }
}
export function validateGatewayReply(value: unknown): GatewayReply {
	const reply = value as GatewayReply;
	if (!reply || typeof reply !== "object" || typeof reply.ok !== "boolean" || typeof reply.request_id !== "string"
		|| typeof reply.requested_url !== "string" || !(reply.final_url === null || typeof reply.final_url === "string")
		|| typeof reply.fetched_at !== "string" || !Number.isFinite(reply.elapsed_ms) || !Array.isArray(reply.attempts)
		|| reply.attempts.length > 3 || reply.attempts.some(a => !a || !["direct", "trawl", "jina"].includes(String(a.backend))
			|| !["useful", "partial", "failed", "cancelled"].includes(String(a.outcome))))
		throw new GatewayError("availability", "Gateway returned an invalid receipt");
	if (reply.ok && (typeof reply.content !== "string" || reply.content.length > 50000
		|| !["direct", "trawl", "jina"].includes(reply.backend ?? "") || !["useful", "partial"].includes(reply.quality ?? "")
		|| !["text", "markdown"].includes(reply.format ?? "") || typeof reply.truncated !== "boolean"
		|| !Array.isArray(reply.warnings) || reply.warnings.some(w => typeof w !== "string")))
		throw new GatewayError("availability", "Gateway returned invalid content");
	if (!reply.ok && (!reply.error || typeof reply.error.code !== "string" || typeof reply.error.message !== "string"))
		throw new GatewayError("availability", "Gateway returned an invalid error");
	return reply;
}
export async function withinSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	let cancel: () => void = () => {};
	const aborted = new Promise<never>((_, reject) => { cancel = () => reject(signal.reason); signal.addEventListener("abort", cancel, { once: true }); });
	const pending = Promise.race([work, aborted]);
	if (signal.aborted) cancel();
	try { return await pending; } finally { signal.removeEventListener("abort", cancel); }
}
export async function requestGateway(endpoint: string, token: string,
	input: { url: string; max_chars: number; backend: FetchBackend }, signal: AbortSignal): Promise<GatewayReply> {
	let url: URL;
	try { url = new URL(endpoint); } catch { throw new GatewayError("configuration", "Invalid WEB_FETCH_GATEWAY_URL"); }
	if (url.protocol !== "https:" || url.username || url.password || !token)
		throw new GatewayError("configuration", "Gateway requires an HTTPS endpoint and WEB_FETCH_GATEWAY_TOKEN");
	url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/fetch`; url.search = ""; url.hash = "";
	const body = JSON.stringify(input);
	return new Promise((resolve, reject) => {
		const req = https.request(url, { method: "POST", signal, headers: {
			authorization: `Bearer ${token}`, "content-type": "application/json", "content-length": Buffer.byteLength(body),
		} }, response => {
			clearTimeout(connectTimer);
			const status = response.statusCode ?? 502;
			if (status === 401 || status === 403) { response.resume(); reject(new GatewayError("configuration", "Gateway authentication failed")); return; }
			const chunks: Buffer[] = []; let bytes = 0;
			response.on("data", (chunk: Buffer) => {
				bytes += chunk.length;
				if (bytes > 300_000) { response.destroy(new Error("Gateway response exceeded bounds")); return; }
				chunks.push(chunk);
			});
			response.on("error", () => reject(new GatewayError("availability", "Gateway response transport failed")));
			response.on("end", () => {
				try {
					let value: unknown;
					try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
					catch { throw new GatewayError("availability", `Gateway returned an invalid HTTP ${status} response`); }
					const reply = validateGatewayReply(value);
					if (!reply.ok) {
						if (["backend_unavailable", "overloaded"].includes(reply.error!.code)) throw new GatewayError("availability", "Gateway unavailable or overloaded");
						if (reply.error!.code === "invalid_request") throw new GatewayError("configuration", `Gateway request rejected: ${reply.error!.code}`);
						throw new GatewayError("acquisition", `Gateway acquisition failed: ${reply.error!.code}`);
					}
					if (status !== 200) throw new GatewayError("availability", "Gateway HTTP status contradicts its result");
					resolve(reply);
				} catch (error) { reject(error); }
			});
		});
		// Connection establishment is separate from the potentially long browser response.
		const connectTimer = setTimeout(() => req.destroy(new Error("Gateway connection deadline exceeded")), 3000);
		req.on("socket", socket => {
			if (!socket.connecting) clearTimeout(connectTimer);
			else socket.once("secureConnect", () => clearTimeout(connectTimer));
		});
		req.on("error", () => { clearTimeout(connectTimer); reject(new GatewayError("availability", "Gateway connection unavailable")); });
		req.end(body);
	});
}
export function gatewayText(reply: GatewayReply): string {
	// Metadata is untrusted too and is included in the one final Luna review.
	return [`Source: ${reply.final_url ?? reply.requested_url}`, `Gateway backend: ${reply.backend}; quality: ${reply.quality}`,
		reply.title ? `# ${reply.title}` : "", reply.content ?? "",
		reply.truncated ? "[Truncated by gateway]" : "", ...(reply.warnings ?? []),
		`Acquisition receipt: ${JSON.stringify({ request_id: reply.request_id, fetched_at: reply.fetched_at, elapsed_ms: reply.elapsed_ms,
			attempts: reply.attempts.map(a => ({ backend: a.backend, revision: a.revision, elapsed_ms: a.elapsed_ms, outcome: a.outcome, reason: a.reason, http_status: a.http_status, tier: a.tier })) })}`,
	].filter(Boolean).join("\n\n");
}
