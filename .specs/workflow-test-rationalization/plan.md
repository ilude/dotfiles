---
created: 2026-07-16
status: draft
completed:
---

# Plan: Workflow, test, and instruction rationalization

## Context & Motivation

The repository has accumulated three related forms of friction:

1. Tests often read tracked prompts, instructions, shell files, or source code and
   assert literal strings instead of exercising behavior. A reconciled inventory
   found 89 strict static-content tests and 106 tests under the broader static
   contract definition. Ten strict cases are in
   `pi/tests/workflow-prompts.test.ts`, and 62 are concentrated in
   `test/test_config_patterns.py`.
2. Workflow commands, prompts, and agent definitions frequently prescribe exact
   agent names, model identifiers, model tiers, panel sizes, team hierarchies,
   turn counts, and file-count thresholds. These values duplicate runtime
   discovery and become stale when available capabilities change.
3. `AGENTS.md`, `CLAUDE.md`, client adapters, skills, and runtime documentation
   repeat rules at multiple layers. Some rules are judgment guardrails that
   belong in concise instructions. Others describe objective mechanics that are
   repeatedly reimplemented with ad hoc shell, Node.js, or Python snippets.

The desired balance is:

- less instruction is preferred: delete or consolidate prose unless it adds
  necessary judgment, safety, escalation, ownership, or operator context that is
  neither inherited nor executable;
- instructions keep workflows aligned where judgment, ambiguity, escalation, and
  operator context matter;
- tests protect executable code behavior and user-visible regressions, not prose
  wording or incidental source shape;
- maintained deterministic programs own repeated, stable, error-prone mechanics;
- linters, type checkers, formatters, and complexity checks guard code quality;
- runtime discovery chooses from available agents, models, providers, and tools;
- model judgment remains responsible for synthesis, prioritization, ambiguous
  classification, and product trade-offs;
- optimization is measured in execution time first, context/token load second;
- cleanup must not remove protection for behavior already delivered;
- the existing workflow-friction system should use session interactions and the
  exact active instruction/skill context to detect overspecific, duplicated,
  contradictory, stale, or harmful instruction combinations and feed supported
  removal/refactoring candidates into the existing `/improve` decision flow.

Verified quality-tool state:

- Ruff, ShellCheck, TypeScript, and Vitest are repository-owned validation tools.
- shfmt is installed and used for mutation, but has no non-mutating CI check.
- Lizard is configured for edit-time quality hooks but is absent from Make and CI.
- Biome is locally available but is not pinned, configured, or invoked by the Pi
  package or CI. It cannot be treated as a repository dependency until added.
- The current full Pi suite was interrupted during this planning session; focused
  workflow prompt/dispatch tests and Pi typecheck passed before planning began.

## Constraints

- Platform: cross-platform dotfiles repository supporting Linux, macOS, Windows,
  Git Bash/MSYS2, and WSL.
- Shell: Git Bash for repository commands; PowerShell only for Windows-native
  behavior.
- Pi package management remains pnpm-only. Root Python tooling remains uv-based.
- Preserve all unrelated staged, unstaged, and untracked work. The worktree is
  currently busy; every implementation wave must capture and compare exact paths.
- Do not perform a mass deletion based on the 89/106 inventory counts.
- Every removed test must be classified as duplicate, wording/source theater,
  replaced behavior coverage, moved enforcement, or intentionally accepted loss.
- Tests must exercise code, parsers, state transitions, public entrypoints,
  failure recovery, or normalized configuration meaning. Tests may inspect text
  only when text is parsed at runtime or the exact token is itself an external
  protocol.
- Instructions may state judgment, risk, escalation, ownership, and workflow
  intent. They must not duplicate discoverable runtime inventories or pretend
  that model/provider/agent snapshots are stable.
- Instruction minimization is the default. Adding or retaining a rule requires
  evidence that it is not inherited, not already enforced, and not safely
  discoverable at runtime. Length alone is not evidence of harm.
- Do not build a universal policy engine. Promote only mechanics that are repeated,
  objective, stable, and demonstrably cheaper through one maintained program.
- Reuse existing validation infrastructure before creating a new tool. In
  particular, evaluate the shared quality-validation configuration and runner
  before adding another changed-file dispatcher.
- Behavior replacement precedes deletion. A replacement must fail against an
  intentional regression fixture before the old check is removed.
- One distinct contract gets one owning check. Remove weaker duplicate checks
  after the stronger owner passes.
- Preserve public command names, argument shapes, status enums consumed by code,
  task/dependency IDs, safety gates, approval boundaries, and exact user entrypoints.
- Do not preserve prompt wording, reviewer counts, model names, or agent names
  unless a runtime consumer parses them.
- Use bounded workflow-friction interaction evidence, including corrections,
  churn, repeated workarounds, and active instruction/skill metadata, when
  deciding whether instructions interact badly. Do not persist raw private
  transcripts or full instruction bodies as detector metadata.
- Deterministic friction signals identify candidates only. Final harmful-
  interaction classification and instruction edits remain evidence-backed
  judgment, and persistence continues through the existing `/improve` decision
  boundary.
- Keep deterministic quality checks fast enough for routine use. Measure before
  and after; do not substitute a slower generalized framework for many cheap but
  redundant checks without evidence.
- Update the root `CHANGELOG.md` for every implementation wave that changes tests,
  instructions, skills, commands, or runtime workflows.
- Use LF line endings and ASCII punctuation in tracked files.
- Do not commit or push unless separately requested.

## Risk & Manual Gate Decision

- **Risk level:** high
- **Blast radius:** personal-local-repo
- **Rollback:** known per wave through target-scoped diffs and preserved baseline
  evidence
- **Manual approval before action:** not required
- **Manual validation after action:** not required
- **Decision reason:** Changes are local and reversible, but broad test and
  instruction deletion can silently remove safeguards. Staged contract mapping,
  intentional failure fixtures, exact-entrypoint tests, per-wave validation, and
  timing evidence provide the required gate without a subjective approval step.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Delete all static-content tests | Fastest line-count reduction | Removes real safety and config invariants with no replacement | Rejected |
| Keep all current tests and only rewrite instructions | Lowest immediate regression risk | Leaves slow, brittle, low-signal checks and duplicate policy | Rejected |
| Convert every prose rule into a validator | Maximum apparent determinism | Creates a policy engine, more maintenance, and tests for subjective rules | Rejected |
| Rewrite all clients, agents, routing, and tests in one migration | One final architecture | Large blast radius and no reliable parity boundary | Rejected |
| Contract-first staged migration with measured tooling promotion | Preserves behavior, removes low-value checks, and proves time savings | Requires several bounded waves | **Selected** |

