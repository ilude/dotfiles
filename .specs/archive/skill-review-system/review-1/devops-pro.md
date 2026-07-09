---
reviewer: devops-pro
status: complete
finding_count: 5
---

# Findings

- category: process defect
  severity: high
  severity rationale: The archive-blocking model comparison is not operationally executable from the documented tool contract, so /do-it can reach T6 and have no valid way to run the exact GPT-5.5/Fable-5 comparison or write the required outputs.
  evidence: The plan's T6 and validation contract say to use the Pi `subagent` tool with generated `subagent-tasks.json`, producing `gpt-review.json` and `fable-review.json`. The actual `pi/extensions/subagent/index.ts` tool schema exposes `modelSize` and `modelPolicy` only; direct provider/model selection is internal (`--model` is passed only from resolved model size or agent frontmatter). `pi/settings.json` contains enabled model IDs for GPT-5.5 and Fable-5, but the plan gives no subagent payload, agent frontmatter, or resolver check that binds a task to `openai-codex/gpt-5.5` and `amazon-bedrock/us.anthropic.claude-fable-5`.
  required_fix: Add a preflight gate before implementation or before T6 that executes a harmless subagent dry run for each exact model and records the accepted tool payload. If exact targeting requires agent files or resolver changes, name the allowed files, add tests, and make that a normal task before dogfood. The generated `subagent-tasks.json` must contain fields that map one-to-one to the actual subagent tool schema and required output paths.
  confidence: high

- category: process defect
  severity: high
  severity rationale: The dogfood command is described as an interactive slash command, not as an executable validation step, so /do-it cannot reliably reproduce or capture the user workflow in automation.
  evidence: The validation contract lists `Command: Pi slash command `/skill-review` from repo root`, but no shell command, Pi CLI invocation, reload procedure, or transcript capture is specified. The command is added as a new `pi/extensions/skill-review.ts` file, and extension commands are registered at extension load time, so an already-running /do-it session may not have the new command available without restart/reload.
  required_fix: Add an exact dogfood procedure: start a fresh Pi process or reload extensions, verify the command is registered, invoke `/skill-review` from repo root, capture the output path, and fail if the path cannot be parsed. If no non-interactive slash-command invocation exists, add a minimal checked-in smoke runner or test harness that exercises the same command handler and separately require an interactive transcript artifact before archive.
  confidence: high

- category: process defect
  severity: medium
  severity rationale: The archive depends on `.tmp` artifacts that are intentionally untracked scratch output, so evidence can disappear or be overwritten without a durable handoff record.
  evidence: The plan requires dogfood and comparison artifacts under `.tmp/skill-review/{timestamp}/`, and `.gitignore` ignores `/.tmp/`. The archive rule only says those files must exist; it does not require checksums, a copied manifest, or a stable evidence record under `.specs/skill-review-system/` before archiving. Later cleanup of scratch output would erase the proof for the archive decision.
  required_fix: Keep generated command output under `.tmp` as required, but add an archive preflight that writes a non-secret evidence manifest under the spec directory, including run directory, artifact filenames, SHA-256 checksums, counts, validation commands, and model IDs used. Do not copy full packets if they may contain private content; record hashes and sanitized summaries.
  confidence: high

- category: substantive defect
  severity: medium
  severity rationale: Failure recovery for partial dogfood/model-comparison runs is ambiguous, making reruns and archive decisions race-prone.
  evidence: T6 writes a multi-file artifact set, then later model outputs and an updated `decision-ledger.json`. Acceptance checks refer to `.tmp/skill-review/{timestamp}/` and the success criteria refer to the `latest` run, but the plan does not require a run status file, atomic completion marker, exclusive directory creation, or instructions to ignore incomplete failed runs. A failed Fable attempt could leave a partial directory that a later `find` or `latest` selection mistakes for the candidate archive run.
  required_fix: Require each run directory to include a status/manifest file with `started`, `deterministic-complete`, `model-comparison-complete`, and `validated` states, written atomically. Archive gates must use the run directory parsed from the successful `/skill-review` output, not `latest`, and must reject partial runs or directories missing the completion marker.
  confidence: medium

- category: process defect
  severity: medium
  severity rationale: CI validation sequencing is not linear because an early acceptance criterion relies on tests that the plan says are added two waves later.
  evidence: T3 acceptance says to verify artifact renderer stability with `cd pi && pnpm test skill-review.test.ts -- --runInBand`, while the same line admits T5 has not added those tests yet. V2 then asks to inspect generated schema snapshots in tests or fixture outputs before T5 creates the full test suite. This leaves /do-it choosing between an unspecified temporary assertion and marking a gate complete without the documented command.
  required_fix: Move a minimal `pi/tests/skill-review.test.ts` into Wave 1 or T3 and make V2 run `cd pi && pnpm test skill-review.test.ts`. Remove `-- --runInBand`; use the repo-supported Vitest invocation. Later waves can expand the same test file, but every gate must have a command that exists when reached.
  confidence: high
