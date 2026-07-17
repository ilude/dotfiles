> Archived 2026-07-17: superseded research that seeded the rationalization wave (phases 1-2 executed its findings; phase 2 evidence base cites these files). Content unchanged.

# Workflow, test, and instruction rationalization summary

## Purpose

This document gives an independent reviewer the conversation context behind
[`plan.md`](plan.md). It records the user's direction, the incident that exposed
the problem, verified repository evidence, likely causes, and questions the plan
must answer.

It is not an implementation specification. The plan owns executable tasks,
dependencies, validation, and rollback.

## Immediate trigger

A `/review-it` run against a workflow-refinement plan exposed the problem:

1. The review command launched a fixed six-reviewer panel.
2. It automatically applied a large set of findings to the plan.
3. Those edits were classified as material.
4. The command then attempted to launch another six-reviewer panel, with a final
   standalone-readiness reviewer still scheduled afterward.
5. The user stopped the run because the review process had become churn rather
   than useful validation.

No implementation source was changed by that review run. The reviewed plan and
review artifacts were later removed by the branch workflow. The incident still
showed that the command encoded too much fixed orchestration policy and treated
its own process as mandatory regardless of whether it remained useful.

## User direction

The following decisions are authoritative for this work.

### Flexible judgment, deterministic repetition

Workflows should remain flexible where they require judgment, interpretation,
prioritization, recovery decisions, or adaptation to the current runtime.

Repeated objective mechanics should move into maintained programs when agents
otherwise keep recreating one-off Bash, Node.js, or Python snippets. Promotion is
justified when the program:

- saves execution time first;
- reduces context and token use second;
- removes recurring syntax and quoting mistakes;
- provides one tested implementation instead of repeated ad hoc variants; and
- protects behavior already delivered.

A deterministic program is not automatically better. One-off or subjective rules
should not become a framework merely because they can be expressed in code.

### Tests protect code, not policy prose

Tests should protect executable behavior, parsed schemas, public entrypoints,
state transitions, safety boundaries, failure recovery, and normalized
configuration meaning.

Tests should not exist solely to assert that a prompt, instruction, README,
template, shell file, or source file contains particular wording or headings.
Text inspection is justified only when runtime code parses that text or when an
exact token is an external protocol.

Linters, formatters, type checking, and complexity tools should prevent low-
quality code. Running large collections of low-signal policy or wording tests
wastes time and context.

### Less instruction is preferred

Instructions should be minimized. Retain prose only when it provides necessary
judgment, safety rationale, escalation behavior, ownership, or operator context
that is not inherited, discoverable at runtime, or enforced by code.

When instruction layers overlap, prefer this order:

1. delete an unnecessary rule;
2. inherit an existing authoritative rule;
3. consolidate duplicates into one owner;
4. use runtime discovery for current capabilities;
5. use a maintained tool for repeated objective mechanics; and
6. add new instruction text only when the other options are insufficient.

Long instructions are not harmful merely because they are long. Harm must be
supported by duplication, contradiction, staleness, user correction, repeated
workaround, failed behavior, or measurable workflow friction.

### Runtime discovery over fixed inventories

Commands, prompts, plans, and agent definitions should not assume fixed agent
names, model names, providers, model tiers, panel sizes, team hierarchies, or
turn counts when those capabilities can be discovered at runtime.

Workflows should state required capabilities, dependencies, evidence, risk, and
outcomes. The runtime should choose from what is actually available and fail
clearly when a required capability is unavailable. Explicit user overrides remain
valid.

### Automatic recommended edits without review churn

The user does not want `/review-it` to ask before applying supported recommended
artifact edits. The user also does not want automatic follow-up panels merely
because the artifact changed.

A useful review should:

- choose proportional reviewers from current runtime capabilities;
- verify findings against evidence;
- apply necessary artifact fixes once;
- validate the revised artifact directly;
- defer optional hardening instead of expanding scope; and
- stop after one coherent pass unless the user explicitly requests more review.