## Objective

Produce a lean repository workflow where:

1. remaining tests protect executable behavior, parsed schemas, normalized config
   meaning, safety boundaries, and public entrypoints;
2. prose-only and incidental source-shape tests are removed;
3. repeated validation mechanics are exposed through maintained repository tools
   instead of recreated snippets;
4. routine quality checks use pinned linters, formatters, type checking, and
   complexity checks with fast focused entrypoints;
5. workflow commands and plans express required capabilities, dependencies,
   evidence, and risk rather than fixed agents, models, panel counts, or team
   structures;
6. runtime code discovers available capabilities and fails clearly when required
   capability is unavailable;
7. instruction files have one owner per rule and retain only the minimum concise
   judgment, safety, escalation, and ownership guidance;
8. workflow-friction review correlates session corrections and churn with the
   active instruction, skill, and workflow context, then proposes supported
   removal or refactoring through the existing `/improve` flow; and
9. exact user workflows and previously delivered behavior remain protected.

## MVP Boundary

The MVP covers the highest-friction, highest-evidence surfaces:

- the 106-test static-contract inventory;
- `test/test_config_patterns.py`;
- Pi workflow prompt tests, runtime smoke tests, tool-reduction source checks,
  privacy source checks, and agent-role metadata checks;
- browser process cleanup and Git ignore/package-lock examples;
- quality-validation routing, Make targets, Ruff, ShellCheck, shfmt, TypeScript,
  Vitest, Biome, and Lizard ownership;
- Pi `/plan-it`, `/review-it`, and `/do-it` workflow prompts and templates;
- Pi agent/model routing and capability discovery boundaries;
- tracked root, Pi, Claude, OpenCode, and relevant directory instruction files;
- thin client command adapters and duplicated shared workflow policy;
- existing workflow-friction capture, review selection, candidate generation,
  `/improve` discussion/decision, active instruction context, and skill/workflow
  identity surfaces.

This scope is sufficient to establish the repository-wide decision model and
remove the largest sources of wasted validation time and prompt fragility.

## Explicit Deferrals

- Rewriting every test outside the 106-test static-contract inventory.
- Generalizing provider adapters whose behavior truly depends on provider APIs.
- Removing explicit user-selected model overrides.
- A new universal workflow DSL or general policy language.
- Automatic prose-quality scoring, ambiguity scoring, or best-practice regexes.
- A new workflow-friction command, candidate store, or automatic instruction
  mutation path. Extend the existing packet/review/candidate flow only.
- Reorganizing the `menos` submodule or its independent instruction ownership.
- Changing security-hook fail-open/fail-closed behavior without a separate
  evidence-backed security decision. This plan may align contradictory prose to
  observed behavior but must not silently change the behavior.
- Making Lizard or Biome block all historical files before changed-boundary
  compliance and baseline debt are understood.
- Token-cost targets without a reproducible local measurement source. The plan
  records prompt/instruction byte counts as a transparent proxy and labels them
  as such.

## Project Context

- **Languages:** Python, shell, PowerShell, TypeScript, Markdown, YAML
- **Current focused tests:** `uv run pytest <paths>` and
  `cd pi && pnpm test <file-filter>`
- **Current lint:** `make lint`
- **Current Pi validation:** `make check-pi-extensions`
- **Current repository validation:** `make check`
- **Current fast test target:** `make test-quick`
- **Current quality hooks:**
  `claude/hooks/quality-validation/validators.yaml` and Pi quality-gates adapter
- **Routing rule for this plan:** each task declares a required capability.
  `/do-it` discovers the current runtime and selects an available worker and model;
  it must not depend on a named agent or model from this plan.

## Automation Plan

| Operation | Command/wrapper | Credentials | Evidence |
|-----------|-----------------|-------------|----------|
| Worktree preflight | `mkdir -p .tmp/workflow-test-rationalization && git status --short --untracked-files=all > .tmp/workflow-test-rationalization/status.before && git diff > .tmp/workflow-test-rationalization/unstaged.before.patch && git diff --cached > .tmp/workflow-test-rationalization/staged.before.patch` | none | baseline status and patches |
| Baseline contract inventory | planned `scripts/validation-profile inventory` after T1; until then use tracked test collection commands | none | `.tmp/workflow-test-rationalization/contracts.before.json` |
| Baseline timing | planned `scripts/validation-profile benchmark` after T1 | none | `.tmp/workflow-test-rationalization/timing.before.json` |
| Friction/session evidence | existing workflow-friction packets, reviews, candidates, and bounded session history readers | local private state; no credentials | sanitized decision evidence under the plan directory; raw local data remains untracked |
| Focused Python validation | `uv run pytest <changed test files> -v --tb=short` | none | pytest summary |
| Focused Pi validation | `cd pi && pnpm test <changed test filters>` | none | Vitest summary |
| Fast quality gate | planned `make check-fast` | none | formatter/linter/type/complexity output and timing |
| Changed-file quality gate | planned `make check-changed` | none | applicable validator results for changed code only |
| Pi aggregate | `make check-pi-extensions` | existing local package setup | typecheck and full Pi Vitest summary |
| Repository aggregate | `make check` | none | full repository validation summary |
| Exact workflow validation | invoke each changed public command through its registered dispatch fixture and run maintained validator CLIs directly | none | focused fixture output |
| Rollback | reverse only the current wave's owned patch; restore deleted tests before removing a failed replacement | none | path-scoped diff and passing prior gate |
| Deploy | not applicable | none | none |

## Execution Checklist

Every executable task and validation gate has one item. Checked means verified
complete. Review must not mark implementation items complete.

### Wave 1

- [ ] T1: Add reusable validation inventory and timing tooling
  - Status: pending
  - Evidence: --
- [ ] T2: Classify contracts and instruction ownership
  - Status: pending
  - Evidence: --
- [ ] T18: Mine workflow-friction and session evidence
  - Status: pending
  - Evidence: --
- [ ] V1: Validate baseline evidence and decision coverage
  - Status: pending
  - Evidence: --

### Wave 2

- [ ] T3: Remove prompt-wording and redundant existence tests
  - Status: pending
  - Evidence: --
- [ ] T4: Move policy and source checks to owning code boundaries
  - Status: pending
  - Evidence: --
- [ ] V2: Validate low-risk test rationalization
  - Status: pending
  - Evidence: --

### Wave 3

- [ ] T5: Replace shell configuration source-pattern tests with behavior checks
  - Status: pending
  - Evidence: --
- [ ] T6: Consolidate config parity and repository-fact validation
  - Status: pending
  - Evidence: --
