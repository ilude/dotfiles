---
created: 2026-05-07
status: completed
completed: 2026-05-07
---

# Plan: Skill stats command with forward skill-load logging

## Context & Motivation

The user wants a `/skill-stats` command analogous to the existing `/extension-stats` command, plus durable logging when skills load so future reports are accurate. Inspection of `pi/extensions/extension-stats.ts` showed the useful implementation pattern: register a slash command, scan `~/.pi/agent/sessions/**/*.jsonl`, aggregate rolling windows, and send Markdown with `pi.sendMessage(..., { triggerTurn: false })` instead of opening a TUI or triggering an LLM turn.

Skills are not tools. Historical skill usage has weaker evidence than extension/tool usage because skills are loaded as prompt/context content, not as structured `toolCall` records. The best-effort historical signals are explicit `/skill:<name>` prompts, persisted expanded `<skill name="...">` blocks if present, structured `skill-load` events if present, and manual/candidate `SKILL.md` reads. Follow-up web/docs and installed-type research found durable custom session persistence via `pi.appendEntry(customType, data?)`; review-3 clarified that `before_agent_start` exposes prompt skill inventory, not necessarily explicit invocation usage. Forward logging should be implemented in repo-owned extension code without editing `node_modules`, using `pi/extensions/skill-loader.ts` or a proven pre-expansion `input` hook for explicit skill invocations and `before_agent_start` only for separately labeled prompt inventory.

## Constraints

