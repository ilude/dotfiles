# Product Manager Review

## Finding 1
- severity: high
- evidence: Plan requires T4 durable forward skill-load logging, but also says only implement if a non-`node_modules` hook exists. This makes the core objective contingent on unknown architecture and may force upstream Pi changes for a local stats feature.
- required_fix: Split scope: ship `/skill-stats` historical/best-effort first; make forward logging a separate follow-up only after T1 proves a durable local hook exists.

## Finding 2
- severity: medium
- evidence: Plan introduces schema design, custom events, de-duplication precedence, fixtures, manual validation, and repo-wide `make check` for a small reporting command analogous to `/extension-stats`.
- required_fix: Reuse `/extension-stats` parsing/reporting patterns directly and limit validation to Pi extension typecheck plus one parser smoke test unless touched files justify repo-wide checks.

## Finding 3
- severity: medium
- evidence: `SKILL.md` read calls are counted as skill usage, but reviewers, researchers, and implementers routinely read skill files without activating them. This creates misleading product metrics.
- required_fix: Exclude `SKILL.md` reads from default totals, or show them only in a separate “candidate/manual reads” section that never contributes to usage ranking.

## Finding 4
- severity: low
- evidence: Manual validation requires running `/skill:docs ...` and then checking `/skill-stats`, even though the plan already calls for synthetic fixtures covering structured events and historical evidence.
- required_fix: Prefer an automated fixture/harness as the acceptance gate; keep manual Pi-session checks optional smoke testing, not archive-blocking.
