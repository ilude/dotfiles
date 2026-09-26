import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { CloseoutInspection, CloseoutManifest, CloseoutOptions, CloseoutResult, StashState, WorktreeState } from "./contracts.ts";

const run = (cwd: string, args: string[]): string => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const inside = (base: string, candidate: string): boolean => {
  const rel = relative(base, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};
const normalized = (path: string): string => resolve(path);
function samePath(left: string, right: string): boolean {
  const canonical = (path: string) => { try { return realpathSync(path); } catch { return resolve(path); } };
  const a = canonical(left).replaceAll("\\", "/");
  const b = canonical(right).replaceAll("\\", "/");
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
const registeredWorktree = (root: string, path: string): boolean => run(root, ["worktree", "list", "--porcelain"]).split(/\r?\n/).some(line => line.startsWith("worktree ") && samePath(line.slice(9), path));
const fail = (message: string): never => { throw new Error(message); };

export function validateCloseoutManifest(manifest: CloseoutManifest): void {
  const root = normalized(manifest.repositoryRoot);
  const target = normalized(manifest.targetCheckout);
  const task = normalized(manifest.taskWorktree);
  if (!isAbsolute(manifest.repositoryRoot) || !isAbsolute(manifest.targetCheckout) || !isAbsolute(manifest.taskWorktree)) fail("Closeout paths must be absolute.");
  if (realpathSync(root) !== root || realpathSync(target) !== target || !inside(root, target)) fail("Target checkout must be a canonical path inside the repository root.");
  const worktrees = resolve(root, ".worktrees");
  if (!inside(worktrees, task) || task === worktrees) fail("Task worktree must be an exact child of the repository .worktrees directory.");
  if (existsSync(task) && realpathSync(task) !== task) fail("Task worktree must be canonical when present.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(manifest.activeSpecStub)) fail("Invalid active spec stub.");
  const expectedArchive = `.specs/archive/${manifest.activeSpecStub}/plan.md`;
  if (manifest.archivedPlanPath.replaceAll("\\", "/") !== expectedArchive) fail(`Archived plan must be ${expectedArchive}.`);
  if (!/^[0-9a-f]{40,64}$/i.test(manifest.taskCommit)) fail("Invalid task commit identifier.");
  if (manifest.preservationStashOid && !/^[0-9a-f]{40,64}$/i.test(manifest.preservationStashOid)) fail("Invalid preservation stash identifier.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.completedDate) || Number.isNaN(Date.parse(`${manifest.completedDate}T00:00:00Z`))) fail("Invalid completion date.");
  if (!manifest.targetBranch || !manifest.taskBranch || manifest.targetBranch === manifest.taskBranch) fail("Target and task branches must be distinct and named.");
}

function gitPath(cwd: string, path: string): string { return samePath(run(cwd, ["rev-parse", "--show-toplevel"]), cwd) ? path : fail("Git checkout root mismatch."); }
function branch(cwd: string): string { return run(cwd, ["branch", "--show-current"]); }
function isAncestor(cwd: string, ancestor: string, descendant: string): boolean {
  try { run(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]); return true; } catch { return false; }
}
function statusPaths(cwd: string): string[] {
  const entries = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd, encoding: "utf8" }).split("\0");
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index++) {
    const row = entries[index]!;
    if (!row) continue;
    paths.push(row.slice(3));
    if (/[RC]/.test(row.slice(0, 2)) && entries[index + 1]) paths.push(entries[++index]!);
  }
  return paths;
}
function overlap(left: Set<string>, right: Set<string>): string[] { return [...left].filter(path => right.has(path)).sort(); }
function stashEntries(cwd: string): Array<{ ref: string; oid: string }> {
  return run(cwd, ["stash", "list", "--format=%gd%x09%H"]).split(/\r?\n/).filter(Boolean).map(row => {
    const [ref, oid] = row.split("\t");
    return { ref: ref!, oid: oid! };
  });
}
function resolveStash(cwd: string, oid: string): string[] {
  return stashEntries(cwd).filter(entry => entry.oid.toLowerCase() === oid.toLowerCase()).map(entry => entry.ref);
}
function readCommittedFile(cwd: string, path: string): string {
  try { return execFileSync("git", ["show", `HEAD:${path}`], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch { return ""; }
}
function planText(cwd: string, archivePath: string): string {
  const archiveRoot = resolve(cwd, ".specs/archive");
  const path = resolve(cwd, archivePath);
  if (!inside(archiveRoot, path) || !existsSync(path) || !samePath(realpathSync(archiveRoot), archiveRoot)) fail("Archived plan is missing or outside the canonical archive.");
  const stat = lstatSync(path);
  const realPath = realpathSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !inside(archiveRoot, realPath)) fail("Archived plan must be a regular, unlinked file inside the canonical archive.");
  return readFileSync(path, "utf8");
}
function metadataText(source: string, date: string, evidence: string): string {
  if (!/^---\r?\n/.test(source)) fail("Archived plan has no frontmatter.");
  let body = source.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (_whole, frontmatter: string) => {
    const fields = frontmatter.split(/\r?\n/).filter(line => !/^(?:status|completed):/.test(line));
    return `---\n${fields.join("\n")}\nstatus: completed\ncompleted: ${date}\n---`;
  });
  if (body === source) fail("Could not update archived plan frontmatter.");
  const marker = "## Integration evidence";
  const section = `${marker}\n\n${evidence.trim()}\n`;
  const start = body.indexOf(marker);
  if (start >= 0) {
    const nextHeading = body.indexOf("\n## ", start + marker.length);
    body = `${body.slice(0, start)}${section}${nextHeading >= 0 ? `\n${body.slice(nextHeading + 1)}` : ""}`;
  } else body = `${body.trimEnd()}\n\n${section}`;
  return body;
}
function result(manifest: CloseoutManifest, values: Partial<CloseoutResult> = {}): CloseoutResult {
  return {
    outcome: "MERGE BLOCKED", targetCommit: "", taskCommit: manifest.taskCommit, stashState: "not-needed",
    merge: "not-started", metadata: "not-started", archivedPlanVerified: false, activeSpecAbsent: false,
    worktree: "missing", retainedArtifacts: [], evidence: [], ...values,
  };
}