- Platform: Windows via Git Bash/MSYS2 (`MINGW64_NT-10.0-26200`), repo path `C:/Users/mglenn/.dotfiles`.
- Shell: use `bash` for repo commands; use forward-slash paths.
- Project markers detected: `.gitattributes`, `Makefile`, `pyproject.toml`; Pi extension TypeScript files under `pi/extensions/` with `pi/extensions/package.json` and `tsconfig.json`.
- Package manager policy: Pi TypeScript validation is `pnpm` only; do not use `bun` for Pi extension or Pi test work.
- Existing strongest repo validation: `make check`; Pi extension validation: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`; Pi tests, when used, run with `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`.
- Do not modify `*.env`, secret-like files, or commit secrets.
- Do not edit `pi/extensions/node_modules` as the durable implementation. Read-only inspection is allowed.
- `pi/extensions/README.md` says every top-level `pi/extensions/*.ts` file is auto-discovered as an extension and must export a default factory. Do not put tests/helpers at top level in `pi/extensions/`.
- `/skill-stats` should dump Markdown directly, not open a paging TUI, matching current `/extension-stats` behavior.
- Session-log evidence artifacts must be redacted/summarized: do not store raw prompts, tool outputs, expanded skill content, tokens, credentials, emails, or private absolute paths beyond the root label.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Count explicit `/skill:<name>` user commands only | Simple and accurate for explicit invocations | Under-counts auto/manual skill loads | Use as fallback signal only |
| Count expanded `<skill name="...">` prompt blocks | More direct if persisted in JSONL | May not exist in logs; can duplicate explicit command evidence | Use with de-duplication |
| Count `read` tool calls to `SKILL.md` paths as usage | Captures manual skill-file reads | Review/research reads are noisy and misleading | Show only in separate candidate/manual-read section, not default usage ranking |
| Emit structured `skill-load` custom messages going forward | Accurate and future-proof | Requires proven durable hook/API outside `node_modules` | Required if local durable hook exists; otherwise pause for user scope decision/upstream patch |
| Reuse `/extension-stats` report/session scanning patterns | Reduces implementation risk | Full refactor of existing file could touch lint-heavy legacy TUI code | Copy/reuse minimal patterns; avoid broad refactor unless necessary |
| Dedicated metrics database | Fast querying | Over-engineered for local Pi JSONL workflows | Rejected |

Convergence note: selected approaches are session-log/report based because Pi already persists JSONL session history and `/extension-stats` follows that pattern. A dedicated metrics database would be correct if reporting had to support real-time dashboards over very large histories.

## Objective

Produce a working `/skill-stats` Pi extension command that reports rolling skill usage from best-effort historical session evidence and parses structured `skill-load` events. Also implement forward structured skill-load logging with the canonical Pi custom entry shape: `type: "custom"`, `customType: "skill-load"`, payload under `data`. Explicit skill invocations must be captured from `pi/extensions/skill-loader.ts` or a proven pre-expansion `input` hook. `before_agent_start.systemPromptOptions.skills` may be logged only as prompt inventory and must not be counted as default invocation usage.

## Project Context

- **Language**: TypeScript for Pi extensions; Python/shell elsewhere in the dotfiles repo.
- **Test command**: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`; if tests are added under `pi/tests`, also `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`.
- **Lint command**: `make lint`; repo-wide validation is `make check`.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Preflight | `mkdir -p .specs/skill-stats-logging/evidence && git status --short > .specs/skill-stats-logging/evidence/preflight-status.txt && git branch --show-current >> .specs/skill-stats-logging/evidence/preflight-status.txt` | none | `.specs/skill-stats-logging/evidence/preflight-status.txt` |
| Owned-file safety | Before edits, record intended paths in `.specs/skill-stats-logging/evidence/owned-files.txt`; abort/escalate if `git status --short -- <path>` shows pre-existing unrelated changes | none | `.specs/skill-stats-logging/evidence/owned-files.txt` |
| Discover hooks/log shapes | `printf 'repo pi exists: '; test -d pi && echo yes || echo no; printf 'runtime sessions exists: '; test -d "$HOME/.pi/agent/sessions" && echo yes || echo no` plus targeted greps from T1 | none | `.specs/skill-stats-logging/evidence/discovery.txt` with redacted summaries only |
| Implement `/skill-stats` | Edit/add TypeScript under `pi/extensions/` and shared helpers under non-autodiscovered paths if needed | none | `REPO_ROOT=$(git rev-parse --show-toplevel) && git diff -- pi/extensions pi/lib pi/tests > "$REPO_ROOT/.specs/skill-stats-logging/evidence/implementation.diff"` |
| Add forward logging | Use repo-owned Pi extension code: capture explicit invocations in `pi/extensions/skill-loader.ts` or proven pre-expansion `input` hook; optionally log `before_agent_start` prompt inventory separately; `pi.appendEntry("skill-load", safePayload)` persists custom entries with payload under `data`; do not store prompt text, expanded skill content, descriptions, raw paths, or tool args | none | `.specs/skill-stats-logging/evidence/forward-logging.txt` |
| Verify Pi typecheck | `REPO_ROOT=$(git rev-parse --show-toplevel) && cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck > "$REPO_ROOT/.specs/skill-stats-logging/evidence/typecheck.txt" 2>&1` | none | `.specs/skill-stats-logging/evidence/typecheck.txt` |
| Verify tests/smoke | If tests under `pi/tests`: `REPO_ROOT=$(git rev-parse --show-toplevel) && cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- skill-stats > "$REPO_ROOT/.specs/skill-stats-logging/evidence/smoke.txt" 2>&1`; otherwise run the explicit smoke command added by T5 | none | `.specs/skill-stats-logging/evidence/smoke.txt` |
| Repo-wide verify | `REPO_ROOT=$(git rev-parse --show-toplevel) && make check > "$REPO_ROOT/.specs/skill-stats-logging/evidence/make-check.txt" 2>&1` | none | `.specs/skill-stats-logging/evidence/make-check.txt` |
| Manual verify | Optional if automated event/parser harness proves output and forward logging; otherwise use a disposable Pi session and capture redacted output/JSONL grep | none | `.specs/skill-stats-logging/evidence/manual.txt` |
| Deploy | not applicable; local dotfiles/Pi extension change only | none | none |
| Rollback | Use exact file manifest from `owned-files.txt` plus `git status --short --untracked-files=all`; restore/remove only listed files after user confirmation if discarding work; preserve review/evidence artifacts unless explicitly listed | none | `.specs/skill-stats-logging/evidence/rollback.txt` if used |

## Execution Checklist

This checklist is the durable resume ledger for `/do-it`. Every executable task, validation gate, and final completion gate has exactly one matching checkbox. Checked means verified complete; unchecked means pending, in-progress, blocked, or invalidated.

`/do-it` must mark each item `[x]` immediately after that item passes its required verification and before starting any dependent or next sequential step. `/review-it` must preserve checked state, add unchecked items for new executable work, and never mark implementation or validation work complete.

### Wave 0

- [x] P1: Preflight status capture
  - Status: pending
  - Evidence: --
- [x] P2: Owned-file safety capture and unrelated-change check
  - Status: pending
  - Evidence: --
- [x] V0: Validate preflight
  - Status: pending
  - Evidence: --

### Wave 1

- [x] T1: Locate durable skill-loading and session-log extension points
  - Status: pending
  - Evidence: --
- [x] T2: Design skill evidence schema and parser contract
  - Status: pending
  - Evidence: --
- [x] V1: Validate wave 1
  - Status: pending
  - Evidence: --
- [x] G1: Forward logging scope decision before Wave 2
  - Status: pending
  - Evidence: --

### Wave 2

- [x] T3: Implement `/skill-stats` best-effort historical scanner
  - Status: pending
  - Evidence: --
- [x] T4: Add structured skill-load logging going forward
  - Status: pending
  - Evidence: --
- [x] V2: Validate wave 2
  - Status: pending
  - Evidence: --

### Wave 3

- [x] T5: Add fixtures or smoke tests for skill stats evidence
  - Status: pending
  - Evidence: --
- [x] V3: Validate wave 3
  - Status: pending
  - Evidence: --

### Final Gates

- [x] F1: Task-specific verification complete
  - Status: pending
  - Evidence: --
- [x] F2: Repo-wide validation complete
  - Status: pending
  - Evidence: --
- [x] F3: Manual validation complete or not required
  - Status: pending
  - Evidence: --
- [x] F4: Deployment validation complete or not required
  - Status: pending
  - Evidence: --
- [x] F5: Content redaction scan complete
  - Status: pending
  - Evidence: --
- [x] F6: Archive preflight complete
  - Status: pending
  - Evidence: --

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| P1 | Preflight status capture | 0 | safety | small | coding-light | -- |
| P2 | Owned-file safety capture and unrelated-change check | 0-1 | safety | small | coding-light | P1 |
| V0 | Validate preflight | -- | validation | small | qa-engineer | P1, P2 |
| T1 | Locate durable skill-loading and session-log extension points | 0-3 | research | small | utility-mini | V0 |
| T2 | Design skill evidence schema and parser contract | 1 | design | small | planner | V0 |
| V1 | Validate wave 1 | -- | validation | small | qa-engineer | T1, T2 |
| G1 | Forward logging scope decision before Wave 2 | -- | decision | small | coding-light | V1 |
| T3 | Implement `/skill-stats` best-effort historical scanner | 1-2 | feature | medium | typescript-pro | G1 |
| T4 | Add structured skill-load logging going forward | 1-3 | feature | medium | typescript-pro | G1 |
| V2 | Validate wave 2 | -- | validation | medium | qa-engineer | T3, T4 |
| T5 | Add fixtures or smoke tests for skill stats evidence | 1-3 | test | medium | qa-engineer | V2 |
| V3 | Validate wave 3 | -- | validation | medium | qa-engineer | T5 |

## Execution Waves

### Wave 0

**P1: Preflight status capture** [small] -- coding-light
- Description: Create the evidence directory and capture initial git branch/status before any implementation or validation edits.
- Files: `.specs/skill-stats-logging/evidence/preflight-status.txt`.
- Acceptance Criteria:
  1. [ ] Initial repo state is captured.
     - Verify: `mkdir -p .specs/skill-stats-logging/evidence && { git branch --show-current; git status --short; } > .specs/skill-stats-logging/evidence/preflight-status.txt`
     - Pass: evidence file exists and shows branch plus working-tree status.
     - Fail: do not proceed; record the failure in `## Execution Status`.

**P2: Owned-file safety capture and unrelated-change check** [small] -- coding-light
- Blocked by: P1
- Description: Record expected task-owned paths and detect pre-existing unrelated changes in target paths before editing.
- Files: `.specs/skill-stats-logging/evidence/owned-files.txt`.
- Acceptance Criteria:
  1. [ ] Owned-file list exists and pre-existing target-path changes are classified.
     - Verify: `printf "%s\n" pi/extensions/skill-stats.ts pi/lib pi/tests .specs/skill-stats-logging/plan.md .specs/skill-stats-logging/evidence .specs/skill-stats-logging/fixtures > .specs/skill-stats-logging/evidence/owned-files.txt && git status --short --untracked-files=all -- pi/extensions pi/lib pi/tests .specs/skill-stats-logging >> .specs/skill-stats-logging/evidence/preflight-status.txt`
     - Pass: unrelated pre-existing changes are either absent or documented before edits.
     - Fail: pause and ask the user before touching paths with unrelated changes.

### Wave 0 -- Validation Gate

**V0: Validate preflight** [small] -- qa-engineer
- Blocked by: P1, P2
- Checks:
  1. Evidence directory and preflight files exist.
  2. Owned-file list is populated.
  3. Any pre-existing unrelated target-path changes are documented and excluded.
- On failure: stop before implementation.

### Wave 1 (parallel)

**T1: Locate durable skill-loading and session-log extension points** [small] -- utility-mini
- Description: Find where Pi expands `/skill:<name>` and where custom/session JSONL messages are persisted. Confirm whether a durable source/hook exists outside `pi/extensions/node_modules`. Do not edit `node_modules` except for read-only inspection.
- Files: read-only inspection of `pi/`, `$HOME/.pi/agent/sessions`, `pi/extensions/node_modules/@mariozechner/pi-coding-agent` only as reference.
- Acceptance Criteria:
  1. [ ] Record path existence and candidate source files.
     - Verify: `mkdir -p .specs/skill-stats-logging/evidence; { printf 'repo pi exists: '; test -d pi && echo yes || echo no; printf 'runtime sessions exists: '; test -d "$HOME/.pi/agent/sessions" && echo yes || echo no; grep -R "_expandSkillCommand\|expandSkillCommand\|getSkills\|customType\|sendMessage" -n pi 2>/dev/null | head -120; } > .specs/skill-stats-logging/evidence/discovery.txt`
     - Pass: evidence records path existence and candidate files; missing dirs are documented, not treated as hidden success.
     - Fail: no durable non-`node_modules` hook is found and no user decision is requested before forward-logging scope changes.
  2. [ ] Identify real session JSONL shapes using a redaction-safe summarizer only.
     - Verify: create/run a summarizer that reads `$HOME/.pi/agent/sessions/**/*.jsonl` and writes only event types, JSON field paths, customType values, evidence counts, line-number/hash references, and path categories (`<pi-sessions-root>`, `<home-skill>`, `<repo-skill>`). It must not copy matched JSONL lines, raw prompts, tool output, expanded skill content, emails, tokens, or absolute home paths into `.specs/skill-stats-logging/evidence/discovery.txt`.
     - Pass: `discovery.txt` contains field/count summaries and no raw session content.
     - Fail: raw JSONL snippets are copied, or no real examples found and T5 does not mark that evidence class unsupported/limited.
  3. [ ] Decide forward-logging feasibility.
     - Verify: `discovery.txt` states one of `forward-logging-local-hook: yes` or `forward-logging-local-hook: no` and names the evidence.
     - Pass: if yes, T4 may implement; if no, `/do-it` asks the user whether to accept best-effort-only stats or stop for upstream Pi work.
     - Fail: T4 proceeds without this decision.

**T2: Design skill evidence schema and parser contract** [small] -- planner
- Description: Define structured event schema, evidence precedence, de-duplication, output tables, and redaction boundaries before implementation.
- Files: `.specs/skill-stats-logging/evidence/schema.md` only during design; implementation tasks may later copy relevant decisions into code comments if useful.
- Acceptance Criteria:
  1. [ ] Define exact structured event schema: session entries use `type: "custom"`, `customType: "skill-load"`, and `data.schemaVersion: 1`; `data` fields are `skill`, `source`, `timestamp`, optional `sessionId`/`turnId`, and optional `skillPathLabel` limited to safe labels or repo/skill-relative paths. Valid sources include `explicit_slash_command`, `prompt_skill_inventory`, `expanded_skill_block`, `historical_explicit_prompt`, `manual_read_candidate`, and `unknown`. Disallow `filePath`, `baseDir`, `description`, prompt text, expanded skill content, tool arguments, tokens, drive roots, usernames, or full private home paths.
     - Verify: inspect `.specs/skill-stats-logging/evidence/schema.md`.
     - Pass: exact discriminator, version, payload, invalid/unknown handling, and allowed/disallowed fields are explicit.
     - Fail: event payload can contain raw user content, skill content, or private absolute paths.
  2. [ ] Define precedence and de-duplication: structured event wins; then expanded `<skill name>`; then explicit `/skill:name`; manual `SKILL.md` reads are separate candidate evidence. Use `{sessionFile, turnIdOrLineNumber, skill}` as the same-turn de-dupe key when no better turn ID exists.
     - Verify: inspect `.specs/skill-stats-logging/evidence/schema.md`.
     - Pass: lower-priority same-key evidence is suppressed from usage totals, while candidate/manual reads are shown separately.
     - Fail: same skill load can be counted multiple times across evidence types.
  3. [ ] Define CLI/report behavior: `/skill-stats` defaults to `1/7/30`; `/skill-stats 60`, `/skill-stats 90`, and `/skill-stats all` add optional windows; invalid args produce a Markdown usage note without throwing. Tables include by skill, by evidence/source, and separate candidate/manual reads when present.
     - Verify: inspect `.specs/skill-stats-logging/evidence/schema.md`.
     - Pass: output contract and invalid-argument behavior are clear before coding.
     - Fail: command behavior is ambiguous.

### Wave 1 -- Validation Gate

**V1: Validate wave 1** [small] -- qa-engineer
- Blocked by: T1, T2
- Checks:
  1. `discovery.txt` contains path existence, session shape summaries, and the forward-logging feasibility decision.
  2. Schema notes define allowed payload fields, precedence, de-duplication key, and report windows.
  3. No files outside `.specs/skill-stats-logging/` were modified during research/design unless explicitly justified.
- On failure: update T1/T2 findings. If no durable hook exists, stop before Wave 2 code mutations and ask the user for a scope decision. Record either `best-effort-only-approved` or `blocked-forward-logging-upstream` in `## Execution Status` and `.specs/skill-stats-logging/evidence/forward-logging.txt` before any T3/T4 implementation work resumes.

