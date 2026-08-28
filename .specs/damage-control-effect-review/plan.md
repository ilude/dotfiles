---
created: 2026-08-27
status: ready
---

# Refactor damage control around parsed effects and Luna review

## Objective

Replace whole-command bypass authorization with shared parsed effects for Bash, PowerShell, Python, JavaScript, and TypeScript, correct the agreed local-operation bypass behavior, and let an explicitly configured Luna reviewer auto-allow only eligible low-risk ask-tier actions without weakening deterministic hard protections.

## Completion Evidence

- Evidence: Focused registered-handler tests prove command ownership and effects are parsed across supported languages; `/dc off` allows ordinary repository-local deletion, Git, Docker, and `.env` operations; `git fetch`, `git clone`, and `git pull --ff-only` do not prompt in normal mode; retained hard protections still ask or block; `/dc on`, `/clear`, process exit, and the bypass footer retain their agreed behavior; and a pinned configured Luna reviewer auto-allows only schema-valid, low-risk, reviewer-eligible asks while every unavailable, malformed, uncertain, ineligible, or protected review falls back to the user prompt.
- Fails when: Whole-command text can confuse command ownership, PowerShell or embedded scripts avoid effect classification, repository-local `.env` access is limited to `ctx.cwd`, local image cleanup is treated as volume deletion, bypass resets on an unrelated session transition, tests use synthetic rules instead of registered handlers, or Luna can override a hard block or suppress a prompt after any parse, model, schema, uncertainty, or eligibility failure.

## Boundaries

- In scope: Pi damage-control parsing, normalized effects, Bash and PowerShell command boundaries, bounded inline or local one-off Python/JavaScript/TypeScript analysis, repository-root containment, bypass eligibility, Git/Docker/delete/`.env` semantics, lifecycle reset behavior, registered-handler tests, existing shadow-judge evolution into optional Luna auto-review, settings validation, dependencies, and the owning contract.
- Out of scope: OS sandboxing, OPA/Rego, Semgrep integration, QuickJS, Node or Deno runtime permissions, persistent parser workers, arbitrary inter-file program analysis, other clients, and model review of hard blocks or unknown effects.
- Preserve: Deny-before-ask-before-allow precedence; policy-load failure, catastrophic/protected/external deletion, dynamic targets, secret exfiltration, force push, remote-ref deletion, Docker volume deletion, SSH/remote execution, live infrastructure, unmanaged backgrounding, sequence controls, circuit breakers, no-UI fail-closed behavior, normal hidden footer state, and red `damage-control: bypassed` footer state.
- Assumptions: `web-tree-sitter` loads the published `tree-sitter-powershell.wasm` 0.26.4, `tree-sitter-python.wasm` 0.25.0, `tree-sitter-javascript.wasm` 0.25.0, and `tree-sitter-typescript.wasm` 0.23.2 assets; TSX is not in scope. Existing `damageControl.judge.enabled` remains shadow-only unless explicit auto-allow is enabled. No unique canonical Git worktree root, parser recovery/error nodes, or unrecognized executable constructs produce uncertainty and retain prompting.

## Tasks

- [ ] **T1: Prove the shared parser-to-effect contract**
  - Files: `pi/package.json`, `pi/pnpm-lock.yaml`, `pi/extensions/damage-control/ast-analyzer.ts`, `pi/extensions/damage-control/operation-analysis.ts`, `pi/tests/damage-control-operation-analysis.test.ts`
  - Change: Add `tree-sitter-powershell@^0.26.4`, `tree-sitter-python@^0.25.0`, `tree-sitter-javascript@^0.25.0`, and `tree-sitter-typescript@^0.23.2`; centralize `Parser.init()`, language/parser caching, exact WASM resolution, and load/timeout failure conversion to uncertainty in `operation-analysis.ts`, while reusing the existing Bash grammar and analysis. Define a discriminated known-effect versus uncertain-effect result: known effects carry source language, normalized operation kind, executable/arguments when applicable, canonical target where applicable, and parser ranges only for diagnostics or command-fragment extraction; filesystem, Git, Docker, subprocess, and network activity are distinct effect kinds, while protection is derived during aggregation rather than stored redundantly. Aggregate every node in the complete invocation before deciding: any protected or uncertain node outranks every allow node, and a sensitive read combined anywhere with an external sink, remote subprocess, or unresolved flow is protected and reviewer-ineligible. First implement the exact multiline `git rm ...; printf ...` regression and PowerShell `Remove-Item -Recurse -Force`; stop expansion if either parser cannot preserve ownership, ranges, arguments, and static targets. Tree-sitter `ERROR`/missing nodes, parser initialization failure, timeout, recursion beyond the existing depth three, and any executable node not mapped to an effect must produce uncertainty.
  - Done when: The representative slices distinguish executable ownership without whole-input regex inference; compound protected effects cannot be hidden by an allowed Git node; malformed and unsupported Bash/PowerShell constructs produce uncertainty; and the shared contract passes focused tests and the early typecheck.
  - Verify: `cd pi && pnpm run typecheck && pnpm test damage-control-operation-analysis.test.ts`