/** Inspect the integration-relevant state without changing either checkout. */
export function inspectCloseout(manifest: CloseoutManifest): CloseoutInspection {
  validateCloseoutManifest(manifest);
  const target = manifest.targetCheckout;
  const root = manifest.repositoryRoot;
  const targetCommit = run(target, ["rev-parse", "HEAD"]);
  const taskPresent = existsSync(manifest.taskWorktree);
  const registered = registeredWorktree(root, manifest.taskWorktree);
  const archivedPlanExists = existsSync(resolve(target, manifest.archivedPlanPath));
  const archiveText = archivedPlanExists ? planText(target, manifest.archivedPlanPath) : "";
  const metadataCommitted = /(?:^|\n)status:\s*completed\s*(?:\n|$)/.test(archiveText) && readCommittedFile(target, manifest.archivedPlanPath) === archiveText;
  const taskCommitPresent = (() => { try { return run(root, ["rev-parse", "--verify", `${manifest.taskCommit}^{commit}`]) === manifest.taskCommit; } catch { return false; } })();
  const pendingMerge = (() => { try { run(target, ["rev-parse", "--verify", "MERGE_HEAD"]); return true; } catch { return false; } })();
  const conflicts = pendingMerge ? run(target, ["diff", "--name-only", "--diff-filter=U"]).split(/\r?\n/).filter(Boolean) : [];
  const message = `plan-integration:${manifest.activeSpecStub}:${manifest.taskCommit}`;
  const matchingStashes = run(target, ["stash", "list", "--format=%H%x09%gs"]).split(/\r?\n/).filter(row => row.includes(message)).map(row => row.split("\t")[0]!);
  let worktree: WorktreeState;
  if (registered) worktree = "registered";
  else if (!taskPresent) worktree = "missing";
  else worktree = "remnant-removed";
  return {
    targetBranch: branch(target), targetCommit, taskCommit: manifest.taskCommit, taskCommitPresent,
    merged: taskCommitPresent && isAncestor(target, manifest.taskCommit, targetCommit), dirtyPaths: statusPaths(target),
    pendingMerge, conflicts, archivedPlanExists, metadataCommitted,
    activeSpecAbsent: !existsSync(resolve(target, ".specs", manifest.activeSpecStub)), matchingStashes, worktree,
  };
}

