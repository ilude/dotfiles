function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid T3 metadata response");
  return value as Record<string, unknown>;
}
export interface T3McpClientOptions {
  url?: string;
  bearerToken?: string;
  fetch?: typeof globalThis.fetch;
}

/** Direct host requests for profile commands and metadata, not model tool composition. */
export function createT3McpClient(options: T3McpClientOptions = {}) {
  const endpoint = options.url ?? process.env.T3_MCP_URL;
  const token = options.bearerToken ?? process.env.T3_MCP_BEARER_TOKEN;
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!endpoint || !token) throw new Error("T3 metadata service unavailable");
  const authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  const protocol = "2025-06-18";
  let sessionId: string | undefined;
  let nextId = 1;
  let connection: Promise<void> | undefined;
  const headers = (): Record<string, string> => ({
    authorization, "content-type": "application/json", accept: "application/json, text/event-stream",
    "mcp-protocol-version": protocol, ...(sessionId ? { "mcp-session-id": sessionId } : {}),
  });
  const post = async (payload: Record<string, unknown>): Promise<Response> => {
    let response: Response;
    try { response = await fetcher(endpoint, { method: "POST", headers: headers(), body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) }); }
    catch { throw new Error("T3 metadata service unavailable"); }
    if (!response.ok) throw new Error(`T3 metadata HTTP request failed (${response.status})`);
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    return response;
  };
  async function request(method: string, params?: unknown): Promise<unknown> {
    const id = nextId++;
    const response = await post({ jsonrpc: "2.0", id, method, params });
    let envelope: Record<string, unknown> | undefined;
    try {
      if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
        for (const event of (await response.text()).split(/\r?\n\r?\n/)) {
          const data = event.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
          if (!data) continue;
          const candidate = record(JSON.parse(data));
          if (candidate.id === id) { envelope = candidate; break; }
        }
      } else {
        envelope = record(await response.json());
      }
    } catch { throw new Error("Invalid T3 metadata response"); }
    if (!envelope || envelope.id !== id) throw new Error("Invalid T3 metadata response identity");
    if (envelope.error) throw new Error("T3 metadata request failed");
    return envelope.result;
  }
  async function initialize(): Promise<void> {
    if (!connection) {
      const opening = (async () => {
        await request("initialize", { protocolVersion: protocol, capabilities: {}, clientInfo: { name: "pi-t3-profile", version: "1" } });
        await post({ jsonrpc: "2.0", method: "notifications/initialized" });
      })();
      connection = opening;
      void opening.catch(() => { if (connection === opening) { connection = undefined; sessionId = undefined; } });
    }
    return connection;
  }
  async function call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    await initialize();
    const result = record(await request("tools/call", { name, arguments: args }));
    if (result.isError === true) throw new Error(`T3 metadata ${name} lookup failed`);
    if (result.structuredContent !== undefined) return result.structuredContent;
    if (Array.isArray(result.content)) {
      const part = result.content.find(value => value && typeof value === "object" && "text" in value && typeof value.text === "string");
      if (part && typeof part.text === "string") {
        try { return JSON.parse(part.text); } catch { throw new Error("Invalid T3 metadata tool result"); }
      }
    }
    throw new Error("Invalid T3 metadata tool result");
  }
  return { call };
}
