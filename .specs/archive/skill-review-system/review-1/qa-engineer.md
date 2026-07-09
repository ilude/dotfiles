# QA Engineer Review

## Finding 1
- category: process defect
- severity: high
- severity rationale: The plan requires `/do-it` execution, but the highest-risk end-to-end validation step is not expressed as a runnable command or tool invocation, so completion can be claimed from notes or snapshots instead of the actual slash-command path.
- evidence: The validation contract says `Command: Pi slash command `/skill-review` from repo root`, and T6 says `Run `/skill-review` from a Pi session at repo root`, but neither provides an exact shell command, Pi CLI invocation, or tool call that `/do-it` can execute and capture. This is the only step that proves the user-facing `/skill-review` command, not just helper tests.
- required_fix: Add an exact executable invocation for `/skill-review` usable by `/do-it`, including cwd, expected stdout/path extraction, and failure behavior. If slash commands cannot be invoked non-interactively, add a minimal Pi-native command test wrapper and require both wrapper execution and an explicit interactive slash-command transcript before archive.
- confidence: high

## Finding 2
- category: substantive defect
- severity: high
- severity rationale: The full-corpus criterion is not independently measurable; checking that files exist and that summary count matches inventory can pass while skills are silently skipped.
- evidence: T6 acceptance says `inventory.json includes every discovered skill from the command run and summary reports the count`, but the verify command only checks three files exist. Success Criteria likewise uses `find .tmp/skill-review -maxdepth 2 -type f | sort`. No command compares `inventory.json` against an independent discovery source such as existing skill discovery output or filesystem `SKILL.md` paths.
- required_fix: Add a deterministic count/path parity check, for example a small Node/Vitest assertion that runs the same default discovery independently and compares sorted normalized skill paths/names to `.tmp/.../inventory.json`, failing on missing, extra, or duplicate entries.
- confidence: high

## Finding 3
- category: substantive defect
- severity: high
- severity rationale: Read-only behavior is asserted but not verified over all source surfaces the command may read; this can miss mutation of user skill directories, session logs, settings, or untracked files.
- evidence: The command is required to not modify `pi/skills`, user skill directories, session logs, settings, or source files, but V5 only requires `git status --short`, which does not cover user skill directories outside the repo and may not catch generated files in ignored/untracked locations. T1 only greps the pure core module for write APIs, while actual writes live in the extension wrapper.
- required_fix: Require before/after manifests or hashes for every read-only root touched by the dogfood run: repo skill directories, user skill directory, session log directory, and Pi settings. Also add a test that injects read-only source roots and asserts only the configured output directory changes.
- confidence: high

## Finding 4
- category: process defect
- severity: medium
- severity rationale: A documented acceptance command conflicts with the repo's Pi test invocation policy and may run the wrong suite or fail for the wrong reason.
- evidence: T3 uses `cd pi && pnpm test skill-review.test.ts -- --runInBand`. The repo instructions explicitly say for single Vitest files to pass the filter directly to the pnpm script and not insert `--` before the file filter. `--runInBand` is also a Jest convention, not a Vitest requirement in this repo.
- required_fix: Replace the T3 command with `cd pi && pnpm test skill-review.test.ts`, and if serial execution is actually needed, document the supported Vitest flag in `pi/package.json` context rather than using Jest syntax.
- confidence: high

## Finding 5
- category: substantive defect
- severity: medium
- severity rationale: Malformed model-output handling is named as desired coverage but lacks a concrete schema, invalid fixtures, and a runnable assertion, so model comparison can remain happy-path only.
- evidence: T5 says malformed model comparison output is represented as invalid in schema tests, and T6 says outputs must follow `comparison-template.json`, but the plan does not require an actual validator API, malformed `gpt-review.json`/`fable-review.json` fixtures, or an exact command that proves malformed output produces an `invalid` verdict without crashing comparison logic.
- required_fix: Define the normalized review-output schema fields and validation result shape, add malformed-output fixtures for missing required fields, wrong verdict enum, and unexpected effort values, and require `cd pi && pnpm test skill-review.test.ts` to assert invalid results are recorded in `decision-ledger.json`/comparison output rather than throwing or being accepted.
- confidence: medium