- [ ] V3: Validate shell and configuration behavior
  - Status: pending
  - Evidence: --

### Wave 4

- [ ] T7: Pin and configure code-quality tooling
  - Status: pending
  - Evidence: --
- [ ] T8: Expose one maintained changed-file validation entrypoint
  - Status: pending
  - Evidence: --
- [ ] T9: Split fast, focused, and full validation workflows
  - Status: pending
  - Evidence: --
- [ ] V4: Validate quality tooling, speed, and diagnostics
  - Status: pending
  - Evidence: --

### Wave 5

- [ ] T10: Add runtime capability-based routing contracts
  - Status: pending
  - Evidence: --
- [ ] T19: Detect harmful instruction interactions in workflow friction
  - Status: pending
  - Evidence: --
- [ ] T11: Generalize workflow prompts, templates, and agent definitions
  - Status: pending
  - Evidence: --
- [ ] T12: Replace routing and prompt wording tests with behavior tests
  - Status: pending
  - Evidence: --
- [ ] V5: Validate adaptive workflow behavior
  - Status: pending
  - Evidence: --

### Wave 6

- [ ] T13: Consolidate root and client instruction ownership
  - Status: pending
  - Evidence: --
- [ ] T14: Thin client command adapters and remove duplicated orchestration policy
  - Status: pending
  - Evidence: --
- [ ] T15: Align hook and directory-specific instructions with tested behavior
  - Status: pending
  - Evidence: --
- [ ] V6: Validate instruction discovery and client ownership
  - Status: pending
  - Evidence: --

### Wave 7

- [ ] T16: Delete superseded checks and stale policy text
  - Status: pending
  - Evidence: --
- [ ] T17: Record final behavior, timing, and context-load comparison
  - Status: pending
  - Evidence: --
- [ ] V7: Validate the complete rationalization
  - Status: pending
  - Evidence: --

### Final Gates

- [ ] F1: Every removed check has a replacement or accepted-loss rationale
  - Status: pending
  - Evidence: --
- [ ] F2: Focused and exact-entrypoint validation complete
  - Status: pending
  - Evidence: --
- [ ] F3: Pi and repository aggregate validation complete
  - Status: pending
  - Evidence: --
- [ ] F4: Timing and context-load results recorded
  - Status: pending
  - Evidence: --
- [ ] F5: Manual and deployment validation not required
  - Status: pending
  - Evidence: --
- [ ] F6: Archive preflight complete
  - Status: pending
  - Evidence: --

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Add reusable validation inventory and timing tooling | 3-5 | tooling | runtime default | capability: validation tooling | -- |
| T2 | Classify contracts and instruction ownership | evidence only | analysis | runtime default | capability: repository architecture | -- |
| T18 | Mine workflow-friction and session evidence | evidence only | analysis | runtime default | capability: interaction analysis | -- |
| V1 | Validate baseline evidence and decision coverage | -- | validation | runtime default | capability: independent validation | T1, T2, T18 |
| T3 | Remove prompt-wording and redundant existence tests | 4-8 | test cleanup | runtime default | capability: test maintenance | V1 |
| T4 | Move policy and source checks to owning code boundaries | 6-10 | behavior/schema | runtime default | capability: safety and test design | V1 |
| V2 | Validate low-risk test rationalization | -- | validation | runtime default | capability: independent validation | T3, T4 |
| T5 | Replace shell source-pattern tests with behavior checks | 5-12 | test migration | runtime default | capability: cross-platform shell testing | V2 |
| T6 | Consolidate config parity and repository-fact validation | 4-8 | tooling | runtime default | capability: config validation | V2 |
| V3 | Validate shell and configuration behavior | -- | validation | runtime default | capability: cross-platform validation | T5, T6 |
| T7 | Pin and configure code-quality tooling | 5-8 | tooling | runtime default | capability: TypeScript/Python tooling | V3 |
| T8 | Expose one changed-file validation entrypoint | 4-7 | tooling | runtime default | capability: validation runtime | T7 |
| T9 | Split fast, focused, and full validation workflows | 3-6 | workflow | runtime default | capability: developer workflow | T7, T8 |
| V4 | Validate quality tooling, speed, and diagnostics | -- | validation | runtime default | capability: performance and validation | T9 |
| T10 | Add runtime capability-based routing contracts | 5-10 | architecture | runtime default | capability: Pi runtime routing | V4 |
| T19 | Detect harmful instruction interactions in workflow friction | 5-7 | feature | runtime default | capability: workflow evidence | V4 |
| T11 | Generalize workflows, templates, and agent definitions | 10-25 | workflow | runtime default | capability: workflow design | T10, T19 |
| T12 | Replace routing and wording tests with behavior tests | 6-12 | test migration | runtime default | capability: Pi integration testing | T10, T11, T19 |
| V5 | Validate adaptive workflow behavior | -- | validation | runtime default | capability: independent Pi validation | T12, T19 |
| T13 | Consolidate root and client instruction ownership | 5-10 | documentation | runtime default | capability: instruction architecture | V5 |
| T14 | Thin client adapters and remove duplicated orchestration policy | 8-20 | workflow | runtime default | capability: cross-client workflow | T13 |
| T15 | Align hook and local instructions with tested behavior | 4-10 | safety documentation | runtime default | capability: hook safety | T13 |
| V6 | Validate instruction discovery and ownership | -- | validation | runtime default | capability: client integration validation | T14, T15 |
| T16 | Delete superseded checks and stale policy text | variable | cleanup | runtime default | capability: repository cleanup | V6 |
| T17 | Record final behavior, timing, and context-load comparison | evidence only | validation | runtime default | capability: measurement | T16 |
| V7 | Validate the complete rationalization | -- | validation | runtime default | capability: release validation | T17 |

## Execution Waves

At each validation gate, consume any workflow-friction review evidence selected
for the current wave, including correction, repeated command construction,
failures, unnecessary delegation, redundant validation, and interaction between
active instructions or skills. Do not force an extra review when no trigger exists.
Add supported findings to T2 evidence with source paths and confidence. Duration,
length, or repetition alone is not harm, and no extra review panel is allowed.

### Wave 1 (parallel)

**T1: Add reusable validation inventory and timing tooling** [runtime default] -- capability: validation tooling

- Description: Add a maintained repository program, preferably under `scripts/`,
  that replaces repeated one-off inventory and timing snippets. It must enumerate
  collected tests, classify validation commands by target, benchmark commands
  without shell-string evaluation, and emit bounded JSON under `.tmp/`. Reuse
  standard library process APIs and argument arrays. Do not parse test source to
  decide value; classification remains T2 judgment.
