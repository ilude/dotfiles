# Pi Prompt Surface Cleanup

Executable cleanup plan for `pi/AGENTS.md`, `pi/PI-INSTRUCTIONS.md`, `pi/prompts/`,
`pi/agents/`, and `pi/skills/`. Derived from a full review (2026-07-19) of all 76
files in scope, line-dated with `git log --follow`, plus the July 2026 OpenAI
GPT-5.6 prompting guidance (developers.openai.com/api/docs/guides/latest-model,
"Prompting best practices": favor leaner prompts, state each instruction once,
consolidate approval boundaries, replace brevity rules with required-content
rules).

## How to run

- Execute phases in order: 1, 2, 3. Each phase is independently shippable; stop
  after each phase, print a summary of files changed and verification output.
- Do not commit. Leave all changes uncommitted for review.
- Line numbers below are as of 2026-07-19 and shift as edits land. The quoted
  text is authoritative: locate targets with `rg -nF '<quoted text>'`, never by
  line number alone. Quotes in this plan may normalize dash characters; if an
  exact match misses, retry with a shorter distinctive substring of the quote
  before concluding the target is absent.
- Scope is `pi/` only. Never touch `claude/`, `opencode/`, `menos/`,
  `pi/skills/pi-skills/` (vendored third-party), `pi/node_modules/`, or Pi
  runtime dirs (`cache/`, `logs/`, `sessions/`, `history/`, `traces/`).
- All new text: ASCII punctuation only (no U+2014/U+2013/U+2018/U+2019/U+201C/
  U+201D), no AI-involvement mentions, sentence-case headings, no shouted
  emphasis (no `CRITICAL:`, `IMPORTANT:`, bold all-caps labels).
- Pi TypeScript validation uses pnpm, never bun: `cd pi && pnpm typecheck &&
  pnpm biome:check && pnpm test`.

## Decisions already made (do not revisit)

- `pi/skills/claude-code-workflow/` is deleted; only `multi-agent-projects.md`
  is salvaged (task 1.1).
- war-report output root is parameterized with fallback chain
  `WAR_ROOT` -> `CLAUDE_WAR_ROOT` -> `~/.claude/war` (task 1.2).
- `memory: none` becomes a valid enum value in the subagent loader (task 1.3).
- Command placement docs describe both real surfaces instead of picking one
  (task 1.4); `pi/skills/workflow/` stays where it is.
- `pi/prompts/gitlab-ticket.md` becomes stack-inferring; known target stacks
  are Angular + C# Web API and Java + WSO2 (task 1.5).
- `pi/skills/orchestration/SKILL.md` keeps its literal model IDs
  (`gpt-5.6-sol`, `gpt-5.6-luna`, `Fable`, `Opus`); `scripts/pi-run` is the
  sync source. No change.
- `pi/agents/orchestrator.md` keeps `find, ls` in its tool list; both are real
  registered tools (upstream `pi-coding-agent` declares `toolName: "find"`).
  No change.
- `pi/skills/pi-contributor-workflow/SKILL.md` label list stays as is
  (incomplete but correct). No change.
- `pi/skills/approval-aware-operations/SKILL.md` keeps its negative-framed
  evasion lists; naming specific bypass techniques is the point of a
  damage-control policy. No change beyond global mechanical fixes.
- Anti-gold-plating policy is owned by `pi/AGENTS.md` and consolidated there
  (task 3.8). Do not create a separate anti-gold-plating skill and do not
  append a new section on top of the existing KISS bullets; the existing
  scope/execution bullets are replaced, not supplemented.
  `pi/skills/development-philosophy/SKILL.md` already routes to
  `pi/AGENTS.md` and stays a pointer.
- The "Scope and execution" text in task 3.8 is approved wording (user
  supplied, merged with approval boundaries). Apply it as written; adjust
  only surrounding flow.
- A prompt-evaluation harness (representative task suite, before/after
  telemetry) is out of scope for this plan. Rollout is conservative by
  construction: phases land separately, uncommitted, reviewable, and
  revertible via git. If regressions in scope discipline appear after 3.8
  ships, build the evaluation suite then, as its own task.

---

## Phase 1: bugs and wrong-audience content

### 1.1 Delete claude-code-workflow, salvage multi-agent-projects

