---
date: 2026-05-03
status: synthesis-complete
---

# Review: Plan: Bring menos deployment into Infisical runtime secret flow

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Key area reviewed | Adversarial angle |
|---|---|---|---|---|---|
| reviewer | reviewer | Execution completeness and explicitness reviewer | Mandatory baseline check for missing assumptions and ambiguous ACs | Missing prerequisites, plan executability, acceptance rigor | Assume operator has no prior state or hidden docs |
| security-reviewer | security-reviewer | Red-team secret-handling reviewer | Mandatory security-focused breakage scan for secret leakage and auth failure modes | Secret lifecycle, token/credential hygiene, rollback safety | Assume an honest mistake could expose secrets under a non-happy path |
| product-manager | product-manager | Simplicity and scope reviewer | Mandatory product/complexity review | Whether plan shape matches the smallest safe migration | Assume easiest path is often over- or under-specified |
| devops-pro | devops-pro | Rollout, idempotency, and rollback reviewer | Ansible/infra changes are central to plan | Deployment orchestration ordering, mutation radius, recovery behavior | Assume deploys fail mid-way and must be recoverable |
| python-pro | python-pro | Python CLI safety and testability reviewer | T1 introduces a new Python script used in CI/deploy | Script semantics, dry-run contract, redaction, dependency assumptions | Assume tests and error paths are where operators lose confidence |
| qa-engineer | qa-engineer | Verification realism reviewer | Plan relies on heavy static command checks | Gate design realism and false-positive acceptance checks | Assume grep checks can pass while behavior is wrong |

## Standard Reviewer Findings
### reviewer
- **HIGH**: `.specs/menos-infisical-runtime/plan.md` sets new `group_vars/*`, but current tree has no `group_vars` and `ansible.cfg` has no var lookup path; new values may never load. **Fix:** write vars where Ansible actually reads them (`playbook`-scoped vars or explicit `-e`/`vars_files`) and verify with syntax-check evidence.
- **HIGH**: Validation/deploy commands omit explicit vault secret delivery (no `--ask-vault-pass` equivalent), despite the plan requiring vault-backed machine credentials. **Fix:** define required vault delivery and include it in every validation/deploy command.
- **HIGH**: New renderer likely depends on Infisical SDK/auth libs, but Ansible container image currently installs only ansible + ansible-lint + gitleaks. **Fix:** choose and add a dependency/install path before V1/V2 execution.
- **MEDIUM**: Several ACs are text-matching only (e.g., `repo-root .env`, `no_log`, `diff: false`), which can pass without proving behavior. **Fix:** replace with executable assertions.
- **MEDIUM**: T4 AC1 allows “at least one env_file” but objective says single shared source; this can leave partial env handling. **Fix:** require consistent, explicit env source across all secret-consuming services.

### security-reviewer
- **HIGH**: “Allowed placeholder strings” in required-key validation permits `changeme`/empty values to pass and still count as present. **Fix:** fail on empties, placeholder patterns, weak lengths for all auth-like keys.
- **HIGH**: No recovery path for render/write failure path after `.env` mutation; partial deploy state can persist. **Fix:** implement handler that preserves prior `.env`, restores on failure, and surfaces clear remediation.
- **MEDIUM**: Local render path does not define cleanup/ephemeral requirements; temp files may remain on controller. **Fix:** render on tmpfs, force secure cleanup in all outcomes.
- **MEDIUM**: No explicit preflight for identity scope/TTL before deploy. **Fix:** validate identity, scope and expiry before remote state mutation.
- **MEDIUM**: no-log/diff checks do not guarantee no secret exposure in script exceptions/traces. **Fix:** add redaction-by-design + failure-output audits.

### product-manager
- **HIGH**: `T1` mixes `--dry-run` with writing secrets to disk in ACs (`--dry-run` normally means no side effects). **Fix:** define separate `--validate` and `--write` modes.
- **HIGH**: T1 introduces a new secrets renderer that duplicates existing Infisical runtime path in `infisical-secrets` spec, increasing operational drift risk. **Fix:** reuse/shared script if available; otherwise document explicit reason for separation.
- **MEDIUM**: Manual smoke checks are environment-dependent and brittle (e.g., local health curl assumptions). **Fix:** add deterministic SSH/local deploy-node checks and bounded retry/failure semantics.