- Files: new `scripts/validation-profile`, focused tests under `test/`, Make help
  entry only if the program proves reusable.
- Acceptance Criteria:
  1. [ ] Inventory mode reports test IDs, files, framework, and collection errors
       from pytest and Vitest without editing source.
     - Verify: `uv run pytest test/test_validation_profile.py -v --tb=short`
     - Pass: fake and real collection fixtures produce deterministic JSON.
     - Fail: fix command invocation and parsing before using the tool as evidence.
  2. [ ] Benchmark mode records command argv, exit status, wall time, and median
       over repeated runs while preserving each command's real exit code.
     - Verify: run focused fixtures with success, failure, timeout, and paths with
       spaces.
     - Pass: JSON is bounded and no shell interpolation is used.
     - Fail: do not use benchmark output for migration decisions.

**T2: Classify contracts and instruction ownership** [runtime default] -- capability: repository architecture

- Description: Convert the planning inventory into owned execution evidence under
  `.specs/workflow-test-rationalization/evidence/`. Classify all 106 broad static
  checks as keep, delete, replace with behavior, move to parser/schema/tool, or
  accepted loss. Map all 11 tracked instruction files and workflow command
  surfaces to one owner. Record observed regression protected, actual consumer,
  replacement, and deletion dependency. This is migration evidence, not a new
  permanent policy registry.
- Files: review-owned evidence under the plan directory only.
- Acceptance Criteria:
  1. [ ] Every candidate test and instruction family has one owner and decision.
     - Verify: T1 inventory IDs joined against the decision evidence with no
       missing or duplicate IDs.
     - Pass: 106 candidates reconcile exactly and every retained instruction rule
       has one owning layer.
     - Fail: stop before deletion.
  2. [ ] Decisions distinguish code behavior from policy and judgment.
     - Verify: inspect all delete and move decisions against the owning runtime,
       parser, linter, or user entrypoint.
     - Pass: no prompt wording is labeled code behavior unless parsed at runtime.
     - Fail: reclassify before V1.

**T18: Mine workflow-friction and session evidence** [runtime default] -- capability: interaction analysis

- Description: Use the existing workflow-friction review packets, completed
  reviews, improvement candidates, bounded session history, and the current
  conversation as evidence for where instructions or skills caused correction,
  churn, repeated workarounds, unnecessary delegation, redundant validation, or
  conflicting behavior. Correlate by interaction, command, source path, and
  timing when evidence exists. Historical records that lack active instruction
  snapshots remain lower-confidence and must not be treated as causal proof.
  Store only sanitized findings and source references in plan-owned evidence;
  leave raw local packets and transcripts untracked.
- Files: plan-owned evidence only; existing local workflow-friction state is
  read-only in this task.
- Acceptance Criteria:
  1. [ ] Instruction cleanup decisions include observed interaction evidence when
       available, not only static prose criticism.
     - Verify: join T2 instruction families with friction reviews, corrections,
       repeated failure/workaround fingerprints, and current session evidence.
     - Pass: each high-priority instruction family has observed evidence or is
       explicitly labeled structural-only with lower confidence.
     - Fail: downgrade unsupported causal claims.
  2. [ ] Session evidence preserves privacy and uncertainty.
     - Verify: inspect plan-owned evidence for raw transcripts, secrets, full
       private instruction bodies, and unsupported attribution.
     - Pass: evidence is bounded, sanitized, source-linked, and confidence-labeled.
     - Fail: remove unsafe content before V1.

### Wave 1 -- Validation Gate

**V1: Validate baseline evidence and decision coverage** [runtime default] -- capability: independent validation

- Blocked by: T1, T2, T18
- Checks:
  1. Recollect tests through native pytest and Vitest commands and T1; counts agree.
  2. Capture three-run medians for `make test-quick`, `make lint`, focused Pi
     workflow tests, and `make check-pi-extensions` only when the worktree state
     permits a valid run.
  3. Record current instruction/workflow byte and line counts as a context-load
     proxy, clearly labeled as not actual token usage.
  4. Sample every decision category and verify the named consumer or lack of one.
  5. Verify high-priority instruction findings against bounded session/friction
     evidence and label static-only conclusions separately.
- On failure: fix evidence or classification; do not delete tests.

### Wave 2 (parallel)

**T3: Remove prompt-wording and redundant existence tests** [runtime default] -- capability: test maintenance

- Blocked by: V1
- Description: Remove static prompt/template heading and literal-phrase tests,
  redundant canonical-file existence checks already enforced by imports/typecheck,
  duplicate forbidden-name lists, and documentation-presence assertions with no
  runtime consumer. Keep or add tests only for command registration, argument
  transport, runtime parsing, structured schemas, and observable state changes.
- Initial targets: `pi/tests/workflow-prompts.test.ts`,
  `pi/tests/runtime-smoke.test.ts`, documentation-only checks in
  `test/test_agent_browser_brave.py`, and prompt/skill content checks identified
  by T2.
- Acceptance Criteria:
  1. [ ] No remaining test passes solely because an unparsed heading or phrase is
       present in a prompt, skill, template, README, or instruction file.
     - Verify: T1 inventory plus targeted search and manual review of candidates.
     - Pass: exact-string tests remain only for parsed protocols or security tokens.
     - Fail: classify the consumer or delete/replace the check.
  2. [ ] Public command dispatch and argument behavior remains tested.
     - Verify: `cd pi && pnpm test workflow-dispatch.test.ts workflow-commands-pure.test.ts`
     - Pass: command registration and dispatch behavior passes without prompt
       wording assertions.
     - Fail: add behavior coverage before deleting the old check.

**T4: Move policy and source checks to owning code boundaries** [runtime default] -- capability: safety and test design

- Blocked by: V1
- Description: Replace representative source/policy checks at their real boundary:
  reject unsupported agent frontmatter in the parser; test browser shutdown against
  owned PID and identity behavior; use Git for ignore classification when a check
  is needed; remove or scope lockfile policy to actual package roots; replace
  source-token process cleanup checks with failure-path behavior tests. Do not add
  a test merely because an instruction exists.
- Initial targets: `pi/tests/agent-role-semantics.test.ts`,
  `test/test_agent_browser_brave.py`, `test/test_ci_contract.py`,
  `test/test_config_patterns.py::test_zshrc_local_gitignored`, and
  `pi/tests/tool-reduction.test.ts` source assertions.
