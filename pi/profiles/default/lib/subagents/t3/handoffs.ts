import { createHash, randomUUID } from "node:crypto";
import { chmod, link, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { parseRoleSnapshot } from "../authority.ts";
import { samePlatformPath } from "../../path-identity.ts";
import type { CloseoutManifest } from "../../plan-integration/contracts.ts";
import type { ChildEndpoint } from "../transport.ts";
import type { RoleGoalScope, T3RoleHandoff, T3RoleOwnershipReceipt, T3RoleOutcomeReport, T3RoleThreadBinding, T3ThreadIdentity } from "./contracts.ts";

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid T3 role ${label}`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid T3 role ${label}`);
  return value;
}
function optional(value: unknown, label: string): string | undefined { return value === undefined ? undefined : string(value, label); }
function idPath(root: string, id: string): string { return join(root, `${createHash("sha256").update(string(id, "identifier")).digest("hex")}.json`); }
let lastAppendTimestamp = 0;
function appendName(): string { return `${String(lastAppendTimestamp = Math.max(Date.now(), lastAppendTimestamp + 1)).padStart(13, "0")}-${randomUUID()}.json`; }
function goal(value: unknown): RoleGoalScope | undefined {
  if (value === undefined) return undefined;
  const v = object(value, "goal");
  return Object.freeze({ runId: string(v.runId, "goal run"), ownerSessionId: string(v.ownerSessionId, "goal owner"), ownerSessionFile: string(v.ownerSessionFile, "goal session file") });
}
function closeout(value: unknown): T3RoleHandoff["closeout"] {
  if (value === undefined) return undefined;
  const v = object(value, "closeout manifest");
  if (typeof v.noMerge !== "boolean") throw new Error("Invalid T3 role closeout manifest");
  const manifest: CloseoutManifest = {
    repositoryRoot: string(v.repositoryRoot, "closeout repository"), targetCheckout: string(v.targetCheckout, "closeout target"), targetBranch: string(v.targetBranch, "closeout target branch"),
    taskWorktree: string(v.taskWorktree, "closeout task checkout"), taskBranch: string(v.taskBranch, "closeout task branch"), taskCommit: string(v.taskCommit, "closeout task commit"),
    archivedPlanPath: string(v.archivedPlanPath, "closeout archive"), activeSpecStub: string(v.activeSpecStub, "closeout spec"), noMerge: v.noMerge,
    completedDate: string(v.completedDate, "closeout date"), integrationEvidence: string(v.integrationEvidence, "closeout evidence"),
    targetStartingCommit: optional(v.targetStartingCommit, "closeout starting commit"), preservationStashOid: optional(v.preservationStashOid, "closeout stash"),
  };
  return Object.freeze(manifest);
}
export function parseT3RoleHandoff(input: unknown): T3RoleHandoff {
  const v = object(input, "handoff"), commissioner = object(v.commissioner, "commissioner"), workspace = object(v.workspace, "workspace");
  if (v.version !== 1) throw new Error("Invalid T3 role handoff version");
  const snapshot = parseRoleSnapshot(v.snapshot);
  if (snapshot.backend !== "t3") throw new Error("T3 role handoff requires T3 authority");
  if (workspace.isolation !== "shared" && workspace.isolation !== "worktree") throw new Error("Invalid T3 role workspace");
  const c = Object.freeze({ threadId: string(commissioner.threadId, "commissioner thread"), runId: string(commissioner.runId, "commissioner run"), piSessionId: string(commissioner.piSessionId, "commissioner session"), piSessionFile: string(commissioner.piSessionFile, "commissioner session file"), profile: string(commissioner.profile, "profile"), cwd: string(commissioner.cwd, "cwd"), parentLaunchId: optional(commissioner.parentLaunchId, "parent launch") });
  const commissioningCwd = string(workspace.commissioningCwd, "commissioning cwd");
  if (!samePlatformPath(snapshot.profile, c.profile) || !samePlatformPath(snapshot.cwd, c.cwd) || !samePlatformPath(commissioningCwd, c.cwd)) throw new Error("T3 role handoff source identity mismatch");
  const taskTitle = optional(v.taskTitle, "task title");
  return Object.freeze({ version: 1, launchId: string(v.launchId, "launch ID"), snapshot, commissioner: c, assignment: string(v.assignment, "assignment"), workspace: Object.freeze({ isolation: workspace.isolation, commissioningCwd }), goal: goal(v.goal), closeout: closeout(v.closeout), ...(taskTitle === undefined ? {} : { taskTitle }) });
}
function parseIdentity(value: unknown): T3ThreadIdentity {
  const v = object(value, "thread identity");
  return Object.freeze({ threadId: string(v.threadId, "thread ID"), parentThreadId: optional(v.parentThreadId, "parent thread ID"), taskId: optional(v.taskId, "task ID"), runId: optional(v.runId, "run ID"), cwd: string(v.cwd, "thread cwd") });
}
export function parseT3RoleBinding(value: unknown): T3RoleThreadBinding {
  const v = object(value, "binding");
  if (v.version !== 1) throw new Error("Invalid T3 role binding");
  const commissioner = object(v.commissioner, "binding commissioner");
  const handoff = parseT3RoleHandoff({ version: 1, launchId: v.launchId, snapshot: v.snapshot, commissioner, assignment: "binding", workspace: { isolation: "shared", commissioningCwd: commissioner.cwd }, goal: v.goal, closeout: v.closeout });
  const parentThreadId = string(v.parentThreadId, "parent thread ID"), profile = string(v.profile, "binding profile");
  if (parentThreadId !== handoff.commissioner.threadId || !samePlatformPath(profile, handoff.snapshot.profile)) throw new Error("T3 role binding source mismatch");
  const taskTitle = optional(v.taskTitle, "task title");
  return Object.freeze({ version: 1, launchId: handoff.launchId, threadId: string(v.threadId, "thread ID"), parentThreadId, profile, cwd: string(v.cwd, "binding cwd"), snapshot: handoff.snapshot, commissioner: handoff.commissioner, goal: handoff.goal, closeout: handoff.closeout, ...(taskTitle === undefined ? {} : { taskTitle }) });
}
function parseReceipt(value: unknown): T3RoleOwnershipReceipt {
  const v = object(value, "receipt");
  if (v.version !== 1 || (v.operation !== "launch" && v.operation !== "follow-up")) throw new Error("Invalid T3 role receipt");
  return Object.freeze({ version: 1, launchId: string(v.launchId, "receipt launch ID"), ownerThreadId: string(v.ownerThreadId, "receipt owner"), ownerPiSessionId: string(v.ownerPiSessionId, "receipt session"), childThreadId: string(v.childThreadId, "receipt child"), taskId: string(v.taskId, "receipt task"), runId: optional(v.runId, "receipt run"), childLink: optional(v.childLink, "child link"), childPiSessionId: optional(v.childPiSessionId, "child Pi session"), childPiSessionFile: optional(v.childPiSessionFile, "child Pi session file"), operation: v.operation });
}
function parseOutcome(value: unknown): T3RoleOutcomeReport {
  const v = object(value, "outcome"), summary = string(v.summary, "outcome summary");
  if (v.version !== 1 || summary.length > 24_000) throw new Error("Invalid T3 role outcome");
  const outcome = v.roleOutcome;
  if (outcome !== "completed" && outcome !== "partial" && outcome !== "blocked" && outcome !== "failed" && outcome !== "cancelled") throw new Error("Invalid T3 role outcome");
  return Object.freeze({ version: 1, launchId: string(v.launchId, "outcome launch ID"), threadId: string(v.threadId, "outcome thread"), runId: string(v.runId, "outcome run"), taskId: optional(v.taskId, "outcome task"), roleOutcome: outcome, summary });
}
async function writeNew(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" }); await link(temp, path); }
  finally { await rm(temp, { force: true }); }
}
async function readJson(path: string, missing = false): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (missing && error instanceof Error && "code" in error && error.code === "ENOENT") return undefined; throw new Error("T3 role metadata unavailable or malformed"); }
}
export interface HandoffStore {
  create(handoff: unknown): Promise<T3RoleHandoff>;
  read(launchId: string): Promise<T3RoleHandoff>;
  claim(launchId: string, input: { identity: unknown; profile: string; cwd: string; actualParentThreadId: string }): Promise<T3RoleThreadBinding>;
  binding(threadId: string): Promise<T3RoleThreadBinding | undefined>;
  receipt(receipt: T3RoleOwnershipReceipt): Promise<void>;
  receipts(ownerThreadId: string): Promise<readonly T3RoleOwnershipReceipt[]>;
  outcome(outcome: T3RoleOutcomeReport): Promise<void>;
  outcomes(threadId: string): Promise<readonly T3RoleOutcomeReport[]>;
  goalEndpoint(scope: RoleGoalScope): Promise<ChildEndpoint | undefined>;
  setGoalEndpoint(scope: RoleGoalScope, endpoint: ChildEndpoint): Promise<void>;
  goalMembers(scope: RoleGoalScope): Promise<readonly T3RoleThreadBinding[]>;
  goalHandoffs(scope: RoleGoalScope): Promise<readonly T3RoleHandoff[]>;
  ownedHandoffs(ownerThreadId: string): Promise<readonly T3RoleHandoff[]>;
}
export function createHandoffStore(agentDir = getAgentDir()): HandoffStore {
  const root = join(agentDir, "sessions", ".t3-roles");
  const handoffFile = (id: string) => idPath(join(root, "handoffs"), id);
  const bindingFile = (id: string) => idPath(join(root, "bindings"), id);
  const threadFile = (id: string) => idPath(join(root, "threads"), id);
  async function entries<T>(directory: string, parse: (value: unknown) => T): Promise<T[]> {
    let files: string[];
    try { files = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    return Promise.all(files.filter(name => name.endsWith(".json")).sort().map(async name => parse(await readJson(join(directory, name)))));
  }
  const scopeMatches = (candidate: RoleGoalScope | undefined, scope: RoleGoalScope) => candidate?.runId === scope.runId && candidate.ownerSessionId === scope.ownerSessionId && samePlatformPath(candidate.ownerSessionFile, scope.ownerSessionFile);
  const scopePath = (scope: RoleGoalScope) => idPath(join(root, "goal-endpoints"), `${string(scope.runId, "goal run")}\\0${string(scope.ownerSessionId, "goal owner")}`);
  function parseEndpoint(value: unknown): ChildEndpoint {
    const v = object(value, "goal endpoint"), port = v.port;
    if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid T3 goal endpoint");
    return Object.freeze({ child: string(v.child, "endpoint child"), run: string(v.run, "endpoint run"), origin: string(v.origin, "endpoint origin"), port, token: string(v.token, "endpoint token") });
  }
  async function index(binding: T3RoleThreadBinding): Promise<void> {
    await mkdir(join(root, "threads"), { recursive: true, mode: 0o700 });
    try { await writeNew(threadFile(binding.threadId), { launchId: binding.launchId }); }
    catch {
      const previous = object(await readJson(threadFile(binding.threadId)), "thread reference");
      if (previous.launchId !== binding.launchId) throw new Error("T3 thread already has a different frozen role");
    }
  }
  return {
    async create(value) {
      const handoff = parseT3RoleHandoff(value);
      if (!samePlatformPath(agentDir, handoff.snapshot.profile)) throw new Error("T3 role handoff profile mismatch");
      await mkdir(join(root, "handoffs"), { recursive: true, mode: 0o700 });
      try { await writeNew(handoffFile(handoff.launchId), handoff); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("T3 role launch ID already exists"); throw error; }
      return handoff;
    },
    async read(id) { return parseT3RoleHandoff(await readJson(handoffFile(id))); },
    async claim(id, input) {
      const handoff = await this.read(id), identity = parseIdentity(input.identity);
      if (!samePlatformPath(input.profile, agentDir) || !samePlatformPath(input.profile, handoff.snapshot.profile) || !samePlatformPath(input.cwd, identity.cwd) || (handoff.workspace.isolation === "shared" && !samePlatformPath(identity.cwd, handoff.workspace.commissioningCwd))) throw new Error("T3 role profile or destination mismatch");
      if (identity.parentThreadId !== handoff.commissioner.threadId || input.actualParentThreadId !== handoff.commissioner.threadId) throw new Error("T3 role commissioner lineage mismatch");
      await mkdir(join(root, "bindings"), { recursive: true, mode: 0o700 });
      let binding: T3RoleThreadBinding = Object.freeze({ version: 1, launchId: handoff.launchId, threadId: identity.threadId, parentThreadId: identity.parentThreadId, profile: input.profile, cwd: identity.cwd, snapshot: handoff.snapshot, commissioner: handoff.commissioner, goal: handoff.goal, closeout: handoff.closeout, ...("taskTitle" in handoff ? { taskTitle: handoff.taskTitle } : {}) });
      try { await writeNew(bindingFile(id), binding); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = parseT3RoleBinding(await readJson(bindingFile(id)));
        if (existing.threadId !== identity.threadId || existing.parentThreadId !== identity.parentThreadId || !samePlatformPath(existing.profile, input.profile) || !samePlatformPath(existing.cwd, identity.cwd)) throw new Error("T3 role launch was already claimed by another thread");
        binding = existing;
      }
      await index(binding);
      return binding;
    },
    async binding(threadId) {
      const reference = await readJson(threadFile(threadId), true);
      if (reference === undefined) return undefined;
      const launchId = string(object(reference, "thread reference").launchId, "launch ID");
      const binding = parseT3RoleBinding(await readJson(bindingFile(launchId)));
      if (binding.threadId !== threadId || !samePlatformPath(binding.profile, agentDir)) throw new Error("T3 role thread binding mismatch");
      return binding;
    },
    async receipt(value) {
      const receipt = parseReceipt(value), directory = idPath(join(root, "receipts"), receipt.ownerThreadId).slice(0, -5);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeNew(join(directory, appendName()), receipt);
    },
    async receipts(ownerThreadId) {
      const values = await entries(idPath(join(root, "receipts"), ownerThreadId).slice(0, -5), parseReceipt);
      if (values.some(value => value.ownerThreadId !== ownerThreadId)) throw new Error("T3 role receipt owner mismatch");
      return values;
    },
    async outcome(value) {
      const outcome = parseOutcome(value), directory = idPath(join(root, "outcomes"), outcome.threadId).slice(0, -5);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeNew(join(directory, appendName()), outcome);
    },
    async outcomes(threadId) {
      const values = await entries(idPath(join(root, "outcomes"), threadId).slice(0, -5), parseOutcome);
      if (values.some(value => value.threadId !== threadId)) throw new Error("T3 role outcome thread mismatch");
      return values;
    },
    async goalEndpoint(scope) {
      const value = await readJson(scopePath(scope), true);
      if (value === undefined) return undefined;
      const record = object(value, "goal endpoint record"), storedScope = goal(record.scope);
      if (!scopeMatches(storedScope, scope)) return undefined;
      return parseEndpoint(record.endpoint);
    },
    async setGoalEndpoint(scope, endpoint) {
      const checkedScope = goal(scope), checkedEndpoint = parseEndpoint(endpoint);
      if (!checkedScope) throw new Error("Invalid T3 goal scope");
      const file = scopePath(checkedScope);
      const previous = await readJson(file, true);
      if (previous !== undefined && !scopeMatches(goal(object(previous, "goal endpoint record").scope), checkedScope)) throw new Error("T3 goal endpoint scope mismatch");
      await mkdir(join(root, "goal-endpoints"), { recursive: true, mode: 0o700 });
      const temp = `${file}.${randomUUID()}.tmp`;
      try { await writeFile(temp, `${JSON.stringify({ scope: checkedScope, endpoint: checkedEndpoint })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" }); await chmod(temp, 0o600); await rename(temp, file); }
      finally { await rm(temp, { force: true }); }
    },
    async goalMembers(scope) {
      const values = await entries(join(root, "bindings"), parseT3RoleBinding);
      return Object.freeze(values.filter(binding => scopeMatches(binding.goal, scope)));
    },
    async goalHandoffs(scope) {
      const values = await entries(join(root, "handoffs"), parseT3RoleHandoff);
      return Object.freeze(values.filter(handoff => scopeMatches(handoff.goal, scope)));
    },
    async ownedHandoffs(ownerThreadId) {
      const owner = string(ownerThreadId, "owner thread");
      const values = await entries(join(root, "handoffs"), parseT3RoleHandoff);
      return Object.freeze(values.filter(handoff => handoff.commissioner.threadId === owner));
    },
  };
}
