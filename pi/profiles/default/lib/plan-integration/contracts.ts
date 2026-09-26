export interface CloseoutManifest {
  repositoryRoot: string;
  targetCheckout: string;
  targetBranch: string;
  taskWorktree: string;
  taskBranch: string;
  taskCommit: string;
  archivedPlanPath: string;
  activeSpecStub: string;
  targetStartingCommit?: string;
  /** Exact stash OID returned by a prior closeout run when resuming preservation. */
  preservationStashOid?: string;
  noMerge: boolean;
  completedDate: string;
  integrationEvidence: string;
}

export type CloseoutOutcome = "COMPLETED" | "MERGE BLOCKED" | "USER INPUT REQUIRED" | "CLEANUP PENDING";
export type StashState = "not-needed" | "created" | "restored" | "retained" | "ambiguous" | "missing";
export type WorktreeState = "registered" | "deregistered" | "remnant-removed" | "missing";

export interface CloseoutInspection {
  targetBranch: string;
  targetCommit: string;
  taskCommit: string;
  taskCommitPresent: boolean;
  merged: boolean;
  dirtyPaths: string[];
  pendingMerge: boolean;
  conflicts: string[];
  archivedPlanExists: boolean;
  metadataCommitted: boolean;
  activeSpecAbsent: boolean;
  matchingStashes: string[];
  worktree: WorktreeState;
}

export interface CloseoutResult {
  outcome: CloseoutOutcome;
  reason?: string;
  action?: string;
  targetCommit: string;
  taskCommit: string;
  stashOid?: string;
  stashState: StashState;
  merge: "not-started" | "already-merged" | "merged" | "conflict" | "failed";
  metadata: "not-started" | "already-committed" | "committed" | "failed";
  archivedPlanVerified: boolean;
  activeSpecAbsent: boolean;
  worktree: WorktreeState;
  retainedArtifacts: string[];
  evidence: string[];
}

export interface CloseoutOptions {
  /** Called after an interruption or a safe stop with the exact state observed. */
  onEvent?: (event: string, details: Record<string, string>) => void;
}