- Acceptance Criteria:
  1. [ ] Each replacement fails against an intentional behavioral regression.
     - Verify: focused parser, process, Git, and timeout fixtures.
     - Pass: replacement fails for the broken fixture and passes for current code.
     - Fail: keep the old protection until a real replacement exists.
  2. [ ] Instructions alone do not create tests.
     - Verify: review new tests for a named code entrypoint and observable result.
     - Pass: every new test invokes code or a real external boundary.
     - Fail: delete the new policy test.

### Wave 2 -- Validation Gate

**V2: Validate low-risk test rationalization** [runtime default] -- capability: independent validation

- Blocked by: T3, T4
- Checks:
  1. Run focused tests for every changed boundary.
  2. Run `make lint` and Pi typecheck.
  3. Compare T1 collection and timing with baseline; record removed tests and
     replacement behavior cases.
  4. Confirm no public workflow or safety behavior lost coverage.
- On failure: restore the removed test or fix its replacement before proceeding.

### Wave 3 (parallel)

**T5: Replace shell configuration source-pattern tests with behavior checks** [runtime default] -- capability: cross-platform shell testing

- Blocked by: V2
- Description: Rationalize the 64 declarations in
  `test/test_config_patterns.py`. Delete exact source-fragment checks that only
  preserve implementation shape. Replace valuable startup, environment, path,
  prompt, plugin, and installer contracts with shell execution or focused helper
  tests through the supported platform entrypoints. Group fixtures by behavior,
  not by individual literal. Preserve WSL/Git Bash/MSYS2 semantics and idempotency.
- Acceptance Criteria:
  1. [ ] Each retained shell test names an observable environment, output, file,
       exit status, or idempotent state transition.
     - Verify: `uv run pytest test/test_config_patterns.py test/test_shell_behavior.py test/test_installer_behavior.py -v --tb=short`
     - Pass: no retained case exists solely to match source text.
     - Fail: delete it or replace it.
  2. [ ] Platform-specific behavior is exercised on its supported CI/platform or
       an equivalent deterministic fixture, not inferred from regex presence.
     - Verify: platform matrix and focused fixtures.
     - Pass: Linux/macOS/Windows/WSL ownership is explicit.
     - Fail: retain the prior check temporarily and mark the gap.

**T6: Consolidate config parity and repository-fact validation** [runtime default] -- capability: config validation

- Blocked by: V2
- Description: Keep normalized semantic checks for WSL/main Dotbot link parity,
  CI referenced paths and executable modes, command ownership, and package-root
  facts. Reuse YAML parsers, Git, and package manifests. Remove regex parsing of
  structured configuration and duplicate checks of the same fact.
- Acceptance Criteria:
  1. [ ] Derived-config checks compare normalized meaning and emit actionable
       source/target diagnostics.
     - Verify: compliant and intentionally mismatched fixtures.
     - Pass: semantic mismatch fails regardless of formatting.
     - Fail: do not remove existing parity coverage.
  2. [ ] Repository-fact checks have one owner and do not duplicate instructions.
     - Verify: T2 ownership evidence and focused validator tests.
     - Pass: one check per fact.
     - Fail: remove the weaker duplicate.

### Wave 3 -- Validation Gate

**V3: Validate shell and configuration behavior** [runtime default] -- capability: cross-platform validation

- Blocked by: T5, T6
- Checks:
  1. Run focused shell/config suites and installer idempotency tests.
  2. Run `make test-quick` and `make test-ci-contract`.
  3. Run supported platform jobs or their exact local fixture equivalents.
  4. Compare runtime and failure-path coverage to T2 decisions.
- On failure: restore protection for the affected contract and stop the wave.

### Wave 4

**T7: Pin and configure code-quality tooling** [runtime default] -- capability: TypeScript/Python tooling

- Blocked by: V3
- Description: Make quality tools repository-owned rather than workstation
  assumptions. Add a pinned Pi-compatible Biome dependency/config only after
  verifying it works with pnpm and current TypeScript. Pin Lizard through the
  repository's uv/tooling policy or document why the existing installer remains
  authoritative. Add non-mutating shfmt validation. Keep Ruff, ShellCheck, and
  TypeScript as existing owners. Establish baseline debt before making new checks
  blocking across historical files.
- Acceptance Criteria:
  1. [ ] Fresh documented setup provides every blocking quality tool.
     - Verify: frozen pnpm/uv setup in an isolated environment.
     - Pass: no blocking tool depends on incidental global installation.
     - Fail: keep it nonblocking or remove it from the gate.
  2. [ ] Each tool checks code quality, formatting, types, or complexity, not
       prompt wording or policy prose.
     - Verify: inspect configs and intentional bad-code fixtures.
     - Pass: each tool fails its own defect class with an actionable diagnostic.
     - Fail: narrow or remove the rule.

**T8: Expose one maintained changed-file validation entrypoint** [runtime default] -- capability: validation runtime

- Blocked by: T7
- Description: Reuse the shared quality-validation configuration and runner where
  practical, and expose one repository CLI for applicable validators on explicit
  changed files. It must use argument arrays, deterministic language/config
  detection, bounded parallelism, and stable exit-code precedence. It replaces
  repeated one-off invocations, not the full test suite.
- Acceptance Criteria:
  1. [ ] One command runs the correct pinned validators for an explicit file list.
     - Verify: fixtures for Python, shell, Pi TypeScript, unsupported files,
       missing config, paths with spaces, one failure, and multiple failures.
     - Pass: deterministic routing and diagnostics match documented ownership.
     - Fail: do not wire it into Make.
  2. [ ] The CLI does not silently skip a required validator or install tools.
     - Verify: missing-tool/config fixtures.
     - Pass: explicit nonzero diagnostic or documented nonblocking classification.
     - Fail: fix before T9.

**T9: Split fast, focused, and full validation workflows** [runtime default] -- capability: developer workflow

- Blocked by: T7, T8
- Description: Define clear Make entrypoints: changed-file quality, fast static
  quality, focused tests selected by the changed boundary, and full repository
  validation. Keep `make check` authoritative but avoid invoking full suites for
  every small edit. Update help and client instructions to call the owning target
  instead of reconstructing command sequences.
- Acceptance Criteria:
  1. [ ] Each target has distinct scope, stable exit behavior, and no duplicated
       work within one invocation.
     - Verify: T1 profile output and controlled failure fixtures.
     - Pass: command graph and timing show the intended scope.
     - Fail: remove redundant subcommands.
  2. [ ] Routine changed-file and fast checks do not regress measured wall time
       beyond baseline variation without adding distinct behavior protection.
     - Verify: T1 benchmark before/after distributions.
     - Pass: at least one routine path is faster and no slowdown lacks evidence.
     - Fail: simplify the target before V4.

### Wave 4 -- Validation Gate

