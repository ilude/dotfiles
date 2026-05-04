---
date: 2026-05-04
status: synthesis-complete
---

# Review: Pi Reload Status Indicator

## Review Panel
| Reviewer | Base Agent | Assigned Expert Persona | Why selected | Adversarial angle |
|----------|------------|-------------------------|--------------|-------------------|
| reviewer | reviewer | Completeness and automation-readiness reviewer | Mandatory standard reviewer for hidden assumptions and weak acceptance criteria | Assume a fresh `/do-it` agent will follow only the plan and archive on weak evidence |
| security-reviewer | security-reviewer | Operational safety and rollback reviewer | Mandatory standard reviewer for realistic failure modes and rollback/archive safety | Assume rollback or archive wording can cause state loss or hide incomplete validation |
| product-manager | product-manager | Scope and simplicity reviewer | Mandatory standard reviewer for overengineering and simpler alternatives | Assume the path-list detector is disproportionate unless evidence proves it is needed |
| typescript-pro | typescript-pro | Pi TypeScript extension runtime/build reviewer | Plan changes `pi/extensions/operator-status.ts` and may add helper modules | Assume implementers will scan too broadly, misuse Node APIs, or write stateful code that only typechecks |
| qa-engineer | qa-engineer | Reload-status verification realism reviewer | Plan depends on mtime, throttle, ANSI, and archive-gate checks | Assume static inspection will be mistaken for proof of behavior |
| ux-researcher | ux-researcher | Operator status affordance and visual-noise reviewer | Plan changes a user-facing terminal footer prompt | Assume users will misread stale red/pink hints or be unable to clear them |

## Standard Reviewer Findings
### reviewer
- High: acceptance criteria allow static inspection instead of executable behavioral proof for changed/unchanged reload states.
- Medium: path scope is still partly guessed and may not match what `/reload` actually reloads.
- Medium: evidence artifacts are terminal-output descriptions, not named artifacts or durable execution notes.

### security-reviewer
- High/contested: rollback wording mentions `git checkout --` and could overwrite local edits if used carelessly; the plan does require explicit approval, so this is hardening rather than a blocker.
- Medium: broad path scanning can accidentally traverse generated/local state unless the exclusion list is mandatory and verified.
- Medium: archive gates allow optional tests to be skipped with explanation, which can mask missing regression coverage.

### product-manager
- High/partly confirmed: maintaining a hand-authored reloadable path list risks false positives/negatives if not tied to actual reload semantics.
- Medium: adding a separate helper may be unnecessary for a small footer change unless tests need exportable functions.
- Low: pink/red may imply error severity for a non-error action hint.

## Additional Expert Findings
### typescript-pro
- High: plan does not require a concrete implementation strategy for glob/path expansion in Node TypeScript, creating risk of unsupported glob assumptions or broad recursive scans.
- Medium: footer render integration needs an injectable or pure helper seam; otherwise stateful mtime behavior is hard to test without running Pi.

### qa-engineer
- High: T2 AC2 explicitly permits static inspection as an alternative to a behavioral test/harness, so broken throttle/mtime logic could still pass review.
- Medium: no required test proves no reload label appears in unchanged state and appears after touching a reloadable temp file.
- Medium: throttle behavior needs an explicit clock/baseline injection or deterministic test plan.

### ux-researcher
- High: clearing expectations are ambiguous. The plan says optional `/reload`/restart visual confirmation, but does not require the indicator to clear after reload even though users will expect `[reload]` to disappear after taking the prompted action.
- Medium: red/pink semantics are not fixed; red may communicate error rather than “reload available.”
- Low: no user-facing explanation exists if `[reload]` appears due to a non-obvious file change.

## Suggested Additional Reviewers
- typescript-pro -- relevant because this is a Pi TypeScript extension change; scrutinized module boundaries, filesystem APIs, and runtime cost.
- qa-engineer -- relevant because the plan’s success depends on proving mtime/throttle/ANSI behavior without manual Pi UI judgment.
- ux-researcher -- relevant because the indicator is an operator-facing status affordance that can become noisy or misleading.

## Bugs (must fix before execution)
1. **Require behavioral verification for reload detection instead of allowing static inspection.**
   - Evidence: T2 AC2 says “otherwise static inspection must show `mtimeMs > baseline` logic,” and Success Criteria also permit “static inspection proving newer `mtimeMs` sets the suffix.” This can archive code that typechecks but does not work under real file mtimes/throttle.
   - Required fix: update the plan to require an executable temp-file/helper harness or unit test for unchanged, changed-after-baseline, and throttle-cache behavior. Static inspection may supplement but not replace behavior proof.

