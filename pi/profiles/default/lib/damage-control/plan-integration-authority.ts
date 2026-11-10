import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { Analysis, ToolRequest } from "./types.ts";
import { validateCloseoutManifest } from "../plan-integration/closeout.ts";
import type { CloseoutManifest } from "../plan-integration/contracts.ts";
import { samePlatformPath } from "../path-identity.ts";
import { validateT3CloseoutTarget, type T3CloseoutAuthority } from "../subagents/t3/closeout.ts";

const HELPER_SHA256 = "3383109411d219e66a0e04c2ee3f0cf45edbdbca7326766cf165c9c38e0bff4d";

function authority(): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(process.env.PI_SUBAGENT_AUTHORITY ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  } catch { return undefined; }
}

export function authorizedPlanIntegration(request: ToolRequest, analysis: Analysis, profile: string, t3?: T3CloseoutAuthority): boolean {
  if (request.tool !== "bash" || analysis.health.status !== "ready" || analysis.uncertainties.length || analysis.matches.length) return false;
  if (t3) {
    try { validateT3CloseoutTarget(t3.manifest, request.cwd); } catch { return false; }
  }
  const handoff = t3 ? { id: t3.provenance.launchId, agent: "integrator", delegates: [], cwd: t3.manifest.targetCheckout, closeout: t3 } : authority();
  const closeout = handoff?.closeout;
  if (!handoff || handoff.agent !== "integrator" || handoff.parentId !== undefined
    || !Array.isArray(handoff.delegates) || handoff.delegates.length !== 0
    || (!t3 && !process.env.PI_SUBAGENT_ENDPOINT) || !closeout || typeof closeout !== "object") return false;
  const value = closeout as Record<string, unknown>;
  const provenance = value.provenance;
  const manifestValue = value.manifest;
  if (!provenance || typeof provenance !== "object" || !manifestValue || typeof manifestValue !== "object") return false;
  const p = provenance as Record<string, unknown>;
  const m = manifestValue as Record<string, unknown>;
  const manifest: CloseoutManifest = {
    repositoryRoot: typeof m.repositoryRoot === "string" ? m.repositoryRoot : "",
    targetCheckout: typeof m.targetCheckout === "string" ? m.targetCheckout : "",
    targetBranch: typeof m.targetBranch === "string" ? m.targetBranch : "",
    taskWorktree: typeof m.taskWorktree === "string" ? m.taskWorktree : "",
    taskBranch: typeof m.taskBranch === "string" ? m.taskBranch : "",
    taskCommit: typeof m.taskCommit === "string" ? m.taskCommit : "",
    archivedPlanPath: typeof m.archivedPlanPath === "string" ? m.archivedPlanPath : "",
    activeSpecStub: typeof m.activeSpecStub === "string" ? m.activeSpecStub : "",
    ...(typeof m.targetStartingCommit === "string" ? { targetStartingCommit: m.targetStartingCommit } : {}),
    ...(typeof m.preservationStashOid === "string" ? { preservationStashOid: m.preservationStashOid } : {}),
    noMerge: m.noMerge === true,
    completedDate: typeof m.completedDate === "string" ? m.completedDate : "",
    integrationEvidence: typeof m.integrationEvidence === "string" ? m.integrationEvidence : "",
  };
  try { validateCloseoutManifest(manifest); } catch { return false; }
  if ((!t3 && (p.source !== "subagent-runtime" || p.childId !== handoff.id)) || (t3 && (p.source !== "t3-role-runtime" || p.launchId !== handoff.id)) || p.version !== 1 || p.agent !== "integrator"
    || typeof p.parentSessionId !== "string" || !p.parentSessionId
    || typeof p.targetCheckout !== "string" || typeof m.targetCheckout !== "string" || m.noMerge !== false
    || !samePlatformPath(resolve(request.cwd), resolve(m.targetCheckout))
    || !samePlatformPath(resolve(handoff.cwd as string), resolve(m.targetCheckout))
    || !samePlatformPath(p.targetCheckout as string, m.targetCheckout)) return false;

  // Accept only a single literal invocation. Shell composition, environment
  // assignments, pipes, redirections, aliases, and additional commands fail closed.
  const match = /^\s*node(?:\.exe)?\s+(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s;&|<>]+))\s+(closeout|integrate|cleanup)\s*$/.exec(request.input.command);
  if (!match) return false;
  const invoked = match[1] ?? match[2] ?? match[3];
  const expected = resolve(profile, "scripts/plan-integration.mjs");
  if (!invoked || resolve(request.cwd, invoked) !== expected) return false;
  const scripts = analysis.internal?.scripts;
  if (!scripts || scripts.length !== 1) return false;
  const source = scripts[0]!;
  try {
    return resolve(source.path) === expected
      && realpathSync(expected) === expected
      && realpathSync(source.path) === expected
      && source.sha256 === HELPER_SHA256
      && source.argv.length === 1
      && source.argv[0] === match[4];
  } catch { return false; }
}
