import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const credentialScript = join(dirname(fileURLToPath(import.meta.url)), "../extensions/web-tools/credential.py");
export type BrowserCredentialBinding = {
  record_id: string;
  expected_key: string;
  origins: string[];
  frame_origins?: string[];
  fields: string[];
  form_origins?: string[];
};
export type BrowserCredentialConfig = { version: 1; bindings: Record<string, BrowserCredentialBinding> };
export type CredentialTarget = { origin: string; frameOrigin: string; field: string; formOrigin?: string };
type Exec = (command: string, args: string[], options: { timeout: number; signal: AbortSignal }) => Promise<{ code: number; killed: boolean; stdout: string; stderr: string }>;

export function parseBrowserCredentialConfig(value: unknown): BrowserCredentialConfig {
  if (!isRecord(value) || !onlyKeys(value, ["version", "bindings"]) || value.version !== 1 || !isRecord(value.bindings)) throw new Error("Invalid browser credential configuration");
  const bindings: Record<string, BrowserCredentialBinding> = {};
  for (const [reference, candidate] of Object.entries(value.bindings)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(reference) || !isRecord(candidate)
      || !onlyKeys(candidate, ["record_id", "expected_key", "origins", "frame_origins", "fields", "form_origins"])
      || !nonempty(candidate.record_id) || !nonempty(candidate.expected_key)
      || !origins(candidate.origins) || !strings(candidate.fields) || (candidate.form_origins !== undefined && !origins(candidate.form_origins))
      || (candidate.frame_origins !== undefined && !origins(candidate.frame_origins))) throw new Error("Invalid browser credential binding");
    bindings[reference] = {
      record_id: candidate.record_id, expected_key: candidate.expected_key,
      origins: [...candidate.origins], fields: [...candidate.fields],
      ...(candidate.frame_origins ? { frame_origins: [...candidate.frame_origins] } : {}),
      ...(candidate.form_origins ? { form_origins: [...candidate.form_origins] } : {}),
    };
  }
  return { version: 1, bindings };
}

/** Session-owned exact-record resolver. It returns only to the trusted fill executor,
 * coalesces concurrent reads, and drops all retained values on clear/abort.
 */
export function createBrowserCredentialResolver(config: BrowserCredentialConfig, exec: Exec, lifetime: AbortSignal) {
  config = parseBrowserCredentialConfig(config);
  const records = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  let disposed = false;
  const clear = () => { disposed = true; records.clear(); pending.clear(); };
  lifetime.addEventListener("abort", clear, { once: true });

  return {
    async resolve(reference: string, target: CredentialTarget, signal: AbortSignal): Promise<string> {
      const binding = config.bindings[reference];
      if (disposed || lifetime.aborted || signal.aborted) throw new Error("Browser credential operation canceled");
      if (!binding || !binding.origins.includes(canonicalOrigin(target.origin))
        || !(binding.frame_origins ?? binding.origins).includes(canonicalOrigin(target.frameOrigin))
        || !binding.fields.includes(target.field)
        || (target.formOrigin !== undefined
          && !(binding.form_origins ?? binding.frame_origins ?? binding.origins).includes(canonicalOrigin(target.formOrigin))))
        throw new Error("Browser credential destination is not bound");
      let request = pending.get(reference);
      if (!request && !records.has(reference)) {
        request = (async () => {
          if (!process.env.BITWARDEN_ACCESS_KEY) throw new Error("Browser credential unavailable");
          let result;
          try {
            result = await exec("uv", ["run", "--with", "bitwarden-sdk==2.1.0", "python", credentialScript, binding.record_id], { timeout: 20_000, signal: lifetime });
          } catch { throw new Error("Browser credential unavailable"); }
          if (result.killed || result.code !== 0 || signal.aborted || lifetime.aborted || disposed) throw new Error("Browser credential unavailable");
          let record: unknown;
          try { record = JSON.parse(result.stdout); } catch { throw new Error("Browser credential unavailable"); }
          if (!isRecord(record) || record.key !== binding.expected_key || typeof record.value !== "string" || !record.value)
            throw new Error("Browser credential record mismatch");
          return record.value;
        })();
        pending.set(reference, request);
      }
      try {
        const value = records.get(reference) ?? await awaitOperation(request!, signal);
        if (signal.aborted || lifetime.aborted || disposed) throw new Error("Browser credential operation canceled");
        if (!records.has(reference)) records.set(reference, value);
        return value;
      } finally { if (pending.get(reference) === request) pending.delete(reference); }
    },
    clear() { lifetime.removeEventListener("abort", clear); clear(); },
  };
}

export function browserCredentialConfigPath(profileDirectory: string): string { return join(profileDirectory, "browser-credentials.json"); }

function canonicalOrigin(value: string): string {
  try { const url = new URL(value); if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) throw new Error(); url.hostname = url.hostname.replace(/\.+$/, ""); if (!url.hostname) throw new Error(); return url.origin; }
  catch { throw new Error("Invalid browser credential origin"); }
}
function origins(value: unknown): value is string[] { return strings(value) && value.every(origin => { try { return canonicalOrigin(origin) === origin; } catch { return false; } }); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.length > 0 && value.every(item => nonempty(item)); }
function nonempty(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.trim() === value; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function onlyKeys(value: Record<string, unknown>, allowed: string[]): boolean { return Object.keys(value).every(key => allowed.includes(key)); }
function awaitOperation<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("Browser credential operation canceled"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Browser credential operation canceled"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
