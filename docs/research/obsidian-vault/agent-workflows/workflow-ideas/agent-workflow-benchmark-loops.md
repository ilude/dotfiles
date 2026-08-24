---
status: research-note
source: ../projects/pi-coding-agent-deep-dive.md
---

# Agent workflow benchmark loops

## Why this matters

Routing, prompt, tool, reviewer, and harness changes are difficult to evaluate
from generic benchmarks or successful demonstrations. A small corpus of tasks
that were genuinely difficult in this workflow could show whether a proposed
change improves completed outcomes under controlled conditions.

This is a research direction, not a proposal for an autonomous optimization
service or a second task system.

## Useful signals

A useful benchmark case needs more than a saved prompt or transcript:

- a reproducible repository revision and starting state;
- a bounded task that represents the original difficulty;
- model-independent acceptance and safety checks;
- fixed instructions, tools, provider conditions, and context inputs;
- structural run measurements such as acceptance, elapsed time, turns, tool
  failures, input/output tokens, cache reads, and validation failures;
- an isolated worktree, fixture repository, or disposable sandbox for mutation;
- a declared comparison and promotion rule before results are observed.

Candidate cases can come from repeated tool failures, execution-time plan gaps,
review misses, operator corrections, or tasks that required several failed
approaches. Candidate discovery is not automatic benchmark admission. Each case
must be minimized, redacted, and proven to reproduce the intended difficulty.

### Failure-to-fixture promotion

The [Cloudflare and Astro issue triage](../projects/cloudflare-astro-issue-triage.md)
case adds a useful promotion sequence:

```text
observed failure
  -> establish recurrence
  -> classify the failure
  -> minimize and redact it
  -> create a disposable reproduction
  -> encode the missing invariant
  -> add an independent validator
  -> replay under controlled conditions
```

Classification should happen before choosing a stronger model or changing the
workflow. A failure may indicate a model or route limitation, a missing tool,
an invalid report, an ambiguous architecture boundary, missing implementation
rationale, insufficient regression coverage, or an external behavior that only
the affected user can verify. The benchmark should encode the missing invariant
rather than preserve the raw session that exposed it.

A first fixture could use this shape:

```text
benchmark-case/
  README.md
  acceptance.json
  setup/
  validate
  runs.jsonl
```

`README.md` states the task and controlled assumptions. `acceptance.json` records
machine-checkable conditions. `setup/` creates disposable state. `validate`
evaluates the result independently of the tested agent. `runs.jsonl` stores
bounded structural results rather than reasoning or raw private session text.

## Possible Pi fit

One fixture can test one current route against one justified alternative while
holding the task, instructions, tool contract, context, and repository revision
constant. Initial questions could include:

- Does a different model role improve acceptance without disproportionate cost?
- Does removing a prompt component preserve safety and completion while reducing
  uncached input or latency?
- Does a reviewer catch a known execution gap often enough to justify its
  pipeline cost?
- Does a specialized tool outperform the general shell path on a recurring
  failure contract?

Existing work supplies pieces rather than a complete benchmark loop:

- `pi/docs/pi-research-report.md` defines controlled comparison and fidelity
  requirements.
- `.specs/complexity-risk-gates/PRD.md` uses deterministic fixtures and bounded
  metrics.
- `.specs/menos-knowledge-compiler/eval-queries.yaml` demonstrates curated
  evaluation inputs, but tests retrieval rather than completed work.
- `.specs/tool-failure-actionability-threshold/plan.md` defines evidence gates
  for recurring failure candidates.
- Pi usage, orchestration, workflow, and failure telemetry provide structural
  measurements.

Menos could preserve source references or candidate records later, but raw
session ingestion should not decide benchmark truth or acceptance.

### Layered acceptance

A case may need several distinct gates:

1. **Reproduction** - prove the reported behavior exists.
2. **Classification** - establish that the behavior is defective rather than
   intended, unsupported, or inconclusive.
3. **Repository validation** - pass focused tests and relevant regressions.
4. **External workflow verification** - ask the original consumer to verify a
   preview when repository checks cannot prove the external boundary.
5. **Promotion** - review the complete evidence before accepting a runtime,
   routing, prompt, tool, or policy change.

Cloudflare's Astro workflow uses a reporter-tested preview before opening a pull
request, illustrating why repository validation and external verification are
not interchangeable. See the
[Cloudflare case study](https://blog.cloudflare.com/astro-issue-triage/).

## Research questions

1. Which recurring failure is small enough to reproduce without production or
   credential dependencies?
2. What independent validator proves the task rather than checking source text?
3. Which structural fields are required to reproduce a run without retaining
   sensitive content?
4. How much environment drift can be tolerated before two runs are incomparable?
5. What minimum acceptance delta justifies a more expensive model or pipeline?
6. When should a benchmark be retired because the underlying workflow changed?
7. Can existing telemetry produce the measurements, or is a separate runner
   artifact actually necessary?

## Risks / reasons not to build yet

- Historical sessions are noisy observations, not controlled test cases.
- A large corpus can reward benchmark-specific behavior and stop representing
  current work.
- Automatic replay can repeat destructive or externally visible side effects.
- Cost, latency, and cache results are provider- and time-dependent.
- Optimizing one score can hide regressions in safety, maintainability, or human
  intervention requirements.
- Automatic prompt, policy, or routing promotion would bypass review and current
  authority boundaries.
- A general runner, dashboard, scheduler, or benchmark database is premature
  before one fixture changes an actual decision.

## KISS recommendation

Do not build a benchmark platform. Select one recurring, already-understood
failure; reconstruct it as a disposable fixture; compare the current default
against one alternative; and keep the fixture only if its result changes a
routing, prompt, tool, or review decision. Require explicit review before any
measured improvement changes runtime policy.

## Related notes

- [Cloudflare and Astro issue triage](../projects/cloudflare-astro-issue-triage.md)
- [Pi Coding Agent deep dive](../projects/pi-coding-agent-deep-dive.md)
- [Adaptive plan review telemetry](adaptive-plan-review-telemetry.md)
- [DuckDB for Pi usage analytics](duckdb-for-pi-usage-analytics.md)
- [Pipelines and policies](pipelines-and-policies.md)
- [Specs workflow trajectory](specs-workflow-trajectory.md)
- [Sandboxed agent runtimes](../patterns/sandboxed-agent-runtimes.md)
- [Deterministic agent rules and guardrails](../patterns/deterministic-agent-rules-and-guardrails.md)
