---
created: 2026-05-12
status: completed
completed: 2026-05-12
---

# Plan: Dolos Private Archive Workflow

## Context & Motivation

The current private archive workflow keeps plaintext under gitignored `private/` and encrypted outputs under `.encrypted/`, with pre-commit logic that can run encryption, require recipient setup, and mutate the Git index during unrelated commits. This already caused `/commit push` to fail when the hook tried to encrypt with an empty recipients file. The desired replacement is **Dolos**: an explicit Git-like private archive workflow where operators run a CLI to manage `private/` and a single tracked encrypted artifact, while hooks only block unsafe plaintext staging.

The reviewed PRD at `.specs/dolos-private-archive/PRD.md` defines the MVP: a Go CLI named `bin/dolos`, one archive `private/` ⇄ `.dolos/artifacts/private.tar.gz.age`, tracked SSH public keys in `.dolos/authorized_keys`, age-compatible SSH private identities for unpack, scratch-first decrypt, strict tar/resource validation, per-worktree local state under `git rev-parse --git-path dolos/...`, and migration away from active `.encrypted/` private archive semantics.

This plan intentionally implements the standalone Dolos MVP first. `/commit` auto-pack and remote freshness integration are **deferred to a later plan** after standalone pack/unpack/status/scan behavior is dogfooded and validated.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`, shell `/usr/bin/bash`).
- Use forward-slash paths.
- Project markers detected: `pyproject.toml`, `Makefile`, `.gitattributes`, `justfile`.
- Existing Go/Docker reference: `claude/claude-status-go/Dockerfile` and `build.sh` use `golang:1.23-alpine`, `GOOS`, `GOARCH`, and `BINARY` build args.
- Primary local validation should use Go directly when available: `cd tools/dolos && go test ./...` and `go build`. Docker build parity should be validated when Docker is available, but Docker absence alone must not block core unit-test progress if local Go works.
- Dolos build output is checkout-local/repo-managed: `bin/dolos` on POSIX-like targets and `bin/dolos.exe` on Windows targets. It is not installed into `~/.claude` or any client-specific directory.
- MVP manages exactly one archive named `private`; multi-archive user behavior is out of scope.
- `.dolos/authorized_keys` is mandatory for pack. Do not use implicit local public-key fallback.
- Tests must generate temporary SSH keypairs and temporary repos. They must not use real private keys, real `private/` contents, or a real encrypted artifact from the user's `private/` directory.
- The plan may create tracked `.dolos/authorized_keys` test/example content only if it contains non-secret public keys or comments. It must not generate `.dolos/artifacts/private.tar.gz.age` from real `private/` during `/do-it`.
- Git hooks must not pack, decrypt, stage, or mutate Dolos state. Hooks may only block/warn on staged plaintext private paths or unsafe artifacts.
- Existing unrelated working-tree changes must be preserved. `/do-it` must only stage/commit plan-scoped paths if the user later asks it to commit.

## Risk & Manual Gate Decision

Manual gates are exceptional. Decide based on blast radius and rollback, not generic confidence. Be conservative for work/shared systems and data/resources that cost money; treat personal/local GitHub repos as localized-to-user when changes are reversible and validated.

- **Risk level:** medium
- **Blast radius:** personal-local-repo
- **Rollback:** known/easy for tracked code changes via git; generated fixtures and temp repos are disposable; real `private/` must not be modified by tests.
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** This is local repo tooling and tests. Validation uses generated SSH keys, generated temp repositories, generated archives, and non-mutating checks in the real checkout. No shared service, paid resource, hardware action, or irreversible side effect is involved.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Keep pre-commit auto-encryption | Automatic encrypted output refresh | Breaks unrelated commits, mutates index, requires key config during normal commits | Rejected: caused the motivating failure |
| Per-file `.encrypted/**/*.age` mirror | Path-level Git changes | More moving parts, leaks path structure, drifted from user preference for a single archive | Rejected for MVP |
| Single `.dolos/artifacts/private.tar.gz.age` archive | Simple canonical artifact, internal manifest fits naturally | Any private change rewrites one opaque binary artifact | **Selected**; document opaque artifact churn and rely on `dolos status` for freshness |
| SOPS or git-crypt | Established secret workflows | Does not match ignored plaintext directory plus explicit pack/unpack/index workflow | Rejected |
| Python-only scripts | Reuses current repo Python tests | User wants a Go executable and existing Go/Docker build pattern reuse | Rejected |
| Phase 2 `/commit` auto-pack now | Convenient end-to-end flow | Reintroduces commit coupling before standalone safety is proven | Deferred to a later plan |
| Fully generic multi-archive sync now | Future reusable tool | Premature abstraction and larger state-machine burden | Rejected for MVP; keep only trivial archive-name isolation internally |

Convergence note: the selected design converges on explicit CLI state transitions rather than transparent Git hooks/filters. The opposite pattern -- transparent filters or hook-driven packing -- would be correct for teams prioritizing invisible encryption over explicit operator control and with mature recovery tooling. This repo's failure mode showed that explicit control is preferable here.

## Objective

Implement and validate a standalone Dolos MVP for this repo:

- Go CLI source under `tools/dolos/`, build output at `bin/dolos` or `bin/dolos.exe`.
- Commands: `init`, `status`, `pack private`, `unpack private`, and `scan --staged`.
- Tracked Dolos files: `.dolos/authorized_keys` and, when deliberately created outside real-private tests, `.dolos/artifacts/private.tar.gz.age`.
- Per-worktree local state/scratch/locks under `git rev-parse --git-path dolos/...`.
- Deterministic manifest/digest/index/status model with a transaction contract for pack/unpack/index updates.
- Strict archive validation, resource limits, scratch permissions/cleanup, evidence hygiene, and no plaintext/key leakage.
- Migration of active private archive scripts/hooks/tests/docs away from `.encrypted/` auto-encryption semantics.
- Phase 2 `/commit` auto-pack documented as deferred, not implemented or enabled by this plan.

## Project Context

- **Language**: Go for `bin/dolos`; Python/pytest for existing private archive regression tests; shell for hook/wrapper scripts.
- **Test command**: `cd tools/dolos && go test ./...`; `uv run pytest test/test_private_archive.py`.
- **Lint command**: `gofmt -l tools/dolos`; `make lint-python` if Python files change.
- **Repo-wide validation**: `make test-quick`; run `make check` only if practical and record any timeout/pre-existing failure.
- **Existing paths to inventory/migrate**: `.gitignore`, `.gitattributes`, `scripts/git-hooks/pre-commit-x-private`, `scripts/install-x-private-hook`, `scripts/private-archive-*`, `scripts/x-private-*`, `scripts/private_archive_lib.py`, `test/test_private_archive.py`, `pi/prompts/handoff.md`, `claude/claude-status-go/`.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight status | `mkdir -p .specs/dolos-private-archive/evidence && { git status --short; git diff --stat -- .gitignore .gitattributes scripts test pi/prompts/handoff.md tools/dolos bin .dolos; } > .specs/dolos-private-archive/evidence/preflight-status.txt` | none | `.specs/dolos-private-archive/evidence/preflight-status.txt` |
| Tool inventory | `git grep -n "private-archive\|\.encrypted\|recipients.txt\|pre-commit-x-private" -- . ':!.git' > .specs/dolos-private-archive/evidence/inventory.txt || true` | none | `.specs/dolos-private-archive/evidence/inventory.txt` |
| Age SSH proof | `cd tools/dolos && go test ./... -run TestAgeSSHSupport` after skeleton exists | generated fixture keys only | `.specs/dolos-private-archive/evidence/age-ssh-proof.txt` |
| Local Go build/test | `cd tools/dolos && go test ./... && go build -o ../../bin/dolos.exe .` on Windows or `go build -o ../../bin/dolos .` elsewhere | generated fixture keys only | `.specs/dolos-private-archive/evidence/go-test.txt` |
| Docker parity build | `bash tools/dolos/build.sh` if Docker is available | local Docker daemon | `.specs/dolos-private-archive/evidence/dolos-build.txt` |
| Python private workflow tests | `uv run pytest test/test_private_archive.py` | generated fixture keys only | `.specs/dolos-private-archive/evidence/private-pytest.txt` |
| Git metadata validation | `! git check-ignore -q .dolos/authorized_keys .dolos/artifacts/private.tar.gz.age; git check-attr --all -- .dolos/artifacts/private.tar.gz.age .dolos/authorized_keys` | none | `.specs/dolos-private-archive/evidence/git-metadata.txt` |
| Legacy active-code check | `python test/private_archive_legacy_allowlist_check.py` or equivalent pytest assertion | none | included in `.specs/dolos-private-archive/evidence/private-pytest.txt` |
| Real-repo non-mutating check | `./bin/dolos.exe status || ./bin/dolos status; ./bin/dolos.exe scan --staged || ./bin/dolos scan --staged; git check-attr --all -- .dolos/artifacts/private.tar.gz.age .dolos/authorized_keys` | none | `.specs/dolos-private-archive/evidence/real-repo-check.txt` |
| Evidence hygiene | `grep -R -nE 'CANARY_PRIVATE_SECRET|BEGIN OPENSSH|AGE-SECRET-KEY|PRIVATE KEY|do-not-print|fixture secret' .specs/dolos-private-archive/evidence && exit 1 || true` | none | `.specs/dolos-private-archive/evidence/no-secret-check.txt` |
| Repo-wide validation | `make test-quick` and `make lint-python` if Python changed | none | `.specs/dolos-private-archive/evidence/repo-validation.txt` |
| Deploy | not applicable | none | not applicable |
| Rollback | `git restore --staged -- <plan-scoped paths>; git restore -- <plan-scoped paths>; rm -rf tools/dolos bin/dolos bin/dolos.exe .dolos/artifacts/private.tar.gz.age` only after confirming generated/unwanted paths | none | working tree returns to pre-plan state; never remove real `private/` |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 0

- [x] T1: Preflight inventory, tool proof, and evidence setup
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/preflight-status.txt`, `.specs/dolos-private-archive/evidence/inventory.txt`, `.specs/dolos-private-archive/evidence/go-version.txt`, `.specs/dolos-private-archive/evidence/age-version.txt`
- [x] V0: Validate preflight
  - Status: passed
  - Evidence: required preflight evidence files exist; no implementation edits were present before validation; no real `private/` content was read, copied, packed, or logged.

