import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdir, readFile } from "node:fs/promises";
import { authorizedPlanIntegration } from "../../lib/damage-control/plan-integration-authority.ts";
import type { Analysis, ToolRequest } from "../../lib/damage-control/types.ts";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { harness } from "./fixtures/fake-pi.ts";

afterEach(() => {
  delete process.env.PI_SUBAGENT_AUTHORITY;
  delete process.env.PI_SUBAGENT_ENDPOINT;
});

async function authorizedFixture(reviewRequired = false, operation = "closeout") {
  const h = await harness(reviewRequired ? {
    analyze: async () => ({
      effects: [], uncertainties: [], health: { status: "ready" as const },
      matches: [{ ruleId: "integrator-invalid", action: "review" as const, applicability: "confirmed" as const, reason: "unvalidated closeout", effects: [] }],
    }),
    review: async () => ({ status: "valid" as const, verdict: "ask" as const, reason: "operator decision required", dismissedCandidates: [] }),
  } : {});
  const helperDir = join(h.cwd, "profile", "scripts");
  await mkdir(helperDir, { recursive: true });
  const helper = join(helperDir, "plan-integration.mjs");
  await copyFile(resolve("scripts/plan-integration.mjs"), helper);
  const root = h.cwd;
  const target = root;
  const manifest = {
    repositoryRoot: root, targetCheckout: target, targetBranch: "main",
    taskWorktree: join(root, ".worktrees", "task"), taskBranch: "feature/task",
    taskCommit: "a".repeat(40), archivedPlanPath: ".specs/archive/task/plan.md",
    activeSpecStub: "task", noMerge: false, completedDate: "2026-09-26", integrationEvidence: "tests",
  };
  const authority = {
    id: "integrator-child", agent: "integrator", tools: ["bash"], delegates: [], cwd: target,
    closeout: { manifest, provenance: { source: "subagent-runtime", version: 1, childId: "integrator-child", agent: "integrator", parentSessionId: "parent-session", targetCheckout: target } },
  };
  process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify(authority);
  process.env.PI_SUBAGENT_ENDPOINT = "authenticated-endpoint";
  const command = `node "${helper}" ${operation}`;
  const emitted = await h.emit("tool_call", { toolName: "bash", toolCallId: "integrator-closeout", input: { command } });
  return { ...h, helper, authority, manifest, command, emitted };
}

it.each(["closeout", "integrate", "cleanup"])("quietly authorizes bounded closeout operation: %s", async operation => {
  const fixture = await authorizedFixture(false, operation);
  expect(fixture.emitted).toBeUndefined();
  expect(fixture.review).not.toHaveBeenCalled();
  expect(fixture.select).not.toHaveBeenCalled();
});

it.each(["closeout", "integrate", "cleanup"])("requires exact helper, argv and provenance for %s even with otherwise clean analysis", async operation => {
  const fixture = await authorizedFixture(false, operation);
  const request: ToolRequest = { callId: "bounded", cwd: fixture.cwd, text: fixture.command, tool: "bash", language: "bash", input: { command: fixture.command } };
  const source = { path: fixture.helper, sha256: createHash("sha256").update(await readFile(fixture.helper)).digest("hex"), range: { start: 0, end: fixture.command.length }, argv: [operation] };
  const analysis: Analysis = { effects: [], matches: [], uncertainties: [], health: { status: "ready" }, internal: { docker: [], scripts: [source] } };
  const profile = join(fixture.cwd, "profile");
  expect(authorizedPlanIntegration(request, analysis, profile)).toBe(true);
  for (const command of [fixture.command + " extra", fixture.command + "; git status", fixture.command.replace(` ${operation}`, " inspect"), `node "${fixture.helper}.other" ${operation}`]) {
    expect(authorizedPlanIntegration({ ...request, input: { command } }, analysis, profile)).toBe(false);
  }
  for (const argv of [["inspect"], [operation, "extra"], [operation === "cleanup" ? "integrate" : "cleanup"]]) {
    expect(authorizedPlanIntegration(request, { ...analysis, internal: { docker: [], scripts: [{ ...source, argv }] } }, profile)).toBe(false);
  }
  expect(authorizedPlanIntegration(request, { ...analysis, internal: { docker: [], scripts: [{ ...source, sha256: "0".repeat(64) }] } }, profile)).toBe(false);
  for (const authority of [
    { ...fixture.authority, parentId: "nested-parent" },
    { ...fixture.authority, delegates: ["developer"] },
    { ...fixture.authority, closeout: { ...fixture.authority.closeout, manifest: { ...fixture.manifest, noMerge: true } } },
    { ...fixture.authority, closeout: { ...fixture.authority.closeout, provenance: { ...fixture.authority.closeout.provenance, childId: "other-child" } } },
    { ...fixture.authority, closeout: { ...fixture.authority.closeout, provenance: { ...fixture.authority.closeout.provenance, targetCheckout: join(fixture.cwd, "other") } } },
  ]) {
    process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify(authority);
    expect(authorizedPlanIntegration(request, analysis, profile)).toBe(false);
  }
});

it.each([
  ["modified helper", (f: Awaited<ReturnType<typeof authorizedFixture>>) => appendFile(f.helper, "\\n// changed\\n")],
  ["alias helper", (f: Awaited<ReturnType<typeof authorizedFixture>>) => { process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify({ ...f.authority, closeout: undefined }); }],
  ["forged runtime provenance", (f: Awaited<ReturnType<typeof authorizedFixture>>) => { const a = structuredClone(f.authority); a.closeout.provenance.source = "model"; process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify(a); }],
  ["missing authority", () => { delete process.env.PI_SUBAGENT_AUTHORITY; }],
  ["missing authenticated endpoint", () => { delete process.env.PI_SUBAGENT_ENDPOINT; }],
  ["sibling worktree", (f: Awaited<ReturnType<typeof authorizedFixture>>) => { const a = structuredClone(f.authority); a.closeout.manifest.taskWorktree = join(f.manifest.repositoryRoot, ".worktrees-sibling", "task"); process.env.PI_SUBAGENT_AUTHORITY = JSON.stringify(a); }],
  ["shared-root deletion", () => undefined],
  ["remote Git operation", () => undefined],
  ["ignored-file operation", () => undefined],
  ["mixed command", () => undefined],
  ["forged command argument", () => undefined],
] as const)("does not grant the exemption for %s", async (name, alter) => {
  const fixture = await authorizedFixture(true);
  fixture.review.mockClear();
  fixture.select.mockClear();
  await alter(fixture as Awaited<ReturnType<typeof authorizedFixture>>);
  const command = name === "mixed command" ? `${fixture.command}; git status`
    : name === "shared-root deletion" ? `${fixture.command}; rm -rf .`
    : name === "remote Git operation" ? "git push origin main"
    : name === "ignored-file operation" ? "git status --ignored"
    : name === "forged command argument" ? fixture.command.replace(" closeout", " closeout extra")
    : fixture.command;
  fixture.select.mockResolvedValue("Deny");
  const result = await fixture.emit("tool_call", { toolName: "bash", toolCallId: `invalid-${name}`, input: { command } });
  expect(result).toMatchObject({ block: true });
  expect(fixture.review).toHaveBeenCalledOnce();
  expect(fixture.select).toHaveBeenCalledOnce();
});
