---
created: 2026-09-06
status: completed
completed: 2026-09-08
---

# Complete the existing adaptive web-fetch gateway

## Scope and authority

Required outcome: ordinary HTTP and browser retrieval, SQLite route learning,
default Pi integration with scoped BWS credentials, local/private fetching, public
Jina fallback, bounded output/cancellation, circuit/curl recovery, and one final
annotation-only Luna review. Preserve sequential retrieval and one browser.

The operator authorized resumption on 2026-09-08: complete bounded live checks,
a gateway-only restart and targeted redeployment if demonstrated gaps require it,
local task commits/merges, and publication of reviewed gateway-related infrastructure
commits before parent gitlink integration. Dotfiles push is not authorized.

Do not add a launcher, registry/publication subsystem, controller, backend research,
benchmark suite, rollback work, or ordinary-work scheduling. Do not change legacy,
SearXNG, Onclave, host/router firewalls, or unrelated services. Questions are needed
only for material scope/acceptance changes, not routine implementation details.

## Ownership and worktrees

Paths below are relative to the original dotfiles repository root unless noted.

- Dotfiles worktree: `.worktrees/web-fetch-completion`, branch
  `task/web-fetch-completion`, merge target `main`, starting at `d361e6b0`.
- Infrastructure worktree: `.worktrees/web-fetch-completion/modules/homelab-infra`,
  branch `task/web-fetch-completion`, merge target module `main`, starting at
  `cb0cb09`. Module main was pulled successfully before integration work.
- This is the coordinating plan. Integrate/publish module changes first, then
  commit the parent gitlink and archived plan together. Preserve unrelated work.
- Default Pi planning/execution profile: `pi/profiles/default`, verified in this
  session. Infrastructure checks have no Pi-profile dependency. Worktree checks
  must resolve the worktree source, not silently test the original checkout.

Read owning AGENTS.md files, the default planning skill, and:

- Module-relative `services/web-fetch-gateway/`, `docs/web-fetch-gateway.md`,
  `infra/ansible/roles/web_fetch_onramp/`, and `scripts/apply-service.sh`.
- Dotfiles-relative `pi/profiles/default/extensions/web-tools/`,
  `pi/profiles/default/docs/web-tools.md`, and existing web-tools tests.
- [preflight.md](preflight.md) only as historical evidence. Removed trial paths are
  not runnable inputs; do not repeat browser candidate selection.

## Reconciled starting evidence

- `cb0cb09` implements the gateway and deployment wiring. Pi integration is already
  committed. Later September 6–7 session evidence records deployment, six live
  tests, and six persisted route rows using WAL. This proves historical execution,
  not current health or persistence across a restart.
- Pi `credentials.ts` retrieves only `WEB_FETCH_GATEWAY_CLIENT` lazily through BWS,
  caches in process memory, and accepts explicit environment overrides. The prior
  environment-only statement was stale. Do not copy secrets into this plan.
- The role implements the operator-approved Trawl digest exception in defaults and
  `tasks/image.yml`. The exception is not permission to waive future image holds.
- Prior gateway evidence: 67 tests/typecheck/build on Windows and Node 24 Linux.
  Prior focused Pi and live integration results remain historical, not new runs.
- Browser abort retains the lease until idle or quarantine; prior owned fixtures
  verified cleanup and container-only private-network isolation. Preserve those
  protections without expanding the security project.
- Removed launcher/archive-publication machinery stays removed. Existing local
  image IDs, BWS settings, and service Ansible are the implementation mechanism.

## Decisions and execution boundaries

Required outcomes are fixed; mechanisms remain replaceable within scope. Inspect
facts before asking. For consequential uncertainty, explain the choice, recommend
an approach, and ask a focused question rather than inventing requirements.

Only redeploy if current inspection or a failed acceptance check demonstrates a
need. Existing fixture tests cover local/private bypass, strict backend selection,
and outage recovery; no induced outage is required to duplicate that coverage.
If simplifying a mechanism, preserve the required function it served.

