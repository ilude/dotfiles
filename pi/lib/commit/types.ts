export type GitIndexStatus = "unmodified" | "modified" | "added" | "deleted" | "renamed" | "copied" | "unmerged" | "unknown";
export type GitWorktreeStatus = GitIndexStatus | "ignored";

export type CommitClassification =
	| "staged_deletion"
	| "staged_change"
	| "unstaged_change"
	| "untracked"
	| "ignored_untracked"
	| "unmerged"
	| "unknown";

export type RecommendedAction = "keep_staged" | "stage" | "skip" | "block";

export interface CommitPathEntry {
	path: string;
	index: GitIndexStatus;
	worktree: GitWorktreeStatus;
	classification: CommitClassification;
	ignored: boolean;
	safeToGitAdd: boolean;
	recommendedAction: RecommendedAction;
	reason: string;
}

export interface GitPreflight {
	ok: boolean;
	blocked: string[];
	warnings: string[];
	detachedHead: boolean;
	mergeInProgress: boolean;
	rebaseInProgress: boolean;
	cherryPickInProgress: boolean;
	bisectInProgress: boolean;
	hasUnmergedPaths: boolean;
	isSubmodule: boolean;
	isWorktree: boolean;
	sparseCheckout: boolean;
	partialIndex: boolean;
}

export interface CommitPlanResult {
	repoRoot: string;
	preflight: GitPreflight;
	entries: CommitPathEntry[];
	confirmationToken?: string;
	stageConfirmationToken?: string;
	createConfirmationToken?: string;
	safeStagePaths: string[];
	expectedStagedPaths: string[];
}

export interface MessageValidationResult {
	valid: boolean;
	error?: string;
}
