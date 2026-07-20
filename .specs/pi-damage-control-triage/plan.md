# Pi Damage Control: Scoped-Delete Allow Tier plus Shadow Judge

Cut interactive damage-control prompt volume by deterministically allowing
deletes that are provably contained, and stand up a shadow-mode LLM judge
that accumulates agreement data on the residual ambiguous prompts without
having any authority.

The whole system in one sentence: if every delete target resolves inside the
session cwd or scratch space, code allows it without asking; everything else
still prompts, and a context-blind judge silently records what it would have
decided so real data can later prove whether it deserves authority.

## Motivating data (measured 2026-07-19, not hypothetical)

Source: `~/.pi/agent/operator/damage-control/events.jsonl`, cross-referenced
against `~/.pi/agent/sessions/**` to separate prompts actually shown from
headless auto-denies. Findings:

- Real interactive approval rate is 84.2% (654 approved / 123 denied).
  The raw log said 52% because headless auto-denies and test-suite
  pollution were counted as user denials. Both problems are fixed: eval
  events now record `hasUI`, and `pi/tests/setup.ts` redirects
  `PI_OPERATOR_DIR` during test runs (uncommitted changes in the working
  tree; this plan builds on them).
- rm-family prompts dominate residual volume (~320 interactive prompts over
  7 weeks). Classified by target containment:
  - all targets cwd-relative: 182 approved / 11 denied (94%). Most of the
    11 denials were workflow steering ("not that way"), not danger; one
    real catch was `rm -rf '.pi/'`.
  - targets outside cwd (mostly /tmp): 23 approved / 6 denied; the denials
    were also mostly workflow steering.
  - a large "unparsed" class is rm matched incidentally inside ssh
    payloads, docker-run scripts, and interpreter one-liners: deletes on a
    remote host or inside a container, gated against the wrong filesystem.
- Rules with near-100% approval and n >= 10 were already downgraded via the
  `pi_allow` key in `claude/hooks/damage-control/patterns.yaml`
  (kubectl exec, helm upgrade, python -c destructive). This plan addresses
  what that mechanism cannot: rules that are sometimes legitimately denied.

## How to run

- Work in `~/.dotfiles/pi/`. Do not commit; leave changes uncommitted for
  review. ASCII punctuation only in all new text. No AI-involvement
  mentions in code, comments, or docs.
- Validation: `cd pi && pnpm typecheck && pnpm biome:check && pnpm test`.
  Damage-control changes follow red-green-refactor per
  `claude/hooks/damage-control/CLAUDE.md`: run the new test, confirm it
  fails, implement, confirm it passes, then run the full suite.
- Reference implementations to read before writing code (canonical
  patterns, do not invent parallel mechanisms):
  - `pi/extensions/damage-control-engine.ts`: `evaluateDangerousCommand`,
    `extractBashDeleteTargets`, `extractPwshDeleteTargets`, heredoc
    masking, AST analysis config, `checkNoDeletePaths`.
  - `pi/extensions/damage-control.ts`: tool_call wiring, ask/deny flow,
    `safeRecordDamageControlEval`, `recordBlock`, `/damage-control`
    command registration.
  - `pi/lib/damage-control-eval.ts`: eval event schema (note the `hasUI`
    field), label mechanism, summarize.
  - `pi/extensions/damage-control-rules.ts`: `normalizeClaudePolicy`,
    `pi_allow` handling.
  - `scripts/pi-run`: how headless Luna invocations work today.
- Discovery step, do first: check the `@earendil-works/pi-coding-agent`
  type declarations for a model-completion API available to extensions.
  If one exists, the shadow judge uses it; if not, it shells out to
  `pi -p --model openai-codex/gpt-5.6-luna --no-session`. Record which
  path was taken in the final report.

## Decisions already made (do not revisit)

- Deterministic tier ships first and carries the volume. The judge is
  shadow-only in this plan; giving it authority is a separate future
  decision gated on the agreement data this plan starts collecting.
- The judge is context-blind: it sees the command text, cwd, matched rule,
  and rule reason. Never conversation content, never file contents. This
  is an injection-surface decision, not a cost decision.