2. **Require baseline reset/clear behavior on `/reload` when the existing lifecycle hook is available.**
   - Evidence: Handoff Notes say “If no reliable `/reload` lifecycle hook exists… acceptable for the initial baseline to clear naturally on Pi restart.” Static verification found `pi/extensions/session-hooks.ts` uses `pi.on("session_start", async (event, ctx) => { if (event.reason === "reload") ... })`, proving a reload lifecycle signal exists in current extension code.
   - Required fix: add a task/acceptance criterion to wire the reload detector baseline reset to `session_start` with `event.reason === "reload"`, or explicitly verify that `operator-status.ts` cannot access that hook and document the fallback.

3. **Define concrete, bounded filesystem traversal rules and implementation strategy.**
   - Evidence: T2 says directory/glob traversal must avoid broad scans, but the plan does not specify how to expand globs, max roots, file extensions, or exclusion verification. The initial path list includes `.pi/agents/**/*.md` and `pi/skills/**/*.md`, which can become broad if implemented naively.
   - Required fix: specify the implementation must use explicit root directories plus extension filters, skip missing roots, exclude `node_modules`, cache/history/session/expertise/generated data, and include a verification command/check that no broad repo-wide recursive scan is introduced.

## Hardening
1. Replace rollback command wording with a non-destructive rollback note unless the user explicitly requests rollback; if kept, require `git diff -- <paths>` before any checkout.
2. Prefer pink (`\x1b[38;5;205m`) over red and state red is reserved for errors.
3. Require a small pure/exported helper seam so tests or a temp-file harness can inject baseline/current time and candidate paths.
4. Name durable evidence in execution notes, e.g. command outputs copied into `## Execution Status`, instead of vague “terminal output.”
5. Clarify whether `pi/settings.json` is actually reloadable or whether user settings like `~/.pi/agent/settings.json` should be in scope.

## Simpler Alternatives / Scope Reductions
1. Keep implementation in `operator-status.ts` unless exporting a helper is necessary for deterministic tests; avoid creating a new module just for organizational preference.
2. Start with a very small path set proven by T1 rather than the full guessed list; expand only when static evidence shows `/reload` reloads those surfaces.
3. If reset-on-reload wiring is hard, use a clearly documented “restart clears” suffix only as a temporary fallback, but do not present it as complete reload-action UX.

## Automation Readiness
- Agent-runnable operational steps: mostly clear, but must add an executable temp-file/helper verification command for reload-dirty behavior.
- Credential/auth flow clarity: no credentials required; acceptable.
- Evidence and archive gates: not sufficient yet because static inspection can satisfy core behavior and optional tests can be skipped too easily.
- Manual-only steps and justification: acceptable that visual UI confirmation is optional, but clearing semantics after `/reload` must be automated or explicitly verified impossible.

## Contested or Dismissed Findings
1. Security rollback concern was downgraded from blocker to hardening because the plan already says rollback needs explicit user approval. It still needs safer pre-check wording.
2. “Use official reload-dirty API instead” was dismissed as a blocker because no such API was found during static inspection; the plan may mention it only as future simplification.
3. Concern that any color hint is too noisy was downgraded because the user explicitly requested pink/red `[reload]`; the plan should still prefer pink and define clearing behavior.

## Verification Notes
1. Confirmed lifecycle hook availability with static inspection: `pi/extensions/session-hooks.ts` registers `pi.on("session_start", ...)` and checks `event.reason === "reload"`.
2. Confirmed current footer ownership with static inspection: `pi/extensions/operator-status.ts` defines `formatPiStatusLine`, uses `ctx.ui.setFooter`, reads `footerData.getGitBranch()`, and constructs the version label.
3. Confirmed the plan’s weak verification wording by reading `.specs/pi-reload-status/plan.md` T2 AC2 and Success Criteria sections allowing static inspection in place of behavioral checks.

## Timing Notes
| Step | Duration | Notes |
|------|----------|-------|
| Initial review panel | unknown | 6/6 reviewers succeeded; per-reviewer timing unavailable; output preview was truncated for some reviewers but usable findings were present, so no recovery was invoked |
| Recovery calls | not run | no reviewer was genuinely unusable |
| Verification | unknown | used targeted `rg` and `read` inspection of plan plus `pi/extensions/session-hooks.ts` / `operator-status.ts` |
| Synthesis | unknown | artifact path: `.specs/pi-reload-status/review-1/synthesis.md` |

## Review Artifact
Wrote full synthesis to: `.specs/pi-reload-status/review-1/synthesis.md`

## Overall Verdict
**Fix bugs first**

## Recommended Next Step
- apply the 3 must-fix plan changes before `/do-it`
- then execute via `/do-it .specs/pi-reload-status/plan.md`