### Wave 1

- [x] T2: Create Dolos Go build skeleton
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/go-test.txt`, `.specs/dolos-private-archive/evidence/dolos-build.txt`
- [x] T3: Define core state, transaction, package, and CLI contracts
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/go-test.txt`
- [x] V1: Validate wave 1
  - Status: passed
  - Evidence: `cd tools/dolos && go test ./...`; `go build -o ../../bin/dolos.exe .`; `bash tools/dolos/build.sh`; `gofmt -l tools/dolos` all passed.

### Wave 2

- [x] T4: Implement pack, age SSH recipients, and atomic artifact promotion
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/age-ssh-proof.txt`, `.specs/dolos-private-archive/evidence/wave2-validation.txt`
- [x] T5: Implement scratch-first unpack, archive validation, and transactional promotion
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/wave2-validation.txt`
- [x] T6: Implement init/status/scan CLI behavior and locking
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/wave2-validation.txt`
- [x] V2: Validate wave 2
  - Status: passed
  - Evidence: `cd tools/dolos && go test ./...`; `go test ./... -run TestEndToEndTempRepoSSHKeys`; `go test ./... -run TestWorktreeStateIsolation`; `gofmt -l tools/dolos` all passed.

### Wave 3

- [x] T7: Migrate old private archive scripts, hooks, docs, ignore rules, and attributes
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/private-pytest-t7.txt`, `.specs/dolos-private-archive/evidence/git-metadata-t7.txt`, `.specs/dolos-private-archive/evidence/ruff-t7.txt`
- [x] T8: Add comprehensive regression tests, fixture coverage, and evidence hygiene
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/private-pytest.txt`, `.specs/dolos-private-archive/evidence/t8-go-fixtures.txt`, `.specs/dolos-private-archive/evidence/no-secret-check.txt`, `.specs/dolos-private-archive/evidence/real-repo-check.txt`
- [x] V3: Validate wave 3
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/go-test.txt`, `.specs/dolos-private-archive/evidence/private-pytest.txt`, `.specs/dolos-private-archive/evidence/ruff-t8-v3.txt`, `.specs/dolos-private-archive/evidence/git-metadata.txt`, `.specs/dolos-private-archive/evidence/real-repo-check.txt`, `.specs/dolos-private-archive/evidence/no-secret-check.txt`

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/final-go-build.txt`, `.specs/dolos-private-archive/evidence/dolos-build.txt`, `.specs/dolos-private-archive/evidence/private-pytest.txt`, `.specs/dolos-private-archive/evidence/no-secret-check.txt`
- [x] F2: Repo-wide validation complete
  - Status: passed
  - Evidence: `.specs/dolos-private-archive/evidence/repo-validation.txt`, `.specs/dolos-private-archive/evidence/ruff-t8-v3.txt`
- [x] F3: Manual validation not required or completed
  - Status: passed
  - Evidence: plan risk gate says manual validation is not required; automated generated-temp-repo and non-mutating real-repo checks passed.
- [x] F4: Deployment validation complete or not required
  - Status: passed
  - Evidence: deployment is not required for checkout-local tooling; Docker parity build passed in `.specs/dolos-private-archive/evidence/dolos-build.txt`.
- [x] F5: Archive preflight complete
  - Status: passed
  - Evidence: final validation evidence exists; no `.dolos/artifacts/private.tar.gz.age` was generated from real `private/`; `.specs/dolos-private-archive/` is ready to archive under `.specs/archive/dolos-private-archive/`.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Preflight inventory, tool proof, and evidence setup | 1-4 evidence files | mechanical | small | devops-pro | -- |
| V0 | Validate preflight | -- | validation | small | qa-engineer | T1 |
| T2 | Create Dolos Go build skeleton | 4-6 files | feature | medium | backend-dev | V0 |
| T3 | Define core state, transaction, package, and CLI contracts | 3-6 files | feature | medium | backend-dev | V0 |
| V1 | Validate wave 1 | -- | validation | medium | qa-engineer | T2, T3 |
| T4 | Implement pack, age SSH recipients, and atomic artifact promotion | 3-6 files | feature | medium | backend-dev | V1 |
| T5 | Implement scratch-first unpack, archive validation, and transactional promotion | 3-6 files | feature | medium | backend-dev | V1 |
| T6 | Implement init/status/scan CLI behavior and locking | 3-6 files | feature | medium | backend-dev | V1 |
| V2 | Validate wave 2 | -- | validation | medium | qa-engineer | T4, T5, T6 |
| T7 | Migrate old private archive scripts, hooks, docs, ignore rules, and attributes | 8-12 files | architecture | large | backend-dev | V2 |
| T8 | Add comprehensive regression tests, fixture coverage, and evidence hygiene | 2-5 files | feature | medium | qa-engineer | V2 |
| V3 | Validate wave 3 | -- | validation | large | qa-engineer | T7, T8 |

## Execution Waves

### Wave 0

**T1: Preflight inventory, tool proof, and evidence setup** [small] -- devops-pro
- Description: Capture current WIP, inventory old private archive references, and prove prerequisites before any modifying task. If Go or age SSH support is unavailable, stop with evidence rather than starting implementation.
- Files: `.specs/dolos-private-archive/evidence/*`.
- Acceptance Criteria:
  1. [ ] Planned-path status and inventory are captured before edits.
     - Verify: `mkdir -p .specs/dolos-private-archive/evidence && { git status --short; git diff --stat -- .gitignore .gitattributes scripts test pi/prompts/handoff.md tools/dolos bin .dolos; } > .specs/dolos-private-archive/evidence/preflight-status.txt && git grep -n "private-archive\|\.encrypted\|recipients.txt\|pre-commit-x-private" -- . ':!.git' > .specs/dolos-private-archive/evidence/inventory.txt || true`
     - Pass: evidence files exist and list current WIP/references.
     - Fail: evidence missing or command errors before writing status.
  2. [ ] Local Go and age SSH support path is decided before implementation.
     - Verify: `go version > .specs/dolos-private-archive/evidence/go-version.txt 2>&1 || true; age --version > .specs/dolos-private-archive/evidence/age-version.txt 2>&1 || true`
     - Pass: either local Go is available, or plan execution records that Docker-only build will be used; age CLI availability is recorded or the implementation explicitly chooses a Go age dependency with SSH recipient support.
     - Fail: no viable Go build path and no age/library strategy is documented.

### Wave 0 -- Validation Gate

**V0: Validate preflight** [small] -- qa-engineer
- Blocked by: T1
- Checks:
  1. Evidence files exist: `preflight-status.txt`, `inventory.txt`, `go-version.txt`, and `age-version.txt` or documented library decision.
  2. T2/T3 must not start until V0 is checked.
  3. No real `private/` contents are read, copied, packed, or logged.
- On failure: fix preflight evidence and rerun V0 before any implementation edits.

### Wave 1

**T2: Create Dolos Go build skeleton** [medium] -- backend-dev
- Blocked by: V0
- Description: Add Go source/build structure for Dolos. Local Go build is primary when available; Docker build reuses the `claude-status-go` build-arg pattern for parity. Use `bash tools/dolos/build.sh` in validation to avoid Windows executable-bit issues; also preserve executable bit if committing the script supports it.
- Files: `tools/dolos/go.mod`, `tools/dolos/main.go`, `tools/dolos/Dockerfile`, `tools/dolos/build.sh`, `bin/.gitkeep` if needed.
- Acceptance Criteria:
  1. [ ] Local build and help work.
     - Verify: `cd tools/dolos && go test ./... && go build -o ../../bin/dolos.exe . && ../../bin/dolos.exe --help`
     - Pass: exits 0 on Windows/Git Bash. On non-Windows, output path may be `../../bin/dolos`.
     - Fail: local Go build fails without a documented Docker-only fallback.
  2. [ ] Docker parity script follows existing pattern without client-specific install.
     - Verify: `sed -n '1,160p' tools/dolos/build.sh && sed -n '1,120p' tools/dolos/Dockerfile`
     - Pass: uses `GOOS`, `GOARCH`, and `BINARY`, writes to repo `bin/`, and does not write to `~/.claude`.
     - Fail: script installs outside repo or requires unrelated tooling.

**T3: Define core state, transaction, package, and CLI contracts** [medium] -- backend-dev
- Blocked by: V0
- Description: Implement pure Go contracts before mutating commands: manifest schema, tree digest, index schema, transaction/lock API, archive-name validation, status state table, CLI usage/exit-code contract, and package boundaries.
- Files: `tools/dolos/internal/state/*.go`, `tools/dolos/internal/archive/*.go`, `tools/dolos/internal/gitstore/*.go`, `tools/dolos/internal/crypto/*.go`, `tools/dolos/internal/cli/*.go`, tests.
- Acceptance Criteria:
  1. [ ] State table and exit-code contract are embedded in tests.
     - Verify: `cd tools/dolos && go test ./... -run 'Test(StatusStateTable|CLIExitCodes|IndexSchema)'`
     - Pass: every PRD state row maps to status, pack allowance, unpack allowance, exit code, and mutation permission.
     - Fail: clean/no-index/diverged states are ambiguous.
  2. [ ] Transaction contract covers crash points.
     - Verify: `cd tools/dolos && go test ./... -run 'TestTransactionContract|TestCrashPointRecovery'`
     - Pass: tests define behavior for temp artifact written, artifact rename complete, index temp written, index rename complete, scratch cleanup failure, stale lock, and retry.
     - Fail: index can mark clean after a partial mutation.
  3. [ ] Pure package boundaries avoid shelling out for core state tests.
     - Verify: `cd tools/dolos && go test ./... -run 'Test(Digest|Manifest|Index|Status)'`
     - Pass: pure state/archive tests do not require Git repo, Docker, or age binary.
     - Fail: core state tests depend on external tools unnecessarily.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [medium] -- qa-engineer
- Blocked by: T2, T3
- Checks:
  1. `cd tools/dolos && go test ./...` -- skeleton/state tests pass.
  2. `cd tools/dolos && go build -o ../../bin/dolos.exe .` on Windows or `go build -o ../../bin/dolos .` elsewhere -- build exits 0.
  3. `bash tools/dolos/build.sh` if Docker is available; if Docker is unavailable, record that Docker parity was skipped and why.
  4. `gofmt -l tools/dolos` -- prints no files.
- On failure: create a focused fix task, rerun affected checks, then rerun V1.

### Wave 2

**T4: Implement pack, age SSH recipients, and atomic artifact promotion** [medium] -- backend-dev
- Blocked by: V1
- Description: Implement `dolos pack private`: strict `.dolos/authorized_keys` parsing, generated SSH public-key age encryption, tar.gz+manifest creation in temp, artifact validation, atomic replace, index update after success only, and no real-private artifact generation during tests.
- Files: `tools/dolos/internal/crypto/*.go`, `tools/dolos/internal/archive/*.go`, `tools/dolos/internal/gitstore/*.go`, `tools/dolos/internal/cli/*.go`, tests.
- Acceptance Criteria:
  1. [ ] Pack encrypts to all tracked SSH public keys and rejects bad key sets.
     - Verify: `cd tools/dolos && go test ./... -run TestPackSSHAuthorizedKeys`
     - Pass: two generated SSH keypairs can both decrypt; missing/empty/malformed/options/cert/unsupported keys fail before artifact promotion; recipients are canonicalized/deduped and fingerprint/count summary is stable.
     - Fail: only one key works, malformed keys are accepted, or local public-key fallback is used.
  2. [ ] Pack updates artifact/index atomically.
     - Verify: `cd tools/dolos && go test ./... -run 'TestPack(Atomic|Index|RefusesStale|CrashPoint)'`
     - Pass: failed pack leaves old artifact/index unchanged; successful pack updates all clean digest fields; stale/diverged/invalid artifact states refuse.
     - Fail: partial artifact remains or index marks clean after failure.

**T5: Implement scratch-first unpack, archive validation, and transactional promotion** [medium] -- backend-dev
- Blocked by: V1
- Description: Implement `dolos unpack private`: decrypt into Git-private scratch, validate archive and manifest, enforce resource limits, acquire lock, re-check live/index state, promote transactionally, update index last, clean scratch, and preserve/rollback existing `private/` on failure.
- Files: `tools/dolos/internal/archive/*.go`, `tools/dolos/internal/gitstore/*.go`, `tools/dolos/internal/cli/*.go`, tests.
- Acceptance Criteria:
  1. [ ] Unsafe/resource-exhausting archives are rejected before promotion.
     - Verify: `cd tools/dolos && go test ./... -run 'TestUnpackRejects|TestArchiveValidation|TestResourceLimits'`
     - Pass: absolute paths, `..`, backslashes, duplicates, symlinks, hardlinks, devices/FIFOs/sockets where constructible, collisions, oversized manifest, too many files, too-large file, and total-size overflow fail without modifying live sentinel files.
     - Fail: any unsafe fixture extracts or mutates live `private/`.
  2. [ ] Transactional promotion and rollback are tested.
     - Verify: `cd tools/dolos && go test ./... -run 'TestUnpack(Transaction|Rollback|CrashPoint|ScratchPermissionsAndCleanup)'`
     - Pass: existing clean `private/` is moved/backed up/promoted atomically where possible; rollback preserves old tree on injected failures; index updates last; scratch is permission-restricted and cleaned; no normal output leaks scratch paths.
     - Fail: partial promotion, stale clean index, leaked temp path, or unrecoverable old tree.

**T6: Implement init/status/scan CLI behavior and locking** [medium] -- backend-dev
- Blocked by: V1
- Description: Implement `init`, `status`, `pack private`, `unpack private`, `scan --staged`, command usage, stable exit-code classes, unknown archive handling, missing Git repo handling, missing age/unsupported identity messages, and Git-private locking.
- Files: `tools/dolos/main.go`, `tools/dolos/internal/cli/*.go`, `tools/dolos/internal/gitstore/*.go`, tests.
- Acceptance Criteria:
  1. [ ] Init/status/scan match the state table and hook contract.
     - Verify: `cd tools/dolos && go test ./... -run 'Test(Init|StatusStateTable|Scan|CLIExitCodes|UnknownArchive|MissingGitRepo)'`
     - Pass: no-index/non-empty cases are not adopted; `init --force` never marks clean; scan blocks plaintext private paths and allows only `.dolos/authorized_keys` plus `.dolos/artifacts/private.tar.gz.age`.
     - Fail: unsafe paths allowed, no-index reported clean, or command output is too unstable for hooks.
  2. [ ] Locking prevents concurrent mutation.
     - Verify: `cd tools/dolos && go test ./... -run TestLocking`
     - Pass: concurrent pack/unpack/status-mutating operations fail cleanly with stale-lock recovery rules.
     - Fail: concurrent commands corrupt artifact/index or hang indefinitely.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- qa-engineer
- Blocked by: T4, T5, T6
- Checks:
  1. `cd tools/dolos && go test ./...` -- all Go tests pass.
  2. `cd tools/dolos && go test ./... -run TestEndToEndTempRepoSSHKeys` -- named generated temp repo pack/unpack test passes with two SSH identities.
  3. `cd tools/dolos && go test ./... -run TestWorktreeStateIsolation` -- linked-worktree state paths are distinct and do not collide.
  4. `gofmt -l tools/dolos` -- prints no files.
- On failure: create a focused fix task, rerun affected checks, then rerun V2.

### Wave 3

**T7: Migrate old private archive scripts, hooks, docs, ignore rules, and attributes** [large] -- backend-dev
- Blocked by: V2
- Description: Replace active `.encrypted/` private archive behavior with Dolos. Update wrappers/hooks/docs to call `bin/dolos scan --staged` or clearly fail with migration guidance. Update ignore/attribute rules so `.dolos/authorized_keys` and `.dolos/artifacts/*.tar.gz.age` are committable and artifacts are binary `-diff -merge`.
- Files: `.gitignore`, `.gitattributes`, `scripts/git-hooks/pre-commit-x-private`, `scripts/install-x-private-hook`, `scripts/private-archive-*`, `scripts/x-private-*`, `scripts/private_archive_lib.py`, `pi/prompts/handoff.md`, `test/test_private_archive.py`.
- Acceptance Criteria:
  1. [ ] Active old workflow is removed by machine-checkable allowlist.
     - Verify: `uv run pytest test/test_private_archive.py -k legacy_allowlist`
     - Pass: any remaining `.encrypted`, `recipients.txt`, or `private-archive` references are listed in an allowlist with file/line/rationale and are deprecation text or compatibility tests only.
     - Fail: active hook/script code still encrypts, stages `.encrypted`, or requires old recipients files.
  2. [ ] Active hook install/update behavior is block-only.
     - Verify: `uv run pytest test/test_private_archive.py -k hook_install`
     - Pass: temp repo hook installation is idempotent; active hook calls Dolos scan/block-only behavior; unrelated commits do not require age keys; hook never packs/decrypts/stages.
     - Fail: installed hook is stale, non-idempotent, or mutates artifacts/index.
  3. [ ] Git metadata assertions fail when Dolos files are ignored/text-diffed.
     - Verify: `! git check-ignore -q .dolos/authorized_keys .dolos/artifacts/private.tar.gz.age && git check-attr --all -- .dolos/artifacts/private.tar.gz.age .dolos/authorized_keys`
     - Pass: paths are not ignored; artifact has binary `-diff -merge`; authorized keys are tracked text.
     - Fail: any path is ignored or artifact is text-diffed.

**T8: Add comprehensive regression tests, fixture coverage, and evidence hygiene** [medium] -- qa-engineer
- Blocked by: V2
- Description: Update tests and fixtures for Dolos workflows, active hooks, generated temp repos/remotes, linked worktrees, malicious archive cases, no-secret/no-plaintext behavior, evidence hygiene, and old wrapper compatibility.
- Files: `test/test_private_archive.py`, `tools/dolos/*_test.go`, optional generated-safe fixture builders.
- Acceptance Criteria:
  1. [ ] Private workflow pytest validates migration and real-repo non-mutating checks.
     - Verify: `uv run pytest test/test_private_archive.py`
     - Pass: unrelated commits do not require age keys; wrappers do not stage `.encrypted`; plaintext `private/` cannot be staged; real repo `dolos status`/`scan --staged`/metadata checks are non-mutating.
     - Fail: tests still expect old per-file output or hook auto-encryption.
  2. [ ] Evidence/log hygiene is enforced.
     - Verify: `uv run pytest test/test_private_archive.py -k evidence_hygiene && grep -R -nE 'CANARY_PRIVATE_SECRET|BEGIN OPENSSH|AGE-SECRET-KEY|PRIVATE KEY|do-not-print|fixture secret' .specs/dolos-private-archive/evidence && exit 1 || true`
     - Pass: generated private key paths stay outside repo; scratch stays under Git-private tmp; evidence does not contain canary secret contents, private keys, or decrypted scratch paths.
     - Fail: evidence/logs leak canary content, key material, or temp plaintext paths.
  3. [ ] Malicious archive constructors are table-driven.
     - Verify: `cd tools/dolos && go test ./... -run 'TestArchiveValidation|TestResourceLimits' -v`
     - Pass: unsupported device/FIFO/socket constructors produce explicit test skip evidence; all supported malicious entries leave sentinel files unchanged.
     - Fail: coverage is skipped silently or relies on external tar behavior without assertions.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [large] -- qa-engineer
- Blocked by: T7, T8
- Checks:
  1. `cd tools/dolos && go test ./...` -- all Go tests pass.
  2. `uv run pytest test/test_private_archive.py` -- private archive tests pass.
  3. `make lint-python` if Python files changed.
  4. `! git check-ignore -q .dolos/authorized_keys .dolos/artifacts/private.tar.gz.age` and `git check-attr --all -- .dolos/artifacts/private.tar.gz.age .dolos/authorized_keys`.
  5. Real-repo non-mutating check: `./bin/dolos.exe status || ./bin/dolos status` and `./bin/dolos.exe scan --staged || ./bin/dolos scan --staged` with no pack/decrypt/stage side effects.
  6. Evidence hygiene grep over `.specs/dolos-private-archive/evidence/` returns no canary/private/key material.
- On failure: create a focused fix task, rerun affected checks, then rerun V3.

## Dependency Graph

```
Wave 0: T1 → V0
Wave 1: T2, T3 (parallel after V0) → V1
Wave 2: T4, T5, T6 (parallel after V1) → V2
Wave 3: T7, T8 (parallel after V2) → V3
Final Gates: V3 → F1, F2, F3, F4, F5
```

## Success Criteria

1. [ ] Dolos standalone workflow works end-to-end in a generated temp repo.
   - Verify: `cd tools/dolos && go test ./... -run TestEndToEndTempRepoSSHKeys`
   - Pass: generated temp repo packs `private/` with two SSH public keys, unpacks with each matching private key, compares deterministic tree digest, and stages no plaintext private files.
2. [ ] Dolos refuses unsafe states and archives.
   - Verify: `cd tools/dolos && go test ./... -run 'Test(StatusStateTable|ArchiveValidation|ResourceLimits|UnpackTransaction|WorktreeStateIsolation)'`
   - Pass: unsafe pack/unpack attempts fail before promotion and leave sentinel files/artifacts unchanged.
3. [ ] Old `.encrypted` auto-encryption workflow is no longer active.
   - Verify: `uv run pytest test/test_private_archive.py -k 'legacy_allowlist or hook_install or scan'`
   - Pass: no active hook/script auto-encrypts or stages `.encrypted`; unrelated commits do not need age keys.
4. [ ] Build and repo validation pass.
   - Verify: `cd tools/dolos && go test ./...`; `uv run pytest test/test_private_archive.py`; `make test-quick`.
   - Pass: all commands exit 0, or any repo-wide failure is proven pre-existing/unrelated with targeted Dolos validations passing.
5. [ ] Opaque single-artifact churn is an explicit accepted MVP tradeoff.
   - Verify: `./bin/dolos.exe status --help || ./bin/dolos status --help` and docs/handoff mention that binary diffs are opaque and `dolos status` is the freshness surface.
   - Pass: users are not expected to inspect binary diffs to determine archive state.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes
- `/do-it` must run validation through documented commands, generated temp repos, generated SSH keys, generated archive fixtures, and repo test wrappers.
- Credentials are not required. Tests must not use real SSH private keys, real `private/`, or real private archive contents.
- Manual-only steps are not required.

### Required automated validation

1. [ ] Run Dolos Go tests and build.
   - Command: `cd tools/dolos && go test ./... && go build -o ../../bin/dolos.exe .` on Windows, or `go build -o ../../bin/dolos .` elsewhere.
   - Pass: exits 0; `bin/dolos(.exe) --help` works.
   - Fail: do not archive; fix build/test failures.

2. [ ] Run Docker build parity when Docker is available.
   - Command: `bash tools/dolos/build.sh`
   - Pass: exits 0 and writes repo `bin/dolos(.exe)`; if Docker unavailable, record skip reason in evidence.
   - Fail: fix Docker build unless intentionally skipped due missing Docker.

3. [ ] Run private archive regression tests.
   - Command: `uv run pytest test/test_private_archive.py`
   - Pass: exits 0 and covers Dolos pack/unpack, scan, hooks, migration, malicious fixtures, Git refs/worktrees, and evidence hygiene.
   - Fail: do not archive.

4. [ ] Run repo-wide validation.
   - Command: `make test-quick`; also run `make lint-python` if Python changed.
   - Pass: exits 0 or failures are documented as pre-existing/unrelated with targeted Dolos validations passing.
   - Fail: do not archive unless proven pre-existing and unrelated in `## Execution Status`.

5. [ ] Run no-secret/no-plaintext staged and evidence checks.
   - Command: `./bin/dolos.exe scan --staged || ./bin/dolos scan --staged`; `grep -R -nE 'CANARY_PRIVATE_SECRET|BEGIN OPENSSH|AGE-SECRET-KEY|PRIVATE KEY|do-not-print|fixture secret' .specs/dolos-private-archive/evidence && exit 1 || true`; `git diff --cached -G'(BEGIN OPENSSH|AGE-SECRET-KEY|PRIVATE KEY|PASSWORD=|TOKEN=|Bearer |sk-ant-|sk-proj-|ghp_)' --exit-code -- ':!*.age'`.
   - Pass: exits 0 and no plaintext private paths, canary secrets, key material, or decrypted scratch paths are staged/logged.
   - Fail: stop and remove leakage.

### Manual validation

Manual validation is exceptional. It should be `Required: no` unless the plan includes destructive operations, data-loss risk, irreversible external side effects, shared/work production impact, paid/billing/data-costing resources, secret exposure risk, hardware/physical checks, or genuinely subjective user judgment that cannot be replaced by safe automation.

- Required: no
- Justification: Generated temp repos, generated keys, fixture archives, non-mutating real-repo checks, and deterministic tests are sufficient. Real `private/` must not be modified.
- Steps:
  1. None.

If manual validation is not required, `/do-it` may mark the manual gate complete after recording why automated evidence is sufficient.

### Deployment validation

- Required: no
- Procedure: None. This is local repo tooling; installation beyond checkout-local `bin/dolos(.exe)` is not part of this plan.

If deployment is required and skipped, cancelled, or fails, `/do-it` must not archive the plan.

### Archive rule

`/do-it` may archive this plan only after all required automated validation, task-specific verification, manual validation non-applicability, deployment non-applicability, and repo-wide validation pass. Archive evidence should include at least:

- `.specs/dolos-private-archive/evidence/preflight-status.txt`
- `.specs/dolos-private-archive/evidence/inventory.txt`
- `.specs/dolos-private-archive/evidence/go-version.txt`
- `.specs/dolos-private-archive/evidence/age-version.txt` or documented library decision
- `.specs/dolos-private-archive/evidence/age-ssh-proof.txt`
- `.specs/dolos-private-archive/evidence/go-test.txt`
- `.specs/dolos-private-archive/evidence/dolos-build.txt` or Docker skip reason
- `.specs/dolos-private-archive/evidence/private-pytest.txt`
- `.specs/dolos-private-archive/evidence/git-metadata.txt`
- `.specs/dolos-private-archive/evidence/real-repo-check.txt`
- `.specs/dolos-private-archive/evidence/repo-validation.txt`
- `.specs/dolos-private-archive/evidence/no-secret-check.txt`

## Handoff Notes

- Do not use real `private/` data for tests. All pack/unpack validation must happen in generated temp repos or fixture directories.
- Do not generate `.dolos/artifacts/private.tar.gz.age` from real `private/` during `/do-it`. If an artifact is needed in the checkout for metadata tests, use a generated non-secret fixture only and document it.
- Verify `age` SSH key support early. If using the age CLI, require generated SSH key proof. If using a Go library, document the dependency and test SSH public/private key compatibility.
- `bin/dolos(.exe)` is checkout-local for this plan; adding it to install/Dotbot/PATH is a future plan unless tests/docs require otherwise.
- Phase 2 `/commit` auto-pack/freshness integration is deferred. Do not edit `pi/extensions/workflow-commands.ts` for auto-pack in this plan unless the user explicitly changes scope.
- Preserve unrelated working-tree changes. Stage only plan-scoped files if a later `/commit` is requested.
- This plan intentionally does not use worktree mode because the user did not request `worktree`/`wt`; executor may still choose a worktree manually if current WIP makes isolated implementation safer.

## Execution Status

- Created by `/plan-it` on 2026-05-12.
- Reviewed and updated by `/review-it` on 2026-05-12.
- Wave 3 T8 and V3 completed on 2026-05-12 with final gates completed and evidence captured.
- Completion classification: completed-and-archived.
- Archived at `.specs/archive/dolos-private-archive/` on 2026-05-12.
