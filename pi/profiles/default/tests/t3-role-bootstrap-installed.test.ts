import { spawn } from "node:child_process";
import { JsonLines } from "../lib/subagents/framing.ts";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { resolveRoleSnapshot } from "../lib/subagents/authority.ts";
import { createHandoffStore } from "../lib/subagents/t3/handoffs.ts";

const manifest = resolve("node_modules/@earendil-works/pi-coding-agent/package.json");
const cli = resolve(dirname(manifest), JSON.parse(readFileSync(manifest, "utf8")).bin.pi);
it("installed Pi binds the private command before its first request and enforces the loadout", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-t3-installed-bootstrap-"));
  const profile = join(root, "profile"), cwd = join(root, "project"), evidence = join(root, "requests.jsonl");
  mkdirSync(join(profile, "agents"), { recursive: true }); mkdirSync(join(profile, "skills", "testing"), { recursive: true }); mkdirSync(cwd);
  writeFileSync(join(cwd, "evidence.txt"), "PERMITTED_READ_EVIDENCE");
  writeFileSync(join(profile, "agents", "reader.md"), "---\nname: reader\ndescription: Inspect\ntools: [read]\nmodel: bootstrap-fixture/reader\neffort: low\nskills: [testing]\n---\nFIRST_REQUEST_ROLE_AUTHORITY");
  writeFileSync(join(profile, "skills", "testing", "SKILL.md"), "FIRST_REQUEST_SELECTED_SKILL");
  const snapshot = resolveRoleSnapshot({ agent: "reader", backend: "t3", profile, cwd, projectTrusted: false });
  const store = createHandoffStore(profile);
  await store.create({ version: 1, launchId: "installed", snapshot, commissioner: { threadId: "parent", runId: "parent-run", piSessionId: "parent-session", piSessionFile: "parent.jsonl", profile, cwd }, assignment: "Inspect only.", workspace: { isolation: "shared", commissioningCwd: cwd } });
  const run = async (id: string): Promise<{ stdout: string }> => {
    const child = spawn(process.execPath, [cli, "--mode", "rpc", "--offline", "--no-session", "--no-extensions", "--no-skills", "--no-context-files", "--no-prompt-templates", "-e", resolve("tests/fixtures/t3-bootstrap-provider.ts"), "--model", "bootstrap-fixture/reader"], { cwd, env: { ...process.env, PI_CODING_AGENT_DIR: profile, PI_SUBAGENT_AUTHORITY: "", PI_SUBAGENT_ENDPOINT: "", PI_T3_BOOTSTRAP_EVIDENCE: evidence }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    const exited = new Promise<void>(done => child.once("close", () => done()));
    try {
      await new Promise<void>((done, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Installed bootstrap timeout: ${stdout} ${stderr}`)), 25000);
        const finish = () => { clearTimeout(timeout); done(); };
        const frames = new JsonLines(value => {
          const event = value as { type?: string; id?: string };
          if ((id === "unknown" && event.type === "response" && event.id === "bootstrap") || (id !== "unknown" && event.type === "agent_end")) finish();
        });
        child.stdout.on("data", chunk => { stdout += String(chunk); frames.push(chunk); });
        child.once("error", error => { clearTimeout(timeout); reject(error); });
        child.once("exit", () => { clearTimeout(timeout); reject(new Error(`Installed Pi exited: ${stderr}`)); });
        child.stdin.write(JSON.stringify({ type: "prompt", id: "bootstrap", message: `/t3-role-bootstrap ${id}` }) + "\n");
      });
      return { stdout };
    } finally { child.kill(); await exited; }
  };
  try {
    await run("unknown"); expect(existsSync(evidence)).toBe(false);
    const output = await run("installed");
    const requests = readFileSync(evidence, "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(requests[0].tools).toEqual(["read"]);
    expect(requests[0].prompt).toContain("FIRST_REQUEST_ROLE_AUTHORITY");
    expect(requests[0].prompt).toContain("FIRST_REQUEST_SELECTED_SKILL");
    expect(output.stdout).toContain("PERMITTED_READ_EVIDENCE");
    expect(output.stdout).toContain("blocked-write");
    expect(existsSync(join(cwd, "escape.txt"))).toBe(false);
    expect(requests.length).toBeGreaterThan(1);
    const results = requests[1].messages.filter((message: { role: string }) => message.role === "toolResult");
    expect(results.find((result: { toolCallId: string }) => result.toolCallId === "allowed-read").isError).toBe(false);
    for (const id of ["blocked-write", "blocked-codemode", "blocked-raw"]) expect(results.find((result: { toolCallId: string }) => result.toolCallId === id).isError).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 60000);
