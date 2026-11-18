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
it.each([false, true])("installed Pi binds and enforces the role loadout (coordinator=%s)", async coordinator => {
  const root = mkdtempSync(join(tmpdir(), "pi-t3-installed-bootstrap-"));
  const profile = join(root, "profile"), cwd = join(root, "project"), evidence = join(root, "requests.jsonl");
  mkdirSync(join(profile, "agents"), { recursive: true }); mkdirSync(join(profile, "skills", "testing"), { recursive: true }); mkdirSync(cwd);
  writeFileSync(join(cwd, "evidence.txt"), "PERMITTED_READ_EVIDENCE");
  writeFileSync(join(profile, "agents", "reader.md"), "---\nname: reader\ndescription: Inspect\ntools: [read]\nmodel: bootstrap-fixture/reader\neffort: low\nskills: [testing]\n---\nFIRST_REQUEST_ROLE_AUTHORITY");
  writeFileSync(join(profile, "skills", "testing", "SKILL.md"), "FIRST_REQUEST_SELECTED_SKILL");
  writeFileSync(join(profile, "agents", "team-lead.md"), "---\nname: team-lead\ndescription: Coordinate\ntools: [subagent]\ndelegates: [strategist]\nmodel: bootstrap-fixture/reader\neffort: low\nskills: [testing]\n---\nFIRST_REQUEST_ROLE_AUTHORITY");
  writeFileSync(join(profile, "agents", "strategist.md"), "---\nname: strategist\ndescription: Plan\ntools: [read]\nmodel: bootstrap-fixture/reader\neffort: low\n---\nPlan only.");
  const snapshot = resolveRoleSnapshot({ agent: coordinator ? "team-lead" : "reader", backend: "t3", profile, cwd, projectTrusted: false });
  const store = createHandoffStore(profile);
  await store.create({ version: 1, launchId: "installed", snapshot, commissioner: { threadId: "parent", runId: "parent-run", piSessionId: "parent-session", piSessionFile: "parent.jsonl", profile, cwd }, assignment: "Inspect only.", workspace: { isolation: "shared", commissioningCwd: cwd } });
  const run = async (id: string): Promise<{ stdout: string }> => {
    const child = spawn(process.execPath, [cli, "--mode", "rpc", "--offline", "--session", join(root, `${id}.jsonl`), "--no-extensions", "--no-skills", "--no-context-files", "--no-prompt-templates", "-e", resolve("tests/fixtures/t3-bootstrap-provider.ts"), "-e", resolve("tests/fixtures/t3-bootstrap-bridge.ts"), "--model", "bootstrap-fixture/reader"], { cwd, env: { ...process.env, PI_CODING_AGENT_DIR: profile, PI_SUBAGENT_AUTHORITY: "", PI_SUBAGENT_ENDPOINT: "", PI_T3_BOOTSTRAP_EVIDENCE: evidence, PI_T3_BOOTSTRAP_COORDINATOR: coordinator ? "1" : "0" }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
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
    expect(requests[0].tools).toEqual([coordinator ? "t3_delegate_role" : "read"]);
    expect(requests[0].prompt).toContain("FIRST_REQUEST_ROLE_AUTHORITY");
    expect(requests[0].prompt).toContain("FIRST_REQUEST_SELECTED_SKILL");
    if (!coordinator) expect(output.stdout).toContain("PERMITTED_READ_EVIDENCE");
    expect(output.stdout).toContain("blocked-write");
    expect(existsSync(join(cwd, "escape.txt"))).toBe(false);
    expect(requests.length).toBeGreaterThan(1);
    const results = requests[1].messages.filter((message: { role: string }) => message.role === "toolResult");
    expect(results.find((result: { toolCallId: string }) => result.toolCallId === (coordinator ? "nested-strategist" : "allowed-read")).isError).toBe(false);
    for (const id of coordinator ? ["blocked-write", "blocked-direct-raw", "blocked-hidden-raw"] : ["blocked-write", "blocked-codemode", "blocked-raw"]) expect(results.find((result: { toolCallId: string }) => result.toolCallId === id).isError).toBe(true);
    if (coordinator) {
      for (const request of requests) {
        expect(request.tools).toEqual(["t3_delegate_role"]);
        expect(request.prompt).not.toContain("RAW_BRIDGE_DECLARATION_MUST_STAY_PRIVATE");
        expect(request.prompt).not.toContain("t3_role_bridge_loadout");
      }
      const operations = readFileSync(`${evidence}.bridge`, "utf8").trim().split("\n").map(line => JSON.parse(line));
      expect(operations).toEqual(["Plan offline", "Plan again offline"].map(assignment => expect.objectContaining({ task: expect.stringMatching(new RegExp(`^/t3-role-bootstrap [a-f0-9]+\\n\\n${assignment}$`)), mode: "wait", target: { providerInstanceId: "offline-pi", model: "bootstrap-fixture/reader" } })));
      const laterResults = requests[2].messages.filter((message: { role: string }) => message.role === "toolResult");
      expect(laterResults.find((result: { toolCallId: string }) => result.toolCallId === "nested-strategist-again").isError).toBe(false);
      const [nested] = await store.ownedHandoffs("child");
      expect(nested.snapshot.definition.name).toBe("strategist");
      expect(nested.commissioner.parentLaunchId).toBe("installed");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 60000);