### Wave 1.5 -- Decision Gate

**G1: Forward logging scope decision before Wave 2** [small] -- coding-light
- Blocked by: V1
- Description: Decide whether Wave 2 may proceed based on T1's `forward-logging-local-hook` result.
- Checks:
  1. Record `forward logging implemented path identified` in `.specs/skill-stats-logging/evidence/forward-logging.txt` only if an explicit-invocation capture path is identified: `pi/extensions/skill-loader.ts` instrumentation or a proven pre-expansion `input` hook, plus `pi.appendEntry("skill-load", data)`.
  2. If only `before_agent_start.systemPromptOptions.skills` is available, record `prompt-inventory-only` and stop before T4 for a user scope decision because prompt inventory is not invocation usage.
  3. Proceed to Wave 2 only when explicit-invocation logging is feasible or the user explicitly approves inventory-only/best-effort scope.
  4. Update `## Execution Status` before proceeding or stopping.
- On failure: do not start T3/T4.

### Wave 2

**T3: Implement `/skill-stats` best-effort historical scanner** [medium] -- typescript-pro
- Blocked by: G1
- Description: Add a Pi extension command, likely `pi/extensions/skill-stats.ts`, modeled on `/extension-stats` Markdown output. It should walk `$HOME/.pi/agent/sessions`, parse historical signals and structured events, aggregate rolling windows, and send a custom Markdown message with `triggerTurn: false`.
- Files: `pi/extensions/skill-stats.ts`; shared helpers only under non-autodiscovered paths such as `pi/lib/` if needed.
- Acceptance Criteria:
  1. [ ] `/skill-stats` is registered in a top-level extension module with a default factory.
     - Verify: `grep -R "export default function.*ExtensionAPI\|registerCommand(\"skill-stats\"" -n pi/extensions/skill-stats.ts`
     - Pass: file has a default extension factory and one command registration.
     - Fail: helper-only/named export module typechecks but will not auto-load.
  1b. [ ] Runtime extension-load smoke passes.
     - Verify: add/run a smoke check that imports `pi/extensions/skill-stats.ts` the same way existing extension smoke checks do, asserts the default export is callable, and verifies `registerCommand("skill-stats", ...)` is invoked without throwing.
     - Pass: smoke exits 0 and writes evidence to `.specs/skill-stats-logging/evidence/smoke.txt`.
     - Fail: typecheck passes but runtime load/registration fails.
  2. [ ] Parser uses `unknown` narrowing for JSONL/custom content and handles invalid/missing fields without crashing.
     - Verify: inspect parser and run T5 tests.
     - Pass: no parser/public helper signatures rely on `any` for untrusted JSON records.
     - Fail: malformed JSON/custom content can crash or inflate counts.
  3. [ ] Default ranking excludes `SKILL.md` reads; report shows them only as candidate/manual-read evidence.
     - Verify: run T5 fixture/smoke test.
     - Pass: manual reads do not affect default usage share/ranking.
     - Fail: incidental skill-file reads are presented as skill usage.
  4. [ ] Report output is safe Markdown.
     - Verify: fixture includes skill/source labels containing pipes, links, backticks, ANSI escapes, path separators, and long strings.
     - Pass: table cells are escaped, labels are length-capped, and session root displays as `<pi-sessions-root>` or `~/.pi/agent/sessions`, never a private absolute path.
     - Fail: output breaks Markdown or leaks private paths.

