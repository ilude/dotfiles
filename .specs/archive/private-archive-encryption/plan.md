---
created: 2026-05-11
status: completed
completed: 2026-05-11
---

# Plan: Generalized Private Archive Encryption

## Context & Motivation

The repo has an SSH-key/age encryption PRD at `.specs/ssh-key-age-encryption-prd.md` and an existing x-specific per-file scaffold (`scripts/x-private-encrypt`, `scripts/x-private-decrypt`, `scripts/x-private-scan`, `scripts/install-x-private-hook`, `config/age/x-research-recipients.txt`). The user wants a generalized system where secrets, configs with keys, PII, mined personal data, logs, and `/handoff` output files are contained under `private/` and encrypted for repo storage.

The user selected archive-based encryption: `private/` plaintext locally, encrypted as `private.tar.age` for Git. Because encrypted archives are opaque to Git, the plan includes an explicit conflict-resolution system and tests for real Git conflict stages. After implementation, the PRD must be updated and moved next to this plan as `.specs/private-archive-encryption/prd.md`.

## Constraints

- Platform: Windows host using Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`).
- Shell: Bash in Git Bash/MSYS2; use forward-slash paths.
- Project markers: `pyproject.toml`, `Makefile`, `.gitattributes`.
- Likely repo-wide validation: `make test-quick`; strongest validation: `make check`.
- Python tooling uses `uv`; use `uv run python`/`uv run pytest`.
- Package policy already installs `age`; do not use npm or create `package-lock.json`.
- `age` and `age-keygen` are hard prerequisites for completion; age-dependent tests must not be skipped for final success.
- Do not read, print, commit, or inspect decrypted private content except controlled non-secret test fixtures.
- Do not modify `.env` files.
- Plaintext private data must remain gitignored.
- Encrypted archive `private.tar.age` is intentionally tracked by default; PRD must document encrypted-retention tradeoffs for personal PII/secrets.
- Conflict resolution must use controlled decrypt -> unpack -> directory merge -> re-encrypt, never direct ciphertext merging.
- `private/handoffs/` is the canonical destination for `/handoff` command output files, so handoff artifacts are private data and included in archive encryption.

## Risk & Manual Gate Decision

- **Risk level:** medium
- **Blast radius:** personal-local-repo
- **Rollback:** easy for code/config changes via Git; real private archive content operations can be data-loss-prone without backups
- **Manual approval before action:** not required for implementing scripts/tests/docs; required before running helpers against real user `private/` content
- **Manual validation after action:** not required for implementation because fixtures validate behavior without real secrets
- **Decision reason:** This plan changes local scripts, ignore rules, docs, tests, and PRD text. Automated fixture tests can validate behavior without touching real private data. Real private-data encrypt/decrypt/conflict operations are outside this implementation plan and require explicit future user invocation.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Whole archive `private.tar.age` | Small public surface; one artifact; portable; matches user selection | Opaque diffs; conflicts require resolver; overwrite risk | **Selected** |
| Per-file encrypted mirror | Better file-level diffs; existing partial scaffold | More path mapping and policy surface; user rejected | Rejected |
| Hybrid | Flexible | More complexity and leak/divergence risk | Rejected for v1 |
| Git merge driver | Integrated with `git merge` | Surprising secret-handling automation and temp plaintext risk | Rejected; explicit resolver is less surprising |

Opposite-pattern check: if this repo needed frequent collaborative edits to individual secret files, per-file encryption would be correct. This personal repo prioritizes containment over diffability.

## Objective

Implement and document a generalized private archive encryption system:

- `private/` is the canonical plaintext directory and remains ignored.
- `private/handoffs/` is the canonical plaintext destination for `/handoff` command output files.
- `private.tar.age` is the canonical encrypted archive artifact and is allowed/tracked by default.
- Helper scripts create, decrypt, scan, status-check, and resolve conflicts for the archive workflow.
- Helpers safely validate tar members, use atomic writes, avoid shell interpolation, clean temp plaintext, and back up/refuse risky overwrites.
- Tests validate archive encryption/decryption, multiple recipients, ignore/scanner/hook guardrails, malicious tar rejection, and real Git conflict-resolution behavior without real secrets.
- The PRD is updated and relocated next to this plan as `.specs/private-archive-encryption/prd.md`.

## Project Context

- **Language**: Python scripts plus shell/Git config/docs.
- **Test command**: `make test-quick`; focused tests with `uv run pytest test/test_private_archive.py -q`.
- **Lint command**: `make lint` or `make lint-python`.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `git status --short && age --version && age-keygen -version && make test-quick` | none | terminal output; missing `age`/`age-keygen` blocks completion |
| Implement helpers | edit/write scripts under `scripts/` | none; tests use generated identities | git diff and test output |
| Install hook integration | update hook installer/hook files | none | temp-repo hook test output |
| Verify focused behavior | `uv run pytest test/test_private_archive.py -q` | generated identities only | pytest output with zero age-dependent skips |
| Repo-wide validation | `make check` | none | command output |
| Rollback | `git checkout -- <changed-files>` before commit, or revert local commit after commit | none | `git status --short` |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 1

- [x] T0: Inventory private data categories and migration boundaries
  - Status: completed
  - Evidence: `.specs/archive/private-archive-encryption/private-inventory.md` created and grep acceptance passed.
- [x] T1: Align repo policy paths for archive encryption
  - Status: completed
  - Evidence: ignore, scan, handoff, attributes, and hook acceptance checks passed.
- [x] T2: Implement archive encrypt/decrypt/scan/status helpers
  - Status: completed
  - Evidence: focused pytest checks for encrypt/decrypt/recipients/status/unsafe tar/atomic behavior passed.
- [x] V1: Validate wave 1
  - Status: completed
  - Evidence: py_compile, acceptance checks, and `make test-quick` passed.

### Wave 2

- [x] T3: Implement explicit archive conflict resolver
  - Status: completed
  - Evidence: focused real Git conflict detection, resolution, and cleanup pytest checks passed.
- [x] T4: Add focused tests and fixtures
  - Status: completed
  - Evidence: `uv run pytest test/test_private_archive.py -q` passed with generated identities only.
- [x] V2: Validate wave 2
  - Status: completed
  - Evidence: all T3/T4 acceptance checks and `make test-quick` passed.

### Wave 3

- [x] T5: Update and relocate PRD next to plan
  - Status: completed
  - Evidence: `.specs/archive/private-archive-encryption/prd.md` exists and documents private archive concepts.
- [x] V3: Validate wave 3
  - Status: completed
  - Evidence: PRD acceptance, compatibility grep, and `make test-quick` passed.

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: completed
  - Evidence: every acceptance criterion command was run or covered by focused checks.
- [x] F2: Repo-wide validation complete
  - Status: completed
  - Evidence: `make check` passed.
- [x] F3: Manual validation not required or completed
  - Status: completed
  - Evidence: manual validation not required; fixture tests avoid real private data.
- [x] F4: Deployment validation complete or not required
  - Status: completed
  - Evidence: deployment not required for local scripts/docs/tests.
- [x] F5: Archive preflight complete
  - Status: completed
  - Evidence: all gates passed; spec archived at `.specs/archive/private-archive-encryption/`.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Inventory private data categories and migration boundaries | 1-2: `.specs/private-archive-encryption/private-inventory.md` or PRD section | mechanical | small | planner | -- |
| T1 | Align repo policy paths for archive encryption | 2-4: `.gitignore`, `.gitattributes`, hook installer/hook docs | feature | medium | devops-pro | -- |
| T2 | Implement archive encrypt/decrypt/scan/status helpers | 4-7: `scripts/private-archive-*`, `scripts/private-archive-status`, x-private wrappers/deprecations | feature | medium | python-pro | -- |
| V1 | Validate wave 1 | -- | validation | medium | qa-engineer | T0, T1, T2 |
| T3 | Implement explicit archive conflict resolver | 1-2: `scripts/private-archive-conflict-resolve` and optional docs string | feature | medium | python-pro | V1 |
| T4 | Add focused tests and fixtures | 1-3: `test/test_private_archive.py`, fixtures/temp helpers | feature | medium | qa-engineer | V1 |
| V2 | Validate wave 2 | -- | validation | medium | qa-engineer | T3, T4 |
| T5 | Update and relocate PRD next to plan | 2: `.specs/private-archive-encryption/prd.md`, old PRD pointer/archive decision | mechanical | small | planner | V2 |
| V3 | Validate wave 3 | -- | validation | small | qa-engineer | T5 |

## Execution Waves

### Wave 1 (parallel)

**T0: Inventory private data categories and migration boundaries** [small] -- planner
- Description: Create a non-secret inventory/taxonomy for what belongs under `private/` without reading secret contents. Include secrets/configs with keys, PII, logs, mined personal data, and `/handoff` outputs under `private/handoffs/`; explicitly list out-of-scope/generated/cache paths that should not be archived.
- Files: `.specs/private-archive-encryption/private-inventory.md` or a dedicated PRD section.
- Acceptance Criteria:
  1. [ ] Inventory defines in/out rules without exposing secret values.
     - Verify: `test -f .specs/private-archive-encryption/private-inventory.md && grep -E "handoffs|PII|secrets|logs|out-of-scope" .specs/private-archive-encryption/private-inventory.md`
     - Pass: file exists and names categories/rules only, not secret values.
     - Fail: add non-secret taxonomy and remove any sensitive content.

**T1: Align repo policy paths for archive encryption** [medium] -- devops-pro
- Description: Make repo policy match archive mode. Ensure `private/` and temporary plaintext archive variants are ignored, `private.tar.age` is not ignored, `/handoff` command outputs are directed to `private/handoffs/`, `.gitattributes` disables diff/merge/filter/textconv for `private.tar.age`, and hook installation invokes the archive scanner. Preserve existing `private-encrypted/` safeguards only if needed for compatibility.
- Files: `.gitignore`, `.gitattributes`, `scripts/git-hooks/*`, `scripts/install-x-private-hook` or renamed successor, handoff command surface.
- Acceptance Criteria:
  1. [ ] Plaintext paths are ignored individually and encrypted archive is committable.
     - Verify: `for p in private/ private.tar private.conflicts/ private.tar.gz private-merge.tar .private.tar; do git check-ignore -q -- "$p" || exit 1; done; ! git check-ignore -q -- private.tar.age`
     - Pass: every plaintext/temp path is ignored individually; `private.tar.age` is not ignored.
     - Fail: adjust ignore negation/order.
  2. [ ] Scanner/hook policy blocks plaintext private paths and allows only the encrypted archive artifact.
     - Verify: `python - <<'PY'
from pathlib import Path
Path('/tmp/private-blocked.paths').write_bytes(b'private/foo.txt\0private/handoffs/example.md\0private.tar\0private.conflicts/foo\0private.tar.gz\0')
Path('/tmp/private-allowed.paths').write_bytes(b'private.tar.age\0')
PY
scripts/private-archive-scan --paths-from /tmp/private-blocked.paths && exit 1 || true
scripts/private-archive-scan --paths-from /tmp/private-allowed.paths`
     - Pass: plaintext paths, handoff files, and temp archive variants are blocked; `private.tar.age` is allowed.
     - Fail: update scanner path predicates.
  3. [ ] `/handoff` command output path is documented or configured as `private/handoffs/`.
     - Verify: `grep -R "private/handoffs" claude opencode copilot pi .specs/private-archive-encryption/plan.md 2>/dev/null`
     - Pass: the owning handoff command surface and plan/PRD mention `private/handoffs/`.
     - Fail: update the owning handoff command/config surface and PRD text.
  4. [ ] `private.tar.age` has safe Git attributes.
     - Verify: `git check-attr diff merge filter textconv -- private.tar.age`
     - Pass: output shows no custom diff, merge, filter, or textconv for `private.tar.age`, and `.gitattributes` contains `private.tar.age binary -diff -merge`.
     - Fail: update `.gitattributes`.
  5. [ ] Hook installer installs and invokes the archive scanner.
     - Verify: `uv run pytest test/test_private_archive.py -k hook_install -q`
     - Pass: temp repo hook exists, is executable where supported, calls `private-archive-scan`, blocks staged `private/*`, and allows `private.tar.age`.
     - Fail: update installer/hook integration.

**T2: Implement archive encrypt/decrypt/scan/status helpers** [medium] -- python-pro
- Description: Generalize x-specific helpers into archive-mode helpers. Provide commands that archive `private/`, encrypt to `private.tar.age`, decrypt back to `private/`, scan staged/path-list inputs, and report status without decrypting. Use `config/age/recipients.txt`, support multiple recipients, validate tar members before extraction, reject unsafe paths/links, avoid shell interpolation, use temp files plus atomic replace, back up or refuse overwriting existing `private/`, clean temp plaintext, and never print private content. Existing `x-private-*` scripts must become wrappers or be explicitly deprecated with tests proving one active scanner/hook policy.
- Files: `scripts/private-archive-encrypt`, `scripts/private-archive-decrypt`, `scripts/private-archive-scan`, `scripts/private-archive-status`, `config/age/recipients.txt`, compatibility wrappers as needed.
- Acceptance Criteria:
  1. [ ] Encrypt helper archives `private/`, writes `private.tar.age`, and removes plaintext temp archive.
     - Verify: `uv run pytest test/test_private_archive.py -k "encrypt and not skip" -q`
     - Pass: ciphertext exists; temp `.tar` does not; previous archive is preserved on failure.
     - Fail: fix temp cleanup and atomic replacement.
  2. [ ] Decrypt helper restores `private/` and refuses/destructively protects overwrites.
     - Verify: `uv run pytest test/test_private_archive.py -k "decrypt and not skip" -q`
     - Pass: fixture files restore byte-for-byte; existing `private/` is preserved on failed decrypt and backed up/refused before overwrite.
     - Fail: fix output path checks, backup/refusal, and extraction logic.
  3. [ ] Multiple recipients are supported.
     - Verify: `uv run pytest test/test_private_archive.py -k "recipients and not skip" -q`
     - Pass: generated archive decrypts with either generated identity.
     - Fail: fix recipient-file handling.
  4. [ ] Status/preflight command fails closed without decrypting or printing private content.
     - Verify: `uv run pytest test/test_private_archive.py -k status -q`
     - Pass: status reports age availability, recipients presence, ignore policy, archive freshness metadata, hook status, and staged-plaintext status without file contents.
     - Fail: implement/fix status mode.
  5. [ ] Unsafe tar members and failed subprocesses cannot write outside the destination or corrupt prior outputs.
     - Verify: `uv run pytest test/test_private_archive.py -k "unsafe_tar or subprocess_failure or atomic" -q`
     - Pass: malicious archives are rejected; failed operations leave prior `private/` and `private.tar.age` unchanged; temp plaintext is cleaned.
     - Fail: add member validation, safe subprocess handling, atomic replace, and cleanup in `finally`.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- qa-engineer
- Blocked by: T0, T1, T2
- Checks:
  1. Run T0, T1, and T2 acceptance criteria.
  2. `uv run python -m py_compile scripts/private-archive-encrypt scripts/private-archive-decrypt scripts/private-archive-scan scripts/private-archive-status` for Python helpers that exist.
  3. `make test-quick` exits 0.
  4. Cross-task integration: helper output paths match `.gitignore`, `.gitattributes`, scanner policy, and status output.
- On failure: create a fix task, re-validate after fix.

### Wave 2

**T3: Implement explicit archive conflict resolver** [medium] -- python-pro
- Blocked by: V1
- Description: Add `scripts/private-archive-conflict-resolve`. It must refuse to run unless `private.tar.age` has Git conflict stages, extract stages 1/2/3 via explicit stage addressing such as `git show :1:private.tar.age`, decrypt/unpack base/ours/theirs into OS temp outside the worktree with restrictive permissions, perform safe directory-level merge decisions, write conflict sidecars/manifests without private file contents, re-encrypt only fixture-resolved directories during this implementation plan, and clean temp plaintext on success/failure unless `--keep-temp` is explicitly passed with a loud warning. Real private-data conflict resolution is outside this implementation plan and requires explicit future user invocation.
- Files: `scripts/private-archive-conflict-resolve`.
- Acceptance Criteria:
  1. [ ] Resolver detects actual Git conflict stages correctly.
     - Verify: `uv run pytest test/test_private_archive.py -k "conflict_detection and real_git" -q`
     - Pass: temp Git repo creates a real merge conflict; `git ls-files -u -- private.tar.age` has stages 1/2/3; no-conflict fixture refuses clearly.
     - Fail: fix stage detection and path-safe parsing.
  2. [ ] Resolver handles non-overlapping fixture changes and reports overlapping conflicts without printing contents.
     - Verify: `uv run pytest test/test_private_archive.py -k "conflict_resolve and real_git" -q`
     - Pass: non-overlap result re-encrypts; overlap creates path-only or redacted sidecars/manifest; no file contents printed.
     - Fail: fix merge algorithm or conflict output policy.
  3. [ ] Resolver cleans decrypted temp files unless `--keep-temp` is set.
     - Verify: `uv run pytest test/test_private_archive.py -k "conflict_cleanup and not skip" -q`
     - Pass: no temp plaintext under repo root after success/failure; `--keep-temp` warns and reports metadata only.
     - Fail: fix temp-root and `finally` cleanup.

**T4: Add focused tests and fixtures** [medium] -- qa-engineer
- Blocked by: V1
- Description: Add pytest coverage for archive helpers, scanner policy, hook install, malicious tar rejection, multi-recipient age encryption, and conflict resolver. Tests must generate temporary age identities and private fixture files, avoid real user SSH keys, avoid actual repo-root `private/`, set `HOME`/`XDG_CONFIG_HOME` to temp dirs, and run risky behavior inside isolated temp Git repos.
- Files: `test/test_private_archive.py`, optional non-secret fixtures.
- Acceptance Criteria:
  1. [ ] Tests use generated temporary identities only.
     - Verify: `grep -R "\.ssh\|id_ed25519" test/test_private_archive.py`
     - Pass: no real identity dependency appears.
     - Fail: replace with generated identities.
  2. [ ] Tests cover scanner, encrypt, decrypt, recipients, status, unsafe tar, hook, and conflict behavior.
     - Verify: `uv run pytest test/test_private_archive.py -q`
     - Pass: all focused tests pass with zero age-dependent skips.
     - Fail: fix implementation or tests.
  3. [ ] Tests include real Git conflict, hook, malicious tar, temp isolation, and staged scanner cases.
     - Verify: `uv run pytest test/test_private_archive.py -k "real_git or hook_install or unsafe_tar or isolation or staged" -q`
     - Pass: temp repos exercise actual Git stages/hooks/scanner; malicious tar entries are rejected; repo-root `private/` is absent or untouched.
     - Fail: replace mocks with integration fixtures and isolate environment variables.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- qa-engineer
- Blocked by: T3, T4
- Checks:
  1. Run all T3/T4 acceptance criteria.
  2. `uv run pytest test/test_private_archive.py -q` exits 0 with no age-dependent skips.
  3. `make test-quick` exits 0.
  4. Confirm no plaintext fixture artifacts appear in `git status --short` except non-secret tests/docs/scripts.
- On failure: create a fix task, re-validate after fix.

### Wave 3

**T5: Update and relocate PRD next to plan** [small] -- planner
- Blocked by: V2
- Description: Update the original PRD to reflect selected archive-based generalized private system, conflict resolution requirements, private data inventory/taxonomy, `/handoff` destination, tracked-by-default `private.tar.age` retention tradeoff, and write it to `.specs/private-archive-encryption/prd.md`. The old `.specs/ssh-key-age-encryption-prd.md` should be removed, replaced with a pointer, or archived according to least-surprising repo convention; document the choice.
- Files: `.specs/private-archive-encryption/prd.md`, `.specs/ssh-key-age-encryption-prd.md`.
- Acceptance Criteria:
  1. [ ] PRD describes `private/`, `private/handoffs/`, `private.tar.age`, helper commands, guardrails, inventory, tests, and conflict resolver.
     - Verify: `grep -E "private/|private/handoffs/|private.tar.age|conflict|private-archive|retention|inventory" .specs/private-archive-encryption/prd.md`
     - Pass: all concepts are present.
     - Fail: update PRD sections.
  2. [ ] PRD is next to this plan file.
     - Verify: `test -f .specs/private-archive-encryption/prd.md`
     - Pass: file exists.
     - Fail: move/write PRD to correct path.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [small] -- qa-engineer
- Blocked by: T5
- Checks:
  1. Run T5 acceptance criteria.
  2. `grep -R "x-research-recipients" .specs/private-archive-encryption/prd.md scripts test || true` and confirm any remaining references are compatibility-only.
  3. `make test-quick` exits 0.
- On failure: create a fix task, re-validate after fix.

## Dependency Graph

```text
Wave 1: T0, T1, T2 (parallel) -> V1
Wave 2: T3, T4 (parallel after V1) -> V2
Wave 3: T5 (after V2) -> V3
Final: V3 -> F1 -> F2 -> F3 -> F4 -> F5
```

## Success Criteria

1. [ ] End-to-end fixture encrypt/decrypt succeeds without real secrets.
   - Verify: `uv run pytest test/test_private_archive.py -q`
   - Pass: all focused tests pass, no age-dependent tests are skipped, and no real `private/` content is accessed.
2. [ ] Repo guardrails enforce archive policy.
   - Verify: `for p in private/ private.tar private.conflicts/ private.tar.gz private-merge.tar .private.tar; do git check-ignore -q -- "$p" || exit 1; done; ! git check-ignore -q -- private.tar.age`
   - Pass: all plaintext/temp paths are ignored individually; encrypted archive is committable.
3. [ ] Conflict resolver is validated with fixture conflicts.
   - Verify: `uv run pytest test/test_private_archive.py -k conflict -q`
   - Pass: no-conflict, non-overlap, overlap, real Git stage extraction, and cleanup cases pass with no age-dependent skips.
4. [ ] PRD is updated and co-located with the plan.
   - Verify: `test -f .specs/private-archive-encryption/prd.md && grep -q "private.tar.age" .specs/private-archive-encryption/prd.md`
   - Pass: file exists and documents selected archive artifact.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must be able to run all implementation validation through documented commands, scripts, or wrappers.
- Credentials: tests must use generated temporary age identities only; real SSH keys or real `private/` data are not required and must not be accessed. `age` and `age-keygen` are required for completion.
- Manual-only steps: none for implementation. Running helpers or conflict resolution against real user private data is outside this plan and requires explicit future user request/approval before touching real `private/`.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command.
   - Command: `make check`
   - Pass: exits 0 with no errors or warnings
   - Fail: do not archive; update `## Execution Status` with the failing command and next fix

2. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command
   - Pass: every acceptance criterion passes exactly as written, with no skipped age-dependent tests
   - Fail: create/fix a task, rerun affected checks, then rerun repo-wide validation

3. [ ] Confirm no plaintext private artifacts are staged or tracked.
   - Command: `git status --short && ! git ls-files | grep -E '^(private/|private\.tar$|private\.conflicts/)' && ! git status --short | grep -E '(^| )[AM?][AM?]? (private/|private\.tar$|private\.conflicts/)'`
   - Pass: no tracked, staged, or untracked plaintext private paths are listed.
   - Fail: remove plaintext from Git tracking/worktree or update ignore/scanner rules.

4. [ ] Confirm archive prerequisites ran for real.
   - Command: `age --version && age-keygen -version && uv run pytest test/test_private_archive.py -q`
   - Pass: tools exist and focused tests pass with no age-dependent skips.
   - Fail: keep plan blocked; do not mark F1/F2 complete.

### Manual validation

- Required: no
- Justification: Automated fixture tests are sufficient for implementation. The plan does not operate on real user secrets, keys, PII, logs, or real `private/` content.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None. This is a local repo script/docs/test change, not a deployment.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, deployment validation, repo-wide validation, PRD relocation, no-plaintext checks, and no-skip age-dependent tests pass. Do not archive if `make check` fails, `age`/`age-keygen` is unavailable, or any plaintext private artifacts are tracked/staged/untracked in the real repo.

## Execution Status

- **Completion classification:** completed-and-archived
- **Current status:** completed on 2026-05-11; all waves and final gates passed.
- **Last completed wave/gate:** F5 archive preflight.
- **Next wave/gate:** none.
- **Implemented:** private archive helpers, scanner/hook policy, conflict resolver, focused tests, private inventory, handoff destination documentation, and co-located PRD.
- **Validation evidence:** `uv run pytest test/test_private_archive.py -q` (6 passed), task-specific `-k` pytest checks passed, `make test-quick` passed (199 passed), `make check` passed (All checks passed), `age --version` and `age-keygen -version` returned v1.3.1, and no plaintext private artifacts were tracked/staged/untracked.
- **Manual validation:** not required; automated fixture validation covers implementation without touching real `private/` data.
- **Deployment validation:** not required; local repo script/docs/test change only.
- **Archive decision:** archived at `.specs/archive/private-archive-encryption/`.

## Handoff Notes

- Do not run encryption/decryption/conflict helpers on the user's real `private/` directory during implementation or tests.
- Use generated temporary age identities in pytest fixtures.
- Preserve or deliberately replace existing `x-private-*` scripts; do not leave two contradictory systems without compatibility tests and docs.
- If `age` or `age-keygen` is missing, implementation may stop after static/docs edits, but the plan remains blocked. Full completion requires age-dependent tests to run, not skip.
