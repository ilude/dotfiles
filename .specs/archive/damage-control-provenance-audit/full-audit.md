# Full default-versus-legacy Damage Control audit

## Result

**30 discrete behavioral differences require review.**

This count excludes pure refactoring, renamed internal types, test-only helpers, formatting, and the two issues already corrected during this task: speculative recursive read-only tree inspection and typed clarification input. It includes additions, removals, and semantic changes that can alter whether a tool call runs, invokes Luna, prompts, blocks, aborts, or exposes an operator control.

Port-authored documentation, migration rationales, and tests prove implementation intent, not operator approval. Each item below therefore remains a finding until the operator explicitly keeps, changes, or removes it.

## Policy and decision behavior

### DC-01: 99 legacy `ask` rules were changed to model-reviewable rules

- Legacy: 225 explicit `ask`, 104 explicit `block`, six omitted actions that effectively block.
- Default migration: 126 `ask -> user`, **99 `ask -> review`**, 104 `block -> block`, six missing -> block.
- Effect: operations that always prompted in legacy can now execute after Luna approval.
- Evidence: `tests/damage-control/fixtures/policy-migration.json`, default `damage-control-rules.yaml`, legacy rules/engine.

### DC-02: Luna review changed from optional configuration to mandatory fixed configuration

- Legacy: judge defaults disabled; authoritative auto-allow requires `enabled`, `autoAllow`, explicit provider/model, and a Luna-like model.
- Default: settings parser requires exactly `openai-codex/gpt-5.6-luna`, high effort, zero retries; checked-in settings enable it.
- Effect: review behavior and startup validity now depend on one fixed model configuration.
- Evidence: legacy `lib/damage-control-settings.ts`; default `policy.ts` and `damage-control-settings.json`.

### DC-03: Luna receives broader operator and session evidence

- Legacy authoritative review receives the matched ask, redacted command fragment, cwd, and analyzed effects. Sequence evidence is separate.
- Default records up to 16 direct interactive/RPC inputs plus prior read/upload/creation effects for up to 30 minutes and sends the bounded projection to Luna.
- Effect: more conversation and historical activity is used in authorization decisions.
- Evidence: default `context.ts`, `judge.ts`; legacy `reviewDamageControlAsk()`.

### DC-04: A fourth `clarification` decision state was added

- Legacy covered outcomes are allow, ask, or block.
- Default adds `clarification`, candidate-block dismissal rules, missing-fact lists, and special review handling.
- Effect: unresolved analysis follows behavior that has no legacy equivalent. Typed input was removed, but the decision state remains.
- Evidence: default `types.ts`, `engine.ts`, `prompt.ts`; legacy contract.

### DC-05: Unsupported commands become reviewable unknown execution

- Legacy generally applies explicit rules and known semantic checks; an otherwise unmatched command proceeds.
- Default emits an unknown execution effect for every unsupported executable and invokes Luna/operator review.
- Effect: harmless commands such as `sort` prompted until individually allowlisted; the same can recur for other normal tools.
- Evidence: default `shell.ts` final `addOpaqueExecution`; observed incident and focused test failure.

### DC-06: Parse uncertainty is elevated into authorization uncertainty

- Legacy AST checks return decisions for matched dangerous behavior; parser limits do not establish a universal requirement to prove every command safe.
- Default records unresolved syntax, dynamic executables, missing operands, nesting limits, and parse deadlines as effects/uncertainties that trigger review or prompts.
- Effect: analysis limitations can block or prompt operations without a matching legacy rule.
- Evidence: default `shell.ts`, `engine.ts`.

## Tool coverage and adapter behavior

### DC-07: Exact native schema validation was added

- Legacy reads fields it knows and ignores unrelated fields.
- Default blocks covered tools with any unexpected field, malformed optional field, or schema variation.
- Effect: compatible Pi schema evolution or extension-added metadata can disable a tool before policy evaluation.
- Evidence: default `adapters.ts` `fields` and `adapt()`.

### DC-08: Native source provenance validation was added

- Legacy gates by tool name.
- Default requires `pi.getAllTools()` to report the covered tool as `builtin`; an override with the same name is blocked.
- Effect: trusted extension replacements or Pi metadata changes are rejected independently of actual operation.
- Evidence: default `enforcement.ts`.

### DC-09: A hard-coded unsupported “critical tool” list was added

- Default blocks `pwsh`, `bg_start`, `text_edit`, `structured_edit`, and `glob` because no adapter is present.
- Legacy directly supports `pwsh`, `bg_start`, and `glob`, and has behavior for older edit tool shapes.
- Effect: tools that legacy handled are categorically unavailable instead of governed.
- Evidence: default `adapters.ts`; legacy shell and file handlers.

### DC-10: Legacy `bg_start` coverage was removed

- Legacy analyzes `bg_start.command`, honors `working_dir`, and blocks unmanaged nested backgrounding.
- Default does not adapt `bg_start` and blocks it as safety-critical.
- Effect: background tasks cannot use the legacy governed path.
- Evidence: legacy `damage-control.ts`; default `adapters.ts`.

### DC-11: Legacy `glob` coverage was removed