## Remaining tasks

- [x] **T1 — Acquisition and routing:** retained implementation and historical evidence above.
- [x] **T2 — Default Pi client/recovery:** retained implementation, including lazy BWS integration.
- [x] **T3 — Reconcile remaining acceptance.** Inspect current service health and
  existing code/configuration evidence. Classify requirements as satisfied, needing
  a current check, or requiring a specific correction. No new architecture audit.
  - Done when: actual remaining gaps and the bounded verification route are known.
  - Evidence: Current HTTPS/default Pi checks passed. Existing image exception and
    BWS credential delivery confirmed. No missing runtime implementation or need
    for redeployment found; persistence through restart remained to verify.
- [x] **T4 — Close demonstrated gaps.** Depends on T3. Correct stale infrastructure
  docs about image eligibility and environment-only disabling. Fix other demonstrated
  gaps only; use the existing targeted service apply path if deployment is needed.
  - Done when: corrections preserve required behavior and affected checks pass.
  - Evidence: Corrected infrastructure docs, annotated standard address ranges and
    synthetic fixtures using existing public-safety conventions, updated three stale
    service-catalog test expectations, and made inherited become behavior explicit.
    Narrow lint annotations preserve existing web_fetch_ configuration names.
    No application behavior, image pins, credentials, or service topology changed.
- [x] **T5 — Finish finite acceptance.** Depends on T4. Verify authenticated HTTPS,
  anonymous rejection, ordinary default Pi BWS resolution without gateway overrides,
  useful direct/browser output with Luna, and learned route persistence through a
  gateway-only restart unless adequate existing evidence settles it. Use existing
  gateway-focused live tests, not unrelated SearXNG research. Run checks affected
  by source changes, then one final module `just validate` after live work finishes.
  - Done when: the original acceptance requirements have concrete evidence.
  - Evidence (2026-09-08): Two existing gateway live tests passed from the dotfiles
    worktree with default profile authentication and no gateway overrides. Direct
    retrieval/link-following and Trawl returned useful content with Luna screening.
    Scoped Ansible checks verified authenticated HTTPS and anonymous 401, then
    preserved all 15 route rows and WAL through one gateway-only restart. Browser
    container identity/start time were unchanged. No redeployment was performed.
  - Validation: One final `just validate` invocation stopped at public-safety
    annotations. Continued its unfinished stages directly after corrections:
    public-safety, OpenTofu/TFLint, ShellCheck, configuration/DNS checks, Python,
    all-playbook syntax, Ansible lint, excluded-values boundary, and live BWS
    configuration syntax. The 426-test Python run found three stale expectations
    (one unrelated opt-in skip); affected service-state/CLI/settings tests passed
    after correction. Final gateway deployment tests (3), role syntax and role
    lint passed. Full lint had identified only this role's 19 issues, now resolved.
    No second full validation invocation or repeated browser research.
- [x] **T6 — Integrate and archive.** Depends on T5. Commit/merge/publish module
  gateway changes under repository rules. Update the parent gitlink, date and archive
  this spec with the dotfiles integration. Verify merged content before removing
  clean task worktrees. No dotfiles push.
  - Evidence: Infrastructure `3c52df2` merged into module main and published with
    existing `cb0cb09`. Parent gitlink and this dated archive are included together
    in the dotfiles completion commit. Git history records parent integration;
    the executing session verifies it before removing clean task worktrees.

## Completion handoff

Original acquisition, integration and persistence acceptance is established by the
historical and current evidence above. Documentation and validation mismatches are
corrected. Infrastructure changes are published; dotfiles is not pushed. Current
observations are not continuous-health guarantees, broad CAPTCHA guarantees, or
proof of prompt-injection resistance. No outstanding implementation blocker.

Temporary acceptance scripts and raw logs were task-local and removed with the
worktrees after integration. This plan retains public-safe evidence, not credentials,
real inventory, or another permanent verification workflow.