**T4: Add structured skill-load logging going forward** [medium] -- typescript-pro
- Blocked by: G1
- Description: Implement minimal durable instrumentation in repo-owned extension code. Capture explicit skill invocations from `pi/extensions/skill-loader.ts` or a proven pre-expansion `input` hook; this explicit path is required for T4 completion unless the user approves a reduced scope. Record prompt inventory from `before_agent_start` separately as `source: "prompt_skill_inventory"` only if useful, and exclude it from default usage rankings. Persist safe custom entries with `pi.appendEntry("skill-load", data)`; parser must read `entry.data` from `type: "custom"`, not `content`. Use an allowlist-only payload builder with runtime validation. Do not fake logging in `node_modules` and do not persist prompt text, expanded skill content, descriptions, raw absolute paths, or tool arguments.
- Files: `pi/extensions/skill-stats.ts` or a small companion top-level extension module with a default factory; shared helpers only under non-autodiscovered paths such as `pi/lib/` if needed.
- Acceptance Criteria:
  1. [ ] If local hook exists, future explicit skill expansions emit one structured session-log event per loaded skill using only the allowed metadata fields.
     - Verify: fixture/control command plus newest-session JSONL grep for `customType` and fields `skill`, `source`, `timestamp`.
     - Pass: event exists, is persisted, and contains no prompt/expanded content.
     - Fail: no durable event is written or payload leaks raw content.
  2. [ ] If no local hook exists, execution pauses for user decision and records status `blocked-forward-logging-upstream` or `best-effort-only-approved` in `## Execution Status`.
     - Verify: inspect `discovery.txt` and `## Execution Status`.
     - Pass: plan does not claim forward logging is complete without implementation or approval.
     - Fail: success criteria pass by documentation alone.
  3. [ ] No lasting implementation edits occur under `node_modules`.
     - Verify: `git diff --name-only | grep node_modules` returns no output.
     - Pass: no `node_modules` changes.
     - Fail: revert and choose durable source/upstream path.