- Legacy treats `glob` as a file tool and feeds credential-discovery sequence state.
- Default blocks it as an unsupported critical tool.
- Effect: model file discovery differs and legacy sequence behavior cannot occur through this tool.
- Evidence: legacy file handler/state; default `adapters.ts`.

### DC-12: Tool coverage outside the adapter list is silently absent

- Default explicitly leaves web tools and future custom tools uncovered while separately hard-blocking selected names.
- Legacy also had bounded named coverage, but did not present the new adapter list as a general safety boundary.
- Effect: the distinction between silently uncovered and categorically blocked is implementation-selected, not policy-derived.
- Evidence: default `adapters.ts`, `enforcement.ts` status text.

## Parser and startup behavior

### DC-13: Five Tree-sitter grammars are mandatory at startup

- Legacy loads/analyzes relevant syntax during operation and can run its policy without a fixed five-grammar startup readiness gate.
- Default requires Bash, PowerShell, Python, JavaScript, and TypeScript WASM before any session work.
- Effect: a missing grammar disables all covered tools, including native read/write operations unrelated to that grammar.
- Evidence: default `initialize()` and `requireGrammars()`.

### DC-14: Nested Python/JavaScript/TypeScript source analysis was broadened

- Legacy has bounded interpreter/source analysis, but default applies one new effect model and all migrated rules across five languages.
- Effect: strings and operations inside nested scripts can receive authority different from legacy tool-scoped rules.
- Evidence: default `shell.ts`, policy `languages`; legacy `operation-analysis.ts`, rule `tools` fields.

### DC-15: Every migrated command rule was made cross-language

- Legacy rules have tool/platform applicability, commonly Bash-only.
- Default generated policy assigns Bash, PowerShell, Python, JavaScript, and TypeScript to every displayed migrated rule.
- Effect: a Bash-oriented regex may classify text in another language where legacy would not apply it.
- Evidence: default YAML and migration fixture versus legacy rule `tools`/platforms.

### DC-16: Policy parsing became stricter than legacy configuration loading

- Default rejects unknown/missing fields, duplicate values, warnings, unsupported tags, nonexact settings, and empty required sections.
- Legacy validates its own schema but tolerates its existing optional surfaces and settings defaults.
- Effect: harmless configuration extension or version skew can fail closed globally.
- Evidence: default `policy.ts`; legacy rule/settings loaders.

## Filesystem behavior

### DC-17: Legacy zero-access exclusions were removed

- Legacy skips zero-access/read-only/read-confirm/write-confirm checks for 68 exclusion patterns.
- Default policy has no exclusion mechanism.
- Effect: files deliberately exempted in legacy, including fixtures and several credential-looking names, can now hard-block.
- Evidence: legacy rules and file handler; default `PathPolicy`/`pathMatches()`.

### DC-18: Generated-file write behavior was changed

- Legacy includes lockfiles, build output, virtual environments, and dependency directories in read-only paths.
- Default separates `generated` but does not enforce that list in `pathMatches()`; tests explicitly permit direct `pnpm-lock.yaml` writes.
- Effect: legacy blocks disappeared rather than being ported.
- Evidence: default `paths.ts`, `paths.test.ts`; legacy `read_only_paths`.

### DC-19: Ancestor deletion now recursively enumerates descendants

- Legacy checks extracted delete targets and configured no-delete patterns, including lexical/canonical checks, but does not recursively walk every deletion target to discover protected descendants.
- Default walks up to 2,000 entries and turns inspection failure/bounds into uncertainty.
- Effect: deletion can prompt/block based on discovered descendants or metadata-read failure beyond legacy rules.
- Evidence: default `inspectPathTree()` and `analysis.ts`.

### DC-20: Unicode filename guessing was added for reads

- Default retries missing read targets with narrow-space AM/PM, NFD normalization, and curly-apostrophe variants before policy checks.
- Legacy canonicalizes the supplied path without these guessed alternate identities.
- Effect: a request can be redirected to a differently spelled physical file for safety classification.
- Evidence: default `canonicalizeRead()`.

### DC-21: Git metadata determines deletion approval tier

- Default runs bounded `git ls-files` for delete targets and creates mandatory `meaningful-existing-work` approval for tracked files.
- Legacy deletion behavior comes from explicit command/path rules and scoped-delete checks, not a tracked-file subprocess for every deletion.
- Effect: repository state adds new prompts and Git availability adds uncertainty.
- Evidence: default `trackedWork()` and `analysis.ts`.

### DC-22: Session creation history determines whether deletion is disposable

- Default records successful newly created file paths and allows later deletion based on that session evidence or configured scratch roots.
- Legacy scoped deletion is based on containment/safe-delete policy, not a file-creation ledger.
- Effect: identical delete commands can receive different outcomes based on prior calls in the branch.
- Evidence: default `Context.recordSuccess()/wasCreated()` and `analysis.ts`.

### DC-23: Native search inventory subprocesses were added

