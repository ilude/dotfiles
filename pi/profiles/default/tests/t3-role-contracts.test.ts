import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import subagents from "../extensions/subagents.ts";
import { createMockPi } from "./helpers/mock-pi.ts";
import { backendToolNames, nativeSubagentAuthority, parseRoleSnapshot, resolveRoleSnapshot, selectedSubagentBackend, subagentAuthority } from "../lib/subagents/authority.ts";

const temporary: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-t1-")); temporary.push(root);
  const profile = join(root, "profile"), cwd = join(root, "project");
  mkdirSync(join(profile, "agents"), { recursive: true }); mkdirSync(cwd);
  writeFileSync(join(profile, "agents", "reader.md"), "---\nname: reader\ndescription: Inspect\ntools: [read, subagent_parent]\nmodel: openai/luna\neffort: low\nskills: [testing]\n---\nInspect only.");
  mkdirSync(join(profile, "skills", "testing"), { recursive: true });
  writeFileSync(join(profile, "skills", "testing", "SKILL.md"), "Profile skill");
  return { agent: "reader", backend: "t3" as const, profile, cwd, projectTrusted: false };
}

describe("T1 selected backend", () => {
  const t3 = { T3_PI_MCP_EXTENSION_PATH: "/bridge.ts" };
  it("selects T3 before native initialization only for the immediate RPC client", () => {
    expect(selectedSubagentBackend({ env: t3, argv: ["--mode", "rpc"] })).toBe("t3");
    expect(selectedSubagentBackend({ env: t3, argv: ["--mode=rpc"] })).toBe("t3");
    for (const mode of ["tui", "json", "print"] as const) expect(selectedSubagentBackend({ env: t3, mode })).toBe("native");
    expect(selectedSubagentBackend({ env: {}, mode: "rpc" })).toBe("native");
    expect(selectedSubagentBackend({ env: { ...t3, PI_SUBAGENT_AUTHORITY: "native" }, mode: "rpc" })).toBe("native");
  });
  it("returns from the native factory before registering tools or subscriptions", () => {
    vi.stubEnv("T3_PI_MCP_EXTENSION_PATH", "/bridge.ts");
    vi.stubEnv("PI_SUBAGENT_AUTHORITY", "");
    const previous = process.argv;
    process.argv = ["node", "pi", "--mode", "rpc"];
    try {
      const pi = createMockPi();
      const on = vi.spyOn(pi, "on"), events = vi.spyOn(pi.events, "on");
      subagents(pi as never);
      expect(pi.getAllTools()).toEqual([]);
      expect(on).not.toHaveBeenCalled(); expect(events).not.toHaveBeenCalled();
    } finally { process.argv = previous; }
  });
  it("maps only canonical lifecycle intents, leaving shared definitions unchanged", () => {
    const canonical = ["read", "subagent", "subagent_control", "subagent_parent"];
    expect(backendToolNames(canonical, "native")).toEqual(canonical);
    expect(backendToolNames(canonical, "t3")).toEqual(["read", "t3_delegate_role", "t3_role_control", "t3_role_parent"]);
    expect(canonical[1]).toBe("subagent");
  });
});

describe("T1 frozen role resolution boundary", () => {
  it("freezes detached defaults, tool names and skill provenance", () => {
    const options = fixture(), snapshot = resolveRoleSnapshot(options);
    expect(snapshot.model).toEqual({ provider: "openai", id: "luna", qualified: "openai/luna", source: "definition" });
    expect(snapshot.effort).toBe("low"); expect(snapshot.effortSource).toBe("definition");
    expect(snapshot.definition.tools).toEqual(["read", "subagent_parent"]);
    expect(snapshot.backendTools).toEqual(["read", "t3_role_parent"]);
    expect(snapshot.skills[0].source).toBe("profile");
    for (const object of [snapshot, snapshot.definition, snapshot.definition.tools, snapshot.model, snapshot.skills, snapshot.skills[0]]) expect(Object.isFrozen(object)).toBe(true);
    expect(parseRoleSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    const authority = subagentAuthority({ launchId: "launch", snapshot }, {});
    expect(authority?.tools).toEqual(snapshot.backendTools); expect(authority?.canonicalTools).toEqual(snapshot.definition.tools);
  });
  it("preserves explicit settings and trusted project skill precedence, including project-only skills", () => {
    const options = fixture();
    mkdirSync(join(options.cwd, ".pi", "skills", "testing"), { recursive: true });
    writeFileSync(join(options.cwd, ".pi", "skills", "testing", "SKILL.md"), "Project skill");
    const snapshot = resolveRoleSnapshot({ ...options, projectTrusted: true, model: "other/exact", effort: "medium" });
    expect(snapshot.model.qualified).toBe("other/exact"); expect(snapshot.model.source).toBe("explicit");
    expect(snapshot.effort).toBe("medium"); expect(snapshot.skills[0].source).toBe("project");
    expect(resolveRoleSnapshot(options).skills[0].source).toBe("profile");
  });
  it("honors invalid trusted override tombstones and the caller delegate ceiling", () => {
    const options = fixture();
    expect(() => resolveRoleSnapshot({ ...options, parentDelegates: [] })).toThrow("outside frozen authority");
    mkdirSync(join(options.cwd, ".pi", "agents"), { recursive: true });
    writeFileSync(join(options.cwd, ".pi", "agents", "reader.md"), "invalid override");
    expect(() => resolveRoleSnapshot({ ...options, projectTrusted: true })).toThrow("Unknown or invalid agent");
    expect(resolveRoleSnapshot(options).definition.source).toBe("profile");
  });
  it("rejects malformed runtime JSON rather than asserting a broad authority type", () => {
    const snapshot = resolveRoleSnapshot(fixture());
    expect(() => parseRoleSnapshot({ ...snapshot, backendTools: ["write"] })).toThrow("canonical authority");
    expect(() => parseRoleSnapshot({ ...snapshot, definition: { ...snapshot.definition, delegates: [42] } })).toThrow();
    expect(() => parseRoleSnapshot({ ...snapshot, model: { ...snapshot.model, qualified: "other/model" } })).toThrow();
    expect(() => parseRoleSnapshot({ ...snapshot, skills: [{ name: "testing", filePath: 42, source: "profile" }] })).toThrow();
    expect(() => nativeSubagentAuthority({ PI_SUBAGENT_AUTHORITY: '{"tools":[]}' })).toThrow();
    expect(nativeSubagentAuthority({})).toBeUndefined();
  });
  it("normalizes the native envelope without replacing native identity with inherited T3 state", () => {
    const snapshot = resolveRoleSnapshot(fixture());
    const env = { PI_SUBAGENT_AUTHORITY: JSON.stringify({ id: "native", agent: "reader", tools: ["read"], delegates: [], skills: [], cwd: "/work" }) };
    expect(subagentAuthority({ launchId: "t3", snapshot }, env)?.id).toBe("native");
    expect(subagentAuthority(undefined, env)?.backend).toBe("native");
  });
});