**V4: Validate quality tooling, speed, and diagnostics** [runtime default] -- capability: performance and validation

- Blocked by: T9
- Checks:
  1. Run changed-file and fast gates against compliant and failing fixtures.
  2. Run `make lint`, Pi typecheck, and focused tests.
  3. Verify fresh dependency setup supplies pinned tools.
  4. Compare timing distributions and command counts with V1 baseline.
- On failure: remove or narrow the slow/redundant tool before proceeding.

### Wave 5

**T10: Add runtime capability-based routing contracts** [runtime default] -- capability: Pi runtime routing

- Blocked by: V4
- Description: Define machine-readable capabilities for available agents, models,
  providers, tools, and task requirements using existing registries and metadata.
  Preserve explicit user overrides. Resolve required capabilities at runtime and
  fail clearly when none are available. Do not encode team hierarchy, panel size,
  or provider family as a universal contract.
- Acceptance Criteria:
  1. [ ] Zero, one, and multiple available capability fixtures resolve
       deterministically from current registry data.
     - Verify: focused resolver and exact launch-entrypoint tests.
     - Pass: valid capability is selected; missing capability fails explicitly;
       user override remains authoritative when valid.
     - Fail: do not generalize prompts before routing is reliable.
  2. [ ] Resolver metadata is structured and schema-validated.
     - Verify: malformed and unknown metadata fixtures.
     - Pass: invalid metadata is rejected rather than silently dropped.
     - Fail: fix parser boundary.

**T19: Detect harmful instruction interactions in workflow friction** [runtime default] -- capability: workflow evidence

- Blocked by: V4
- Description: Extend the existing workflow-friction packet and review path with
  a bounded snapshot of the instruction context active for each interaction:
  loaded context paths/layers, hashes, byte counts, truncation/skipped reasons,
  active skill identifiers, and dispatched workflow identifier when available.
  Add pure deterministic candidate signals for duplicate statements,
  contradiction candidates, stale runtime inventories, context truncation,
  cross-layer correction, repeated cross-session workaround, and instruction-
  related churn. Use user/assistant interaction history already captured by the
  friction system as evidence, but do not persist full instruction bodies,
  secrets, or raw private transcripts as detector metadata. Deterministic signals
  select and inform review; the existing reviewer adjudicates whether specificity
  was harmful, intentional, or unrelated. Reuse the existing candidate store and
  `/improve` decision flow. Do not add a command or automatic instruction edit.
- Files: `pi/lib/workflow-friction.ts`,
  `pi/extensions/agents-context.ts`,
  `pi/extensions/workflow-friction-review.ts`, optional narrow context/workflow
  identifier exposure, `pi/tests/workflow-friction.test.ts`, `pi/README.md`.
- Acceptance Criteria:
  1. [ ] Review packets identify the exact bounded instruction, skill, and
       workflow context active during an interaction.
     - Verify: packet-capture fixtures for parent/child instructions, imported and
       truncated context, active skills, skipped files, and workflow dispatch.
     - Pass: paths/layers/hashes/counts reach review input; full bodies and secrets
       do not enter persistent metadata.
     - Fail: do not enable instruction-interaction signals.
  2. [ ] Deterministic signals are candidate evidence, not automatic verdicts.
     - Verify: pure tests for duplicate, contradiction candidate, stale inventory,
       cross-layer correction, repeated workaround, intentional precedence,
       unknown inventory, and one-off correction.
     - Pass: strong observed interaction can queue review; length or duplication
       alone cannot classify harm or mutate instructions.
     - Fail: narrow the signal before integration.
  3. [ ] Supported findings enter the existing improvement workflow.
     - Verify: integration test from signal-backed review through candidate
       ranking, discussion, and explicit `/improve decide` persistence.
     - Pass: no second candidate store, command, or automatic edit path exists.
     - Fail: reuse the current flow rather than adding parallel machinery.

**T11: Generalize workflow prompts, templates, and agent definitions** [runtime default] -- capability: workflow design

- Blocked by: T10, T19
- Description: Rewrite Pi planning, execution, and review workflows to express
  outcomes, dependencies, required capabilities, risk, evidence, and validation.
  Remove fixed agent names, model names, model tiers, reviewer counts, validators
  per wave, file-count thresholds, and team hierarchies unless a real protocol
  consumes them. Agent definitions retain role intent, tools, permissions, and
  capabilities. Planning templates replace hardcoded Model/Agent assignments with
  required-capability and resolved-at-runtime fields.
- Acceptance Criteria:
  1. [ ] Workflow artifacts can be executed against different valid runtime
       inventories without prompt edits.
     - Verify: exact command fixtures with zero, minimal, and rich capability sets.
     - Pass: same workflow requirements route appropriately or fail explicitly.
     - Fail: remove the hidden fixed assumption.
  2. [ ] Instructions remain minimal judgment guardrails.
     - Verify: review each retained rule for ownership, inheritance, runtime
       discovery, deterministic enforcement, and observed friction evidence.
     - Pass: no duplicate runtime inventory or incidental wording contract; every
       retained rule is shorter than or equal to the minimum needed for its
       distinct judgment or safety purpose.
     - Fail: delete, consolidate, or move the rule.

**T12: Replace routing and prompt wording tests with behavior tests** [runtime default] -- capability: Pi integration testing

- Blocked by: T10, T11, T19
- Description: Remove exact model IDs, agent names, model ladders, panel counts,
  team names, prompt phrases, and presentation text from tests unless parsed by a
  consumer. Add behavior tests for capability satisfaction, command dispatch,
  task dependencies, safety gates, artifact mutation boundaries, and failure
  diagnostics through actual entrypoints.
- Acceptance Criteria:
  1. [ ] No Pi test protects unparsed workflow wording or a runtime inventory
       snapshot.
     - Verify: T1 inventory and focused manual inspection.
     - Pass: wording changes do not fail behavior tests.
     - Fail: delete or reclassify the assertion.
  2. [ ] Adaptive routing behavior has complete success/failure coverage.
     - Verify: focused Pi resolver, subagent, workflow dispatch, and task tests.
     - Pass: capability fixtures prove routing without hardcoded names.
     - Fail: fix runtime behavior before V5.

### Wave 5 -- Validation Gate

**V5: Validate adaptive workflow behavior** [runtime default] -- capability: independent Pi validation

- Blocked by: T12, T19
- Checks:
  1. Run focused routing, agent discovery, command dispatch, task, and workflow
     integration tests.
  2. Run changed-file quality and Pi typecheck.
  3. Invoke `/plan-it`, `/review-it`, and `/do-it` through maintained safe fixtures
     and verify their public outcomes and mutation boundaries.
  4. Run workflow-friction instruction-context, signal, false-positive, and
     `/improve` integration tests.
  5. Run `make check-pi-extensions` once after focused gates pass.
