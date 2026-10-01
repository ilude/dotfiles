import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { preparePlanRun } from "../lib/plan-run.ts";
import { loadDefinitions } from "../lib/subagents/definitions.ts";
import type { CloseoutManifest } from "../lib/plan-integration/contracts.ts";
import { isolatedPlanHerdr, git, profile, type Agent, type Pane, type Workspace } from "./fixtures/plan-herdr-live.ts";
import { fixtureIntegratorModel, type CloseoutEvidence } from "./fixtures/plan-closeout-provider.ts";

interface Snapshot {
  origin: string; paneId: string; tabId: string; cwd: string;
  host: { childPid: number; hostPid: number; sessionId: string; sessionFile: string; integrationReady?: { outcome: string; metadata: string; targetCommit: string; archivedPlanVerified: boolean; activeSpecAbsent: boolean }; phase: string; result?: string; error?: string };
}
interface Message { role: string; toolName?: string; toolCallId?: string; isError?: boolean; customType?: string; content?: unknown }
const messages = (evidence: CloseoutEvidence[]) => evidence.filter(row => row.kind === "message-end").map(row => row.message as Message);
const results = (evidence: CloseoutEvidence[], id: string) => messages(evidence).filter(message => message.role === "toolResult" && message.toolCallId === id);
const resultText = (message: Message) => (message.content as { type: string; text?: string }[]).filter(part => part.type === "text").map(part => part.text).join("\n");
const evidenceAt = (file: string): CloseoutEvidence[] => existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as CloseoutEvidence) : [];
const assistantText = (evidence: CloseoutEvidence[]) => messages(evidence).filter(message => message.role === "assistant").map(resultText).filter(Boolean);