The skill instructs the reader to behave as Claude Code (TodoWrite, Task tool,
Opus/Sonnet/Haiku selection, `/clear`, `~/.claude/ide/*.lock`,
`/add-marketplace`) and references a tool that does not exist anywhere in the
repo (`ptc_wrapper` at `~/.claude/tools/ptc-wrapper`). None of it applies to Pi.

1. Read `pi/skills/claude-code-workflow/multi-agent-projects.md`. Create
   `pi/skills/multi-agent-projects/SKILL.md`:
   - Frontmatter: `name: multi-agent-projects`; `description: "Coordinating
     multiple concurrent agent sessions in one repo via STATUS.md and .spec/
     files. Use when splitting work across parallel agent sessions or laying
     out a multi-agent project."`
   - Body: keep only client-neutral patterns (STATUS.md conventions, `.spec/`
     directory layout, session scoping rules). Remove or neutralize every
     Claude-specific reference: TodoWrite, Task tool, model names, `/clear`,
     `~/.claude` paths, CLAUDE.md. If a passage loses its meaning without the
     Claude reference, drop the passage. Maximum 60 lines.
   - Acceptance: `rg -in 'claude|todowrite|opus|sonnet|haiku'
     pi/skills/multi-agent-projects/SKILL.md` returns nothing.
2. `rm -rf pi/skills/claude-code-workflow/` (removes SKILL.md plus
   multi-instance.md, browser-orchestration.md, marketplace-manager.md,
   ruleset-optimization.md, multi-agent-projects.md and any other sub-files).
3. `rg -rn 'claude-code-workflow' pi/ --glob '!node_modules' --glob
   '!skills/pi-skills'` and remove any dangling references found (update, do
   not delete, the file containing the reference).

### 1.2 Parameterize war-report output root

