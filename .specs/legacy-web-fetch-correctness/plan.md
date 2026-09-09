---
created: 2026-09-09
status: deferred
completed: null
---

# Legacy web-fetch path, error and connection correctness

## Workstream disposition

Deferred by the operator's default-profile scope correction. The demonstrated defects and retained proposal below concern legacy only; they are not part of the current default workstream or prerequisites for its plans. Preserve this plan as unfinished, not completed or archived. Its tasks/checks are inactive until legacy work is separately requested and the plan is revalidated. No implementation or live fetch is authorized by the current plan-correction request.

## Goal and scope

Make legacy `web_fetch` execute its owning script, report failed subprocesses as tool failures, and connect only to addresses validated for the current hop. Preserve readable extraction, intentional private/local access, and public-only Jina fallback.

Non-goals: default-profile fetch/gateway changes, browser retrieval, caching, new external services, generic HTTP framework, skill inventory changes, or other review findings. Do not add rollback work.

Authorization: planning only. Separate execution authorization includes task commits and merge into dotfiles `main`, not push/deployment.

## Context for a fresh session

All paths are dotfiles-root-relative. Read root `AGENTS.md`, `pi/profiles/legacy/AGENTS.md`, its `docs/README.md`, and relevant `skills/pi-extension/references/tooling-contracts.md` contracts. Follow the active default planning/testing skills while respecting legacy source rules.

- Proposed worktree: `../.dotfiles-worktrees/legacy-web-fetch-correctness`.
- Proposed branch: `fix/legacy-web-fetch-correctness`; merge target: dotfiles `main`.
- Required source: legacy `extensions/web-tools.ts`, `extensions/web-fetch/fetch.js`, `tests/{web-tools,web-tools-pure}.test.ts`, `package.json` and `tests/vitest.config.ts`.
- Starting evidence: the extension hardcodes `~/.dotfiles/pi/extensions/web-fetch/fetch.js`, absent on the inspected machine. The actual script lives under `pi/profiles/legacy/extensions/web-fetch/`. The extension ignores subprocess exit code/killed state.
- The script resolves/classifies DNS, then calls global fetch with the hostname and no pinned connection. An offline injected-resolver/transport probe accepted a simulated metadata connection after public validation. This proves the boundary gap, not a live exploit.
- Private/local direct fetch is intentional. Metadata denial is distinct from private classification; do not replace the latter with a blanket private-network ban. Fallback currently reclassifies the original URL without remembering a private hop.
- Legacy package metadata has no direct Undici runtime dependency. On 2026-09-09 a bounded loopback probe verified Node native HTTP `lookup` pinning with the original Host header and no external DNS. HTTPS/SNI and response handling remain part of implementation acceptance, not verified by that HTTP probe.
- Checkout was clean before plan creation. Preserve concurrent changes at execution.

### Profiles and evidence

Planning profile: verified default at `pi/profiles/default`; intended implementation/validation: legacy at `pi/profiles/legacy`. Default behavior remains unchanged. Planning probes used inert DNS/transport and one temporary loopback HTTP server, now closed. No production URLs, credentials or real metadata endpoints were contacted.

## Decisions and contracts

| Decision | Authority | Required behavior |
| --- | --- | --- |
| D1 | Earlier legacy proposal, deferred by current default-only scope | The three related fetch boundaries remain a legacy-local proposal, not active work. |
| D2 | Existing behavior | Allow direct HTTP(S) access to non-metadata private/local URLs; do not send private targets to Jina. |
| D3 | Existing limits | Preserve 8,000 default / 50,000 maximum characters, 2 MiB response limit, five redirects, 15-second per-request bound and 30-second wrapper timeout. |
| D4 | Existing extraction | Preserve Readability, RSC extraction, Markdown formatting and public Jina fallback; search behavior is unchanged. |

Proposed mechanism:

1. Resolve the sibling fetch script with `fileURLToPath(new URL(..., import.meta.url))`, independent of HOME, cwd and checkout location. Keep argv execution, not interpolated shell commands.
2. Treat nonzero exit, killed/timeout, and spawn failure as thrown tool errors with bounded diagnostics. Preserve successful stdout and existing code-zero empty-output behavior; stderr alone is not a reliable exit-status classifier. Forward the tool abort signal to the subprocess.
3. Extract a small importable per-hop acquisition module, proposed `extensions/web-fetch/http.js`, leaving the existing CLI and extraction pipeline intact. Use native `node:http`/`node:https` request with a lookup callback bound to already classified address records. Do not resolve again at connection time or reuse a connection from a differently validated hop. Keep the URL hostname for Host, SNI, and certificate verification; never disable TLS validation.
4. For each hop, normalize address forms, classify all DNS results, reject metadata as the current policy requires, and pin the selected non-metadata address. Direct private addresses remain allowed. Redirects get their own validation and pinning. Keep response byte/time limits and dispose request/response resources on redirects, errors, limits and aborts. Preserve text decoding and compressed response support using Node facilities rather than silently returning compressed bytes to Readability.
5. Carry a conservative public-fallback eligibility fact across the original acquisition: observing any private/local target or redirect disallows external fallback for that attempt. Revalidate the original URL before fallback too. DNS changes cannot erase an already observed private classification. Do not claim control over Jina's own downstream DNS or fetch behavior.