### Wave 2 -- Validation Gate

**V2: Validate wave 2** [medium] -- qa-engineer
- Blocked by: T3, T4
- Checks:
  1. `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck > ../../.specs/skill-stats-logging/evidence/typecheck.txt 2>&1` exits 0, or rerun with correct relative evidence path from repo root if needed.
  2. `git diff --check` exits 0.
  3. `git diff --name-only | grep -E '(^|/)\.env|secret|credential|node_modules'` shows no forbidden changes; investigate false positives before proceeding.
  4. Cross-task integration: structured events emitted by T4 are parsed and prioritized by T3, or T4 is explicitly blocked/approved best-effort-only per user decision.
- On failure: fix, rerun affected checks, then rerun V2.

### Wave 3

**T5: Add fixtures or smoke tests for skill stats evidence** [medium] -- qa-engineer
- Blocked by: V2
- Description: Add automated verification for parser/report behavior. Prefer `pi/tests` with Vitest. Do not create top-level `pi/extensions/*.test.ts` because top-level extension files are auto-discovered.
- Files: `pi/tests/*skill-stats*` or a non-autodiscovered fixture/smoke script; fixtures may live under `pi/tests/fixtures/` or `.specs/skill-stats-logging/fixtures/` if not loaded by Pi.
- Acceptance Criteria:
  1. [ ] Test command is exact and runnable.
     - Verify: if using Vitest, `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- skill-stats > ../../.specs/skill-stats-logging/evidence/smoke.txt 2>&1`; otherwise document and run one exact package/script command with output redirected to `.specs/skill-stats-logging/evidence/smoke.txt`.
     - Pass: command exits 0 and writes `.specs/skill-stats-logging/evidence/smoke.txt`.
     - Fail: test exists only as comments or an unspecified script.
  2. [ ] Fixtures include exact expected count matrix for: structured event, `<skill name>`, `/skill:name`, candidate `SKILL.md` read, mixed-shape duplicates with shared/missing turn IDs and adjacent line numbers, duplicate structured event, malformed custom content, missing skill field, unknown source, realistic home/repo `SKILL.md` paths, and deterministic 1/7/30-day window boundaries with injected `now`.
     - Verify: inspect fixture assertions and smoke output.
     - Pass: same skill in same turn counts once in usage totals; candidate reads are separate; invalid records skip without crash.
     - Fail: tests can pass while double-counting or crashing on malformed records.
  3. [ ] At least one fixture mirrors real observed JSONL field names from T1, or `discovery.txt` documents no real examples were found and why.
     - Verify: compare T1 session shape notes with fixture records.
     - Pass: fixture shape is grounded in observed/logged Pi records or limitation is explicit.
     - Fail: tests use invented shapes with no confidence statement.

