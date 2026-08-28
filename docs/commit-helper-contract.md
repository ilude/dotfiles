# Commit helper and Pi commit contracts

These are related but separate interfaces:

- `uv run python scripts/commit-helper ...` is a non-mutating Python CLI for compatibility, legacy consumers, and parity checks.
- `pi/extensions/commit.ts` registers the structured Pi tools. Pi's tools can stage, create, and push; the slash-command orchestration loop is documented in [Agent command surfaces](agent-command-surfaces.md).

## Python helper

Commands are `status-json`, `stage-plan [--paths <paths...>]`, and `validate-message <message>`.

The JSON document contains `schema_version` (currently `1`), `command`, `repo_root`, `clean`, `entries`, `warnings`, and `errors`. Each entry contains a repo-relative forward-slash `path`, porcelain-v1 `index` and `worktree` status characters, `classification`, `ignored`, `safe_to_git_add`, `recommended_action`, and `reason`.

Python classifications are:

- `staged_deletion`, `staged`, `modified`, `deleted`, `untracked`, `ignored`, `renamed`, `copied`, `unmerged`, and `unknown`

Actions are `stage`, `keep_staged`, `skip`, `block`, or `none`. `none` is the fallback for an unexpected status with no staging recommendation. The helper preserves staged deletions and never recommends adding ignored paths. For porcelain rename/copy records, it consumes the extra source-path record and emits the reported path as one entry; the Python schema does not expose a source/destination pair.

`validate-message` accepts the repository's conventional subject format and returns exit code `0` when valid, `1` for validation or usage failure, and `2` when Git fails or the current directory is not a repository. Planning commands return JSON and use `2` for those Git/repository failures. The helper does not create commits, push, force-add ignored files, scan secrets, choose groupings, or write messages.

## Pi structured tools

`pi/extensions/commit.ts` independently registers:

- `commit_plan`: inspect and return a plan without mutation
- `commit_validate_message`: validate a subject without mutation
- `commit_stage`: stage exact safe paths
- `commit_create`: create one local commit
- `commit_push`: push after checking the expected commit and upstream state

The model-visible result is deliberately smaller than the internal result. `commit_plan` exposes `planId`, preflight data, selected entries, `safeStagePaths`, and `expectedStagedPaths`; it does not expose confirmation tokens. `commit_stage` exposes `stageId`, staged paths, and the expected staged set; it does not expose the create token. Internal tool details retain the plan or stage state and tokens for subsequent calls. `commit_validate_message` exposes its validation result. `commit_create` returns the commit hash, message, committed paths, and `pushed: false`. `commit_push` returns branch, hash, and whether a push occurred.

Pi classifications are:

- `staged_deletion`, `staged_change`, `unstaged_change`, `untracked`, `ignored_untracked`, `unmerged`, and `unknown`

Pi actions are `keep_staged`, `stage`, `skip`, and `block`; there is no Pi `none` action. Ignored untracked paths are skipped and never force-added. An ignored local copy of a tracked file whose deletion is already staged remains `staged_deletion`, with `safeToGitAdd: false` and `keep_staged`; it must not be re-added.

Pi does not expose separate `renamed` or `copied` classifications. Renames and copies are represented through the staged-change/status handling. During staging, already-staged rename sources are excluded so staging does not re-add them.

## Normalization and boundaries

Both surfaces normalize paths to repo-relative forward-slash paths and deduplicate them. The Python helper passes Git arguments as subprocess argument lists, preserving spaces and avoiding shell-string parsing. Pi uses the same forward-slash normalization for selected and expected paths.

Pi stage and create operations are bound to opaque SHA-256 tokens derived from the repository root, purpose, exact normalized path set, and the relevant worktree or index fingerprint. Stage and create compare tokens with a timing-safe comparison and revalidate the repository state at the mutation boundary. Create also validates the message, exact staged set, whitespace, and added-content secret scan. Push validates the expected HEAD, branch/upstream state, fetches the remote, rejects a behind branch, and never force-pushes.
