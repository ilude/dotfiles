import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The adapter must also run as plain Node outside the Pi profile.
import { resolveInstalledPiEntry, runPiAdapter } from "../../../../scripts/t3-pi.mjs";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "T3 Pi adapter ")); roots.push(root); return root;
}

describe("T3 provider maintenance", () => {
  it("handles T3's native update argv using the shared installation/link-refresh pass", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const release = vi.fn().mockResolvedValue(undefined), lock = vi.fn().mockResolvedValue(release);
    const update = vi.fn().mockResolvedValue({ installed: true, linked: true, version: "2.0.0" });
    const resolveEntry = vi.fn();
    await expect(runPiAdapter(["update", "--self"], { lock, update, resolveEntry })).resolves.toEqual({ code: 0, signal: null });
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0].env.PI_CODING_AGENT_DIR).toBeTruthy();
    expect(release).toHaveBeenCalledOnce();
    expect(resolveEntry).not.toHaveBeenCalled();
  });
  it("reports a failed link refresh as update failure and releases the shared lock", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const release = vi.fn().mockResolvedValue(undefined);
    await expect(runPiAdapter(["update", "--self"], {
      lock: async () => release,
      update: async () => ({ installed: true, linked: false, error: "link refresh failed" }),
    })).rejects.toThrow("link refresh failed");
    expect(release).toHaveBeenCalledOnce();
  });
});

describe("installed Pi resolution", () => {
  it("uses pnpm's current installation and its declared bin rather than a version/hash path", async () => {
    const root = await fixtureRoot(), entry = join(root, "future CLI.mjs");
    await writeFile(entry, "");
    await writeFile(join(root, "package.json"), JSON.stringify({ bin: { pi: "future CLI.mjs" } }));
    const run = vi.fn().mockResolvedValue({ stdout: JSON.stringify([{ dependencies: { "@earendil-works/pi-coding-agent": { path: root } } }]) });
    await expect(resolveInstalledPiEntry(process.env, run, "win32")).resolves.toBe(entry);
    expect(run.mock.calls[0][0]).toBe("pwsh");
    expect(run.mock.calls[0][1].at(-1)).toContain("pnpm list -g --json --depth -1");
  });
  it("fails visibly when pnpm no longer reports the expected installation", async () => {
    await expect(resolveInstalledPiEntry({}, async () => ({ stdout: "[]" }))).rejects.toThrow("Cannot resolve the installed global Pi");
  });
});

describe("Pi process boundary", () => {
  it.each([0, 7])("forwards argv, RPC streams, cwd, T3 environment and exit code %s", async exitCode => {
    const root = await fixtureRoot(), entry = join(root, "fake Pi entry.mjs"), cwd = join(root, "workspace with spaces");
    await mkdir(cwd);
    await writeFile(entry, `
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => { input += chunk; });
      process.stdin.on("end", () => {
        console.log(JSON.stringify({ args: process.argv.slice(2), input, cwd: process.cwd(),
          marker: process.env.T3_PI_MCP_EXTENSION_PATH, profile: process.env.PI_CODING_AGENT_DIR }));
        console.error("fixture diagnostic");
        process.exitCode = ${exitCode};
      });
    `);
    const adapter = pathToFileURL(fileURLToPath(new URL("../../../../scripts/t3-pi.mjs", import.meta.url))).href;
    const runner = `import { runPiAdapter } from ${JSON.stringify(adapter)};
      const result = await runPiAdapter(process.argv.slice(1), { resolveEntry: async () => ${JSON.stringify(entry)} });
      process.exitCode = result.code ?? 1;`;
    const args = ["--mode", "rpc", "--extension", 'path with spaces & "quotes" $literal é', "update", "--self", "extra"];
    const input = '{"id":"state","type":"get_state"}\n';
    const child = spawn(process.execPath, ["--input-type=module", "-e", runner, "--", ...args], {
      cwd, env: { ...process.env, T3_PI_MCP_EXTENSION_PATH: "T3 fixture", PI_CODING_AGENT_DIR: root },
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.stdin.end(input);
    const code = await new Promise<number | null>((accept, reject) => { child.once("error", reject); child.once("close", accept); });
    expect(code).toBe(exitCode);
    expect(JSON.parse(stdout)).toEqual({ args, input, cwd, marker: "T3 fixture", profile: root });
    expect(stderr.trim()).toBe("fixture diagnostic");
  });
});
