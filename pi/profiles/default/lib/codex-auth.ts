import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

interface CodexAuth { accessToken: string; accountId?: string; expiresAt?: number }
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
export function resolveCodexAuth(): CodexAuth {
  let auth: Record<string, unknown> | undefined;
  try { auth = object(JSON.parse(readFileSync(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json"), "utf8"))); }
  catch { /* Report a missing CLI sign-in below, never fall back to Pi credentials. */ }
  const tokens = object(auth?.tokens);
  const accessToken = text(tokens?.access_token);
  if (!accessToken || (auth?.auth_mode && auth.auth_mode !== "chatgpt"))
    throw new Error("Codex CLI ChatGPT sign-in unavailable. Keep Pi's native OpenAI login; check the existing Codex CLI sign-in.");
  let claims: Record<string, unknown> | undefined;
  try { claims = object(JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"))); }
  catch { /* Opaque access tokens can still work. */ }
  return {
    accessToken,
    accountId: text(tokens?.account_id) || text(object(claims?.["https://api.openai.com/auth"])?.chatgpt_account_id),
    expiresAt: typeof claims?.exp === "number" && Number.isFinite(claims.exp) ? claims.exp * 1000 : undefined,
  };
}

// Windows package-manager shims are scripts, not spawnable executables. Resolve
// their installed native binary so cancellation owns one process, not a shell tree.
function codexExecutable(): string {
  if (process.platform !== "win32") return "codex";
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    const executable = join(directory, "codex.exe");
    if (existsSync(executable)) return executable;
    let shim: string;
    try { shim = readFileSync(join(directory, "codex.ps1"), "utf8"); } catch { continue; }
    const relative = shim.match(/\$basedir\/([^"\r\n]*\/codex\/bin\/codex\.js)/)?.[1];
    if (!relative) continue;
    const entry = realpathSync(resolve(directory, relative));
    const target = process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
    const pkg = process.arch === "arm64" ? "@openai/codex-win32-arm64" : "@openai/codex-win32-x64";
    let root: string;
    try { root = join(dirname(createRequire(entry).resolve(`${pkg}/package.json`)), "vendor"); }
    catch { root = join(dirname(entry), "..", "vendor"); }
    // Current and earlier packaged CLIs use bin/ and codex/ respectively.
    for (const folder of ["bin", "codex"]) {
      const binary = join(root, target, folder, "codex.exe");
      if (existsSync(binary)) return binary;
    }
  }
  throw new Error("Cannot find the installed Codex CLI for credential renewal.");
}

export async function refreshCodexCliAuth(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  // Codex owns token rotation and persistence. Never copy its refresh token into Pi.
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(codexExecutable(), ["app-server", "--stdio", "-c", 'model_provider="openai"', "-c", 'cli_auth_credentials_store="file"'], {
      cwd: homedir(), shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "", bytes = 0, completed = false, failure: Error | undefined;
    const stop = (error: Error) => { failure ??= error; child.kill(); };
    const abort = () => stop(new Error("Codex CLI credential renewal cancelled."));
    const timer = setTimeout(() => stop(new Error("Codex CLI credential renewal timed out.")), 10_000);
    signal.addEventListener("abort", abort, { once: true });
    const send = (value: unknown) => child.stdin.write(JSON.stringify(value) + "\n");
    child.stdin.on("error", () => stop(new Error("Codex CLI credential renewal transport closed.")));
    child.stderr.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 256 * 1024) stop(new Error("Codex CLI credential renewal output exceeded its limit."));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 256 * 1024) return stop(new Error("Codex CLI credential renewal output exceeded its limit."));
      buffer += chunk.toString("utf8");
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let response: Record<string, unknown> | undefined;
        try { response = object(JSON.parse(line)); }
        catch { return stop(new Error("Invalid Codex CLI credential renewal response.")); }
        if (response?.id !== 1 && response?.id !== 2) continue;
        if (response.error) return stop(new Error("Codex CLI could not renew its existing ChatGPT sign-in."));
        if (response.id === 1) {
          send({ method: "initialized" });
          send({ id: 2, method: "account/read", params: { refreshToken: true } });
        } else {
          const account = object(object(response.result)?.account);
          if (account?.type !== "chatgpt") return stop(new Error("Codex CLI ChatGPT sign-in unavailable."));
          completed = true;
          child.stdin.end();
        }
      }
    });
    child.on("error", () => { failure ??= new Error("Could not start the installed Codex CLI for credential renewal."); });
    child.on("close", code => {
      clearTimeout(timer); signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (!completed || code !== 0) reject(new Error("Codex CLI credential renewal did not complete."));
      else resolvePromise();
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "pi_usage", version: "1" } } });
  });
}