/** Complete an authorized local closeout. Each step is state-checked so it can resume after interruption. */
export function closeout(manifest: CloseoutManifest, options: CloseoutOptions = {}): CloseoutResult {
  validateCloseoutManifest(manifest);
  const target = manifest.targetCheckout;
  const root = manifest.repositoryRoot;
  const event = (name: string, details: Record<string, string> = {}) => options.onEvent?.(name, details);
  let state = result(manifest);
  const retained = (path: string) => { if (!state.retainedArtifacts.includes(path)) state.retainedArtifacts.push(path); };
  const stop = (outcome: CloseoutResult["outcome"], reason: string, action: string): CloseoutResult => ({ ...state, outcome, reason, action });
  if (manifest.noMerge) return stop("USER INPUT REQUIRED", "Manifest forbids merge and closeout mutation.", "Skip Integrator closeout and leave the task worktree pending.");
  try {
    if (gitPath(root, ".") !== "." || gitPath(target, ".") !== ".") fail("Repository root/target is not a Git worktree root.");
    if (branch(target) !== manifest.targetBranch) return stop("USER INPUT REQUIRED", `Target checkout is on ${branch(target)}, not ${manifest.targetBranch}.`, "Check out the recorded target branch and rerun.");
    if (run(root, ["rev-parse", "--verify", `${manifest.taskBranch}^{commit}`]) !== manifest.taskCommit) return stop("USER INPUT REQUIRED", "Task branch does not point to the recorded task commit.", "Verify the task branch and manifest before continuing.");
    const taskRegistered = registeredWorktree(root, manifest.taskWorktree);
    state = { ...state, worktree: taskRegistered ? "registered" : existsSync(manifest.taskWorktree) ? "remnant-removed" : "missing" };
    if (taskRegistered) {
      if (!existsSync(manifest.taskWorktree) || branch(manifest.taskWorktree) !== manifest.taskBranch) return stop("USER INPUT REQUIRED", "Registered task worktree is missing or on another branch.", "Inspect Git worktree state before continuing.");
      if (run(manifest.taskWorktree, ["rev-parse", "HEAD"]) !== manifest.taskCommit) return stop("USER INPUT REQUIRED", "Task worktree HEAD differs from the recorded commit.", "Verify task worktree history before continuing.");
    }
    const targetHeadAtStart = run(target, ["rev-parse", "HEAD"]);
    const baseCommit = manifest.targetStartingCommit ?? run(root, ["merge-base", manifest.taskCommit, manifest.targetBranch]);
    if (manifest.targetStartingCommit && (!isAncestor(root, baseCommit, manifest.taskCommit) || !isAncestor(root, baseCommit, targetHeadAtStart))) return stop("USER INPUT REQUIRED", "Recorded target starting commit is not an ancestor of both histories.", "Verify the target/task base and update the manifest only with exact repository evidence.");
    const taskPaths = new Set(run(root, ["diff", "--name-only", "-z", `${baseCommit}..${manifest.taskCommit}`]).split("\0").filter(Boolean));
    const mergePending = (() => { try { run(target, ["rev-parse", "--verify", "MERGE_HEAD"]); return true; } catch { return false; } })();
    let dirty = statusPaths(target);
    const overlaps = overlap(taskPaths, new Set(dirty));
    const message = `plan-integration:${manifest.activeSpecStub}:${manifest.taskCommit}`;
    const taggedStashes = run(target, ["stash", "list", "--format=%H%x09%gs"]).split(/\r?\n/).filter(row => row.includes(message));
    if (taggedStashes.length > 1 && !manifest.preservationStashOid) {
      state = { ...state, stashState: "ambiguous", retainedArtifacts: taggedStashes.map(row => row.split("\t")[0]!) };
      return stop("USER INPUT REQUIRED", `Multiple closeout stashes match: ${taggedStashes.join(", ")}.`, "Identify the exact preservation stash; do not drop any entry.");
    }
    let stashOid: string | undefined = manifest.preservationStashOid ?? (taggedStashes.length === 1 ? taggedStashes[0]!.split("\t")[0] : undefined);
    let stashState: StashState = stashOid ? "created" : "not-needed";
    if (stashOid && resolveStash(target, stashOid).length !== 1) {
      state = { ...state, stashOid, stashState: "missing" }; retained(stashOid);
      return stop("USER INPUT REQUIRED", `Recorded stash ${stashOid} is missing or ambiguous.`, "Inspect stash history and target changes; do not substitute another stash.");
    }
    if (overlaps.length && !mergePending) {
      const matches = taggedStashes;
      if (stashOid) {
        if (matches.length !== 1 || matches[0]!.split("\t")[0]!.toLowerCase() !== stashOid.toLowerCase()) { state = { ...state, stashOid, stashState: "ambiguous" }; retained(stashOid); return stop("USER INPUT REQUIRED", "Recorded preservation stash does not match the unique closeout stash message.", "Identify the correct preservation entry before restoration."); }
      }
      if (matches.length === 1 && !stashOid) { stashOid = matches[0]!.split("\t")[0]; stashState = "created"; }
      if (!stashOid) {
        const before = new Set(dirty);
        run(target, ["stash", "push", "--include-untracked", "-m", message]);
        const candidates = run(target, ["stash", "list", "--format=%H%x09%gs"]).split(/\r?\n/).filter(row => row.includes(message));
        if (candidates.length !== 1) { state = { ...state, stashState: "ambiguous" }; return stop("USER INPUT REQUIRED", "Could not identify the newly created preservation stash uniquely.", "Inspect refs/stash and restore the matching changes manually."); }
        stashOid = candidates[0]!.split("\t")[0];
        const after = statusPaths(target);
        const captured = [...before].filter(path => !after.includes(path));
        if (captured.length !== before.size) { retained(stashOid); state = { ...state, stashOid, stashState: "retained" }; return stop("USER INPUT REQUIRED", `Stash did not capture all expected dirty paths: ${[...before].filter(path => after.includes(path)).join(", ")}.`, "Inspect the stash and remaining target changes; preserve both."); }
        stashState = "created";
      }
      dirty = statusPaths(target);
      const ignored = run(target, ["status", "--short", "--ignored", "--untracked-files=all"]).split(/\r?\n/).filter(line => line.startsWith("!! "));
      state = { ...state, stashOid, stashState, evidence: [...state.evidence, `overlap=${overlaps.join(",")}`, `ignored-left-in-place=${ignored.map(line => line.slice(3)).join(",") || "none"}`] };
    }
    let targetHead = run(target, ["rev-parse", "HEAD"]);
    const taskAlreadyMerged = isAncestor(target, manifest.taskCommit, targetHead);
    if (mergePending) {
      const conflicts = run(target, ["diff", "--name-only", "--diff-filter=U"]).split(/\r?\n/).filter(Boolean);
      if (conflicts.length) { state = { ...state, merge: "conflict", stashOid, stashState: stashOid ? "retained" : stashState }; if (stashOid) retained(stashOid); return stop("MERGE BLOCKED", `Merge conflicts remain: ${conflicts.join(", ")}.`, "Resolve the conflict paths within plan intent, then rerun."); }
      try { run(target, ["commit", "--no-edit"]); }
      catch (error) { return stop("MERGE BLOCKED", `Resolved merge could not be committed: ${String(error)}.`, "Complete the pending merge commit, then rerun closeout."); }
      targetHead = run(target, ["rev-parse", "HEAD"]);
      state = { ...state, targetCommit: targetHead, merge: "merged" };
    } else if (taskAlreadyMerged) state = { ...state, merge: "already-merged" };
    else {
      const remainingOverlap = overlap(taskPaths, new Set(dirty));
      if (remainingOverlap.length) return stop("USER INPUT REQUIRED", `Overlapping target changes remain before merge: ${remainingOverlap.join(", ")}.`, "Preserve these changes and inspect the task/target overlap.");
      try { run(target, ["merge", "--no-edit", manifest.taskCommit]); }
      catch (error) {
        const conflicts = run(target, ["diff", "--name-only", "--diff-filter=U"]).split(/\r?\n/).filter(Boolean);
        state = { ...state, merge: conflicts.length ? "conflict" : "failed", stashOid, stashState: stashOid ? "retained" : stashState };
        if (stashOid) retained(stashOid);
        event("merge-stopped", { conflicts: conflicts.join(","), error: String(error) });
        return stop(conflicts.length ? "MERGE BLOCKED" : "MERGE BLOCKED", conflicts.length ? `Merge conflicts: ${conflicts.join(", ")}.` : `Merge failed: ${String(error)}`, "Resolve routine conflicts within plan intent, then rerun; do not discard target work.");
      }
      targetHead = run(target, ["rev-parse", "HEAD"]);
      state = { ...state, targetCommit: targetHead, merge: "merged" };
    }
    if (!isAncestor(target, manifest.taskCommit, run(target, ["rev-parse", "HEAD"]))) return stop("MERGE BLOCKED", "Target does not contain the task commit after merge.", "Inspect target history before retrying.");
    state = { ...state, targetCommit: run(target, ["rev-parse", "HEAD"]), archivedPlanVerified: existsSync(resolve(target, manifest.archivedPlanPath)), activeSpecAbsent: !existsSync(resolve(target, ".specs", manifest.activeSpecStub)) };
    if (!state.archivedPlanVerified || !state.activeSpecAbsent) return stop("MERGE BLOCKED", "Archived plan is missing or active spec remains present.", "Verify archive and active-spec paths before metadata completion.");

    if (stashOid) {
      const matches = resolveStash(target, stashOid);
      if (!matches.length) { state = { ...state, stashOid, stashState: "missing" }; return stop("USER INPUT REQUIRED", `Recorded stash ${stashOid} is no longer present.`, "Inspect the target changes and stash history; do not substitute another stash."); }
      if (matches.length !== 1) { state = { ...state, stashOid, stashState: "ambiguous" }; retained(stashOid); return stop("USER INPUT REQUIRED", `Recorded stash ${stashOid} has ambiguous references.`, "Identify the exact stash reference without dropping any entry."); }
      try { run(target, ["stash", "apply", stashOid]); }
      catch {
        const conflicts = run(target, ["diff", "--name-only", "--diff-filter=U"]).split(/\r?\n/).filter(Boolean);
        state = { ...state, stashOid, stashState: "retained" }; retained(stashOid);
        return stop("USER INPUT REQUIRED", `Stash restoration conflicted${conflicts.length ? ` on ${conflicts.join(", ")}` : ""}.`, "Resolve restoration without dropping the stash, then verify every preserved path.");
      }
      if (state.taskCommit !== manifest.taskCommit) fail("Internal task commit mismatch.");
      dirty = statusPaths(target);
      const restorationMissing = overlaps.filter(path => !dirty.includes(path));
      if (restorationMissing.length) { state = { ...state, stashOid, stashState: "retained" }; retained(stashOid); return stop("USER INPUT REQUIRED", `Restoration did not reproduce expected paths: ${restorationMissing.join(", ")}.`, "Inspect restored changes and keep the stash until verified."); }
      const references = resolveStash(target, stashOid);
      if (references.length !== 1) { state = { ...state, stashOid, stashState: "ambiguous" }; retained(stashOid); return stop("USER INPUT REQUIRED", "Restored stash reference is no longer unique.", "Keep all stash entries and identify the exact matching reference."); }
      const stillMatching = run(target, ["stash", "list", "--format=%H"]).split(/\r?\n/).filter(value => value.toLowerCase() === stashOid!.toLowerCase());
      if (stillMatching.length !== 1) { state = { ...state, stashOid, stashState: "ambiguous" }; retained(stashOid); return stop("USER INPUT REQUIRED", "Refusing to drop an ambiguous stash reference.", "Inspect stash references before cleanup."); }
      run(target, ["stash", "drop", references[0]!]);
      state = { ...state, stashOid, stashState: "restored", evidence: [...state.evidence, `restored=${overlaps.join(",")}`] };
    }

    const archive = planText(target, manifest.archivedPlanPath);
    const completedMetadata = /(?:^|\n)status:\s*completed\s*(?:\n|$)/.test(archive) && archive.includes(`completed: ${manifest.completedDate}`) && archive.includes(manifest.integrationEvidence.trim());
    const metadataCommitted = completedMetadata && readCommittedFile(target, manifest.archivedPlanPath) === archive;
    if (!metadataCommitted) {
      const updated = metadataText(archive, manifest.completedDate, manifest.integrationEvidence);
      writeFileSync(resolve(target, manifest.archivedPlanPath), updated, "utf8");
      try { run(target, ["commit", "--only", "-m", `docs(plan): record ${manifest.activeSpecStub} integration`, "--", manifest.archivedPlanPath]); }
      catch (error) { return stop("CLEANUP PENDING", `Completion metadata could not be committed: ${String(error)}.`, "Resolve target index/commit requirements and rerun closeout."); }
      state = { ...state, metadata: "committed", targetCommit: run(target, ["rev-parse", "HEAD"]) };
    } else state = { ...state, metadata: "already-committed", targetCommit: run(target, ["rev-parse", "HEAD"]) };

    if (!taskRegistered && !existsSync(manifest.taskWorktree)) {
      state = { ...state, worktree: "missing" };
    } else if (!taskRegistered) {
      state = { ...state, worktree: "deregistered" };
    } else {
      const workStatus = statusPaths(manifest.taskWorktree);
      const unmerged = run(manifest.taskWorktree, ["diff", "--name-only", "--diff-filter=U"]).split(/\r?\n/).filter(Boolean);
      if (workStatus.length || unmerged.length) { state = { ...state, worktree: "registered" }; retained(manifest.taskWorktree); return stop("CLEANUP PENDING", `Task worktree is not clean: ${[...workStatus, ...unmerged].join(", ")}.`, "Commit or resolve task-worktree changes before removing it."); }
      try { run(root, ["worktree", "remove", manifest.taskWorktree]); }
      catch (error) { state = { ...state, worktree: "registered" }; retained(manifest.taskWorktree); return stop("CLEANUP PENDING", `Git could not remove the task worktree: ${String(error)}.`, "Inspect task-worktree status, including ignored files, then retry removal."); }
      state = { ...state, worktree: "deregistered" };
    }
    if (existsSync(manifest.taskWorktree)) {
      const rootReal = realpathSync(root);
      const taskPath = resolve(manifest.taskWorktree);
      if (!inside(resolve(rootReal, ".worktrees"), taskPath) || taskPath === resolve(rootReal, ".worktrees") || registeredWorktree(root, taskPath)) return stop("CLEANUP PENDING", "Task path is not a deregistered contained worktree remnant.", "Inspect Git registration and exact path before cleanup.");
      const stat = lstatSync(taskPath);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return stop("CLEANUP PENDING", "Task remnant is not a plain directory.", "Inspect the exact remnant path before cleanup.");
      rmSync(taskPath, { recursive: true, force: false });
      state = { ...state, worktree: "remnant-removed" };
    }
    state = { ...state, outcome: "COMPLETED", targetCommit: run(target, ["rev-parse", "HEAD"]), activeSpecAbsent: !existsSync(resolve(target, ".specs", manifest.activeSpecStub)), archivedPlanVerified: existsSync(resolve(target, manifest.archivedPlanPath)), retainedArtifacts: [] };
    event("completed", { targetCommit: state.targetCommit, taskCommit: manifest.taskCommit });
    return state;
  } catch (error) {
    event("error", { message: String(error) });
    const head = existsSync(target) ? (() => { try { return run(target, ["rev-parse", "HEAD"]); } catch { return ""; } })() : "";
    const outcome = state.metadata === "committed" || state.metadata === "already-committed" ? "CLEANUP PENDING" : "MERGE BLOCKED";
    return { ...state, outcome, reason: String(error), action: "Inspect the reported Git/filesystem state and rerun only after confirming the manifest.", targetCommit: head, retainedArtifacts: state.retainedArtifacts };
  }
}
