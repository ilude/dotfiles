# Product Manager Review

## Finding 1
- severity: high
- evidence: The plan requires "Use all available local Pi data" across `~/.pi/agent/sessions/**`, traces, metrics, multi-team sessions, repo artifacts, command implementations, and git history, then asks for era assignment, quantitative claims, case studies, and reproducibility artifacts. This exceeds a first audit and risks spending most effort on inventory mechanics instead of actionable workflow fixes.
- required_fix: Narrow the first pass to one repo plus explicit `/plan-it`, `/do-it`, `/review-it` sessions only, with a capped sample size and a follow-up criterion for expanding scope.

## Finding 2
- severity: high
- evidence: "Equivalent workflow episodes" include broad phrases such as "make a plan", "review this", "do it", "acceptance criteria", "handoff", and "review artifact". These patterns will capture ordinary work and inflate the candidate index with ambiguous sessions.
- required_fix: Remove equivalent-workflow discovery from v1 or require at least two structural signals, such as a `.specs/` artifact plus a review artifact, before inclusion.

## Finding 3
- severity: medium
- evidence: The coding taxonomy spans five domains with 48+ categories, plus a separate review-theater classification and many measurable signals. Manual coding at this granularity will be inconsistent and slow unless tooling and inter-rater rules already exist.
- required_fix: Collapse the taxonomy to the few decisions needed for product action: planning defect, execution drift, review noise, validation gap, and performance waste; defer subcategory expansion until after an initial sample proves value.

## Finding 4
- severity: medium
- evidence: The plan mandates a git-based era timeline before analyzing outcomes, including assigning every episode to eras like "after first major /plan-it change". No evidence is provided that enough episodes exist per era or that command changes are the main explanatory variable.
- required_fix: Make era analysis optional and only run it if the candidate index shows sufficient episode counts around meaningful workflow changes.

## Finding 5
- severity: medium
- evidence: Acceptance criteria require final report, inventory, timeline, episode index, coded rows, counts/rates, case studies, and methodology, but there is no MVP artifact that would let the team stop early once high-confidence friction points are found.
- required_fix: Add an explicit stop rule and MVP deliverable: top 3 evidence-backed workflow problems with source excerpts and one recommendation each; only produce the full report if patterns remain unclear.