## Additional Expert Findings
### devops-pro
- **HIGH**: Render happens after costly pre-flight/version tasks in current `deploy.yml`; current objective says fail fast, but preexisting deployment side effects can occur before secret validation. **Fix:** move secret validation earlier and gate all mutating tasks behind it.
- **HIGH**: No blocking rollback semantics in playbook flow; deploy failure path can leave services partly changed with no controlled revert. **Fix:** add `block/rescue` with optional remote `.env` restore and service rollback.
- **MEDIUM**: Secret render/sync is local-first without explicit atomic temp write+rename; controller and remote could briefly hold inconsistent file states. **Fix:** enforce temp path + atomic move + backup old file.

### python-pro
- **HIGH**: T1 testability is under-defined (`--dry-run` ambiguity) and lacks deterministic non-network fixture path, forcing brittle live-auth tests. **Fix:** provide input stubs/JSON fixture mode and injectable API client for tests.
- **MEDIUM**: No explicit parser for `.env`-style merge precedence. **Fix:** enforce deterministic precedence and error on duplicate/ambiguous keys.
- **MEDIUM**: UMask/overwrite behavior around `0600` not specified; secure mode may regress unexpectedly. **Fix:** set and verify permissions on temp and final files deterministically.

### qa-engineer
- **HIGH**: AC uses `grep` for behavior checks that can pass despite wrong execution (`grep -q Copy .env file`, flag presence checks). **Fix:** AST-like targeted assertions over relevant tasks.
- **MEDIUM**: `V2`’s manual auth-failure path is optional while required for reliability. **Fix:** make it mandatory with required negative test.
- **MEDIUM**: No explicit negative tests for placeholder secrets or stale controller artifacts. **Fix:** add lightweight fixture-based negative validation in V1/V2.

## Suggested Additional Reviewers
- devops-pro -- Rollout and rollback behavior on real deploy host is the highest risk in this plan; chosen for dependency ordering, safe failure handling, and remote state management.
- python-pro -- T1 introduces Python runtime logic that drives deploy behavior; chosen for CLI contracts, secure file handling, and testability.
- qa-engineer -- Acceptance criteria are heavy on static checks; chosen to harden verification against false positives and cover negative-path testing.

## Bugs (must fix before execution)
1. **HIGH — New `group_vars` will likely not load**. The plan adds `menos/infra/ansible/group_vars/all.yml`/`.example`, but current repo has no `group_vars` path configured in `ansible.cfg`, and no directory exists now. Deployment may miss all `menos_infisical_*` settings. 
   - Evidence: `find menos/infra/ansible/group_vars` returns nothing; `ansible.cfg` has only `inventory`, `host_key_checking`, `interpreter_python`.
   - Required fix: Scope vars where Ansible loads them (`host_vars`/`vars_files`/explicit `-e`), then validate with `ansible-playbook --syntax-check` and variable debug.

2. **HIGH — Vault path is underspecified in execution commands**. V1/V2 checks and plan commands repeatedly call Ansible without a defined secret-delivery mechanism, while sensitive inputs are explicitly vaulted (`vault_*`). This breaks reproducibility and operator usability. 
   - Evidence: `V1`/`V2` ACs and provided command snippets omit `--ask-vault-pass` / vault password file pattern used elsewhere in this repo.
   - Required fix: define one explicit secret entry mode and update every check/deploy command and runbook example to enforce it.

3. **HIGH — `scripts/menos-infisical-env.py` dependency/runtime is undefined for container execution**. The Ansible image currently installs only `ansible-core`, `ansible-lint`, and `gitleaks`; no Infisical SDK/CLI path is available.
   - Evidence: `menos/infra/ansible/Dockerfile` lacks infisical-related dependencies; `deploy.yml` currently runs commands via this container.
   - Required fix: either add dependency installation, use a no-dependency API path, or run renderer outside this container with defined handoff.

4. **HIGH — `--dry-run` semantics conflict in acceptance criteria and can cause implementation/test errors**. `T1 AC1` and `python-pro` feedback both mix “dry-run” with file output assertions, causing inconsistent implementation choices and unreliable automated checks.
   - Evidence: `T1 AC1` states `python ... --dry-run` writes required keys and creates an env file.
   - Required fix: split validation-only and render modes (`--validate` vs `--write`), then assert each explicitly in V1.

