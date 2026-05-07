# DevOps Review: Automation / Evidence Portability

## Findings

### 1. Severity: High — T1 discovery still invites raw session-log leakage into portable artifacts
- **Evidence:** T1 asks for targeted grep/read of `$HOME/.pi/agent/sessions` for `/skill:`, `<skill name=`, `SKILL.md`, and `customType`, then writes summaries to `discovery.txt`. The constraints say artifacts must be redacted, but no exact redaction-safe command/wrapper is provided, so a fresh `/do-it` executor may paste raw prompts, tool outputs, or private paths into `.specs/`.
- **Required fix:** Replace open-ended grep/read with a deterministic summarizer command/script that emits only counts, JSON field paths, event/custom types, redacted skill names, and path categories. Explicitly forbid copying matched JSONL lines into artifacts.

### 2. Severity: High — Forward-logging user-decision path is not automation-portable
- **Evidence:** T4 says if no local hook exists, execution pauses for user decision and records `blocked-forward-logging-upstream` or `best-effort-only-approved`. In non-interactive `/do-it` automation, a mid-run pause can leave partial implementation work and no stable resumption point.
- **Required fix:** Make the decision gate executable before Wave 2 mutations: after T1/V1, if `forward-logging-local-hook: no`, stop with no code changes outside evidence/schema artifacts and a clear status. Only proceed to T3/T5 best-effort implementation if the plan already contains a recorded approval or a separate resumed run supplies it.

### 3. Severity: Medium — Evidence redirection paths are fragile from nested working directories
- **Evidence:** Validation commands redirect to `../../.specs/...` from `pi/extensions` and `pi/tests`. This works only if commands are run from the expected repo root and package depth; any wrapper changing `cwd` or using symlinked paths can write evidence outside the plan directory or fail silently after shell redirection.
- **Required fix:** Define `REPO_ROOT=$(git rev-parse --show-toplevel)` once and redirect via `$REPO_ROOT/.specs/skill-stats-logging/evidence/...` in every command. Add a post-command check that each evidence file exists and is non-empty.

### 4. Severity: Medium — Archive preflight can flag generated evidence as unexpected noise
- **Evidence:** F5 requires `git status --short` and `git diff --name-only` then changed files must match `owned-files.txt`; P2 writes the broad owned-file list including `.specs/skill-stats-logging`, while generated evidence files are untracked and not represented by `git diff --name-only`.
- **Required fix:** Add `git status --short --untracked-files=all` to archive evidence and classify allowed generated artifacts separately from implementation files. The owned-file check should compare both tracked diffs and untracked evidence/fixture files.

### 5. Severity: Medium — `make check` remains a hard archive gate without an environment portability fallback
- **Evidence:** The plan runs repo-wide `make check` as required validation even though the task touches Pi TypeScript and `.specs` artifacts, and the environment is Windows Git Bash/MSYS2 where shell/Python tooling may have unrelated local failures.
- **Required fix:** Keep `make check` required to run, but allow archive when task-specific validation passes and `make check` failure is captured, classified as pre-existing/unrelated, and linked to `preflight-status.txt` or a rerun showing unchanged failure. Do not require fixing unrelated environment-wide issues for this feature.
