---
created: 2026-05-02
status: notes
source: .specs/pipelines-n-policies/notes.md
---

# Pipelines and Policies

## Purpose

Capture ideas from local YouTube research about agentic pipelines, local AI stacks, memory, and policy-as-code, then map them to possible Pi workflow improvements. This is a reference note for future `/plan-it` work, not an implementation plan.

## Local research artifacts

The `/yt-local` workflow persisted transcripts and metadata under gitignored `yt/<video_id>/` directories.

| Video | Relevance |
|---|---|
| `xfwmzYOod3k` — “Are Agentic Pipelines Actually Worth It?” | Pipeline ROI, ledger/run receipts, measuring pipeline tax vs accuracy lift |
| `9YYUzA5ZnDo` — “How to Build Agentic Pipelines (It’s Simpler Than You Think)” | Pipeline blocks, manager/worker loops, artifacts, events, profiles, gates |
| `iFLaeWXRSlY` — “Set Up Policy as Code in 1 Hour (Control AI Code Fast)” | Starter scanner, bespoke architecture rules, deterministic anti-drift checks |
| `lHZomSUi7gU` — “How We Use Policy as Code to Control Claude and AI Agents” | Evidence gathering, rule registry, gates, findings, waivers, reports |
| `iUSdS-6uwr4` — “RTX 5090, Mac Studio, or DGX Spark? I tried all three.” | Personal AI computer stack, local memory, MCP/tool boundaries, local-vs-cloud routing |
| `3MP8D-mdheA` — “Improve codebase architecture” topic | Deep modules, seams, adapters, architecture-improvement skills, human strategic oversight |
| `3zSANOIBHYw` — local Claude Code / LM Studio workflow | Local AI coding, LM Studio Link, Claude Code against local models, subagents for context management |

Source URLs:

- https://www.youtube.com/watch?v=xfwmzYOod3k
- https://www.youtube.com/watch?v=9YYUzA5ZnDo
- https://www.youtube.com/watch?v=iFLaeWXRSlY
- https://www.youtube.com/watch?v=lHZomSUi7gU
- https://www.youtube.com/watch?v=iUSdS-6uwr4
- https://www.youtube.com/watch?v=3MP8D-mdheA
- https://www.youtube.com/watch?v=3zSANOIBHYw

## Strong ideas

### Pipelines need to earn their cost

Agentic pipelines add token, wall-clock, orchestration, review-loop, and abstraction tax. They are justified only when they measurably improve quality, governance, repeatability, or accuracy.

The useful question is not “can this pipeline work?” but “did this pipeline earn its cost compared with a simpler single-agent or manually guided run?”

### Run receipts / ledgers are critical

A pipeline should write machine-readable and human-readable receipts as it runs. Useful fields include plan slug, task/wave id, agent/model, timestamps, elapsed time, commands run, files touched, artifacts created, validation results, retry count, reviewer/validator outcome, and final status.

Potential Pi artifact:

```text
.specs/<slug>/run-ledger.json
.specs/<slug>/artifacts/final-summary.md
```

On archive:

```text
.specs/archive/<slug>/run-ledger.json
.specs/archive/<slug>/artifacts/final-summary.md
```

### Artifacts should be first-class

Each pipeline step should leave useful output on disk instead of relying only on chat context:

```text
.specs/<slug>/artifacts/T1-handoff.md
.specs/<slug>/artifacts/V1-validation.md
.specs/<slug>/artifacts/review-summary.md
.specs/<slug>/artifacts/final-report.md
```

Benefits: auditability, handoff, resumability, and less reliance on conversation context.

### Resumability should be designed in

A robust `/do-it` should be able to resume from the last completed validation gate by reading plan state, `run-ledger.json`, and validation artifacts. It should ask whether to resume or restart after prior failures and never re-run completed destructive/deployment steps without confirmation.

### Policy-as-code gates fit Pi

Pi already has deterministic validation commands and safety hooks. A named policy gate can turn recurring human review rules into deterministic scanners.

A starter version can ask an agent for important repo rules, create a `policies/` scanner, run it across source, and inspect violations.

A scaled version has:

1. **Evidence gathering** — parse the codebase once into reusable evidence buckets.
2. **Rules** — declarative modules/data that evaluate evidence and emit findings.
3. **Gates** — decide which findings are hard failures, warnings, release warnings, or waived exceptions.

Supporting pieces: evidence cache, rule registry, runner, findings output, waiver system, and report output. Waivers are useful but risky because agents may try to add waivers instead of fixing code; AI should generally not create waivers directly.

Candidate policies:

- no `.env` modifications
- no secrets in diffs
- generated local state remains gitignored
- completed plans are archived
- `/review-it` synthesis exists before high-risk execution
- HIGH/CRITICAL review findings were verified before accepted
- no destructive git commands without confirmation
- no submodule force-push/amend/rebase of pushed commits

Potential artifact:

```text
.specs/<slug>/artifacts/policy-checks.md
```

### Profiles and recipes are reusable pipeline blocks

Pi already has agents and skills, but could benefit from reusable workflow recipes above individual agents:

```text
pi/pipelines/recipes/spec-execution.md
pi/pipelines/recipes/docs-only-change.md
pi/pipelines/recipes/typescript-feature.md
pi/pipelines/recipes/safety-hook-change.md
pi/pipelines/recipes/local-youtube-research.md
```

Recipes would describe task shapes, expected artifacts, validation gates, and policy checks.

### Manager/worker loops should stay small

Start with:

1. Run worker.
2. Run manager/reviewer.
3. Decide retry/fix/finish.

Only add planning, parallelism, TDD loops, governance dashboards, or branch/worktree isolation after a measured failure mode justifies it.

### Local memory and tool boundaries matter

Applied to Pi:

- expertise JSONL remains source of truth
- derived snapshots/retrieval indexes are disposable
- local YouTube artifacts under `yt/` are gitignored fetched data
- MCP/tool surfaces need permissions, logging, and boundaries
- agents should get only the tools required for their role

## Current Pi fit

Pi already has several pipeline-like pieces: `/plan-it`, `/review-it`, `/do-it`, expertise tools, archived specs, and review synthesis artifacts.

Main gaps:

1. No consistent run ledger for `/do-it`.
2. No required per-task/per-wave artifacts.
3. Resumability is implicit rather than ledger-driven.
4. Policy checks are scattered across instructions/hooks/tests rather than a named pipeline gate.
5. Recipes/profiles exist as agents/skills but not as first-class pipeline blocks.

## Recommended first implementation plan

Do **not** build a large pipeline framework first. Start with the smallest useful governance addition:

1. Add `/do-it` run ledger.
2. Add per-wave validation artifacts.
3. Add final summary artifact.
4. Archive these artifacts with the plan.
5. Add a policy-check artifact generated before final archive.

Candidate first plan slug:

```text
.specs/pi-run-ledger-policy-gates/plan.md
```

## Open questions

- Should the ledger be JSON only, Markdown only, or both?
- Should subagents write task handoff artifacts directly, or should the orchestrator synthesize them?
- Should `/review-it` be mandatory before `/do-it` for high-risk plans?
- Should policy checks be implemented as scripts, command instructions, or both?
- Should Pi eventually expose a `/pipeline-status` command for active/archived runs?