The native per-hop adapter is a proposed implementation choice supported by the local pinning probe. If it cannot preserve the existing response contract without disproportionate duplication, document that concrete limitation before adding a dependency or changing behavior; do not silently remove compression/TLS/fallback support.

## Execution guidance

Create the dedicated worktree/branch only after authorization; work and validate there. Carry this plan without losing its original or others' changes. Keep paths/profile boundaries explicit. Follow legacy's final-validation cadence: author implementation/tests first, then one final validation phase; after a failed phase allow one focused repair batch and affected rerun, then report any remaining blocker. The completed planning probes are not new implementation validation.

Before expanding work, identify the required outcome and evidence. If an assumption fails, prefer a simpler in-scope mechanism; ask before consequential scope or contract changes. Remove only task-created detours, preserving necessary behavior and concurrent work. No live external fetch is needed for acceptance.

## Tasks

- [ ] **T1 - Correct the extension subprocess adapter**
  - Depends on: none.
  - Files: legacy `extensions/web-tools.ts`, `tests/web-tools.test.ts`.
  - Do: resolve the sibling script, forward cancellation, and throw on nonzero/killed/spawn failures with bounded diagnostics. Keep successful output and URL/max-character argv behavior.
  - Verify: author tests for an existing profile-local script path, paths with spaces, nonzero stdout/stderr, killed timeout, spawn rejection and successful output. Do not run validation before T3 is ready.
  - Done when: wrong-path and failed-process results cannot appear as successful fetch content.
  - Evidence: Not started.

- [ ] **T2 - Bind address classification to each connection**
  - Depends on: T1.
  - Files: existing `extensions/web-fetch/fetch.js`; proposed `extensions/web-fetch/http.js`.
  - Do: implement the per-hop adapter and fallback eligibility propagation. Keep the CLI interface and extraction stages. Avoid introducing extra caches, retry policies or broad private-address restrictions.
  - Verify: author T3's transport regressions against actual adapter code and controllable DNS/connection boundaries.
  - Done when: no hop can connect through an independent hostname resolution, and observed private targets remain ineligible for external fallback.
  - Scope checkpoint: default gateway, search semantics, skill inventory and broad SSRF policy expansion are untouched.
  - Evidence: Not started.

- [ ] **T3 - Complete bounded tests, documentation and final validation**
  - Depends on: T2.
  - Files: existing legacy web tests; proposed `tests/web-fetch-http.test.ts`; legacy `extensions/README.md` and root `CHANGELOG.md`.
  - Do: cover changed DNS answers, explicit/mapped metadata addresses, allowed local fetch, mixed DNS classification, redirect revalidation, private-hop fallback denial, public fallback, byte limit, timeout/abort cleanup, and a compressed response. Use temporary loopback servers and controlled resolver callbacks, never live metadata/Jina requests.
  - Verify: include a loopback connection test proving only the validated address is used while Host remains the original hostname; a controlled HTTPS fixture verifies SNI/hostname checking stays enabled. Preserve real extraction with a local readable HTML fixture. Run final commands below once.
  - Done when: T1/T2 contracts pass at adapter and wrapper boundaries and tests leave no sockets/processes behind.
  - Evidence: Not started.

- [ ] **T4 - Archive and integrate**
  - Depends on: T3.
  - Do: record actual legacy validation and limitations, archive this plan, commit and merge locally.
  - Verify: `main` contains implementation and dated archive; no active copy remains.
  - Done when: locally integrated, or an explicit integration blocker is reported with the task worktree retained.
  - Evidence: Not started.

## Agreed validation and finish

From the task worktree's `pi/profiles/legacy`:

```sh
pnpm test web-tools.test.ts web-tools-pure.test.ts web-fetch-http.test.ts
pnpm run typecheck
```

The HTTP test file is proposed. Its local extraction/CLI test supplies runtime coverage for the JavaScript path, which TypeScript alone cannot establish. Use the installed legacy dependency setup; if links are missing, follow root pnpm/link instructions without relinking production to a disposable worktree. Classify unrelated baseline failures; do not audit or fix them under this plan. No full-suite or live-network acceptance requirement.

## Current handoff

- Status: deferred and outside the default-profile workstream; implementation not started or authorized.
- Completed: historical current-path inspection, injected boundary reproduction and native pinning feasibility probe only.
- Next: none in the default workstream. Resume only after a separate request for legacy work and revalidation of current source/requirements.
- Open operator decisions for the default workstream: none. Retained HTTPS/body parity checks apply only if this legacy plan is resumed.

## Completion and archive

After the agreed work/checks, set completed status/date and move this directory to `.specs/archive/legacy-web-fetch-correctness/` in the task worktree. Do not overwrite an archive; repair affected links. Commit implementation, changelog and archive together, then merge into `main` preserving unrelated changes. If blocked, retain the worktree and report implementation versus integration separately. Verify target/archive and absence of active plan. Recheck only behavior changed by merge conflicts; remove the worktree after clean integration. Do not push.