### Wave 3 -- Validation Gate

**V3: Validate wave 3** [medium] -- qa-engineer
- Blocked by: T5
- Checks:
  1. Run T5 smoke/test command and confirm output evidence.
  2. `cd pi/extensions && pnpm run typecheck > ../../.specs/skill-stats-logging/evidence/typecheck-rerun.txt 2>&1` exits 0.
  3. Run `make check > .specs/skill-stats-logging/evidence/make-check.txt 2>&1` from repo root unless blocked by unrelated pre-existing environment issues; if blocked, capture exact failure and classify in `## Execution Status`.
- On failure: fix, rerun T5 and V3.

## Dependency Graph

```text
Wave 0: P1 → P2 → V0
Wave 1: T1, T2 (parallel after V0) → V1 → G1
Wave 2: T3, T4 (parallel after G1) → V2
Wave 3: T5 → V3
Final: V3 → F1 → F2 → F3 → F4 → F5 → F6
```

## Success Criteria

1. [ ] `/skill-stats` exists, auto-loads as a Pi extension, and produces a Markdown report from session logs/fixtures.
   - Verify: invoke `/skill-stats` in Pi or run the parser/report smoke test if non-interactive invocation is unavailable.
   - Pass: report includes rolling windows, skill rows, evidence/source labels, candidate/manual reads, generated timestamp, and session path.
2. [ ] Structured skill-load logging is implemented when a durable local hook exists; otherwise completion is blocked until user approves best-effort-only scope or upstream work. If no hook exists, Wave 2 code mutations must not start until that decision is recorded.
   - Verify: inspect `discovery.txt`, implementation diff, newest-session JSONL grep or fixture/control output, and `## Execution Status`.
   - Pass: future skill loads have a durable structured event path, or the plan is explicitly not archived as fully complete without user-approved scope reduction.
3. [ ] Validation passes with durable evidence.
   - Verify: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`, relevant `pi/tests` command if used, and `make check`.
   - Pass: commands exit 0, or unrelated pre-existing failures are documented with evidence and task-specific validation still passes.

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Automation completeness

- Required: yes.
- `/do-it` must run all agent-runnable validation through documented commands or wrappers.
- No credentials are expected.
- Manual-only checks are optional if automated fixture/control checks prove command output and forward logging; otherwise manual steps below are required.
- Every completed checklist item must update its `Evidence:` field with a path under `.specs/skill-stats-logging/evidence/`.

### Required automated validation

1. [ ] Run Pi extension validation.
   - Command: `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck > ../../.specs/skill-stats-logging/evidence/typecheck.txt 2>&1`
   - Evidence: `.specs/skill-stats-logging/evidence/typecheck.txt`
   - Pass: exits 0.
   - Fail: fix TypeScript errors and rerun.

2. [ ] Run skill-stats parser/report tests or smoke command.
   - Command: if using `pi/tests`, `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- skill-stats > ../../.specs/skill-stats-logging/evidence/smoke.txt 2>&1`; otherwise the exact command added by T5 with output redirected to `.specs/skill-stats-logging/evidence/smoke.txt`.
   - Evidence: `.specs/skill-stats-logging/evidence/smoke.txt`
   - Pass: expected fixture matrix passes.
   - Fail: fix parser/tests and rerun.

3. [ ] Run repo-wide validation.
   - Command: `make check > .specs/skill-stats-logging/evidence/make-check.txt 2>&1`
   - Evidence: `.specs/skill-stats-logging/evidence/make-check.txt`
   - Pass: exits 0, or unrelated pre-existing environment failure is captured and classified.
   - Fail: do not archive; update `## Execution Status`.