Pi currently reads/writes Claude's home directory: `pi/skills/war-report/
SKILL.md` hardcodes `~/.claude/war/` and `CLAUDE_WAR_ROOT` (lines 13, 21, 25),
and the companion script reads `CLAUDE_WAR_ROOT`.

1. Locate the script with `ls pi/skills/war-report/` (expected:
   `get-user-commits.py`). Change root resolution to, in order: `WAR_ROOT` env
   var, then `CLAUDE_WAR_ROOT` env var, then `~/.claude/war` default. The
   default keeps the existing archive readable; `WAR_ROOT` is the
   client-neutral override.
2. Update `pi/skills/war-report/SKILL.md` and `pi/prompts/war-report.md` to
   document exactly that resolution order wherever they currently name
   `~/.claude/war/` or `CLAUDE_WAR_ROOT`.
3. Acceptance: `WAR_ROOT=/tmp/war-test python pi/skills/war-report/
   get-user-commits.py --help` (or equivalent dry invocation) runs without
   error; with `WAR_ROOT` set, no path under `~/.claude` is used (verify by
   reading the resolved path in code, and a dry run writes only under the
   override).

### 1.3 Make `memory: none` a valid agent frontmatter value

`pi/agents/skill-review.md:6` sets `memory: none`, but
`pi/extensions/subagent/agents.ts` only accepts `user | project | session`
(`AgentMemory` type near line 17, `VALID_MEMORY` near line 55); invalid values
are silently dropped, so the intended no-memory hint is never transmitted.

1. In `pi/extensions/subagent/agents.ts`: add `"none"` to the `AgentMemory`
   union type and to `VALID_MEMORY`.
2. Check `pi/tests/` for tests that enumerate valid memory values
   (`rg -n 'VALID_MEMORY|"session"' pi/tests/`) and extend them to cover
   `"none"`.
3. Acceptance: `cd pi && pnpm typecheck && pnpm biome:check && pnpm test` all
   pass; `pi/agents/skill-review.md` is unchanged (its frontmatter is now
   valid).

### 1.4 Reconcile command placement docs with the code

Two real command surfaces exist and each doc describes only one, which reads as
a contradiction. `pi/extensions/workflow-commands.ts` (SKILLS_DIR constant near
line 58) reads `pi/skills/workflow/` as the body source for extension-registered
commands; `pi/prompts/*.md` are frontmatter-driven auto-discovered commands.

1. In `pi/AGENTS.md`, replace the paragraph under `## Pi Command Authoring`
   (currently beginning "Before creating, reviewing, or relocating a Pi slash
   command") with:

   > Before creating, reviewing, or relocating a Pi slash command, use the
   > `pi-command` skill. Two command surfaces exist. Prompt-only commands live
   > in `pi/prompts/<name>.md` with frontmatter (`description`,
   > `argument-hint`, `$ARGUMENTS` when needed) and are auto-discovered.
   > Workflow commands that need TypeScript-side logic or state are registered
   > in `pi/extensions/` (see `workflow-commands.ts`) with their prompt bodies
   > in `pi/skills/workflow/<name>.md`; those bodies carry no frontmatter
   > because the extension owns registration. Reusable guidance that is not a
   > command belongs in `pi/skills/<name>/SKILL.md`.

2. In `pi/skills/pi-command/SKILL.md`, replace the placement-table row whose
   first cell reads "Pi workflow slash command or prompt" with two rows:

   > `| Prompt-only slash command | pi/prompts/<name>.md (frontmatter, auto-discovered) |`
   > `| Workflow command with TS logic or state | pi/extensions/ registration + body in pi/skills/workflow/<name>.md (no frontmatter) |`

3. Acceptance: both files name both surfaces; the criterion (needs
   TypeScript-side logic or state vs pure prompt) appears in at least one of
   them.

### 1.5 Make gitlab-ticket stack-inferring

`pi/prompts/gitlab-ticket.md` hardcodes one project's stack into a shared
command, states the `--hostname` rule twice, and shouts two rules.

1. Replace the role line (currently "You are a Senior Technical Requirements
   Analyst generating a structured GitLab issue for an Angular 20 + C# Web API
   application") with:

   > You are a senior technical requirements analyst generating a structured
   > GitLab issue for the current repository. Detect the stack from repo
   > evidence before writing: `angular.json`/`package.json` (Angular
   > frontend), `*.csproj`/`*.sln` (C# Web API), `pom.xml`/`build.gradle` or
   > WSO2 artifacts (Java/WSO2 integration). Reference the detected stack; do
   > not assume one.

2. Replace the rule "Technical Design must reference the actual architecture
   (Angular components, C# controllers/services)" with:

   > Technical Design must reference the actual architecture of the target
   > repo as detected (components, controllers/services, integration
   > configs), never an assumed stack.

3. De-duplicate the `--hostname` rule: it appears once in Step 4 ("MUST use
   explicit --hostname with all glab commands") and once in the Rules section
   ("Always use --hostname with glab commands"). Keep a single occurrence, in
   the Rules section, phrased: "Use explicit `--hostname` with all glab
   commands; a repo can otherwise resolve against the wrong GitLab instance."
   Delete the other.
4. Rewrite "Do NOT ask additional clarifying questions" as "Ask at most one
   clarifying question total (Step 1); otherwise proceed with stated
   assumptions."
5. Acceptance: `rg -n 'Angular 20|MUST|Do NOT' pi/prompts/gitlab-ticket.md`
   returns nothing.

---

## Phase 2: mechanical style cleanup

All tasks in this phase are exact, local edits. Files also touched by Phase 3
still get these fixes now; Phase 3 operates on the result.

### 2.1 Unicode punctuation to ASCII

Replacement rules: U+2014 (em dash) -> " - " (collapse surrounding whitespace
to single spaces); U+2013 (en dash) -> "-" (preserve surrounding text as is);
U+2018/U+2019 -> "'"; U+201C/U+201D -> '"'.

Known occurrences (verify with the scan in Verification before and after):
`pi/skills/rust/async.md` (10), `pi/skills/rust/serde.md` (7),
`pi/skills/rust/workspace.md` (6), `pi/skills/rust/concurrency.md` (5),
`pi/skills/rust/ffi.md` (5), `pi/skills/rust/performance.md` (4),
`pi/skills/rust/web.md` (3), `pi/skills/ux-design-workflow/2-prd-to-ux.md` (5),
`pi/skills/ux-design-workflow/pipeline.md` (5),
`pi/skills/research-archive/SKILL.md` (1),
`pi/skills/analysis-workflow/adversarial.md` (3),
`pi/skills/grill-me/SKILL.md` (1 curly quote),
`pi/skills/justfile/SKILL.md` (1 curly apostrophe, "repo's"),
`pi/skills/pi-command/SKILL.md` (1 curly apostrophe, "owner's").

Apply with a small Python script (read UTF-8, apply the four rules, write
UTF-8, no BOM). Acceptance: the Verification unicode scan reports zero hits.

### 2.2 Remove leftover RFC 2119 boilerplate

A Feb 2026 cleanup removed the "keywords MUST, SHOULD ... per RFC 2119" line
from most files but missed sub-files. Delete the RFC 2119 line (and nothing
else) from: `pi/skills/csharp/core.md`, `pi/skills/go/core.md`,
`pi/skills/go/testing.md`, `pi/skills/ruby/core.md`,
`pi/skills/ruby/hanami.md`, `pi/skills/ruby/rails.md`,
`pi/skills/ruby/testing.md`, and all eight `pi/skills/rust/*.md` sub-files
(async, concurrency, core, ffi, performance, serde, web, workspace).

Acceptance: `rg -rin 'RFC 2119' pi/skills --glob '!pi-skills'` returns nothing.

### 2.3 De-shout emphatic headers

Rewrite each header/label to plain sentence case, keeping the content beneath
untouched. Locations (file:line as of 2026-07-19; locate by text):
`pi/skills/analysis-workflow/adversarial.md:28`,
`pi/skills/analysis-workflow/structured-analysis.md:257`,
`pi/skills/api-design/SKILL.md:31`, `pi/skills/database/SKILL.md:10`,
`pi/skills/development-philosophy/security-first.md:7`,
`pi/skills/docker/reference.md:16,35,54`,
`pi/skills/python/reference.md:186`,
`pi/skills/python/testing.md:5,30,128`,
`pi/skills/typescript/testing.md:13`,
`pi/skills/ux-design-workflow/aesthetics.md:13`.

Pattern: `**CRITICAL: <text>**` or `## IMPORTANT: <text>` becomes `<text>`
with normal header/bold formatting and no urgency prefix. Do not soften the
rule itself, only remove the shouting.

Allowed to remain: severity taxonomy values such as the CRITICAL/HIGH/MEDIUM/
LOW enum in `pi/agents/security-reviewer.md` (that is data, not emphasis).

Acceptance: `rg -n '(CRITICAL|IMPORTANT):' pi/skills pi/agents pi/prompts
pi/AGENTS.md pi/PI-INSTRUCTIONS.md --glob '!pi-skills'` returns only taxonomy
uses (no directive prefixes).

### 2.4 Brevity and anti-laziness line fixes

Per GPT-5.6 guidance, replace blanket brevity with required-content phrasing,
and drop bare "always do X first" imperatives.

- `pi/prompts/yt.md`: replace "Always attempt menos first; do not gate on
  `~/.claude/state/menos_status.json`." with "Attempt menos first;
  `~/.claude/state/menos_status.json` is a display hint and never gates the
  attempt."
- `pi/prompts/summarize.md`: replace "Keep it concise but complete enough to
  survive compaction or handoff." with "Keep every fact, decision, open
  question, and next step needed to resume the work; trim narration and
  repetition first."
- `pi/agents/code-reviewer.md`: delete the line "Be concise: findings report,
  not verbose analysis logs." (the fixed Output Format section already
  enforces the shape).
- `pi/agents/planner.md`: replace "Do NOT implement anything -- hand off to
  the builder" with "Produce the plan only; the builder implements."

### 2.5 Delete rules restated from AGENTS.md in agent files

`pi/AGENTS.md` loads for every Pi invocation including subagents, so these
per-agent restatements add nothing. Delete these lines (locate by quoted
text):

- `pi/agents/backend-dev.md`: "Never touch: ~/.ssh/, *.pem, *.key, .env"
- `pi/agents/frontend-dev.md`: "Never touch: ~/.ssh/, secrets, infra configs"
- `pi/agents/csharp-pro.md`: "Do not modify secrets or environment files."
- `pi/agents/devops-pro.md`: "Security-first approach (no secrets in code,
  least privilege)"
- KISS restatements: "Keep solutions simple (KISS principle)" in
  `python-pro.md`, `rust-pro.md`, `typescript-pro.md`, `devops-pro.md`
- "Only create files when necessary" in `csharp-pro.md`, `devops-pro.md`,
  `python-pro.md`, `rust-pro.md`, `typescript-pro.md`

Keep each agent's Own/Read-only scope lines; only the secrets/KISS/file-
creation restatements go.

### 2.6 reference.md duplication

- `pi/skills/docker/reference.md`, `pi/skills/python/reference.md`,
  `pi/skills/git-workflow/reference.md`, `pi/skills/terraform/reference.md`,
  `pi/skills/typescript/reference.md`: each repeats its parent SKILL.md's
  frontmatter (name + description) at the top. reference.md files are only
  reached as linked files, never activation targets. Delete the duplicated
  frontmatter block from each.
- `pi/skills/python/reference.md`: the closing "Quick Reference"/"Key rules"
  block (near line 298) restates rules already stated in the body (near lines
  158 and 186). Delete the closing restatement.
- `pi/skills/docker/reference.md`: the closing block (near line 406) restates
  the three sections above it. Delete the closing restatement.

### 2.7 Native-skill line fixes

- `pi/skills/justfile/SKILL.md` "Practical Steps" 1-6: convert numbered list
  to plain bullets (independent hygiene checks, not a sequence).
- `pi/skills/no-ai-slop/SKILL.md` "Practical Steps" 1-7: same conversion.
- `pi/skills/tui-ux/SKILL.md`:
  - Delete the sourcing disclaimer sentence(s) near lines 10-14 ("I did not
    find a clearly authoritative public GPT-5.6-specific TUI UX guide...").
    Keep the "Key takeaways to apply" bullets that follow.
  - Replace section 10 "Least astonishment" (near lines 68-71) with one line:
    "Apply POLA (see the `least-astonishment` skill) to keybindings, wording,
    and spacing."
  - Deduplicate "Checklist Before Marking Done" against "Core Principles":
    where an item appears in both (keyboard navigation, secrets not rendered,
    config not overwritten), keep the checklist entry and cut the duplicate
    principle sub-bullet, or vice versa; net reduction target 10-15 lines.
  - Rewrite "Never block typing, navigation, cancel, help, or quit on
    network/storage/provider work." as "Keep typing, navigation, cancel,
    help, and quit responsive during network/storage/provider work."
- `pi/skills/browser-tab-capture/SKILL.md`: split the four-prohibition run-on
  ("Never kill Brave to unlock files, write captures under `.pi/` or tracked
  paths, force-add `private/`, or claim session parsing is live.") into a
  short bulleted list under the existing positive statement about not
  starting/stopping Brave.

---

## Phase 3: structural compaction

Global rules for every task in this phase. CUT: tutorial explanations of
language/framework basics a senior engineer already knows; worked code
examples longer than about 15 lines demonstrating standard patterns; closing
summary blocks restating the body. KEEP: frontmatter (unchanged unless a task
says otherwise); boundary tables; anti-pattern tables; non-obvious pitfalls;
project-specific conventions; version-specific facts. Targets are ranges, not
quotas; when in doubt about one passage, keep it.

### 3.1 rust/ (10 files, 3,595 lines; target roughly -1,100 to -1,300)

Cut ownership/borrowing 101, basic builder/newtype walk-throughs, and long
standard-pattern examples across the sub-files. Keep, verbatim or near:
- `ffi.md`: the FFI safety checklist (near lines 603-611).
- `async.md`: cancellation-safety pitfalls (near 121-138) and the
  lock-across-await pitfall (near 248-263).
All crate references (Tokio, sqlx, axum, wasm-bindgen, PyO3) were verified
current; do not update versions.

### 3.2 database/ (5 files, 1,059 lines; target roughly -400 to -500)

Cut 1NF/2NF/3NF definitions, basic FK syntax, and SQL-101 material across
SKILL.md, sql.md, orm-patterns.md, sql-optimization.md, migration-patterns.md.
Keep: the complexity-theater litmus test (SKILL.md near lines 10-33, already
de-shouted by 2.3) and the anti-pattern table (SKILL.md near 206-218).

### 3.3 api-design/ (SKILL.md is current; 3 sub-files, 1,214 lines; target roughly -500 to -600)

Cut HTTP status/method tables and generic REST/GraphQL walk-throughs in
rest-patterns.md, graphql-patterns.md, auth-patterns.md. Keep: SKILL.md's
Complexity Theater framing (near 31-54) and anti-pattern examples (near
148-178). SKILL.md itself needs little beyond the 2.3 de-shout.

### 3.4 ruby/ (5 files, 1,187 lines; target roughly -400 to -500)

Cut RSpec conventions and framework walk-throughs into terse rule form. Keep
version-specific facts: Ruby 3.4 `it` block parameter, Rails 8 Solid
Queue/Cache/Cable, Hanami slices/ROM (all verified current).

### 3.5 csharp/ (3 files, 568 lines; target roughly -200)

Cut worked examples of primary constructors, minimal APIs, DI lifetimes, and
the AAA test pattern down to one-line rules.

### 3.6 ux-design-workflow/ (6 files, 1,228 lines; target roughly -400 to -500)

Cut full WCAG contrast tables, the complete React focus-trap hook, ARIA modal
walk-throughs, CSS token blocks. Keep: principles (SKILL.md near 23-32) and
the checklists; keep one-line pointers to authoritative external references
where a table was cut.

### 3.7 Language-pro agent consolidation

For `pi/agents/csharp-pro.md`, `devops-pro.md`, `python-pro.md`,
`rust-pro.md`, `typescript-pro.md`: reduce each to frontmatter, a 1-2 sentence
role statement, and the language-specific quality standards and tool
constraints (dotnet/cargo/uv/pnpm specifics). Delete the generic 5-step
Analyze/Plan/Implement/Verify/Report workflow from each (AGENTS.md philosophy
plus model defaults cover it; do not create a shared workflow doc). Target
15-20 lines per file. Phase 2.5 already removed the KISS/secrets/file-creation
restatements.

For `backend-dev.md`, `frontend-dev.md`, `qa-engineer.md`,
`security-reviewer.md`: keep the Own/Read-only scope declarations (genuinely
per-agent); no further structural change.

Acceptance: agent frontmatter still parses (Verification check); every
remaining line in the five language-pro files is language-specific or
role-specific.

### 3.8 AGENTS.md and PI-INSTRUCTIONS.md restructure

`pi/AGENTS.md` (90 lines): the "Critical Rules (Always Apply First)" section
flattens hard constraints and judgment philosophy into one shouted rule dump,
which is the shape the GPT-5.6 guidance warns against, and it has failed in
practice to stop agents from inventing unrequested limits and termination
conditions. The scope and execution rules are therefore replaced with one
consolidated policy rather than retuned bullet by bullet. The file's own
later prose sections are the target style.

1. Rename the section to `## Hard constraints` and keep in it only true
   non-negotiables, in sentence case with the reason attached where one
   exists: secrets/credential paths (`~/.ssh`, `*.pem`, `*.key`, `.env`),
   destructive git operations, no AI-involvement mentions in code or docs,
   ASCII punctuation only. Rewrite the bold all-caps labels ("**NO AI
   MENTIONS**", "**ASCII PUNCTUATION ONLY**") as plain sentences.
2. Add a `## Scope and execution` section with exactly this text:

   > Treat the user's requested outcome as the scope, subject to hard
   > constraints and repo invariants. For requests to answer, explain,
   > review, diagnose, or plan: inspect the relevant materials and report;
   > do not implement. For requests to change, build, or fix: begin in-scope
   > local work without asking for plan approval unless planning or approval
   > was requested; use a brief working plan when complexity requires it.
   >
   > Make the smallest coherent change that fully satisfies the request.
   > Preserve existing architecture, behavior, interfaces, defaults, and
   > unrelated code unless changing them is necessary for the requested
   > result. Do not add optional improvements, speculative requirements,
   > arbitrary limits, unused flexibility, or drive-by refactors. Necessary
   > root-cause and enabling work is in scope; optional adjacent improvement
   > is not.
   >
   > Stop when the requested outcome is implemented and proportionately
   > verified. Do not invent additional requirements, completion criteria,
   > or termination conditions. Limits are valid only when the user, a
   > contract, evidence, or an intentionally bounded stage requires them;
   > safety controls that alter scope, completion, or liveness require an
   > explicit user decision.
   >
   > Surface a materially better alternative briefly, then do what was
   > asked; never silently broaden or substitute the requested scope.
   > Require confirmation for external writes, destructive actions, and
   > material scope expansion. After a denial or hard block, re-plan instead
   > of retrying equivalent variants.

3. This section replaces the existing scope/execution bullets. Delete the
   current bullets covering KISS, minimal-touch, no "just in case" features,
   proportional planning, execute-without-unnecessary-questions,
   stop-when-satisfied, resolve-only-real-choices, and challenge-naive-
   approaches wherever they appear in the file, so each of these rules is
   stated exactly once (in the new section). Judgment bullets not covered by
   the policy (confidence calibration, deterministic-by-default, data and
   verification rules) move into or stay in `## Development Philosophy` as
   prose, merged and deduplicated.
4. Rewrite the provenance bullet ("Never use provenance to avoid requested
   work") to lead with its reason ("Provenance is irrelevant when given a
   direct instruction...").
5. `pi/PI-INSTRUCTIONS.md`: delete its restatement of re-plan-after-denial
   (the "Approval-Aware Execution" sentence duplicating AGENTS.md); keep only
   the damage-control-specific mechanics (no language or wrapper switching to
   evade confirmation prompts).
6. Leave `pi/skills/development-philosophy/SKILL.md` and
   `pi/skills/workflow/plan-it.md` unchanged, except: confirm
   development-philosophy still defers to `pi/AGENTS.md` and does not
   restate the new policy; if it restates any replaced bullet, convert that
   line to a pointer.
7. Acceptance: `rg -l 'Do not invent additional requirements' pi/AGENTS.md
   pi/PI-INSTRUCTIONS.md pi/prompts pi/agents pi/skills --glob '!pi-skills'`
   lists only pi/AGENTS.md; `rg -in 'smallest coherent' pi/AGENTS.md
   pi/PI-INSTRUCTIONS.md` returns exactly one match and `rg -in 'KISS'` on
   the same two files returns none; `rg -il 're-?plan' pi/AGENTS.md
   pi/PI-INSTRUCTIONS.md` lists only pi/AGENTS.md; AGENTS.md does not grow
   past its current 90 lines; no bold all-caps labels remain.

---

## Verification (run after each phase; all must pass at the end)

Scope for scans: `pi/AGENTS.md`, `pi/PI-INSTRUCTIONS.md`, `pi/prompts/`,
`pi/agents/`, `pi/skills/` excluding `pi/skills/pi-skills/`.

1. Unicode scan (must report zero):

   ```
   python - <<'EOF'
   import pathlib
   bad = "\u2014\u2013\u2018\u2019\u201c\u201d"
   roots = [pathlib.Path("pi/AGENTS.md"), pathlib.Path("pi/PI-INSTRUCTIONS.md")]
   for d in ("pi/prompts", "pi/agents", "pi/skills"):
       roots += [p for p in pathlib.Path(d).rglob("*.md")
                 if "pi-skills" not in p.parts]
   hits = [(str(p), i + 1) for p in roots if p.is_file()
           for i, line in enumerate(p.read_text(encoding="utf-8").splitlines())
           if any(c in line for c in bad)]
   print(hits or "clean")
   raise SystemExit(1 if hits else 0)
   EOF
   ```

2. `rg -rin 'RFC 2119' pi/skills --glob '!pi-skills'` returns nothing.
3. `rg -n '(CRITICAL|IMPORTANT):' pi/AGENTS.md pi/PI-INSTRUCTIONS.md
   pi/prompts pi/agents pi/skills --glob '!pi-skills'` returns only severity
   taxonomy values, no directive prefixes.
4. Frontmatter parse check (must print ok for every file):

   ```
   python - <<'EOF'
   import pathlib, yaml
   for p in pathlib.Path("pi/skills").rglob("SKILL.md"):
       if "pi-skills" in p.parts:
           continue
       text = p.read_text(encoding="utf-8")
       assert text.startswith("---"), p
       fm = yaml.safe_load(text.split("---")[1])
       assert fm.get("name") and fm.get("description"), p
   for p in pathlib.Path("pi/agents").glob("*.md"):
       text = p.read_text(encoding="utf-8")
       assert text.startswith("---"), p
       assert yaml.safe_load(text.split("---")[1]).get("name"), p
   print("ok")
   EOF
   ```

5. After Phase 1 only: `cd pi && pnpm typecheck && pnpm biome:check &&
   pnpm test`.
6. Referenced-path check: for every repo path named in a file you edited,
   confirm it exists (`ls`/`test -e`); fix or remove the reference if not.
7. Report per phase: files changed, lines added/removed (`git diff --stat`),
   verification outputs. Leave everything uncommitted.