- On failure: revert only the affected workflow/resolver slice.

### Wave 6

**T13: Consolidate root and client instruction ownership** [runtime default] -- capability: instruction architecture

- Blocked by: V5
- Description: Assign each retained rule to root repository invariants, Pi,
  Claude, OpenCode, Copilot, hook, prompt-routing, or directory-local ownership.
  Remove duplicated Pi package-manager, orchestration, validation, and runtime
  inventory prose from root/client layers after owning commands and discovery are
  verified. Use T18 historical evidence and T19 signal-backed reviews to identify
  instructions whose interactions caused corrections or churn. Prefer deletion
  over rewriting, and consolidation over adding another layer. Keep only minimum
  judgment, safety rationale, rollout discipline, and ambiguity handling in prose.
- Acceptance Criteria:
  1. [ ] Every retained instruction rule has one authoritative owner and no
       contradictory child copy.
     - Verify: T2 ownership evidence and instruction discovery fixtures.
     - Pass: 11 tracked instruction files resolve as documented.
     - Fail: restore the parent/child rule until discovery is proven.
  2. [ ] Removed deterministic instructions have an owning tool or runtime source,
       but subjective rules remain concise prose.
     - Verify: rule-by-rule ownership review plus bounded friction evidence for
       high-priority instruction families.
     - Pass: no rule is moved into tooling merely because it can be expressed as
       a string check, and no new instruction duplicates inherited guidance.
     - Fail: delete/consolidate the prose or remove unnecessary tool enforcement.

**T14: Thin client command adapters and remove duplicated orchestration policy** [runtime default] -- capability: cross-client workflow

- Blocked by: T13
- Description: Make Claude, OpenCode, Copilot, and Pi command adapters contain
  only client invocation metadata and references to runtime-neutral workflow
  requirements where sharing is real. Remove copied agent/model/team inventories,
  reviewer counts, and sizing thresholds. Do not force clients with different
  runtime semantics through one implementation.
- Acceptance Criteria:
  1. [ ] Each client discovers or resolves capabilities through its supported
       runtime rather than inherited provider-specific prose.
     - Verify: client command-loading fixtures and source ownership inspection.
     - Pass: adapters contain no stale foreign runtime inventory.
     - Fail: retain the client-local difference with rationale.
  2. [ ] Public command names and arguments remain unchanged unless explicitly
       retired by the user.
     - Verify: command inventory and dispatch tests.
     - Pass: no accidental command disappearance.
     - Fail: restore adapter registration.

**T15: Align hook and directory-specific instructions with tested behavior** [runtime default] -- capability: hook safety

- Blocked by: T13
- Description: Reduce volatile version/upstream claims, duplicate vault prose, and
  hook implementation tables. Align hook instructions to observed entrypoint and
  failure behavior without changing security semantics. Preserve threat-model
  rationale, recovery procedures, and directory-local judgment rules.
- Acceptance Criteria:
  1. [ ] Hook prose matches actual malformed-input, missing-tool, crash, and
       security-decision behavior.
     - Verify: focused hook entrypoint tests.
     - Pass: no silent prose override of tested behavior.
     - Fail: stop and create a separate security decision plan.
  2. [ ] Directory-specific instructions contain only local differences.
     - Verify: instruction inheritance fixtures and T2 ownership map.
     - Pass: parent rules are not copied into children.
     - Fail: restore only the rule required for actual discovery behavior.

### Wave 6 -- Validation Gate

**V6: Validate instruction discovery and client ownership** [runtime default] -- capability: client integration validation

- Blocked by: T14, T15
- Checks:
  1. Run client instruction/command loading fixtures.
  2. Run hook focused tests without changing security behavior.
  3. Verify every tracked instruction file and client adapter against T2 ownership.
  4. Re-run exact Pi workflow fixtures after instruction reduction.
- On failure: restore the owning rule or adapter and record the discovery gap.

### Wave 7

**T16: Delete superseded checks and stale policy text** [runtime default] -- capability: repository cleanup

- Blocked by: V6
- Description: Remove old tests, helper fragments, prompt wording assertions,
  duplicate validators, stale locations, duplicated instructions, and obsolete
  comments only after their replacement/accepted-loss evidence is complete.
  Update docs and changelog per ownership family. Do not combine unrelated
  historical cleanup.
- Acceptance Criteria:
  1. [ ] Every deletion resolves to a T2 decision and passed replacement gate.
     - Verify: deletion paths joined against evidence.
     - Pass: no orphan deletion and no duplicate enforcement remains.
     - Fail: restore the path or complete its decision.

**T17: Record final behavior, timing, and context-load comparison** [runtime default] -- capability: measurement

- Blocked by: T16
- Description: Re-run T1 inventory and benchmark using the same commands,
  environment metadata, and repetitions. Record test counts, routine gate times,
  full gate times, instruction/workflow bytes, and command duplication removed.
  Label byte counts as a context proxy, not token usage. Explain any slowdown with
  the distinct behavior it protects.
- Acceptance Criteria:
  1. [ ] Before/after evidence is reproducible and directly comparable.
     - Verify: T1 tool validates both evidence files and command sets.
     - Pass: same measurement schema and environment fields.
     - Fail: rerun measurement; do not infer improvement.
  2. [ ] Routine workflow is faster or simpler without behavior regression.
     - Verify: timing, command-count, and exact-entrypoint evidence.
     - Pass: at least one frequent path improves, no unexplained slowdown remains,
       and retained tests each protect a distinct contract.
     - Fail: remove redundant work or report the plan incomplete.

### Wave 7 -- Validation Gate

**V7: Validate the complete rationalization** [runtime default] -- capability: release validation

- Blocked by: T17
- Checks:
  1. Run `make check-changed` and `make check-fast`.
  2. Run all focused replacement tests and exact workflow fixtures.
  3. Run `make check-pi-extensions`.
  4. Run `make check` once after all focused gates pass.
  5. Run `git diff --check`, inspect staged/unstaged/untracked state, and compare
     paths with preflight baseline.
  6. Audit the final test/instruction inventory for duplicate or prose-only checks.
- On failure: repair the owning wave and rerun focused checks before V7.

## Dependency Graph

