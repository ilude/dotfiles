import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

export type HerdrEnv = NodeJS.ProcessEnv;
export type HerdrCli = (args: string[], options?: { timeoutMs?: number; signal?: AbortSignal }) => Promise<string>;
export const OUTPUT_LIMIT = 16_000;
export function herdrContext(env: HerdrEnv = process.env) {
  if (env.HERDR_ENV !== "1" || !env.HERDR_SOCKET_PATH || !env.HERDR_PANE_ID || !env.HERDR_WORKSPACE_ID) throw new Error("Herdr caller context unavailable");
  return { pane: env.HERDR_PANE_ID, workspace: env.HERDR_WORKSPACE_ID };
}
export function createHerdrCli(env: HerdrEnv = process.env): HerdrCli {
  return (args, { timeoutMs = 10_000, signal } = {}) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Herdr request cancelled; inspect before retrying"));
    const child = spawn(env.HERDR_BIN_PATH || "herdr", args, { env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", bytes = 0, failure: Error | undefined;
    const stop = (reason: string) => { failure ??= new Error(`${reason}; inspect target before retrying`); child.kill(); };
    const timer = setTimeout(() => stop("Herdr deadline exceeded"), timeoutMs);
    const abort = () => stop("Herdr request cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    const collect = (chunk: Buffer, error: boolean) => {
      bytes += chunk.length;
      if (bytes > 256 * 1024) return stop("Herdr response exceeded limit");
      if (error) stderr += chunk.toString(); else stdout += chunk.toString();
    };
    child.stdout.on("data", chunk => collect(chunk, false));
    child.stderr.on("data", chunk => collect(chunk, true));
    child.on("error", error => { failure = error; });
    child.on("close", code => {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error((stderr || stdout || `Herdr exited ${code}`).slice(0, 2000)));
      else resolve(stdout); // Mutations intentionally return no JSON.
    });
  });
}
export function result(text: string): any {
  const parsed = JSON.parse(text);
  if (!parsed.result || parsed.error) throw new Error("Invalid Herdr response");
  return parsed.result;
}
export function compactPane(pane: any) {
  if (!pane || typeof pane.pane_id !== "string") throw new Error("Herdr omitted pane identity");
  return { pane: pane.pane_id, tab: pane.tab_id, workspace: pane.workspace_id, label: pane.label, cwd: pane.foreground_cwd || pane.cwd, state: pane.agent_status, focused: pane.focused };
}
export async function inspectPane(cli: HerdrCli, pane: string, signal?: AbortSignal) {
  const value = result(await cli(["pane", "get", pane], { signal })).pane;
  if (value?.pane_id !== pane) throw new Error("Herdr target identity changed");
  return value;
}
export async function inspectShell(cli: HerdrCli, pane: string, signal?: AbortSignal) {
  const info = result(await cli(["pane", "process-info", "--pane", pane], { signal })).process_info;
  if (info?.pane_id !== pane || !info.shell_pid) throw new Error("Cannot verify shell identity");
  const foreground = info.foreground_processes;
  if (!Array.isArray(foreground) || foreground.length !== 1 || foreground[0].pid !== info.shell_pid) throw new Error("Target is not an idle supported shell; command not submitted");
  const process = foreground[0];
  const name = String(process.name).replace(/^.*[\\/]/, "").replace(/\.exe$/i, "").toLowerCase();
  const language = name === "pwsh" || name === "powershell" ? "powershell" : name === "bash" ? "bash" : undefined;
  if (!language || !process.cwd || !isAbsolute(process.cwd)) throw new Error("Verified Bash or PowerShell cwd required; command not submitted");
  return { language, cwd: process.cwd as string, pid: process.pid as number, pane };
}
