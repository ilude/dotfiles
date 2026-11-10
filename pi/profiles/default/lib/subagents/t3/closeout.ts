import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { normalizeCloseoutManifest, validateCloseoutManifest } from "../../plan-integration/closeout.ts";
import type { CloseoutManifest } from "../../plan-integration/contracts.ts";
import { samePlatformPath } from "../../path-identity.ts";
import { extractCloseoutHandoff } from "../closeout-handoff.ts";
import { ChildTransport } from "../transport.ts";
import type { T3RoleHandoff, T3RoleThreadBinding } from "./contracts.ts";

export interface T3CloseoutAuthority {
  readonly manifest: CloseoutManifest;
  readonly provenance: {
    readonly source: "t3-role-runtime"; readonly version: 1; readonly agent: "integrator";
    readonly launchId: string; readonly threadId: string; readonly parentThreadId: string;
    readonly parentSessionId: string; readonly targetCheckout: string;
  };
}
const ENV = "PI_T3_CLOSEOUT_ENDPOINT";
let active: T3CloseoutAuthority | undefined;
let transport: ChildTransport | undefined;
/** Process-owned state only. Environment and assignment JSON cannot install this authority. */
export function currentT3CloseoutAuthority(): T3CloseoutAuthority | undefined { return active; }
export async function clearT3CloseoutAuthority(): Promise<void> {
  active = undefined;
  delete process.env[ENV];
  const previous = transport; transport = undefined;
  await previous?.close();
}
const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 }).trim();

/** Read-only preflight. Dirty target preservation and completion remain owned by the existing helper. */
export function validateT3CloseoutTarget(manifest: CloseoutManifest, cwd: string): void {
  validateCloseoutManifest(manifest);
  if (manifest.noMerge) throw new Error("T3 Integrator closeout is disabled by noMerge; retain committed task work intentionally");
  if (!samePlatformPath(cwd, manifest.targetCheckout)) throw new Error(`Unsupported T3 Integrator target: current thread checkout ${cwd} differs from manifest target ${manifest.targetCheckout}; unchanged T3 cannot bind an existing checkout. Commission from the recorded target with shared isolation.`);
  if (!samePlatformPath(git(cwd, "rev-parse", "--show-toplevel"), manifest.targetCheckout)
    || git(cwd, "branch", "--show-current") !== manifest.targetBranch) throw new Error("T3 Integrator target checkout/branch mismatch");
  if (!samePlatformPath(git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"), git(manifest.repositoryRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"))) throw new Error("T3 Integrator repository mismatch");
  if (git(cwd, "rev-parse", "--verify", `${manifest.taskBranch}^{commit}`) !== manifest.taskCommit
    || git(cwd, "rev-parse", "--verify", `${manifest.taskCommit}^{commit}`) !== manifest.taskCommit) throw new Error("T3 Integrator task branch/commit mismatch");
  if (git(cwd, "cat-file", "-t", `${manifest.taskCommit}:${manifest.archivedPlanPath}`) !== "blob") throw new Error("T3 Integrator archived plan missing from exact task commit");
  if (manifest.targetStartingCommit) git(cwd, "merge-base", "--is-ancestor", manifest.targetStartingCommit, "HEAD");
  if (existsSync(manifest.taskWorktree)) {
    if (!samePlatformPath(git(manifest.taskWorktree, "rev-parse", "--show-toplevel"), manifest.taskWorktree)
      || git(manifest.taskWorktree, "branch", "--show-current") !== manifest.taskBranch
      || git(manifest.taskWorktree, "rev-parse", "HEAD") !== manifest.taskCommit) throw new Error("T3 Integrator task worktree branch/commit mismatch");
  } else git(cwd, "merge-base", "--is-ancestor", manifest.taskCommit, "HEAD");
}

/** T4 prepareHandoff hook. The existing exact manifest envelope is the only assignment input. */
export async function prepareT3Closeout(handoff: T3RoleHandoff, ctx: ExtensionToolContext): Promise<T3RoleHandoff> {
  const extracted = extractCloseoutHandoff(handoff.assignment);
  if (handoff.snapshot.definition.name !== "integrator") {
    if (extracted || handoff.closeout) throw new Error("Closeout manifests require the Integrator role");
    return handoff;
  }
  if (!extracted || handoff.closeout) throw new Error("T3 Integrator requires the exact closeout manifest assignment envelope");
  if (handoff.workspace.isolation !== "shared" || handoff.commissioner.parentLaunchId || handoff.snapshot.definition.delegates.length) throw new Error("T3 Integrator requires originating shared-isolation leaf authority");
  const manifest = Object.freeze(normalizeCloseoutManifest(extracted.manifest));
  for (const cwd of [ctx.cwd, handoff.commissioner.cwd, handoff.workspace.commissioningCwd, handoff.snapshot.cwd]) {
    if (!samePlatformPath(cwd, manifest.targetCheckout)) throw new Error(`Unsupported T3 Integrator target: thread checkout ${cwd} differs from ${manifest.targetCheckout}; commission from the recorded target with shared isolation`);
  }
  validateT3CloseoutTarget(manifest, ctx.cwd);
  return Object.freeze({ ...handoff, assignment: extracted.instructions, closeout: manifest });
}

/** Called only after the runtime has authenticated the durable binding and actual T3 identity. */
export async function bindT3CloseoutAuthority(binding: T3RoleThreadBinding): Promise<T3CloseoutAuthority | undefined> {
  await clearT3CloseoutAuthority();
  if (binding.snapshot.definition.name !== "integrator") {
    if (binding.closeout) throw new Error("Non-Integrator closeout binding rejected");
    return undefined;
  }
  if (!binding.closeout || binding.snapshot.definition.delegates.length || binding.commissioner.parentLaunchId
    || binding.parentThreadId !== binding.commissioner.threadId
    || !samePlatformPath(binding.commissioner.cwd, binding.cwd)
    || !samePlatformPath(binding.snapshot.cwd, binding.cwd)) throw new Error("T3 Integrator manifest or originating shared-checkout binding missing");
  validateT3CloseoutTarget(binding.closeout, binding.cwd);
  const value: T3CloseoutAuthority = Object.freeze({ manifest: Object.freeze({ ...binding.closeout }), provenance: Object.freeze({ source: "t3-role-runtime", version: 1, agent: "integrator", launchId: binding.launchId, threadId: binding.threadId, parentThreadId: binding.parentThreadId, parentSessionId: binding.commissioner.piSessionId, targetCheckout: binding.closeout.targetCheckout }) });
  const server = new ChildTransport(async (_identity, message) => {
    if (message.type !== "t3-closeout-authority" || active !== value) throw new Error("T3 closeout authority unavailable");
    validateT3CloseoutTarget(value.manifest, binding.cwd);
    return value;
  });
  try {
    const endpoint = await server.register({ child: binding.launchId, run: randomUUID(), origin: binding.threadId });
    transport = server; active = value; process.env[ENV] = JSON.stringify(endpoint);
    return value;
  } catch (error) { await server.close(); throw error; }
}