- Fail closed everywhere: unparseable commands, extraction failures, judge
  timeouts, and judge errors all fall through to the existing ask flow.
- Secret and exfil rules are out of scope for both tiers. The .env read
  rule stays interactive at 96.9% approval by explicit choice: the cost of
  the 3% case is asymmetric. Do not add allow paths for zero-access,
  secret-read, or exfil patterns.
- ssh-remote deletes keep asking (remote hosts are where the blast radius
  is). Container-internal deletes are allowed (contained filesystem).
- Tier 1 must pass replay validation against the historical eval log
  before it is wired into the live flow. The acceptance gate is zero
  would-allows on historically denied events whose denial was
  danger-shaped (the danger/steering call is made per event during replay
  review and recorded in the report).
- Telemetry is first-class: every tier-1 auto-allow writes an eval event
  so `/dc stats` shows impact and regret is auditable.

## Design

### Tier 1: scoped-delete allow

New engine function `evaluateScopedDelete(command, cwd, rules)` consulted
from `evaluateDangerousCommand` only when the matched rule is in the
delete class and its action is ask. Delete-class rules are named by an
explicit list of pattern strings (the two rm patterns and bare rm), not
inferred. Result is one of `allow | ask`, never block.

Allow requires all of:

- Target extraction succeeds via the existing extractors plus AST path;
  zero targets or parse failure means ask.
- Every target, after canonicalization against cwd, resolves inside cwd or
  inside a scratch root. Scratch roots: `/tmp/`, `os.tmpdir()`, `$TMPDIR`
  when set. Windows equivalents come from `os.tmpdir()`.
- No target contains `..` segments, `~`, a drive-letter or `/` absolute
  prefix (outside scratch roots), command substitution, or an environment
  variable reference that cannot be resolved statically.
- No target matches `no_delete_paths` or would delete cwd itself, `.git`,
  or `.pi` (the `.pi` catch is the one real historical denial; hardcode
  these three as floor protections independent of config).
- The command segment containing the rm is not inside an ssh payload.
  Detection: the rm match sits inside the quoted argument of `ssh`/`scp`.
  Inside `docker ... run/exec` payloads the delete is allowed (container
  filesystem), provided the docker command itself matches no other rule.

Known accepted risk, document in code: symlinks inside the repo pointing
outside are not chased; glob targets are validated by prefix only (a
relative glob stays under cwd by construction).

Auto-allows are recorded via a new eval decisionType `auto_allowed` with
`rule` set to the original matched rule and a `tier: "scoped_delete"`
metadata field. `summarizeDamageControlEval` and `/dc stats` gain the new
type. Schema stays version 1; the field is additive.

### Tier 2: shadow judge

New lib `pi/lib/damage-control-judge.ts` plus wiring in the ask path of
`damage-control.ts`. When an ask prompt fires (interactive only,
`hasUI === true`), fire-and-forget a judge evaluation in parallel with the
user prompt; never delay or block the confirm dialog.

- Input: command text, cwd, matched rule pattern, rule reason. Fixed
  system prompt asking for a single-token verdict `allow` or `ask` plus a
  one-line reason. Temperature 0 equivalent settings where available.
- Timeout 20s; on timeout or error record verdict `error`.
- Output: append-only `~/.pi/agent/operator/damage-control/judge.jsonl`
  keyed by the eval event id (separate file avoids rewrite races with the
  label mechanism). Fields: eventId, verdict, reason, model, latencyMs,
  recordedAt.
- Reporting: `/dc judge` subcommand prints agreement stats: verdict vs
  actual user decision, split by rule; headline numbers are agreement on
  approvals and the count of judge-allow on user-denied events (the number
  that must be zero before any future arming discussion).
- Config: `damageControl.judge.enabled` setting, default false. When
  disabled, no subprocess spawns, no latency, no cost.
- The judge never influences the decision in this plan. There is no code
  path from verdict to allow.

### Explicitly rejected for this plan

