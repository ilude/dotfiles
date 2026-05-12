---
created: 2026-05-12
status: completed
completed: 2026-05-12
---

# Plan: Private per-file age encryption workflow

## Context & Motivation

The repository has a Pi `/handoff` prompt that writes handoff documents under `private/handoffs/`. The user clarified that **anything under `private/`**, not just X/Twitter-related content, should be encrypted and stored under `.encrypted/`. Existing tooling uses `scripts/private-archive-*`, `scripts/git-hooks/pre-commit-x-private`, `.gitignore`, `.gitattributes`, `config/age/recipients.txt`, and `test/test_private_archive.py`, with older `private.tar.age` archive assumptions. This plan intentionally runs from a fresh git worktree and must not depend on uncommitted prototype edits in the original checkout.

## Constraints

- Platform: Windows with Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`).
- Shell: `/usr/bin/bash`.
- Worktree mode is required: all implementation, tests, and final commit happen in `../.dotfiles-private-encrypted-workflow`, not the original checkout.
- Preserve `private/` as gitignored plaintext working data; never commit plaintext private files.
- Store encrypted private files as per-file `.age` artifacts under `.encrypted/`, preserving the relative path from `private/`.
- Encryption must behave as a sync: the expected `.encrypted/**/*.age` set is derived from current regular files under `private/`; stale `.age` files with no source must be removed/staged for deletion, while non-`.age` files under `.encrypted/` must never be silently accepted.
- Encryption must fail closed and avoid mixed-generation output: generate into a temporary mirror, complete all `age` operations successfully, then promote the new `.encrypted/` state. On failure, do not stage partial output.
- `config/age/recipients.txt` may contain comments only. Missing, malformed, or unusable recipients must produce a clear nonzero failure before any encrypted output is promoted.
- Existing command names `scripts/private-archive-*` and `scripts/x-private-*` may remain as legacy-compatible entrypoints, but active help/status/guidance must say they now manage per-file `.encrypted/` artifacts.
- Prefer Python/pytest for private workflow tests; repo Python floor is 3.9, and tooling uses `uv`.
- Do not push. Final commit is local only on branch `plan/private-encrypted-workflow`.

## Risk & Manual Gate Decision

- **Risk level:** Low
- **Blast radius:** personal-local-repo
- **Rollback:** easy via marker-checked worktree removal or reverting the local commit
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** Changes are local repo scripts/tests/gitignore metadata. They do not decrypt real secrets, push to remotes, alter production systems, or perform irreversible external side effects. Automated tests use generated temporary age keys and fixture data to verify encryption/decryption, hook behavior, plaintext blocking, and cleanup.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Single `private.tar.age` archive | Existing scripts and conflict resolver already support it; simple one-file artifact | Any private file change rewrites one binary archive; merge conflicts are more likely; user explicitly asked for `.encrypted/` storage | Rejected: does not match desired `.encrypted/` per-file model |
| Per-file `.encrypted/**/*.age` outputs with sync semantics | Matches user intent; preserves private tree structure; independent private files can be staged/reviewed/merged separately; delete/rename behavior is explicit | More files to manage; needs stale-output and all-or-nothing safeguards | **Selected** |
| git-crypt or clean/smudge filters | Transparent encryption before commit | Adds tool-specific repo state and recovery complexity; current repo already uses age scripts and recipients | Rejected: larger workflow change than needed |
| Encrypt only handoff/X-related paths | Smaller scope | User clarified all `private/` content should be covered | Rejected: too narrow |

## Objective

Implement and validate a worktree-local change that sync-encrypts every safe regular file under `private/` to `.encrypted/<relative-path>.age`, removes stale encrypted artifacts for deleted/renamed sources, wires a worktree-safe pre-commit hook to auto-encrypt and stage `.encrypted/`, blocks plaintext private paths from commits, updates guidance/tests, and leaves a local commit on `plan/private-encrypted-workflow` after validation passes.

## Project Context

- **Language**: Python scripts plus shell git hook; repo markers include `pyproject.toml`, `Makefile`, and `.gitattributes`.
- **Test command**: `uv run pytest test/test_private_archive.py` for task-specific checks; `make test-quick` for repo-wide validation.
- **Lint command**: `make lint-python`.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Worktree preflight | `test ! -e ../.dotfiles-private-encrypted-workflow; test -z "$(git status --porcelain=v1 --unmerged)"; for p in rebase-merge rebase-apply MERGE_HEAD; do gp=$(git rev-parse --git-path "$p"); test ! -e "$gp"; done; git show-ref --verify --quiet refs/heads/plan/private-encrypted-workflow && exit 1 || true; git worktree add -b plan/private-encrypted-workflow ../.dotfiles-private-encrypted-workflow HEAD; git -C ../.dotfiles-private-encrypted-workflow rev-parse HEAD > ../.dotfiles-private-encrypted-workflow/.pi-worktree-run-marker` | none | Terminal transcript; branch/current HEAD marker |
| Implement | `cd ../.dotfiles-private-encrypted-workflow` then edit only plan-scoped files | none | `git diff --stat` in worktree |
| Verify task behavior | `uv run pytest test/test_private_archive.py` | generated temporary age keys only | pytest output showing all tests pass |
| Lint | `make lint-python` | none | command exits 0 |
| Repo-wide validation | `make test-quick` | none | command exits 0 |
| Commit | `git add -- .gitignore .gitattributes pi/prompts/handoff.md scripts/git-hooks/pre-commit-x-private scripts/install-x-private-hook scripts/private-archive-decrypt scripts/private-archive-encrypt scripts/private-archive-scan scripts/private-archive-status scripts/private_archive_lib.py scripts/x-private-decrypt scripts/x-private-encrypt scripts/x-private-scan test/test_private_archive.py && git diff --cached --check && git diff --cached --name-only && scripts/private-archive-scan --staged && git diff --cached -G'(AKIA|ghp_|sk-ant-|sk-proj-|BEGIN OPENSSH|PASSWORD=|TOKEN=|Bearer )' --exit-code -- . ':!*.age' && git commit -m "feat: encrypt private files per path"` | none | local commit hash on `plan/private-encrypted-workflow` |
| Cleanup/rollback | If marker exists and branch is `plan/private-encrypted-workflow`: `git -C ../.dotfiles-private-encrypted-workflow status --short; rm -rf ../.dotfiles-private-encrypted-workflow/private ../.dotfiles-private-encrypted-workflow/private.bak; git worktree remove ../.dotfiles-private-encrypted-workflow`; optionally `git branch -D plan/private-encrypted-workflow` | none | worktree/branch removed; no generated plaintext private fixture remains |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. Each Evidence entry must record the cwd, exact command, exit status, and key assertion output/path. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 0

- [x] T0: Create dedicated git worktree
  - Status: pending
  - Evidence: --
- [x] V0: Validate worktree preflight
  - Status: pending
  - Evidence: --

### Wave 1

- [x] T1: Convert private encryption scripts to synced per-file `.encrypted/` outputs
  - Status: pending
  - Evidence: --
- [x] T2: Update git hook, hook installer, ignore rules, attributes, and handoff guidance
  - Status: pending
  - Evidence: --
- [x] T3: Update private workflow tests
  - Status: pending
  - Evidence: --
- [x] V1: Validate wave 1
  - Status: pending
  - Evidence: --

### Wave 2

- [x] T4: Finalize compatibility cleanup and local commit
  - Status: pending
  - Evidence: --
- [x] V2: Validate wave 2
  - Status: pending
  - Evidence: --

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: pending
  - Evidence: --
- [x] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: --
- [x] F3: Manual validation not required or completed
  - Status: pending
  - Evidence: --
- [x] F4: Deployment validation complete or not required
  - Status: pending
  - Evidence: --
- [x] F5: Archive preflight complete (record all prior gates checked, local commit hash, clean worktree status, and confirmation that no push/merge/rebase was performed)
  - Status: pending
  - Evidence: --

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Create dedicated git worktree | 0 | mechanical | small | git-workflow specialist | -- |
| V0 | Validate worktree preflight | -- | validation | small | validation agent | T0 |
| T1 | Convert private encryption scripts to synced per-file `.encrypted/` outputs | 4 | feature | medium | python specialist | V0 |
| T2 | Update git hook, hook installer, ignore rules, attributes, and handoff guidance | 5 | feature | medium | shell/tooling specialist | V0 |
| T3 | Update private workflow tests | 1 | feature | medium | python test specialist | V0 |
| V1 | Validate wave 1 | -- | validation | medium | validation agent | T1, T2, T3 |
| T4 | Finalize compatibility cleanup and local commit | 3 | mechanical | small | git-workflow specialist | V1 |
| V2 | Validate wave 2 | -- | validation | medium | validation agent | T4 |

## Execution Waves

### Wave 0

**T0: Create dedicated git worktree** [small] -- git-workflow specialist
- Description: Create branch `plan/private-encrypted-workflow` and worktree `../.dotfiles-private-encrypted-workflow` from current HEAD. Do not require the original checkout to be clean; do not copy uncommitted prototype changes. Use `git rev-parse --git-path` for merge/rebase checks, because linked worktrees may have `.git` as a file.
- Files: none
- Acceptance Criteria:
  1. [ ] Worktree exists on the expected branch and has a run marker.
     - Verify: `git -C ../.dotfiles-private-encrypted-workflow branch --show-current && test -s ../.dotfiles-private-encrypted-workflow/.pi-worktree-run-marker && git -C ../.dotfiles-private-encrypted-workflow status --short && for p in rebase-merge rebase-apply MERGE_HEAD; do gp=$(git rev-parse --git-path "$p"); test ! -e "$gp"; wgp=$(git -C ../.dotfiles-private-encrypted-workflow rev-parse --git-path "$p"); test ! -e "$wgp"; done`
     - Pass: branch is `plan/private-encrypted-workflow`; marker exists; no unresolved merge/rebase state exists in original or new worktree.
     - Fail: branch/path already exists, run marker missing, or repository has unresolved merge/rebase state; stop and report exact blocker.

### Wave 0 -- Validation Gate

**V0: Validate worktree preflight** [small] -- validation agent
- Blocked by: T0
- Checks:
  1. `git -C ../.dotfiles-private-encrypted-workflow rev-parse --is-inside-work-tree` returns `true`.
  2. `git -C ../.dotfiles-private-encrypted-workflow branch --show-current` returns `plan/private-encrypted-workflow`.
  3. `for p in rebase-merge rebase-apply MERGE_HEAD; do gp=$(git -C ../.dotfiles-private-encrypted-workflow rev-parse --git-path "$p"); test ! -e "$gp"; done` exits 0.
  4. Confirm subsequent commands in this plan use `cd ../.dotfiles-private-encrypted-workflow`.
- On failure: remove the worktree only if `.pi-worktree-run-marker` exists and branch/HEAD match the just-created branch; otherwise stop with manual cleanup instructions.

### Wave 1 (parallel after V0)

**T1: Convert private encryption scripts to synced per-file `.encrypted/` outputs** [medium] -- python specialist
- Blocked by: V0
- Description: In the worktree, update private encryption/decryption/status helpers so each safe regular file under `private/` encrypts to `.encrypted/<relative-path>.age`; stale `.age` files without a source are removed; encryption writes to a temporary mirror and promotes only after all `age` subprocesses succeed. Decryption restores `.encrypted/**/*.age` into `private/` only after path safety checks pass. Fail closed for missing/malformed recipients or missing `age`.
- Files: `scripts/private-archive-encrypt`, `scripts/private-archive-decrypt`, `scripts/private-archive-status`, `scripts/private_archive_lib.py`
- Acceptance Criteria:
  1. [ ] Encrypt creates non-plaintext per-file `.age` outputs and decrypts via age.
     - Verify: `tmp=$(mktemp -d); cp -R scripts "$tmp/scripts"; mkdir -p "$tmp/config/age" "$tmp/private/a"; age-keygen -o "$tmp/id.txt" >"$tmp/age.out" 2>&1; awk '/public key:/ {print $NF}' "$tmp/id.txt" "$tmp/age.out" | tail -1 > "$tmp/config/age/recipients.txt"; echo secret > "$tmp/private/a/note.txt"; (cd "$tmp" && PYTHONPATH=scripts python scripts/private-archive-encrypt && test -f .encrypted/a/note.txt.age && ! grep -a -q secret .encrypted/a/note.txt.age && age -d -i id.txt .encrypted/a/note.txt.age | grep -qx secret && find .encrypted -type f ! -name '*.age' | wc -l | grep -qx 0)`
     - Pass: command exits 0; only `.age` output exists; artifact does not contain plaintext; age decrypt returns fixture.
     - Fail: missing recipients, wrong output path, plaintext copied into `.encrypted/`, non-age file created, or command exits nonzero unexpectedly.
  2. [ ] Delete/rename sync removes stale encrypted artifacts.
     - Verify: temp repo test encrypts `private/a/old.txt`, renames it to `private/a/new.txt`, reruns encryption, and asserts `.encrypted/a/old.txt.age` is gone while `.encrypted/a/new.txt.age` decrypts correctly.
     - Pass: stale `.age` file is removed and current file decrypts correctly.
     - Fail: stale encrypted data remains silently or current output missing.
  3. [ ] Failure paths do not promote partial output.
     - Verify: pytest uses a fake/failing `age` or invalid recipient fixture to force a mid-run failure across multiple files.
     - Pass: encrypt exits nonzero with useful stderr; existing `.encrypted/` state is unchanged; hook does not stage partial output.
     - Fail: mixed old/new outputs remain or are staged after failure.
  4. [ ] Unsafe paths and symlinks are rejected or skipped deterministically.
     - Verify: pytest covers symlink-to-file, symlink-to-directory, `..` traversal, absolute/drive-like paths, `file.age` -> `file.age.age`, and case-collision policy on Windows.
     - Pass: no write escapes `private/`; symlinks/devices are refused before encryption/decryption; legitimate names round-trip.
     - Fail: path escape, followed symlink, ambiguous collision, or silent unsafe restore.

**T2: Update git hook, hook installer, ignore rules, attributes, and handoff guidance** [medium] -- shell/tooling specialist
- Blocked by: V0
- Description: Update the pre-commit hook to auto-run private sync encryption and stage `.encrypted/`; keep scanner blocking plaintext staged paths. Update `scripts/install-x-private-hook` to resolve hook path with `git rev-parse --git-path hooks/pre-commit` so it works in linked worktrees. Update `.gitignore` so `.encrypted/**/*.age` is committable and plaintext/non-age `.encrypted/` files are blocked; update `.gitattributes` for encrypted age files; update `pi/prompts/handoff.md` to describe `.encrypted/`.
- Files: `scripts/git-hooks/pre-commit-x-private`, `scripts/install-x-private-hook`, `.gitignore`, `.gitattributes`, `pi/prompts/handoff.md`
- Acceptance Criteria:
  1. [ ] Hook behavior is proven by a real temp-repo commit test.
     - Verify: pytest/temp repo installs the hook, configures generated age recipient, creates `private/handoffs/example.md`, runs `git add private/handoffs/example.md` or force-stages it, attempts `git commit`, and asserts plaintext is blocked; then commits with only `.encrypted/handoffs/example.md.age` and asserts commit succeeds and plaintext is absent from `git ls-tree -r HEAD`.
     - Pass: hook blocks forced plaintext private paths and non-age `.encrypted` paths; successful commit contains only `.encrypted/**/*.age` for private data.
     - Fail: grep-only proof, plaintext private path committed, non-age `.encrypted` committed, or hook does not stage encrypted artifact.
  2. [ ] Hook installer works from linked worktrees.
     - Verify: linked-worktree fixture runs `scripts/install-x-private-hook --dry-run` and real install, then `git rev-parse --git-path hooks/pre-commit` points to an existing executable hook containing `scripts/git-hooks/pre-commit-x-private`.
     - Pass: installer does not write to literal `.git/hooks` when `.git` is a file.
     - Fail: hook missing, wrong path, or installer crashes in linked worktree.
  3. [ ] Git metadata allows only encrypted private artifacts.
     - Verify: `grep -n "!.encrypted/\|!.encrypted/.*\.age\|.encrypted.*binary" .gitignore .gitattributes` plus scanner tests for `.encrypted/plain.txt` rejection.
     - Pass: `.encrypted/**/*.age` is allowed/marked binary; plaintext `private/` remains ignored; scanner rejects non-age `.encrypted` files.
     - Fail: `.encrypted/` wholly ignored, plaintext can be staged without `-f`, or `.age` artifacts are not allowed.

**T3: Update private workflow tests** [medium] -- python test specialist
- Blocked by: V0
- Description: Update `test/test_private_archive.py` to cover per-file encryption/decryption, delete/rename sync, all-or-nothing failure, recipient parsing, path/symlink safety, scanner allow/block behavior, hook auto-staging/blocking during real commits, linked-worktree hook install, missing-recipient status, and independent private-file merge behavior.
- Files: `test/test_private_archive.py`
- Acceptance Criteria:
  1. [ ] Tests assert per-file `.encrypted/**/*.age`, delete/rename sync, and no plaintext leak.
     - Verify: `grep -n "\.encrypted/.*\.age\|delete\|rename\|grep -a\|plaintext" test/test_private_archive.py`
     - Pass: tests include `.encrypted/...age`, stale-removal, and no-plaintext assertions.
     - Fail: core tests still expect `private.tar.age` as the primary artifact or omit stale/plaintext checks.
  2. [ ] Tests cover failure and safety cases.
     - Verify: `grep -n "malformed\|duplicate\|symlink\|traversal\|worktree\|pre-commit\|merge" test/test_private_archive.py`
     - Pass: tests cover recipient parsing, symlink/path safety, linked-worktree installer, real hook commit behavior, and independent-file merge.
     - Fail: any listed safety area is absent or only checked by comments.
  3. [ ] Targeted pytest passes.
     - Verify: `uv run pytest test/test_private_archive.py`
     - Pass: all tests pass.
     - Fail: any failure or warning requiring code/test correction.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- validation agent
- Blocked by: T1, T2, T3
- Checks:
  1. Run all acceptance criteria for T1, T2, and T3.
  2. `uv run pytest test/test_private_archive.py` -- all tests pass.
  3. `python -m py_compile scripts/private-archive-encrypt scripts/private-archive-decrypt scripts/private-archive-status scripts/private_archive_lib.py scripts/install-x-private-hook` -- exits 0.
  4. Cross-task integration: temp repo with generated age key installs the hook, creates `private/handoffs/example.md`, runs real `git commit`, verifies `.encrypted/handoffs/example.md.age` is committed, verifies plaintext private file is not committed, force-stages plaintext and verifies commit fails.
  5. Merge regression: from a base commit, branch A adds/encrypts `private/a.txt`, branch B adds/encrypts `private/b.txt`, merge B into A, assert no conflict and both `.encrypted/a.txt.age` and `.encrypted/b.txt.age` exist.
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T4: Finalize compatibility cleanup and local commit** [small] -- git-workflow specialist
- Blocked by: V1
- Description: In the worktree, inspect for stale references saying `private.tar.age` is the primary workflow; update wording to `.encrypted/` or mark as legacy compatibility. Run task-specific validation, lint, repo-wide validation, stage exact intended files only, scan staged diff for secrets/plaintext, then create one local commit on `plan/private-encrypted-workflow`.
- Files: `.gitignore`, `.gitattributes`, `pi/prompts/handoff.md`, `scripts/private-archive-*`, `scripts/x-private-*`, `scripts/private_archive_lib.py`, `scripts/git-hooks/pre-commit-x-private`, `scripts/install-x-private-hook`, `test/test_private_archive.py`
- Acceptance Criteria:
  1. [ ] No misleading primary-workflow references remain.
     - Verify: `git grep -n -I "private.tar.age\|private-encrypted\|x-research" -- . ':!pi/extensions/node_modules' ':!claude/commands/yt/.venv' | head -100`
     - Pass: remaining hits are archived specs, old compatibility references, or explicitly documented legacy behavior; active handoff/private workflow guidance uses `.encrypted/`.
     - Fail: active guidance still tells users to use `private.tar.age` as the main storage target.
  2. [ ] Local commit exists only after validation and safe staging.
     - Verify: `git status --short && git diff --cached --name-only && git log -1 --oneline`
     - Pass: latest commit is the private encryption workflow commit on `plan/private-encrypted-workflow`; staged paths were exact intended files; worktree is clean except documented evidence artifacts excluded from commit.
     - Fail: commit missing, commit created before validation, wrong branch, unrelated files staged/committed, broad directory staging used, or plaintext private data present.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- validation agent
- Blocked by: T4
- Checks:
  1. `git -C ../.dotfiles-private-encrypted-workflow branch --show-current` is `plan/private-encrypted-workflow`.
  2. `uv run pytest test/test_private_archive.py` passes.
  3. `make lint-python` passes with no new warnings.
  4. `make test-quick` passes.
  5. `git status --short` in the worktree is clean or only contains explicitly documented evidence artifacts excluded from commit.
  6. `find private -type f -print` in the worktree either reports no generated plaintext private fixtures or only intentionally ignored local fixtures documented in Evidence; no `private/` path is staged.
- On failure: do not archive; fix, rerun affected checks, then rerun all V2 checks.

## Dependency Graph

```
Wave 0: T0 → V0
Wave 1: T1, T2, T3 (parallel after V0) → V1
Wave 2: T4 → V2
Final Gates: V2 → F1, F2, F3, F4, F5
```

## Success Criteria

1. [ ] Any safe regular file under `private/` is encrypted to `.encrypted/<same-relative-path>.age` by the script/hook, without plaintext leakage.
   - Verify: `uv run pytest test/test_private_archive.py`
   - Pass: tests cover nested private paths, no plaintext in encrypted artifacts, age decrypt round-trip, and no non-age `.encrypted` outputs.
2. [ ] Deletes/renames under `private/` cannot leave stale encrypted private data committed silently.
   - Verify: targeted delete/rename tests in `test/test_private_archive.py`
   - Pass: stale `.encrypted/**/*.age` files are removed/staged for deletion or status fails with an explicit required cleanup; selected behavior is documented.
3. [ ] Plaintext private content cannot be committed accidentally.
   - Verify: real temp-repo hook commit test plus `scripts/private-archive-scan --staged` fixture.
   - Pass: plaintext `private/...` and non-age `.encrypted/...` staged paths are rejected; successful commit contains only `.encrypted/**/*.age` private artifacts.
4. [ ] The work is isolated in a git worktree branch with a local commit only.
   - Verify: `git -C ../.dotfiles-private-encrypted-workflow branch --show-current && git -C ../.dotfiles-private-encrypted-workflow log -1 --oneline`
   - Pass: branch is `plan/private-encrypted-workflow`; latest commit contains only intended workflow changes.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must run all implementation and validation commands inside `../.dotfiles-private-encrypted-workflow` after V0.
- Credentials are not required for tests; tests must generate temporary age identities/recipients and clean them up. A real user recipient in `config/age/recipients.txt` is not required for automated fixture validation, but status/encrypt commands must report missing recipients safely if none are configured.
- Manual-only steps are not required.
- Evidence for each checklist item must include cwd, exact command, exit status, and key assertion output/path.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command or command set for this project.
   - Command: `make lint-python && make test-quick`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command; at minimum `uv run pytest test/test_private_archive.py`
   - Pass: every acceptance criterion passes exactly as written
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

3. [ ] Run staged-diff safety checks before commit.
   - Command: `git diff --cached --check && scripts/private-archive-scan --staged && git diff --cached -G'(AKIA|ghp_|sk-ant-|sk-proj-|BEGIN OPENSSH|PASSWORD=|TOKEN=|Bearer )' --exit-code -- . ':!*.age'`
   - Pass: exits 0; no plaintext private paths or obvious secrets in staged non-age files
   - Fail: unstage/fix offending files before commit

### Manual validation

- Required: no
- Justification: Automated validation is sufficient; changes are local, reversible, and tested with generated fixture secrets rather than real private content.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None. This is a local repo workflow change; installation validation is covered by the hook installer/link-worktree and temp repo tests.

If deployment is required and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, staged-diff safety checks, deployment validation, repo-wide validation, and the local commit on the worktree branch pass. Do not merge, rebase, cherry-pick, fast-forward, or push from the worktree unless the user separately requests it.

## Handoff Notes

- Start in the original checkout only long enough to create the worktree. After V0, run every command from `../.dotfiles-private-encrypted-workflow`.
- The original checkout may have unrelated uncommitted changes such as `artifacts/` or old prototype edits; do not depend on them and do not clean them up from this plan.
- Real day-to-day encryption requires at least one public `age1...` recipient in `config/age/recipients.txt`, but automated tests must generate temporary recipients and must not expose real secrets.
- The local `.git/hooks/pre-commit` file itself is not tracked; validate installer behavior with linked-worktree/temp repo tests rather than committing hook installation state.
- Use per-test temp paths such as `$tmp/age.out`; do not write reusable evidence or key material to shared `/tmp` paths.
- Rollback may remove the worktree only when `.pi-worktree-run-marker` exists and the branch/HEAD match this plan. Otherwise stop and report manual cleanup instructions.

## Execution Status

Completion classification: completed-and-archived.
Current date: 2026-05-12.
Last completed wave/gate: Final Gates F1-F5.
Next wave/gate to run: none.
Implemented: local worktree branch `plan/private-encrypted-workflow` at commit `1b8b873 feat: encrypt private files per path`; per-file `.encrypted/**/*.age` sync encryption/decryption, stale removal, fail-closed recipient handling, hook auto-encryption/staging, scanner blocking for plaintext private and non-age `.encrypted` paths, linked-worktree hook installation, metadata/docs/tests.
Validation evidence (all exit 0 unless noted):
- `cd ../.dotfiles-private-encrypted-workflow && uv run pytest test/test_private_archive.py` -> 8 passed.
- `cd ../.dotfiles-private-encrypted-workflow && python -m py_compile scripts/private-archive-encrypt scripts/private-archive-decrypt scripts/private-archive-status scripts/private_archive_lib.py scripts/install-x-private-hook` -> passed.
- `cd ../.dotfiles-private-encrypted-workflow && make lint-python` -> ruff check passed.
- `cd ../.dotfiles-private-encrypted-workflow && make test-quick` -> 199 passed.
- staged safety before commit: `git diff --cached --check && scripts/private-archive-scan --staged && git diff --cached -G'(AKIA|ghp_|sk-ant-|sk-proj_|BEGIN OPENSSH|PASSWORD=|TOKEN=|Bearer )' --exit-code -- . ':!*.age'` -> passed.
- final status: `git status --short` showed only untracked `.pi-worktree-run-marker`; `find private -type f -print` produced no plaintext private fixtures.
Manual validation: not required by validation contract; automated temp-repo/key fixtures cover behavior.
Deployment validation: not required; no deployment procedure.
Archive preflight: passed; no push/merge/rebase performed by final worktree workflow beyond temp-repo test fixtures.
