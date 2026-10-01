import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import subagents from "../extensions/subagents.ts";

// Exercise the registered production admission and prompt handlers, without
// starting children, sockets, models, or touching inherited developer panes.
vi.mock("../lib/subagents/runtime.ts", () => ({
  getSubagentRuntime: () => ({ bind: vi.fn(), unbind: vi.fn() }),
  retireSubagentRuntime: vi.fn(), resetSubagentRuntime: vi.fn(), SUBAGENT_RUNTIME_RESET: "reset",
}));
vi.mock("../lib/subagents/closeout-handoff.ts", () => ({
  CloseoutSuccessorHandoff: class {}, extractCloseoutHandoff: vi.fn(),
}));
vi.mock("../lib/subagents/definitions.ts", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/subagents/definitions.ts")>(),
  loadDefinitions: () => ({ agents: new Map(), errors: [] }),
}));

const ownerKey = Symbol.for("dotfiles.pi.default.prepared-plan-origin");
const globals = globalThis as typeof globalThis & { [ownerKey]?: string };
let cwd: string;
let previousOwner: string | undefined;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "prepared-admission-"));
  previousOwner = globals[ownerKey]; delete globals[ownerKey];
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("HERDR_") || key.startsWith("PI_SUBAGENT_") || key.startsWith("PI_HERDR_")) vi.stubEnv(key, undefined);
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  if (previousOwner === undefined) delete globals[ownerKey]; else globals[ownerKey] = previousOwner;
  rmSync(cwd, { recursive: true, force: true });
});
const receipt = () => ({ version: 1, specStub: "fixture", specRelativePath: ".specs/fixture/plan.md", taskWorktreePath: cwd,
  taskBranch: "task/fixture", originCheckoutPath: join(cwd, "origin"), originBranch: "main", startingTargetCommit: "a".repeat(40) });
function fixture() {
  const handlers = new Map<string, Function>();
  const entries: any[] = [];
  const tools = new Map<string, any>();
  subagents({ on: (name: string, handler: Function) => handlers.set(name, handler),
    appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
    registerTool: (tool: any) => tools.set(tool.name, tool), registerCommand: vi.fn(),
  } as any);
  const context = (id: string, branch: any[] = entries) => ({ cwd, isProjectTrusted: () => false,
    sessionManager: { getSessionId: () => id, getBranch: () => branch } });
  return { entries, launch: (id: string) => tools.get("closeout_successor").execute("probe", { action: "launch" }, undefined, undefined, context(id)), start: (id: string, branch?: any[]) => handlers.get("session_start")!({}, context(id, branch)),
    prompt: (id: string) => handlers.get("before_agent_start")!({ systemPrompt: "base" }, context(id)).systemPrompt };
}
const preparedEntries = (entries: any[]) => entries.filter(entry => entry.customType === "prepared-plan-run");

describe("production prepared admission", () => {
  it("consumes bootstrap input, persists exact ownership and keeps guidance through factory reload", () => {
    const expected = receipt(); vi.stubEnv("PI_HERDR_PLAN_RUN", JSON.stringify(expected));
    const first = fixture(); first.start("origin");
    expect(process.env.PI_HERDR_PLAN_RUN).toBeUndefined();
    expect(preparedEntries(first.entries)).toEqual([{ type: "custom", customType: "prepared-plan-run", data: { origin: "origin", receipt: expected } }]);
    expect(first.prompt("origin")).toContain("## Runtime-issued prepared plan-run context");
    expect(first.prompt("origin")).toContain(JSON.stringify(expected.originCheckoutPath));
    const reloaded = fixture(); reloaded.start("origin", first.entries);
    expect(reloaded.prompt("origin")).toContain("## Runtime-issued prepared plan-run context");
    expect(preparedEntries(reloaded.entries)).toEqual([]);
  });
  it("excludes new and branched sessions even with copied origin metadata", async () => {
    vi.stubEnv("HERDR_ENV", "1");
    vi.stubEnv("PI_HERDR_PLAN_RUN", JSON.stringify(receipt()));
    const first = fixture(); first.start("origin"); const saved = [...first.entries];
    first.start("new", []);
    expect(first.prompt("new")).not.toContain("Runtime-issued prepared");
    await expect(first.launch("new")).rejects.toThrow("exact runtime-prepared Herdr plan session");
    const branch = fixture(); branch.start("branch", saved);
    expect(branch.prompt("branch")).not.toContain("Runtime-issued prepared");
    await expect(branch.launch("branch")).rejects.toThrow("exact runtime-prepared Herdr plan session");
    first.start("origin", saved);
    expect(first.prompt("origin")).toContain("Runtime-issued prepared");
  });
  it("does not leak admission into a fresh process-local owner in the task cwd", async () => {
    vi.stubEnv("HERDR_ENV", "1");
    vi.stubEnv("PI_HERDR_PLAN_RUN", JSON.stringify(receipt()));
    const first = fixture(); first.start("origin");
    // A bare pp subprocess inherits this environment, not the global owner.
    expect({ ...process.env }).not.toHaveProperty("PI_HERDR_PLAN_RUN");
    delete globals[ownerKey];
    const ordinary = fixture(); ordinary.start("ordinary", []);
    expect(ordinary.prompt("ordinary")).not.toContain("Runtime-issued prepared");
    expect(preparedEntries(ordinary.entries)).toEqual([]);
    await expect(ordinary.launch("ordinary")).rejects.toThrow("exact runtime-prepared Herdr plan session");
  });
  it.each(["not-json", JSON.stringify({ version: 1 }), "wrong-cwd"])("consumes invalid input without granting admission: %s", input => {
    vi.stubEnv("PI_HERDR_PLAN_RUN", input === "wrong-cwd" ? JSON.stringify({ ...receipt(), taskWorktreePath: join(cwd, "other") }) : input);
    const f = fixture(); expect(() => f.start("ordinary")).not.toThrow();
    expect(process.env.PI_HERDR_PLAN_RUN).toBeUndefined();
    expect(preparedEntries(f.entries)).toEqual([]);
    expect(f.prompt("ordinary")).not.toContain("Runtime-issued prepared");
  });
});
