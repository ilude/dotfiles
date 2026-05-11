# QA Automation Review

## Finding 1
severity: high
evidence: The plan says focused tests "should be added/updated" and V1 says "run relevant focused tests" but names no exact pnpm test filters for branch, subagent/team, registry, dependencies, security, renderer, task tools, or `/tasks`. A cold `/do-it` can satisfy V2 while skipping focused regression gates.
required_fix: Add an explicit focused-validation command list with exact files/filters, e.g. `cd pi/tests && pnpm test branch-command.test.ts`, plus expected exit code and evidence file names for each domain.

## Finding 2
severity: high
evidence: T3/T4/T13 rely on "grep/test evidence" and "docs no longer advertise `/team`" without defining active vs historical paths or allowed archive hits. This creates false positives because archived specs may legitimately contain `/team`, while active command registration may be missed.
required_fix: Define exact grep commands and expected allowlist/denylist, separating active source/docs from `.specs/archive`. Require tests asserting extension registration rejects `/team` and subagent remains available.

## Finding 3
severity: medium
evidence: Evidence destinations are inconsistent: P0 and F1 name files, but V1/V2/V3, T1-T13, and F2 do not. The plan also lacks a durable resume ledger beyond frontmatter and "Last completed item", so interrupted `/do-it` runs can lose which commands passed.
required_fix: Add `.specs/pi-control-plane-consolidation/evidence/validation.md` and a required ledger format recording item id, command, exit code, timestamp, artifact path, and next action after every completed checklist item.

## Finding 4
severity: high
evidence: F3 says archive the plan and remove active superseded directories, but the task input points `/do-it` at this active plan path. If implemented literally before final verification, standalone resumption from `.specs/pi-control-plane-consolidation/plan.md` breaks.
required_fix: Move F3 to a final, explicitly gated closeout step requiring all evidence complete, clean status reviewed, and a redirect/stub or documented new plan path so `/do-it` can resume/verify after archival.

## Finding 5
severity: medium
evidence: Several pass criteria are subjective: "too-simple work can be declined", "coordination-only", "useful historical expertise/memory", "raw session content", and "real-looking secrets" lack concrete fixtures or expected strings. A cold executor may mark them done with manual judgment only.
required_fix: Replace subjective checks with executable fixtures and expected outputs: sample agent configs, sentinel session text, synthetic secret tokens, decline prompt cases, and exact assertions that persisted JSON, logs, argv, slash output, and evidence omit raw sentinels.