4. [ ] Confirm forward logging scope decision.
   - Command: inspect `discovery.txt`, user response if any, `G1` evidence, and `## Execution Status`.
   - Evidence: `.specs/skill-stats-logging/evidence/forward-logging.txt` and `## Execution Status`
   - Pass: one of `forward logging implemented`, `best-effort-only-approved`, or `blocked-forward-logging-upstream` is explicitly recorded.
   - Fail: do not archive.

5. [ ] Run content redaction scan.
   - Command: `REPO_ROOT=$(git rev-parse --show-toplevel); { grep -RInE "(BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY|sk-[A-Za-z0-9_-]{20,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}|/Users/|/home/|C:/Users/|<skill name=|\"text\"[[:space:]]*:|\"toolName\"[[:space:]]*:)" "$REPO_ROOT/.specs/skill-stats-logging/evidence" "$REPO_ROOT/pi/extensions" "$REPO_ROOT/pi/lib" "$REPO_ROOT/pi/tests" 2>/dev/null || true; } > "$REPO_ROOT/.specs/skill-stats-logging/evidence/redaction-scan.txt"`
   - Evidence: `.specs/skill-stats-logging/evidence/redaction-scan.txt`
   - Pass: file exists; no unredacted sensitive matches remain, or each match is documented as a false positive in `## Execution Status`.
   - Fail: redact before archive.

6. [ ] Run archive preflight.
   - Command: `git status --short --untracked-files=all > .specs/skill-stats-logging/evidence/archive-status.txt && git diff --name-only > .specs/skill-stats-logging/evidence/archive-files.txt`
   - Pass: tracked and untracked changed files match the owned-file manifest or allowed generated evidence/review artifacts, no `.env`/secret-like files changed, no `node_modules` implementation changes, unrelated modifications are documented/excluded, and newline-only unrelated diffs such as `pi/settings.json` are reverted or classified.
   - Fail: do not archive.

### Manual validation

- Required: no if automated fixture/control checks prove both report output and forward logging or approved best-effort-only status; otherwise yes.
- Steps when required:
  1. Start a disposable/new Pi session.
  2. Run `/skill:docs test skill logging` or another harmless known skill invocation.
  3. Run `/skill-stats 1`.
  4. Copy only redacted report excerpts and a redacted newest-session JSONL grep showing `customType`, `skill`, `source`, and `timestamp` into `.specs/skill-stats-logging/evidence/manual.txt`.
- Expected success signal: `/skill-stats` displays Markdown without an LLM turn; structured event exists if forward logging was implemented; validation/test events are labeled or excluded from normal usage summaries.

If manual validation is required and not confirmed passed, `/do-it` must classify the result as `implemented-awaiting-manual-validation`, update `## Execution Status`, and must not archive the plan.

### Deployment validation

- Required: no.
- Procedure: None. This is a local dotfiles/Pi extension change; normal Pi reload/install may be done separately by the user.

### Final gate execution details

- F1 Task-specific verification complete: pass after every acceptance criterion in P1/P2/V0/T1/T2/V1/G1/T3/T4/V2/T5/V3 has passing evidence paths recorded in the checklist.
- F2 Repo-wide validation complete: pass after Required automated validation item 3 is run and either exits 0 or is classified unrelated/pre-existing with evidence.
- F3 Manual validation complete or not required: pass after Manual validation says not required due automated proof, or after `.specs/skill-stats-logging/evidence/manual.txt` captures redacted manual evidence.
- F4 Deployment validation complete or not required: pass because deployment is not required for this local extension change; record `not required` in checklist evidence.
- F5 Content redaction scan complete: pass after Required automated validation item 5 produces `redaction-scan.txt` and any matches are redacted or documented false positives.
- F6 Archive preflight complete: pass after Required automated validation item 6 confirms changed tracked/untracked files are allowed and no forbidden paths remain.

### Archive rule

`/do-it` may archive this plan only after required automated validation, task-specific verification, manual validation when required, deployment validation when required, archive preflight, and repo-wide validation pass. Do not archive if forward logging was requested but no durable local hook exists unless the user explicitly approves `best-effort-only` scope.

## Execution Status

