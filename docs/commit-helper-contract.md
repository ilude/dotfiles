# Commit Helper Contract

`uv run python scripts/commit-helper ...` provides deterministic, machine-readable planning for non-Pi `/commit` consumers and parity checks.

Pi now owns the canonical commit workflow through the TypeScript Pi commit extension (`pi/extensions/workflow-commands.ts` plus `pi/extensions/commit.ts`). The Python helper is retained for compatibility, regression comparison, and clients that have not migrated to the Pi commit extension.

## Goals

- Classify current Git state without relying on agent interpretation of porcelain output.
- Produce a safe staging plan that preserves already-staged deletions.
- Reject non-conventional commit messages before `git commit` is attempted.

## Non-goals

- The helper does not create commits.
- The helper does not push.
- The helper does not force-add ignored files.
- The helper does not perform broad secret scanning in V1.
- The helper does not choose logical commit groupings or write commit messages.

## Implementations

Three surfaces implement the commit workflow. Each has a distinct scope:

- `scripts/commit-helper` -- Python CLI; non-mutating JSON output used by legacy callers and parity checks. Does not create commits or push.
- `claude/agents/committer.md` -- Claude agent definition invoked by `/commit`; orchestrates grouping, conventional-message authoring, and optional push. Calls the Python helper for planning; does not call the Pi commit tools directly.
- `pi/extensions/commit.ts` + `pi/lib/commit/*` -- Pi-native TypeScript tools (`commit_plan`, `commit_validate_message`, `commit_stage`, `commit_create`). Canonical path for Pi sessions. Confirmation tokens enforce user-review of every staged-path set.

## Commands

### `status-json`

Prints a JSON document describing current Git status.

### `stage-plan [--paths <paths...>]`

Prints a JSON document describing what the committer should stage, keep staged, skip, or block. This command is non-mutating.

### `validate-message <message>`

Validates a conventional commit subject. Exits `0` for valid messages and non-zero for invalid messages.

## JSON schema -- Python helper (scripts/commit-helper)

Top-level fields:

- `schema_version`: integer, currently `1`.
- `repo_root`: absolute repository root path as reported by Git.
- `clean`: boolean.
- `entries`: array of path entries (see Per-path fields below).
- `warnings`: array of strings.
- `errors`: array of strings.

Per-path fields:

- `path`: repo-relative path using forward slashes.
- `index`: single-character index status from porcelain v1, or `?` for untracked.
- `worktree`: single-character worktree status from porcelain v1, or `?` for untracked.
- `classification`: normalized state label (see Classifications below).
- `ignored`: boolean from `git check-ignore`.
- `safe_to_git_add`: boolean.
- `recommended_action`: one of `stage`, `keep_staged`, `skip`, `block`.
- `reason`: human-readable reason for the recommendation.

## JSON schema -- Pi commit tools (CommitPlanResult)

The Pi `commit_plan` tool returns a `CommitPlanResult` object. Top-level fields beyond `repoRoot` and `entries`:

- `preflight`: `GitPreflight` object -- `ok` boolean plus per-condition flags (`detachedHead`, `mergeInProgress`, `rebaseInProgress`, `hasUnmergedPaths`, etc.) and `blocked`/`warnings` string arrays. Non-ok preflight prevents staging and commit.
- `stageConfirmationToken`: opaque string token authorizing `commit_stage` for the exact path set shown. Validated with timing-safe comparison inside `commit_stage`.
- `createConfirmationToken`: opaque string token authorizing `commit_create` for the exact staged-path set. Validated with timing-safe comparison inside `commit_create`.
- `safeStagePaths`: string array of paths classified safe to pass to `git add`.
- `expectedStagedPaths`: string array of paths expected to be staged at commit time. Used by `commit_create` to revalidate the staged set immediately before `git commit`.

## Classifications

### Python helper classifications

The Python helper keeps its historical snake-case JSON contract. Valid `classification` values:

- `staged_deletion`: index deletion already staged; keep it staged and do not run `git add` for that path.
- `staged`: any other already-staged change.
- `modified`: tracked unstaged modification.
- `deleted`: tracked unstaged deletion.
- `untracked`: untracked path not ignored.
- `ignored`: path matched by `.gitignore` or another Git ignore source.
- `renamed`: porcelain rename entry.
- `copied`: porcelain copy entry.
- `unmerged`: merge conflict or unmerged state.
- `unknown`: fallback for unexpected status combinations.

### Pi commit tool classifications

The Pi `CommitPlanResult.entries[].classification` field is drawn from the `CommitClassification` type in `pi/lib/commit/types.ts`. Valid values:

- `staged_deletion`: index deletion already staged; keep it staged and do not run `git add` for that path.
- `staged_change`: any other already-staged change.
- `unstaged_change`: tracked file with unstaged modification or deletion.
- `untracked`: untracked path not ignored.
- `ignored_untracked`: untracked path matched by `.gitignore` or another Git ignore source.
- `unmerged`: merge conflict or unmerged state.
- `unknown`: fallback for unexpected status combinations.

## Recommended actions

The `recommended_action` / `recommendedAction` field is drawn from the `RecommendedAction` type in `pi/lib/commit/types.ts`. Valid values:

- `keep_staged`: entry is already staged and should not be re-staged.
- `stage`: safe to pass to `git add`.
- `skip`: do not stage; include as informational context.
- `block`: staging must be blocked; abort if encountered during automated staging.

## Required ignored staged deletion behavior

When a tracked file is added to `.gitignore` and then removed from the index with `git rm --cached`, Git may show the path as an index deletion while a local ignored file still exists.

That entry must be represented as:

```json
{
  "classification": "staged_deletion",
  "ignored": true,
  "safe_to_git_add": false,
  "recommended_action": "keep_staged",
  "reason": "Deletion is already staged; local path is ignored and must not be re-added"
}
```

The committer must not run `git add` for entries with `safe_to_git_add: false`.

## Exit codes

- `0`: command succeeded; for `validate-message`, message is valid.
- `1`: validation or usage failure; JSON may include `errors` where applicable.
- `2`: Git command failed or current directory is not inside a Git repository.

## Path normalization

All path entries in JSON use repo-relative forward-slash paths. The helper must handle spaces and Windows/Git Bash path behavior by passing arguments to subprocess calls as lists, not shell strings.