// Real installed Pi, production prepared admission/tool facade/readiness/release,
// independent successor host/surface and canonical Git closeout. Only provider
// reasoning/network and disposable implementation inputs are fixture-owned.
describe.skipIf(process.env.PI_PLAN_CLOSEOUT_HERDR_LIVE !== "1")("isolated production real-Pi successor closeout acceptance", () => {
  for (const scenario of ["success", "blocker", "cleanup-failure", "mixed-release"] as const) it(scenario, async () => {
    const fixture = await isolatedPlanHerdr();
    const { scratch, repo, fixtureProfile, cli } = fixture;
    const originEvidence = join(scratch, "origin.jsonl"), successorEvidence = join(scratch, "successor.jsonl"), inputFile = join(scratch, "inputs.json");
    let opened: Pane | undefined;
    try {
      // Bootstrap must expand the real native /do-it while the selected spec is
      // still active. Task implementation/archive/commit are supplied afterward.
      mkdirSync(join(repo, ".specs/acceptance"), { recursive: true });
      writeFileSync(join(repo, ".specs/acceptance/plan.md"), "---\nstatus: in progress\ncompleted: null\n---\n# Acceptance\n- [x] Fixture delivery\n");
      git(repo, "add", ".specs"); git(repo, "commit", "-m", "fixture selected plan");
      writeFileSync(join(repo, ".specs/acceptance/support.txt"), "untracked selected-spec evidence\n");
      const run = preparePlanRun({ originCheckoutPath: repo, specRelativePath: ".specs/acceptance/plan.md" });
      const task = run.taskWorktreePath;
      writeFileSync(join(fixtureProfile, "damage-control-rules.yaml"), readFileSync(join(profile, "damage-control-rules.yaml")));
      writeFileSync(join(fixtureProfile, "package.json"), readFileSync(join(profile, "package.json")));
      for (const dir of ["agents", "skills", "scripts", "lib"]) symlinkSync(join(profile, dir), join(fixtureProfile, dir), "junction");
      mkdirSync(join(fixtureProfile, "prompts"));
      writeFileSync(join(fixtureProfile, "prompts/do-it.md"), readFileSync(join(profile, "prompts/do-it.md")));
      for (const file of ["compaction.ts", "damage-control", "session-profile.ts", "tool-invocation-provenance.ts", "scoped-instructions.ts", "herdr-ui-prompt-state.ts"]) symlinkSync(join(profile, "extensions", file), join(fixtureProfile, "extensions", file), file === "damage-control" ? "junction" : "file");
      const providerPath = join(profile, "tests/fixtures/plan-closeout-provider.ts");
      writeFileSync(join(fixtureProfile, "extensions/closeout-successor.ts"), `import implementation from ${JSON.stringify(join(profile, "extensions/closeout-successor.ts"))};\nimport {registerCloseoutFixture} from ${JSON.stringify(providerPath)};\nexport default function(pi){if(process.env.PI_CLOSEOUT_SUCCESSOR==='1')registerCloseoutFixture(pi,${JSON.stringify({ role: "successor", inputFile, evidenceFile: successorEvidence })});implementation(pi);}\n`);
      // This factory remains the production origin extension. Observation and
      // deterministic provider registration add no replacement command or tool.
      writeFileSync(join(fixtureProfile, "extensions/subagents.ts"), `export {default} from ${JSON.stringify(join(profile, "extensions/subagents.ts"))};\n`);
      writeFileSync(join(fixtureProfile, "extensions/acceptance.ts"), `import {registerCloseoutFixture} from ${JSON.stringify(providerPath)};\nexport default function(pi){registerCloseoutFixture(pi,${JSON.stringify({ role: "origin", inputFile, evidenceFile: originEvidence })});}\n`);
      writeFileSync(join(fixtureProfile, "settings.json"), JSON.stringify({ defaultProjectTrust: "trust", defaultProvider: "closeout-fixture", defaultModel: "deterministic-origin" }));
      const grouped = (await cli<{ result: { workspace: Workspace; root_pane: Pane } }>(["worktree", "open", "--cwd", repo, "--path", task, "--no-focus"])).result;
      opened = (await cli<{ result: { plugin_pane: { pane: Pane } } }>(["plugin", "pane", "open", "--plugin", "local.pi", "--entrypoint", "pi", "--placement", "tab", "--workspace", grouped.workspace.workspace_id, "--cwd", task, "--env", `PI_HERDR_PROFILE_DIR=${fixtureProfile}`, "--env", `PI_HERDR_PLAN_PATH=${run.specRelativePath}`, "--env", `PI_HERDR_PLAN_RUN=${JSON.stringify(run)}`, "--env", "PI_HERDR_TAB_LABEL=acceptance", "--no-focus"])).result.plugin_pane.pane;
      const originPane = opened;
      await vi.waitFor(() => expect(evidenceAt(originEvidence).some(row => row.kind === "settled")).toBe(true), { timeout: 30_000, interval: 200 });
      const initial = evidenceAt(originEvidence).find(row => row.kind === "request")!;
      expect(initial.prompt).toContain("Invocation arguments: .specs/acceptance/plan.md");
      expect(initial.systemPrompt).toContain("## Runtime-issued prepared plan-run context");
      expect(initial.systemPrompt).toContain(JSON.stringify(repo));
      expect(initial.providerSystemPrompt).toContain("## Runtime-issued prepared plan-run context");
      expect(initial.providerSystemPrompt).toContain(JSON.stringify(repo));
      expect(JSON.stringify(initial.messages)).toContain("Invocation arguments: .specs/acceptance/plan.md");
      expect(initial.launchReceiptConsumed).toBe(true);
      expect(initial.authority).toBeNull();
      expect(initial.herdrSocket).toBe(fixture.env.HERDR_SOCKET_PATH);
      expect(resolve(String(initial.cwd))).toBe(resolve(task));
      expect(initial.entries).toEqual(expect.arrayContaining([expect.objectContaining({ type: "custom", customType: "prepared-plan-run", data: { origin: initial.sessionId, receipt: run } })]));
      await vi.waitFor(async () => expect((await cli<{ result: { agents: Agent[] } }>(["agent", "list"])).result.agents.some(agent => agent.pane_id === originPane.pane_id && agent.agent_session?.value === initial.sessionFile && ["idle", "done"].includes(agent.agent_status))).toBe(true), { timeout: 30_000, interval: 200 });
      await cli(["pane", "close", grouped.root_pane.pane_id]);
      const native = await cli<{ result: unknown }>(["worktree", "list", "--cwd", repo]);
      expect(JSON.stringify(native.result).replaceAll("\\\\", "/")).toContain(task.replaceAll("\\", "/"));
      expect(JSON.stringify(native.result)).toContain(run.taskBranch);

      mkdirSync(join(task, ".specs/archive"), { recursive: true });
      renameSync(join(task, ".specs/acceptance"), join(task, ".specs/archive/acceptance"));
      writeFileSync(join(task, "baseline.txt"), "task implementation\n");
      git(task, "add", "-A"); git(task, "commit", "-m", "fixture implementation and archive");
      const taskCommit = git(task, "rev-parse", "HEAD");
      if (scenario === "blocker") { writeFileSync(join(repo, "baseline.txt"), "conflicting target implementation\n"); git(repo, "add", "baseline.txt"); git(repo, "commit", "-m", "fixture competing target"); }
      const manifest: CloseoutManifest = { repositoryRoot: repo, targetCheckout: repo, targetBranch: run.originBranch, taskWorktree: task, taskBranch: run.taskBranch, taskCommit, archivedPlanPath: ".specs/archive/acceptance/plan.md", activeSpecStub: "acceptance", targetStartingCommit: run.startingTargetCommit, noMerge: false, completedDate: "2026-09-30", integrationEvidence: "Isolated deterministic production real Pi acceptance" };
      writeFileSync(inputFile, JSON.stringify({ manifest, mixedRelease: scenario === "mixed-release", origin: { pid: initial.pid, sessionId: initial.sessionId, paneId: originPane.pane_id, workspaceId: originPane.workspace_id } }));
      await cli(["agent", "prompt", originPane.pane_id, "Task implementation archived and committed. Perform authorized local closeout."]);
      let snapshot: Snapshot | undefined;
      await vi.waitFor(() => {
        const inspected = results(evidenceAt(originEvidence), scenario === "blocker" ? "inspect-blocker" : "inspect-ready").at(-1);
        expect(inspected).toBeDefined();
        expect(inspected!.isError, resultText(inspected!)).not.toBe(true);
        snapshot = JSON.parse(resultText(inspected!)) as Snapshot;
        if (scenario === "blocker") expect(snapshot.host.result).toContain("MERGE BLOCKED");
        else expect(snapshot.host.integrationReady?.outcome).toBe("INTEGRATION READY");
      }, { timeout: 60_000, interval: 250 });
      expect(snapshot!.origin).toBe(initial.sessionId);
      expect(snapshot!.tabId).toBe(originPane.tab_id);
      expect(resolve(snapshot!.cwd)).toBe(resolve(repo));
      expect(snapshot!.host.sessionId).not.toBe(initial.sessionId);
      expect(snapshot!.host.childPid).not.toBe(initial.pid);
      expect(existsSync(task)).toBe(true);
      const beforeRelease = (await cli<{ result: { panes: Pane[] } }>(["pane", "list", "--workspace", originPane.workspace_id])).result.panes;
      expect(beforeRelease.map(pane => pane.pane_id).sort()).toEqual([originPane.pane_id, snapshot!.paneId].sort());
      expect(beforeRelease.every(pane => pane.tab_id === originPane.tab_id)).toBe(true);
      const originBeforeRelease = evidenceAt(originEvidence);
      expect(messages(originBeforeRelease).some(message => message.role === "custom" && message.customType === "closeout-successor" && JSON.stringify(message.content).includes(scenario === "blocker" ? "successor-turn" : "successor-integration-ready"))).toBe(true);
      expect(results(originBeforeRelease, "launch")).toHaveLength(1);
      expect(results(originBeforeRelease, "launch")[0]!.isError).not.toBe(true);
      const successorInitial = evidenceAt(successorEvidence).find(row => row.kind === "request")!;
      const definition = loadDefinitions(profile, false, profile).agents.get("integrator")!;
      expect(definition.model).toBe("luna"); expect(definition.effort).toBe("high");
      expect(successorInitial.model).toBe(`openai-codex/${fixtureIntegratorModel}`);
      expect(successorInitial.reasoning).toBe(definition.effort);
      expect(successorInitial.herdrSocket).toBe(fixture.env.HERDR_SOCKET_PATH);
      expect(successorInitial.authority).toMatchObject({ agent: "integrator", tools: definition.tools, delegates: [], cwd: repo, closeout: { manifest, provenance: { source: "subagent-runtime", version: 1, parentSessionId: initial.sessionId, targetCheckout: repo } } });
      expect(successorInitial.tools).toEqual(expect.arrayContaining(definition.tools));
      expect((successorInitial.tools as string[]).sort()).toEqual([...definition.tools, "closeout_successor_handoff"].sort());
      expect(successorInitial.declaredTools).toEqual(expect.arrayContaining(["closeout_successor_handoff"]));
      expect(successorInitial.systemPrompt).toContain("restricted Integrator closeout successor");
      expect(successorInitial.systemPrompt).toContain(JSON.stringify(manifest));
      expect(successorInitial.providerSystemPrompt).toContain("restricted Integrator closeout successor");
      expect(successorInitial.providerSystemPrompt).toContain(JSON.stringify(manifest));
      expect(successorInitial.systemPrompt).not.toContain("Report consequential decisions to the parent");
      expect(successorInitial.entries).toEqual(expect.arrayContaining([expect.objectContaining({ type: "custom", customType: "subagent-lineage", data: expect.objectContaining({ role: "integrator", parentSessionId: initial.sessionId }) })]));

      if (scenario !== "blocker") {
        expect(snapshot!.host.integrationReady).toMatchObject({ metadata: "committed", archivedPlanVerified: true, activeSpecAbsent: true });
        expect(snapshot!.host.integrationReady!.targetCommit).toBe(git(repo, "rev-parse", "HEAD"));
        expect(readFileSync(join(repo, manifest.archivedPlanPath), "utf8")).toContain("status: completed");
        expect(existsSync(join(repo, ".specs/acceptance"))).toBe(false);
        expect(readFileSync(join(repo, ".specs/archive/acceptance/support.txt"), "utf8")).toBe("untracked selected-spec evidence\n");
        if (scenario === "cleanup-failure") writeFileSync(join(task, "retained-untracked.txt"), "force exact worktree cleanup failure\n");
        await vi.waitFor(async () => expect((await cli<{ result: { agents: Agent[] } }>(["agent", "list"])).result.agents.some(agent => agent.pane_id === originPane.pane_id && ["idle", "done"].includes(agent.agent_status))).toBe(true), { timeout: 20_000, interval: 200 });
        await cli(["agent", "prompt", originPane.pane_id, "Origin obligations completed. Release final reporting."]);
      }
      await vi.waitFor(() => expect(evidenceAt(successorEvidence).some(row => row.kind === "settled")).toBe(true), { timeout: 40_000, interval: 250 });
      const successor = evidenceAt(successorEvidence), origin = evidenceAt(originEvidence);
      const final = successor.filter(row => row.kind === "settled").at(-1)!;
      expect(resolve(String(final.cwd))).toBe(resolve(repo));
      expect(final.pid).toBe(snapshot!.host.childPid);
      expect(final.sessionId).toBe(snapshot!.host.sessionId);
      const panes = (await cli<{ result: { panes: Pane[] } }>(["pane", "list", "--workspace", originPane.workspace_id])).result.panes;
      expect(panes.some(pane => pane.pane_id === snapshot!.paneId && pane.tab_id === originPane.tab_id)).toBe(true);
      expect(panes.some(pane => pane.pane_id === originPane.pane_id)).toBe(scenario === "blocker");
      expect(panes).toHaveLength(scenario === "blocker" ? 2 : 1);
      const processes = await cli<{ result: { process_info: { foreground_processes: { pid: number; argv: string[] }[] } } }>(["pane", "process-info", "--pane", snapshot!.paneId]);
      expect(processes.result.process_info.foreground_processes.some(process => process.pid === final.pid && process.argv.includes(fixture.entry))).toBe(true);
      expect(existsSync(task)).toBe(scenario === "blocker" || scenario === "cleanup-failure");
      expect(git(repo, "worktree", "list", "--porcelain").replaceAll("\\", "/").includes(task.replaceAll("\\", "/"))).toBe(scenario === "blocker" || scenario === "cleanup-failure");
      const outcome = scenario === "blocker" ? "MERGE BLOCKED" : scenario === "cleanup-failure" ? "CLEANUP PENDING" : "COMPLETED";
      expect(assistantText(successor).filter(text => text.includes(outcome))).toHaveLength(1);
      expect(assistantText(origin).some(text => /COMPLETED|MERGE BLOCKED|CLEANUP PENDING|UNEXPECTED ORIGIN CONTINUATION/.test(text))).toBe(false);
      const handoff = results(successor, "handoff");
      expect(handoff).toHaveLength(1); expect(handoff[0]!.isError).not.toBe(true);
      const actual = JSON.parse(resultText(handoff[0]!)) as { outcome: string; retainedArtifacts: string[]; metadata: string; taskCommit: string; archivedPlanVerified: boolean; activeSpecAbsent: boolean };
      expect(actual.outcome).toBe(outcome); expect(actual.taskCommit).toBe(taskCommit);
      if (scenario === "cleanup-failure") { expect(actual.retainedArtifacts).toContain(task); expect(assistantText(successor).join("\n").replaceAll("\\\\", "/")).toContain(task.replaceAll("\\", "/")); }
      process.kill(final.pid, 0); // The actual successor survives settlement and origin retirement.
      if (scenario !== "blocker") {
        expect(actual.metadata).toBe("already-committed"); expect(actual.archivedPlanVerified).toBe(true); expect(actual.activeSpecAbsent).toBe(true);
        expect(() => process.kill(initial.pid, 0)).toThrow();
        expect(git(repo, "merge-base", "--is-ancestor", taskCommit, "HEAD")).toBe("");
        expect(git(repo, "log", "-1", "--format=%s")).toBe("docs(plan): record acceptance integration");
        const release = results(origin, "release");
        expect(release).toHaveLength(1); expect(release[0]!.isError).not.toBe(true);
        expect(JSON.parse(resultText(release[0]!))).toMatchObject({ handoff: "released", finalReportOwner: "Integrator", originRetirement: "requested" });
        const releaseIndex = origin.findIndex(row => row.kind === "message-end" && (row.message as Message).role === "toolResult" && (row.message as Message).toolCallId === "release");
        expect(origin.slice(releaseIndex + 1).filter(row => row.kind === "request")).toEqual([]);
        expect(origin.filter(row => row.kind === "shutdown")).toEqual([expect.objectContaining({ reason: "quit", pid: initial.pid, sessionId: initial.sessionId })]);
        if (scenario === "mixed-release") {
          expect(results(origin, "release-sibling")).toHaveLength(1);
          expect(results(origin, "release-sibling")[0]!.isError).not.toBe(true);
          const releaseAssistant = messages(origin).find(message => message.role === "assistant" && JSON.stringify(message.content).includes('"id":"release"'))!;
          expect(releaseAssistant.content).toEqual(expect.arrayContaining([expect.objectContaining({ name: "closeout_successor", id: "release" }), expect.objectContaining({ name: "read", id: "release-sibling" })]));
        }
        const cleanup = successor.filter(row => row.kind === "cleanup-start");
        expect(cleanup).toHaveLength(1);
        expect(cleanup[0]).toMatchObject({ originAlive: false, taskExists: true, origin: { pid: initial.pid, sessionId: initial.sessionId, paneId: originPane.pane_id } });
        expect((cleanup[0]!.panes as { result: { panes: Pane[] } }).result.panes.some(pane => pane.pane_id === originPane.pane_id)).toBe(false);
      } else {
        process.kill(initial.pid, 0);
        expect(results(origin, "release")).toEqual([]);
        expect(successor.filter(row => row.kind === "cleanup-start")).toEqual([]);
        expect(actual.metadata).toBe("not-started");
      }
      const canonicalCalls = successor.filter(row => row.kind === "tool-call" && row.toolName === "bash").map(row => (row.input as { command: string }).command);
      expect(canonicalCalls).toEqual([`node "${join(fixtureProfile, "scripts/plan-integration.mjs")}" integrate`, ...(scenario === "blocker" ? [] : [`node "${join(fixtureProfile, "scripts/plan-integration.mjs")}" cleanup`])]);
    } catch (error) {
      const output = opened ? await cli(["pane", "read", opened.pane_id, "--source", "recent-unwrapped", "--lines", "100"]).catch(String) : "not launched";
      const launch = results(evidenceAt(originEvidence), "launch").at(-1);
      const successorPane = launch && !launch.isError ? (JSON.parse(resultText(launch)) as { paneId?: string }).paneId : undefined;
      const successorOutput = successorPane ? await cli(["pane", "read", successorPane, "--source", "recent-unwrapped", "--lines", "100"]).catch(String) : "not launched";
      throw new Error(`${error instanceof Error ? error.stack : String(error)}\norigin output: ${JSON.stringify(output)}\nsuccessor output: ${JSON.stringify(successorOutput)}\norigin evidence: ${JSON.stringify(evidenceAt(originEvidence).slice(-4)).slice(-16000)}\nsuccessor evidence: ${JSON.stringify(evidenceAt(successorEvidence).slice(-4)).slice(-16000)}\nnode stderr: ${fixture.logs()}`);
    } finally { await fixture.close(); }
  }, 180_000);
});