- [ ] **T2: Route bypass and normal safe operations through parsed effects**
  - Files: `pi/extensions/damage-control-engine.ts`, `pi/extensions/damage-control.ts`, `pi/extensions/damage-control/operation-analysis.ts`, `pi/damage-control-rules.yaml`, `pi/tests/damage-control.test.ts`, `pi/tests/damage-control-ast.test.ts`, `pi/tests/damage-control-operation-analysis.test.ts`, `pi/skills/pi-extension/references/contracts/damage-control.md`
  - Change: Replace the separate whole-command bypass regex classifier with one final aggregated effect decision after every deterministic sequence, path, no-delete, secret, and dangerous-command check. Route the PowerShell handler through parsing before regex deletion decisions. Discover the canonical root with `git rev-parse --show-toplevel` from the effective tool cwd; linked worktrees resolve to their worktree root, submodules to their own root, and non-repositories or discovery failure remain uncertain with no cwd fallback. Address PowerShell deletion parity; allow repository-contained `.env` pipelines and sequences while treating any invocation-wide sensitive-read plus external/network/DNS/remote-process or unresolved data flow as protected; use real configured policy and registered handlers; distinguish `docker system/image prune` and `compose down --rmi` from protected `volume rm/prune` and `compose down -v/--volumes`; and reset bypass only for `session_start` reasons `startup` and `clear` while process exit discards memory and `reload`, `resume`, and `fork` preserve the current in-process state when the runtime retains the extension instance. Parse UTF-8 inline scripts or canonical repository-contained `.py`, `.js`, `.mjs`, `.cjs`, or `.ts` files within one 256 KiB total analyzed-source budget per invocation and recursion depth three, for supported literal filesystem, subprocess, import, and network APIs; missing, changed, unreadable, binary, symlink-escaped, computed, reflective, aliased, unsupported, or inter-file-dependent code is uncertain. Treat `git fetch`, `git clone`, and `git pull --ff-only` as allow effects only after complete-invocation aggregation; environment prefixes and global Git options may be normalized, but aliases, remote helpers, compound protected effects, and uncertain arguments retain prompting. Other ordinary local Git effects are bypassable; force push and remote-ref deletion remain protected.
  - Done when: Registered handlers, identified by tool behavior rather than array index, prove all agreed allow classes and retained groups; representative Python/JS/TS tests cover each supported effect family, parser recovery/error cases, and dynamic or unsupported executable constructs becoming uncertain; nested cwd, linked-worktree, submodule, symlink escape, and non-repository cases prove root semantics; and the exact `git rm` regression no longer prompts while bypassed.
  - Verify: `cd pi && pnpm test damage-control.test.ts damage-control-ast.test.ts damage-control-operation-analysis.test.ts`
  - Depends on: T1

- [ ] **T3: Promote the shadow judge into bounded optional Luna auto-review**
  - Files: `pi/lib/damage-control-settings.ts`, `pi/lib/damage-control-judge.ts`, `pi/extensions/damage-control.ts`, `pi/tests/damage-control-settings.test.ts`, `pi/tests/damage-control-judge.test.ts`, `pi/tests/damage-control-shadow-judge-extension.test.ts`, `pi/skills/pi-extension/references/contracts/damage-control.md`
  - Change: Preserve existing shadow-only behavior by default and add a settings parser for `damageControl.judge.{enabled,autoAllow,provider,model}` that validates consumed field types, requires an exact configured model ID containing the Luna family name for auto-allow, uses fixed `high` reviewer effort, and never falls back to another provider/model. Await authoritative review only after all deterministic seams produce one final reviewer-eligible ask with no protected or uncertain effects and only when `ctx.hasUI`; no-UI remains fail-closed without authoritative review. Send the tool-less configured model only bounded redacted authorization, matched rule, repository-relative effect summaries, and untrusted command fragments as delimited data. Require strict JSON `{decision:"allow"|"ask",risk:"low"|"medium"|"high"|"unknown",reason:string}`; only `allow` plus `low` may auto-allow after deterministic eligibility has already proved there are no protected or uncertain effects. Resolution failure, timeout/transport failure, malformed output, ask verdict, or evidence of tool-capable execution retains the original prompt. Hard blocks and ineligible asks cannot reach the reviewer. Reuse existing judge records/correlation and keep `enabled:true` without `autoAllow:true` asynchronous and non-authoritative.
  - Done when: Tests prove one eligible low-risk ask auto-allows through the exact configured Luna model; settings, fixed effort, redaction, exact Luna identity, no-UI, one model-resolution failure, one transport failure, one schema failure, shadow-only, and later-seam hard protection retain the original prompt without replay or authority escalation.
  - Verify: `cd pi && pnpm test damage-control-judge.test.ts damage-control-shadow-judge-extension.test.ts damage-control.test.ts`
  - Depends on: T2

## Validation

- [ ] `cd pi && pnpm test damage-control-operation-analysis.test.ts damage-control-ast.test.ts damage-control-settings.test.ts damage-control-judge.test.ts damage-control-shadow-judge-extension.test.ts damage-control.test.ts operator-status.test.ts` passes with the completion-evidence behaviors exercised through the focused suites.
- [ ] `cd pi && pnpm exec biome check extensions/damage-control.ts extensions/damage-control-engine.ts extensions/damage-control lib/damage-control-judge.ts tests/damage-control-operation-analysis.test.ts tests/damage-control-ast.test.ts tests/damage-control-settings.test.ts tests/damage-control-judge.test.ts tests/damage-control-shadow-judge-extension.test.ts tests/damage-control.test.ts tests/operator-status.test.ts` passes without fixes.
- [ ] `cd pi && pnpm run typecheck` passes after the final shared-contract and settings changes.

## Retention

Keep incomplete work at `.specs/damage-control-effect-review/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/damage-control-effect-review/`.

## Execution Status

- State: Ready; implementation has not started.
- Blocker: None.
- Next: T1.
- Resume: `/do-it .specs/damage-control-effect-review/plan.md`