5. **HIGH — No reliable rollback or atomicity around `.env` mutation**. `T3` and `V2` provide rollback guidance only in docs, with no `block/rescue` flow; failed deploys can leave partially changed `.env` and service state. 
   - Evidence: current `playbooks/deploy.yml` has linear tasks; plan AC lists no mandatory rescue/restore steps.
   - Required fix: add guarded block with backup/restore, failure handler, and explicit abort-before-side-effect policy.

6. **MEDIUM — Local temp secret file lifecycle is under-defined**. Current plan does not require render output cleanup before/after failure, enabling lingering secret artifacts on controller. 
   - Evidence: T1/T3 examples reference `/tmp/menos.env` and `/project` local handling without cleanup AC.
   - Required fix: require tmpfs output and guaranteed cleanup in both success and failure handlers.

## Hardening
1. Replace all grep/text-only checks in ACs with executable structural validation (e.g., playbook task-targeted checks for `/project/.env` and for secret-bearing tasks with scoped `no_log`/`diff: false`).
2. Add explicit placeholder/weak-value validation for required secrets (`changeme`, empty, too-short, obvious test tokens).
3. Add explicit non-placeholder/contracted merge precedence between Infisical values and defaults, and test that defaults cannot silently supply auth-critical fields.
4. Extend V2 with a mandatory auth-failure negative test so deployment aborts before any compose mutation.
5. Keep `.env` handling deterministic across OS quirks by setting/validating permission bits with controlled umask-independent write logic.

## Simpler Alternatives / Scope Reductions
1. Use a direct reuse path with the existing Infisical helper strategy used by `.specs/infisical-secrets` where possible, instead of introducing a parallel fetch/render stack from scratch.
2. For this phase, scope to “render + validate + sync” only and defer full backup/restore rollback complexity to a second phase if needed, but only if no service mutation can occur before fail-fast validation.

## Contested or Dismissed Findings
1. The proposal that `env_file` alone cannot support compose interpolation was marked as a concern by one reviewer and is **not confirmed** as a must-fix for this plan because compose can still use default `.env` interpolation behavior in deploy path. Still, explicit parse verification (`docker compose config`) remains strongly recommended in hardening.

## Verification Notes
1. Confirmed group_vars load issue by listing directories and config: no `menos/infra/ansible/group_vars` exists and `ansible.cfg` contains no `roles_path`/vars path additions.
2. Confirmed vault command omission by checking validation snippets in `plan.md` where `--ask-vault-pass` is absent.
3. Confirmed missing renderer dependency path by reading `menos/infra/ansible/Dockerfile`.
4. Confirmed dry-run contract conflict directly from `plan.md` AC text in T1.
5. Confirmed lack of rollback logic from plan wording and current `deploy.yml` linear task flow.
6. Confirmed no explicit cleanup for local secret file generation in plan task ACs.

## Timing Notes
| Step | Duration | Notes |
|---|---|---|
| Initial review panel | 00:01:58 (wall) | 6 reviewers launched in parallel; no timeouts |
| Recovery calls | not run | No reviewer failures requiring recovery |
| Verification | 00:00:25 | `bash/read/grep` checks against `deploy.yml`, `ansible.cfg`, and `ansible/Dockerfile` |
| Synthesis | 00:00:30 | Compiled findings and wrote review artifact |

## Review Artifact
Wrote full synthesis to: `.specs/menos-infisical-runtime/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Outcome
- **Status:** NOT READY TO EXECUTE
- **Reason:** High-severity execution blockers exist around variable loading, secret bootstrap delivery, runtime dependencies, and deploy rollback safety.
- **Plan state:** active at `.specs/menos-infisical-runtime/plan.md`; review artifact written to `.specs/menos-infisical-runtime/review-1/synthesis.md`
- **Recommended next action:** apply fixes first, then run `/do-it .specs/menos-infisical-runtime/plan.md`

Apply options:

1. Apply bugs only (Recommended when bugs > 0 — 6 fixes, required before `/do-it`)
2. Apply bugs + selected hardening — pick which
3. Apply everything (bugs + 5 hardening)
4. No changes — review only

Next-step command:
/do-it .specs/menos-infisical-runtime/plan.md

How do you want to proceed?

FINAL STATUS: NOT READY TO EXECUTE — must-fix bugs remain.