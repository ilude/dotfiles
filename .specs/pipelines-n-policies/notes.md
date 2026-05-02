---
created: 2026-05-02
status: notes
---

# Pipelines and Policies Notes

## Purpose

Capture ideas from recent local YouTube research about agentic pipelines, local AI stacks, memory, and policy-as-code, then map them to possible Pi workflow improvements. This is not an implementation plan yet; it is a reference note for future `/plan-it` work.

## Local Research Artifacts

The `/yt-local` workflow persisted transcripts and metadata under `yt/<video_id>/`. The `yt/` directory is gitignored local fetched data.

| Video | Local artifacts | Relevance |
|---|---|---|
| `xfwmzYOod3k` — “Are Agentic Pipelines Actually Worth It?” | `yt/xfwmzYOod3k/transcript.txt`, `yt/xfwmzYOod3k/metadata.json`, `yt/xfwmzYOod3k/description.txt`, `yt/xfwmzYOod3k/description_urls.txt` | Pipeline ROI, ledger/run receipts, measuring pipeline tax vs accuracy lift |
| `9YYUzA5ZnDo` — “How to Build Agentic Pipelines (It’s Simpler Than You Think)” | `yt/9YYUzA5ZnDo/transcript.txt`, `yt/9YYUzA5ZnDo/metadata.json`, `yt/9YYUzA5ZnDo/description.txt`, `yt/9YYUzA5ZnDo/description_urls.txt` | Pipeline blocks, manager/worker loops, artifacts, events, profiles, gates |
| `iFLaeWXRSlY` — “Set Up Policy as Code in 1 Hour (Control AI Code Fast)” | `yt/iFLaeWXRSlY/transcript.txt`, `yt/iFLaeWXRSlY/metadata.json`, `yt/iFLaeWXRSlY/description.txt`, `yt/iFLaeWXRSlY/description_urls.txt` | Policy-as-code starter scanner, bespoke architecture rules, deterministic anti-drift checks |
| `lHZomSUi7gU` — “How We Use Policy as Code to Control Claude and AI Agents” | `yt/lHZomSUi7gU/transcript.txt`, `yt/lHZomSUi7gU/metadata.json`, `yt/lHZomSUi7gU/description.txt`, `yt/lHZomSUi7gU/description_urls.txt` | Scaled policy-as-code architecture: evidence gathering, rule registry, gates, findings, waivers, reports |
| `iUSdS-6uwr4` — “RTX 5090, Mac Studio, or DGX Spark? I tried all three.” | `yt/iUSdS-6uwr4/transcript.txt`, `yt/iUSdS-6uwr4/metadata.json`, `yt/iUSdS-6uwr4/description.txt`, `yt/iUSdS-6uwr4/description_urls.txt` | Personal AI computer stack, local memory, MCP/tool boundaries, local-vs-cloud routing |
| `3MP8D-mdheA` — “Improve codebase architecture” topic | `yt/3MP8D-mdheA/transcript.txt`, `yt/3MP8D-mdheA/metadata.json`, `yt/3MP8D-mdheA/description.txt`, `yt/3MP8D-mdheA/description_urls.txt` | Deep modules, seams, adapters, architecture-improvement skills, human strategic oversight |
| `3zSANOIBHYw` — local Claude Code / LM Studio workflow | transcript fetched in-session; metadata URLs surfaced | Local AI coding, LM Studio Link, Claude Code against local models, subagents for context management |

## Source Video URLs

- https://www.youtube.com/watch?v=xfwmzYOod3k
- https://www.youtube.com/watch?v=9YYUzA5ZnDo
- https://www.youtube.com/watch?v=iFLaeWXRSlY
- https://www.youtube.com/watch?v=lHZomSUi7gU
- https://www.youtube.com/watch?v=iUSdS-6uwr4
- https://www.youtube.com/watch?v=3MP8D-mdheA
- https://www.youtube.com/watch?v=3zSANOIBHYw

## Ideas Extracted

### 1. Pipelines need to earn their cost

Agentic pipelines add tax:

- more tokens
- more wall-clock time
- more orchestration
- more review loops
- more abstraction around development

They are justified only when they measurably improve quality, governance, repeatability, or accuracy. The useful question is not “can this pipeline work?” but “did this pipeline earn its cost compared with a simpler single-agent or manually guided run?”

### 2. Run receipts / ledgers are critical

A pipeline should write machine-readable and human-readable receipts as it runs. Useful fields:

- plan slug
- task id / wave id
- agent and model size
- start/end timestamps
- elapsed time
- commands run
- files touched
- artifacts created
- validation results
- retry count
- reviewer/validator outcome
- final status

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

### 3. Artifacts should be first-class

Each pipeline step should leave useful output on disk instead of relying only on chat context. Candidate artifacts:

```text
.specs/<slug>/artifacts/T1-handoff.md
.specs/<slug>/artifacts/V1-validation.md
.specs/<slug>/artifacts/review-summary.md
.specs/<slug>/artifacts/final-report.md
```

Benefits:

- easier audit/review
- easier handoff between agents
- better resumability after failures
- less reliance on conversation context

### 4. Resumability should be designed in

A robust `/do-it` should be able to resume from the last completed validation gate. Possible state sources:

- plan frontmatter `completed:` list
- `run-ledger.json`
- validation artifacts

Potential behavior:

1. Read plan and ledger.
2. Identify completed tasks and validation gates.
3. If a prior run failed, ask whether to resume from the next blocked task or restart.
4. Never re-run completed destructive/deployment steps without confirmation.

### 5. Policy-as-code gates are a natural fit for Pi

Pi already has deterministic validation commands (`make test-pytest`, `make lint`, targeted Vitest, safety hooks). This can be extended into explicit policy gates before validator signoff.

The policy-as-code videos frame this as a bespoke linting layer: write down the architecture/code-review rules humans repeatedly catch in PRs, then turn them into deterministic scanners. A starter version can be simple: ask an agent for important rules, create a `policies/` scanner, run it across source, and inspect violations.

A scaled version has three core levels:

1. **Evidence gathering** -- scrape/parse the codebase once into reusable evidence buckets so every rule does not do a full scan.
2. **Rules** -- declarative modules/data that evaluate evidence and emit findings.
3. **Gates** -- decide which findings are hard failures, warnings, release warnings, or waived exceptions.

Supporting pieces:

- evidence cache/store
- rule registry
- runner
- findings output
- waiver system
- report output, eventually HTML/database/app
- gate evaluator

Waivers are useful but risky because agents may try to add waivers instead of fixing code. AI should generally not be allowed to create waivers directly; waivers should be audited separately.

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

### 6. Profiles and recipes are reusable pipeline blocks

The videos describe profiles as opinionated bundles of docs, skills, resources, permissions, and expectations. Pi already has agents and skills, but could benefit from reusable workflow recipes.

Possible recipe files:

```text
pi/pipelines/recipes/spec-execution.md
pi/pipelines/recipes/docs-only-change.md
pi/pipelines/recipes/typescript-feature.md
pi/pipelines/recipes/safety-hook-change.md
pi/pipelines/recipes/local-youtube-research.md
```

These recipes would sit above individual agents and describe task shapes, expected artifacts, validation gates, and policy checks.

### 7. Manager/worker loops should stay small at first

The pipeline videos emphasize starting simple:

1. Run worker.
2. Run manager/reviewer.
3. Decide retry/fix/finish.

Only add planning, parallelism, TDD loops, governance dashboards, or branch/worktree isolation after a measured failure mode justifies it.

### 8. Local memory and tool boundaries matter

The personal AI computer video emphasized owning memory and using tools with boundaries. Applied to Pi:

- expertise JSONL remains source of truth
- derived snapshots/retrieval indexes are disposable
- local YouTube artifacts under `yt/` are gitignored fetched data
- MCP/tool surfaces need permissions, logging, and boundaries
- agents should get only the tools required for their role

## Current Pi Fit

Pi already has several pipeline-like pieces:

- `/plan-it` creates executable specs
- `/review-it` runs adversarial multi-agent review
- `/do-it` executes waves and validation gates
- `append_expertise` / `read_expertise` provide durable memory
- archived specs preserve final plans
- review synthesis artifacts now exist by instruction

Main gaps:

1. No consistent run ledger for `/do-it`.
2. No required per-task/per-wave artifacts.
3. Resumability is implicit rather than ledger-driven.
4. Policy checks are scattered across instructions/hooks/tests rather than a named pipeline gate.
5. Recipes/profiles exist as agents/skills but not as first-class pipeline blocks.

## Recommended First Implementation Plan

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

## Open Questions

- Should the ledger be JSON only, Markdown only, or both?
- Should subagents write task handoff artifacts directly, or should the orchestrator synthesize them?
- Should `/review-it` be mandatory before `/do-it` for high-risk plans?
- Should policy checks be implemented as scripts, command instructions, or both?
- Should Pi eventually expose a `/pipeline-status` command for active/archived runs?