## Verified repository evidence

### Static-content tests

A reconciled inventory found:

- 89 strict tests that read tracked prose, prompts, templates, configuration, or
  source and assert literal content or file presence without executing behavior;
- 106 tests under a broader definition that also includes static metadata,
  source-shape, ordering, and structural policy checks;
- 10 strict prompt/template tests in `pi/tests/workflow-prompts.test.ts` at the
  time of the inventory; and
- 62 strict tests concentrated in `test/test_config_patterns.py`.

These counts are classification inputs, not deletion targets. Some checks protect
real normalized configuration or safety contracts. Each candidate still needs a
keep, replace, move, delete, or accepted-loss decision.

Examples that exposed the distinction:

- A synthesis-template test checked only whether headings existed. It protected
  no runtime behavior and was immediately recognized as useless.
- A `.zshrc.local` test searched `.gitignore` text instead of asking Git whether
  the path was ignored.
- Agent metadata tests scanned files for unsupported fields instead of making the
  parser reject unknown metadata.
- Browser cleanup tests searched source for broad-kill strings instead of proving
  that shutdown targets only an owned process.
- Canonical module existence tests duplicated protection already supplied by
  imports and TypeScript validation.

### Workflow and routing specificity

The audit found fixed model, agent, panel, hierarchy, and sizing assumptions in:

- `pi/skills/workflow/plan-it.md`;
- `pi/skills/workflow/do-it.md`;
- the prior `pi/skills/workflow/review-it.md`;
- `pi/skills/workflow/templates/plan-template.md`;
- `pi/agents/*.md`;
- `pi/extensions/fable.ts` and subagent routing surfaces;
- `claude/shared/*-instructions.md`;
- OpenCode command adapters; and
- Copilot prompt metadata.

Some provider-specific implementation is legitimate. The problem is duplicated
or universal policy built from a runtime snapshot.

### Instruction layering

Eleven tracked instruction files currently participate in repository, client,
hook, Pi, prompt-routing, and directory-local behavior. The audit found:

- duplicated Pi package-manager and validation policy across root and client
  layers;
- overlapping orchestration and safety rules in root and Pi instructions;
- client ownership descriptions that do not match tracked instruction surfaces;
- volatile upstream/version facts embedded as durable instructions;
- hook error guidance that can conflict with explicit-failure repository rules;
- directory-local files repeating parent guidance; and
- deterministic implementation facts maintained manually in prose.

### Quality tooling

Verified current state:

- Ruff, ShellCheck, TypeScript, and Vitest are repository-owned and invoked.
- shfmt is available for formatting but has no non-mutating CI check.
- Lizard is configured for edit-time quality validation but is not part of Make
  or CI.
- Biome exists on the current workstation but is not pinned, configured, or
  installed by the Pi package.
- Pi has type checking and tests but no repository-owned TypeScript lint/format
  configuration.

The plan must not assume incidental local tools are available in a fresh setup.

### Workflow-friction evidence gap

The existing workflow-friction system already captures bounded interaction text,
tool traces, failures, corrections, duration, review results, and improvement
candidates. It can route supported findings into `/improve`, where explicit
`/improve decide` authorization controls persistence.

It does not currently record the exact instruction and skill context active for
an interaction. It therefore cannot reliably connect a correction or churn event
to:

- the loaded root and directory instruction files;
- imports, truncation, or skipped instruction sources;
- active skills;
- a dispatched workflow prompt;
- duplicated or contradictory instruction layers; or
- a stale model/agent inventory embedded in instructions.

The plan proposes extending the existing packet and review path with bounded
paths, layers, hashes, counts, truncation status, active skill identifiers, and
workflow identifiers. It must not add another command, candidate store, automatic
instruction edit path, or persisted raw transcript.

## Likely causes

### Determinism was applied at the wrong layer