- Judge authority (arming): needs the shadow data first. The future gate,
  recorded here so it is not re-litigated: >= 100 shadow events, >= 95%
  agreement on approvals, zero judge-allows on danger-shaped denials.
- Context-full judge (seeing conversation intent): would catch workflow
  steering denials but reopens the injection surface; rejected.
- Session-scoped "remember this approval" memory: plausible future tier
  but changes UX semantics; out of scope.
- Auto-allowing small-n 100% rules (terraform -auto-approve, git restore,
  git branch -D, crontab): the now-clean hasUI data will justify or refute
  these; one-line pi_allow changes when the volume arrives.

## Tasks

### Phase 0: discovery

- Read the reference files listed above. Enumerate the extension model API
  (or confirm subprocess fallback for the judge). Confirm where
  `evaluateDangerousCommand` knows which rule matched, so the delete-class
  check can key off the pattern string.

### Phase 1: scoped-delete engine logic (TDD)

- Unit tests first in `pi/tests/damage-control-scoped-delete.test.ts`:
  containment matrix (relative ok, `..` ask, `~` ask, absolute ask,
  /tmp allow, drive-letter ask, glob-relative allow, cwd/.git/.pi floor
  protections ask, no_delete_paths ask, unparseable ask, ssh payload ask,
  docker payload allow, multi-target mixed ask).
- Implement `evaluateScopedDelete` in `damage-control-engine.ts`. Wire
  into `evaluateDangerousCommand` behind the delete-class pattern list.
- Full damage-control test files green.

### Phase 2: replay validation gate

- Build `pi/scripts/damage-control-replay.mjs`: reads the historical eval
  log, filters rm-family interactive events, runs each redactedAction plus
  recorded cwd through the new decision path, and prints a table:
  historical decision vs new outcome, with per-event lines for every
  denied event the new code would auto-allow.
- Known limitation to note in output: redaction may have altered some
  command text; such events are reported as unparseable, which fails safe.
- Gate: review the would-allow-on-denied list; each entry must be
  classifiable as workflow steering, and `rm -rf '.pi/'` (or any similar
  protected-floor delete) must show as ask. If a danger-shaped denial
  would be auto-allowed, tighten the rules and rerun before Phase 3.
- Keep the script; it is the regression harness for future rule changes.

### Phase 3: live wiring and telemetry

- Wire tier 1 into `damage-control.ts` bash and pwsh handlers. pwsh scope:
  same containment logic over `extractPwshDeleteTargets`; if the extractor
  proves too weak for pwsh syntax, ship bash-only and record that in the
  report rather than weakening the containment rules.
- Add `auto_allowed` decisionType to the eval lib, summarize, and
  `/dc stats` output. Eval events carry `hasUI` as shipped.
- Extension-level tests: an in-cwd rm flows through with no confirm call
  and an `auto_allowed` event; an out-of-cwd rm still prompts.

### Phase 4: shadow judge

- `pi/lib/damage-control-judge.ts` with tests (prompt construction,
  verdict parsing, timeout handling, jsonl append; subprocess or API call
  mocked).
- Ask-path wiring behind `damageControl.judge.enabled`, fire-and-forget,
  interactive prompts only.
- `/dc judge` report subcommand with tests over synthetic judge/eval data.

### Phase 5: docs

- Update `claude/hooks/damage-control/CLAUDE.md` patterns notes and
  `pi/README.md` damage-control section: pi_allow key, scoped-delete tier,
  judge shadow mode and its arming gate.

## Verification

- `cd pi && pnpm typecheck && pnpm biome:check && pnpm test` all green.
- Replay report shows: prompt-volume reduction estimate on historical data
  (expect roughly 180-200 of ~250 rm prompts auto-allowed) and zero
  danger-shaped denials auto-allowed.
- Manual smoke in a live Pi session: `rm -rf node_modules/foo` inside a
  repo runs without a prompt and appears in `/dc recent` as auto_allowed;
  `rm -rf ~/x` still prompts; `.env` read still prompts.
- With `damageControl.judge.enabled` true, an ask prompt produces a
  judge.jsonl row and `/dc judge` renders agreement; with it false, no
  subprocess is spawned.
