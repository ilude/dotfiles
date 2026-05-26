# Workflow Data Collection

## Thesis

Local workflow telemetry may produce better router training data than larger
external prompt dumps.

External datasets are useful for discovery, but Pi needs labels for cheapest
acceptable `(model_tier, effort)` in real local workflows.

## What to collect

Privacy-safe event fields:

- Prompt hash.
- Deterministic prompt features.
- Router recommended tier and effort.
- User-selected tier and effort.
- Final applied tier and effort.
- Override type.
- Task surface or command surface.
- Files touched count.
- Tool calls count.
- Validation commands run.
- Validation success or failure.
- Repair loop count.
- Follow-up type: accepted, correction, escalation, continuation, cancel.

Raw prompt text should be opt-in and reviewed before it becomes training data.

## High-value queue triggers

Create adjudication rows for:

- User effort override disagrees with router recommendation.
- User model-tier override disagrees with router recommendation.
- Low route followed by validation failure or repeated correction.
- High route completed with trivial work.
- Short prompt that needed high effort.
- Long prompt that completed cheaply.
- Safety-sensitive prompt routed too low.

## Review output

Reviewed rows should produce:

- `accepted_route`
- review decision
- reviewer or review source
- source event IDs or hashes
- reason notes
- privacy classification

## Why this helps

User overrides and validation outcomes provide direct evidence about whether the
router helped or hurt. This is more actionable than generic prompt complexity.

## Open work

- Define the telemetry event schema.
- Decide where runtime telemetry should be stored.
- Add opt-in raw prompt capture path for reviewed samples.
- Build a queue generator from override and outcome events.
- Add tests that user effort override is preserved in final route.
