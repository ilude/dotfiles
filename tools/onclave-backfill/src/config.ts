import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";

export const DEFAULT_CACHE_ROOT = join(homedir(), ".dotfiles", "yt");
export const DEFAULT_CONFIG_PATH = join(DEFAULT_CACHE_ROOT, "onclave-backfill.json");
export const DEFAULT_STATE_PATH = join(DEFAULT_CACHE_ROOT, "onclave-backfill-state.json");
export const DEFAULT_LOCK_PATH = join(DEFAULT_CACHE_ROOT, "onclave-backfill.lock");
export const DEFAULT_LOG_PATH = join(DEFAULT_CACHE_ROOT, "onclave-backfill.log");
export const TRANSCRIPT_LIMIT_BYTES = 5 * 1024 * 1024;

export type BackfillConfig = {
  endpoint: string;
  keyPath: string;
  cacheRoot: string;
  statePath: string;
  lockPath: string;
  logPath: string;
  executablePath?: string;
  artifactPath?: string;
};

type ConfigFile = Partial<Record<
  "endpoint" | "key_path" | "cache_root" | "state_path" | "lock_path" | "log_path" | "executable_path" | "artifact_path",
  unknown
>>;

function stringValue(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Backfill configuration field ${name} must be a non-empty string`);
  return value.trim();
}

function absolute(value: string, base: string): string {
  return isAbsolute(value) ? value : resolve(base, value);
}

export function normalizeEndpoint(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Backfill endpoint must be a valid http or https URL"); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Backfill endpoint must be an origin or end in /api/v1");
  }
  if (parsed.pathname === "/" || parsed.pathname === "/api/v1" || parsed.pathname === "/api/v1/") parsed.pathname = "/api/v1/";
  else throw new Error("Backfill endpoint must be an origin or end in /api/v1");
  return parsed.toString();
}

export function defaultConfig(): BackfillConfig {
  return {
    endpoint: "",
    keyPath: join(homedir(), ".ssh", "id_ed25519"),
    cacheRoot: DEFAULT_CACHE_ROOT,
    statePath: DEFAULT_STATE_PATH,
    lockPath: DEFAULT_LOCK_PATH,
    logPath: DEFAULT_LOG_PATH,
  };
}

export async function loadConfig(configPath = DEFAULT_CONFIG_PATH): Promise<BackfillConfig> {
  const path = resolve(configPath);
  let parsed: ConfigFile;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as ConfigFile;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Backfill configuration is malformed: ${path}`);
    if (error instanceof Error && "code" in error && error.code === "ENOENT") throw new Error(`Backfill configuration is missing: ${path}`);
    throw new Error(`Backfill configuration cannot be read: ${path}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Backfill configuration must be an object: ${path}`);
  const base = dirname(path);
  const endpoint = stringValue(parsed.endpoint, "endpoint");
  if (endpoint === undefined) throw new Error("Backfill configuration requires endpoint");
  const keyPath = absolute(stringValue(parsed.key_path, "key_path") ?? defaultConfig().keyPath, base);
  const cacheRoot = absolute(stringValue(parsed.cache_root, "cache_root") ?? DEFAULT_CACHE_ROOT, base);
  const statePath = absolute(stringValue(parsed.state_path, "state_path") ?? join(cacheRoot, "onclave-backfill-state.json"), base);
  const lockPath = absolute(stringValue(parsed.lock_path, "lock_path") ?? join(cacheRoot, "onclave-backfill.lock"), base);
  const logPath = absolute(stringValue(parsed.log_path, "log_path") ?? join(cacheRoot, "onclave-backfill.log"), base);
  return {
    endpoint: normalizeEndpoint(endpoint), keyPath, cacheRoot, statePath, lockPath, logPath,
    executablePath: stringValue(parsed.executable_path, "executable_path") === undefined ? undefined : absolute(parsed.executable_path as string, base),
    artifactPath: stringValue(parsed.artifact_path, "artifact_path") === undefined ? undefined : absolute(parsed.artifact_path as string, base),
  };
}