Objective routing, validation, parsing, state transitions, retries, and repeated
command construction benefit from maintained code. Instead, some objective rules
remained prose while tests asserted that the prose or source wording existed.
This produced the appearance of enforcement without testing behavior.

### Historical fixes accumulated without retiring weaker checks

New tests and instructions were added after individual regressions, but older
source scans, duplicate policy, and fallback instructions often remained. The
repository gained multiple checks for the same concern, each at a different
layer and with different assumptions.

### Runtime snapshots became universal workflow policy

Named agents, current model ladders, provider families, fixed panel sizes, and
team hierarchies were written into prompts and instructions. Tests then locked
those snapshots in place. Runtime discovery existed, but workflow policy did not
consistently use it.

### Prompt tests optimized wording stability instead of outcome stability

Literal string assertions were easy to add and fast to write. They were also
cheap to satisfy without preserving behavior. This encouraged large prompt
contracts whose failures often meant wording changed, not that a workflow broke.

### Validation was optimized for completeness rather than decision value

Broad suites and mandatory follow-up reviews were treated as inherently safer.
The missing question was whether another check could change the implementation or
confidence. This increased waiting and context use without proportional evidence.

### Workflow friction lacked instruction context

Session review could identify frustration or correction, but not which active
instruction layers interacted to cause it. Without that link, recurring problems
were more likely to produce another instruction than removal or consolidation of
the existing ones.

## Desired end state

The work is successful when:

- every remaining test protects a distinct code, schema, normalized config,
  safety, or public workflow contract;
- prompt and instruction wording can change without failing tests unless a runtime
  parser consumes it;
- repeated validation and inspection mechanics have one maintained entrypoint;
- fast checks are used for routine edits and full suites run only at appropriate
  integration gates;
- code-quality tools are pinned, available in fresh setup, and scoped to actual
  code defects;
- workflows describe capabilities and outcomes rather than runtime inventories;
- instruction layers are shorter, have one owner, and contain no avoidable
  duplication;
- workflow friction uses session evidence plus active instruction/skill context
  to propose deletion or refactoring when interactions cause harm;
- instruction findings still require evidence-backed review and the existing
  improve decision boundary before persistence; and
- exact user workflows and behavior already delivered continue to pass.

## Current repository state

The broad cleanup has not started.

Before this plan was created, `/review-it` was rewritten toward a runtime-adaptive
single-pass flow and its focused workflow prompt/dispatch tests plus Pi typecheck
passed. A subsequent full Pi validation run was interrupted. Those changes and
other unrelated working-tree edits must be preserved and classified separately
when execution begins.

The executable plan is:

- [`plan.md`](plan.md)

Planning evidence used to build it currently exists in gitignored scratch paths:

- `.tmp/review-test-audit/`
- `.tmp/rationalization-plan/`

The plan is standalone and does not require those scratch files.

## Questions for independent review

1. Does the plan itself repeat the over-specification it is trying to remove?
2. Which proposed maintained tools save repeated work, and which are unnecessary
   frameworks around existing commands?
3. Are the keep/replace/delete criteria strict enough to protect delivered
   behavior without preserving policy prose?
4. Does the plan make fast validation materially faster, or merely add another
   layer of commands?
5. Are Biome, Lizard, shfmt, Ruff, ShellCheck, TypeScript, and test responsibilities
   assigned to the correct boundaries?
6. Is capability-based routing sufficiently concrete without recreating fixed
   agent or model tiers under new names?
7. Does workflow-friction integration use session history safely and distinguish
   correlation from causation?
8. Can instruction interaction signals avoid false positives from intentional
   precedence, useful repetition, or long but necessary safety guidance?
9. Are any instruction layers or client adapters missing from the ownership plan?
10. Are migration waves small enough to validate and roll back independently?
11. Which tasks should be deleted or combined before execution?
12. What previously delivered behavior has no explicit replacement coverage in
    the plan?
