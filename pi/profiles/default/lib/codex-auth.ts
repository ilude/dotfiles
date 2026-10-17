import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

export const CODEX_QUOTA_PROVIDER = "openai-codex";
export const CODEX_QUOTA_LOGIN = `/login ${CODEX_QUOTA_PROVIDER}`;
export type CodexAuthRegistry = Pick<ModelRegistry, "getProviderAuth">;
type CodexAuthStatus = "login needed" | "auth renewal failed" | "authorization rejected";
export class CodexAuthError extends Error {
  readonly status: CodexAuthStatus;
  constructor(status: CodexAuthStatus, message: string) {
    super(message);
    this.name = "CodexAuthError";
    this.status = status;
  }
}
interface CodexAuth { accessToken: string; accountId?: string }
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export async function resolveCodexAuth(registry: CodexAuthRegistry, signal: AbortSignal): Promise<CodexAuth> {
  signal.throwIfAborted();
  // Pi owns refresh and persistence, including the cross-process credential lock.
  // Cancellation stops this reader, not a refresh that may have rotated a token.
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    let resolved: Awaited<ReturnType<CodexAuthRegistry["getProviderAuth"]>>;
    try { resolved = await Promise.race([registry.getProviderAuth(CODEX_QUOTA_PROVIDER), cancelled]); }
    catch {
      signal.throwIfAborted();
      // Provider exceptions can contain token responses. Do not persist them in reports.
      throw new CodexAuthError("auth renewal failed", `Pi could not resolve or renew Codex quota authorization. Retry /usage; if authorization remains invalid, use ${CODEX_QUOTA_LOGIN} in this profile. Your model login is unchanged.`);
    }
    const accessToken = resolved?.auth.apiKey;
    if (!accessToken) throw new CodexAuthError("login needed", `Codex quota login needed: use ${CODEX_QUOTA_LOGIN} in Pi, then /usage. This is separate from native OpenAI model login; Codex CLI is not required.`);
    let claims: Record<string, unknown> | undefined;
    try { claims = object(JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"))); }
    catch { /* Opaque access tokens can still work without an account header. */ }
    const accountId = object(claims?.["https://api.openai.com/auth"])?.chatgpt_account_id;
    return { accessToken, accountId: typeof accountId === "string" && accountId ? accountId : undefined };
  } finally { signal.removeEventListener("abort", onAbort); }
}
