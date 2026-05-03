# Commit Helper Contract

`uv run python scripts/commit-helper ...` provides deterministic, machine-readable planning for the `/commit` workflow.

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

## Commands

### `status-json`

Prints a JSON document describing current Git status.

### `stage-plan [--paths <paths...>]`

Prints a JSON document describing what the committer should stage, keep staged, skip, or block. This command is non-mutating.

### `validate-message <message>`

Validates a conventional commit subject. Exits `0` for valid messages and non-zero for invalid messages.

## JSON schema

Top-level fields:

- `schema_version`: integer, currently `1`.
- `repo_root`: absolute repository root path as reported by Git.
- `clean`: boolean.
- `entries`: array of path entries.
- `warnings`: array of strings.
- `errors`: array of strings.

Per-path fields:

- `path`: repo-relative path using forward slashes.
- `index`: single-character index status from porcelain v1, or `?` for untracked.
- `worktree`: single-character worktree status from porcelain v1, or `?` for untracked.
- `classification`: normalized state label.
- `ignored`: boolean from `git check-ignore`.
- `safe_to_git_add`: boolean.
- `recommended_action`: one of `stage`, `keep_staged`, `skip`, `block`, `none`.
- `reason`: human-readable reason for the recommendation.

## Classifications

- `staged_deletion`: index deletion already staged; keep it staged and do not run `git add` for that path.
- `staged`: any other already-staged change.
- `modified`: tracked unstaged modification.
- `deleted`: tracked unstaged deletion.
- `untracked`: untracked path not ignored.
- `ignored`: path matched by `.gitignore` or another Git ignore source.
- `renamed`: porcelain rename entry.
- `copied`: porcelain copy entry.
- `unmerged`: merge conflict/unmerged state.
- `unknown`: fallback for unexpected status.

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