- Current status: complete.
- 2026-05-07 research update: parallel web/docs/local API research corrected the initial narrow grep result. Durable custom session persistence is feasible without editing `node_modules`; review-3 clarified that `before_agent_start` should be treated as prompt skill inventory, not proof of explicit skill invocation. T4 must therefore instrument `pi/extensions/skill-loader.ts` or a proven pre-expansion `input` hook for explicit usage logging. Evidence: `.specs/skill-stats-logging/evidence/research-pi-hooks.md`, `.specs/skill-stats-logging/evidence/research-local-api.md`, `.specs/skill-stats-logging/evidence/research-analogues.md`, `.specs/skill-stats-logging/evidence/research-synthesis.md`, `.specs/skill-stats-logging/review-3/synthesis.md`.
- Next gate: validate `discovery.txt` and `forward-logging.txt`, then proceed to Wave 2 implementation with review-3 amendments below.

### Review 3 Applied Amendments

These amendments are part of the executable plan and override older conflicting wording:

1. Canonical structured forward-log entries are Pi custom entries: `type: "custom"`, `customType: "skill-load"`, payload under `data`, not `content`. Use one discriminator only: `skill-load`.
2. `before_agent_start.systemPromptOptions.skills` is prompt skill inventory, not proof of explicit usage. Default usage rankings must exclude `source: "prompt_skill_inventory"` unless correlated with an explicit invocation.
3. Explicit skill invocations must be instrumented in the repo-owned skill command path (`pi/extensions/skill-loader.ts`) or a proven pre-expansion `input` hook.
4. Forward logging must use an allowlist-only mapper and runtime validation; never spread raw `Skill` objects or persist `filePath`, `baseDir`, `description`, prompt text, expanded content, tool args, tokens, or private paths.
5. Parser/report code must use sanitized internal evidence objects only; raw JSONL lines, prompts, tool output, expanded skill content, and private paths must not be retained in diagnostics, report rows, thrown errors, snapshots, or evidence files.
6. Parser diagnostics must include skipped malformed JSON, invalid skill-load payloads, invalid/missing timestamps, unknown shapes, unreadable files, and skipped future/out-of-window events.
7. Window semantics: count events with `timestamp >= now - windowDays` and `timestamp <= now`; parse ISO timestamps with offsets to UTC; invalid or future timestamps are skipped with diagnostics unless specifically reported separately.
8. Traversal semantics: stream files; do not follow symlink cycles; tolerate partial trailing lines; count unreadable files as diagnostics; do not load all session logs into memory.
9. CLI grammar: `/skill-stats` defaults to `1/7/30`; accepted extra arguments are integer day windows `1..365` and case-insensitive `all`; duplicates are de-duplicated; windows sort ascending with `all` last; zero, negative, decimal, excessive, and mixed invalid args produce a Markdown usage note without throwing.
10. Table sorting must be deterministic: descending count, then most recent timestamp, then normalized label ascending.
11. Preflight evidence is immutable after first capture; retries write `preflight-status-current.txt`. Owned-file manifest must use exact `path<TAB>action<TAB>pre_status<TAB>pre_hash_or_dash` entries and must be updated before editing newly discovered files.
12. Archive preflight must create a complete changed-file list from tracked, staged, and untracked files and compare it against the exact manifest. Read-only `node_modules` inspection requires final ignored-status/metadata evidence showing no local mutations.
13. Redaction scan matches require `redaction-classification.md`; real tainted evidence must be deleted/regenerated immediately, without waiting for rollback approval.
14. Manual validation is required only if automated control/smoke cannot prove both report output and current-session disk persistence of `appendEntry("skill-load", data)`.
- Allowed statuses during `/do-it`:
  - `not-started`
  - `in-progress`
  - `blocked-forward-logging-upstream`
  - `best-effort-only-awaiting-user-approval`
  - `best-effort-only-approved`
  - `implemented-awaiting-manual-validation`
  - `implemented-validation-failed`
  - `complete`
- `/do-it` must update this section with failing commands, user scope decisions, manual validation status, and evidence paths before stopping or reporting completion.

## Handoff Notes

- `/extension-stats` at `pi/extensions/extension-stats.ts` is the closest implementation model. Reuse the Markdown report/session scanning pattern; avoid broad refactors of its legacy TUI/lint-heavy code unless necessary.
- Tests/helpers must not be top-level `pi/extensions/*.ts` files unless they are real extensions with default factories.
- Historical skill usage is approximate. The report must label best-effort signals and never imply exact counts unless from structured events.
- If durable skill expansion code is only inside installed `@mariozechner/pi-coding-agent` under `pi/extensions/node_modules`, do not patch it there. Pause for user decision or upstream patch planning.


### Completion Update 2026-05-07

- Classification: completed-and-archived.
- Implemented: /skill-stats extension, skill-loader appendEntry skill-load explicit invocation logging, parser/report tests.
- Validation passed: pi extension typecheck, pi tests skill-stats, make check, git diff --check.
- Manual validation: not required; automated tests cover report output and appendEntry integration path.
- Deployment: not required.