- Even after removing uncertainty prompts, default native `grep`/`find` and shell `rg` may launch `rg`/`fd` to enumerate filenames and apply path rules to returned files.
- Legacy checks the explicit file-tool path and recognizes read-only shell searches; it does not pre-run a second search executable for authorization.
- Effect: duplicate work, dependency/latency differences, and blocks based on inferred selected descendants.
- Evidence: default `search.ts`, `analysis.ts`; legacy file/shell handlers.

## Docker behavior

### DC-24: Docker daemon metadata queries were added to authorization

- Legacy uses command/rule/AST analysis and does not query Docker inspect/context metadata to decide each covered operation.
- Default invokes Docker metadata for container deletion and exec.
- Effect: authorization depends on daemon availability, endpoint resolution, response bounds, and extra subprocesses.
- Evidence: default `docker.ts`, `docker-analysis.ts`.

### DC-25: Container identity and creation ledgers were added

- Default records exact 64-character container IDs after creation and considers deletion disposable only for a same-daemon immutable identity created in the branch.
- Legacy uses ask/bypass/scoped command behavior without this ledger.
- Effect: identical container removal changes tier based on prior session events and metadata output shape.
- Evidence: default `enforcement.ts`, `context.ts`, `docker-analysis.ts`.

### DC-26: Docker mount translation created new policy rules

- Default maps container paths through bind mounts and volumes, synthesizing `docker-exec-persistent-volume`, `docker-exec-volume-access`, `docker-exec-context`, and remote-bind uncertainty.
- Legacy blocks/asks using its explicit Docker rules and protected path analysis, without these synthetic resource identities.
- Effect: `docker exec` can trigger prompts or clarification for behavior not represented in legacy policy.
- Evidence: default `docker-analysis.ts` and Docker tests.

## Operator controls, recovery, and observability

### DC-27: Legacy session bypass controls were removed

- Legacy `/dc off` provides a nonpersistent, narrowly eligible bypass for local ask-tier rm/Docker/Git/.env operations while retaining hard protections; `/dc on` restores it.
- Default `/dc` is status-only and relies on a separate recovery launch for implementation repair.
- Effect: the operator lost a normal legacy control for noisy ask-tier work.
- Evidence: legacy command registration and bypass functions; default status implementation/docs.

### DC-28: Legacy `noshell` mode was removed

- Legacy supports `/dc mode noshell` and resets session state appropriately.
- Default has no normal mode switch.
- Effect: the operator lost the legacy ability to disable shell tools while retaining file tools.
- Evidence: legacy command and contract; default enforcement/status.

### DC-29: Self-integrity bootstrap and recovery mode were added

- Default protects its implementation, policy, settings, bootstrap, launcher, and recovery files; startup failures install a guard; repair requires `pp --dc-recovery` with a separate locked flow.
- Legacy fails closed on policy health but does not have this launcher-level self-protecting bootstrap/recovery architecture.
- Effect: ordinary authorized maintenance is blocked in normal sessions, as observed during this task.
- Evidence: default path policy, bootstrap/launcher, setup docs; legacy health handling.

### DC-30: Legacy audit/debug/operator diagnostics were removed or replaced

- Legacy records bounded redacted decisions and rule-load failures, supports debug logging, shadow evaluation, `/dc stats`, `/dc recent`, `/dc judge`, and labeling.
- Default intentionally has no production decision log or telemetry and exposes only readiness status.
- Effect: operator visibility and post-incident diagnosis are materially reduced even though decision complexity increased.
- Evidence: legacy `damage-control.ts` command/audit paths; default docs and enforcement.

## Cross-cutting notes not counted separately

- The repeated-call breaker exists in both systems, but thresholds, polling exceptions, delivery, and termination semantics differ. This is folded into DC-30 unless the operator wants a separate breaker-only review.
- Legacy deterministic sensitive-read/discovery/upload sequence decisions are replaced by broader historical evidence supplied to Luna. This is folded into DC-03 rather than double-counted.
- Legacy secret-output heuristics record audit evidence but do not block output. Their absence is folded into DC-30.
- `/commit` and direct operator shell exemptions are documented default choices. Direct shell exemption exists in the owning surface; `/commit` is not counted separately because it is an integration exception rather than a general policy engine behavior.

## Operator decisions

All findings were resolved in six groups:

1. **DC-01–06: 1B.** Legacy ask/block authority with Luna limited to dismissing non-executing false-positive matches. Luna cannot authorize actual ask-tier operations. Parser uncertainty alone adds no restriction.
2. **DC-07–16: 2B.** Legacy tool compatibility with on-demand deep parsing only for interpreter or concealed mutations. Harmless schema additions and ordinary unmatched commands do not block.
3. **DC-17–23: 3A.** Restore legacy filesystem and search behavior exactly.
4. **DC-24–26: 4A.** Restore legacy Docker command-rule behavior exactly.
5. **DC-27–29: 5A with operator exception.** Restore legacy bypass and `noshell`; remove expanded self-integrity behavior but retain `pp --dc-recovery`.
6. **DC-30 and folded breaker/sequence differences: 6B.** Restore bounded operational diagnostics and legacy loop/sequence protections, excluding evaluation labels, shadow experiments, large telemetry, and `/dc status`.

Implementation should follow this dependency order and verify each grouped contract without introducing replacement restrictions.