```text
Wave 1: T1, T2, T18 -> V1
Wave 2: T3, T4 -> V2
Wave 3: T5, T6 -> V3
Wave 4: T7 -> T8 -> T9 -> V4
Wave 5: T10, T19 -> T11 -> T12 -> V5
Wave 6: T13 -> T14, T15 -> V6
Wave 7: T16 -> T17 -> V7
Final: V7 -> F1 -> F2 -> F3 -> F4 -> F5 -> F6
```

## Success Criteria

1. [ ] No remaining test exists solely to preserve unparsed prompt, instruction,
       README, template, or source wording.
   - Verify: final T1 inventory plus manual inspection of all static candidates.
   - Pass: every retained text inspection has a runtime parser, external protocol,
     security token, or normalized semantic contract.
2. [ ] Every removed behavior-relevant test has replacement coverage that fails
       against an intentional regression.
   - Verify: T2 decision evidence and focused failure fixtures.
   - Pass: no behavior protection is removed on assertion alone.
3. [ ] Repeated validation mechanics have one maintained repository entrypoint.
   - Verify: changed-file, fast, focused, and full validation commands.
   - Pass: workflows no longer recreate equivalent shell/Node/Python snippets.
4. [ ] Code quality is guarded by pinned repository tooling.
   - Verify: isolated setup plus Ruff, ShellCheck, non-mutating shfmt, TypeScript,
     Biome where configured, Lizard where configured, and test fixtures.
   - Pass: each blocking tool is available, scoped, and detects its defect class.
5. [ ] Workflow routing adapts to runtime capabilities without fixed inventories.
   - Verify: zero/minimal/rich capability fixtures through public commands.
   - Pass: valid runtime routes, unavailable capability fails explicitly, and
     explicit user overrides remain supported.
6. [ ] Instruction files have clear ownership and contain the minimum judgment
       and safety guidance rather than duplicated runtime facts.
   - Verify: instruction discovery fixtures, T2 ownership evidence, T18 session
     evidence, and T19 signal-backed reviews.
   - Pass: no contradictory or duplicated policy family remains, and new prose is
     added only when deletion, inheritance, discovery, or tooling is insufficient.
7. [ ] Workflow friction detects overspecific, duplicated, contradictory, stale,
       and harmful instruction interactions without auto-editing instructions.
   - Verify: workflow-friction packet, signal, selection, false-positive, and
     `/improve` decision-flow tests.
   - Pass: active instruction/skill/workflow context reaches review, session
     corrections and repeated workarounds inform judgment, and only an explicit
     improve decision persists a change.
8. [ ] Routine validation time and context load improve without unexplained
       regression.
   - Verify: T17 before/after evidence.
   - Pass: measured frequent paths improve or remove steps; any slowdown protects
       a named distinct behavior.
9. [ ] Exact user workflows and repository aggregates pass.
   - Verify: V7 commands.
   - Pass: focused entrypoints, `make check-pi-extensions`, and `make check` pass.

## Validation Contract

### Automation completeness

- Required: yes.
- All implementation and validation is local and deterministic.
- Runtime-dependent command routing uses controlled capability fixtures.
- No credentials, paid calls, external deployment, or subjective manual check is
  required.
- Replacement tests must exercise the exact entrypoint or a documented safe
  equivalent fixture.

### Required automated validation

1. [ ] Run every task acceptance command and V1-V7 gate.
   - Pass: all commands and direct evidence checks pass.
   - Fail: leave the owning checklist item unchecked and record the failing
     command, root cause, and next repair in Execution Status.
2. [ ] Run `make check-pi-extensions` after Pi-focused checks pass.
   - Pass: dependency setup, TypeScript, and full Pi Vitest pass.
   - Fail: do not proceed to repository aggregate validation.
3. [ ] Run `make check` once at final integration.
   - Pass: repository lint and tests pass with no in-scope errors or warnings.
   - Fail: do not archive.
4. [ ] Run final inventory and timing comparison.
   - Pass: every deletion is classified, every retained check has one distinct
     contract, and measurements use the same schema.
   - Fail: do not claim time or context improvement.
5. [ ] Consume triggered workflow-friction and bounded session evidence throughout
       execution.
   - Pass: when triggers exist, supported instruction/tooling interaction findings
     update T2 evidence; false positives and uncertainty remain recorded; no raw
     private transcript is copied into tracked artifacts. No-trigger waves add no
     review work.
   - Fail: do not finalize instruction consolidation or archive.

### Manual validation

- Required: no.
- Justification: Automated behavior, parser, tooling, command, and instruction
  discovery fixtures are sufficient for this local reversible migration.
- Steps:
  1. None.

### Deployment validation

- Required: no.
- Procedure: None.

### Archive rule

`/do-it` may archive only after T1-T19, V1-V7, F1-F6, all Success Criteria,
focused entrypoint checks, `make check-pi-extensions`, and `make check` pass. The
archive must include the plan and its owned decision/timing evidence. Scratch
benchmark output may be summarized into owned evidence; machine-specific raw
captures remain under `.tmp/`.

## Handoff Notes

- Discovery evidence currently lives under `.tmp/review-test-audit/` and
  `.tmp/rationalization-plan/`; the plan is standalone and does not require those
  files to execute.
- Reconciled current static-contract counts are 89 strict and 106 broad. These are
  classification inputs, not deletion targets.
- `test/test_config_patterns.py` is the largest first target, but behavior
  replacement must be cross-platform.
- The current `/review-it` rewrite and many unrelated working-tree edits predate
  this plan. Preserve them and classify them separately during preflight.
- Biome is not currently repository-pinned or configured for Pi despite local
  availability. Do not add it to commands until T7 proves fresh setup.
- Lizard is currently hook-time and installer-provided, not a Make/CI dependency.
- Use existing quality-validation infrastructure before adding a new dispatcher.
- Existing workflow-friction review already captures bounded interaction text and
  tool traces, but not the exact active instruction/skill snapshot. T19 closes
  that evidence gap without a new command or store.
- Historical friction records without instruction snapshots support correlation,
  not causal certainty.
- Less instruction is the default. Retention or addition requires a distinct,
  non-inherited judgment or safety purpose.
- Do not change security-hook failure semantics inside instruction cleanup.

## Execution Status

- **Classification:** planned, not started
- **Date:** 2026-07-16
- **Last completed wave/gate:** none
- **Next ready wave/gate:** T1, T2, and T18 in parallel
- **Completed work:** repository-wide discovery, test-count reconciliation,
  instruction-layer audit, workflow-specificity audit, quality-tool verification,
  and decision synthesis
- **Validation evidence:** static discovery only; no implementation validation
- **Blocker:** none
- **Remaining checks:** T1-T19, V1-V7, F1-F6
- **Resume command:** `/review-it .specs/workflow-test-rationalization/plan.md`
