# Completeness and Explicitness Review

## Finding 1
- severity: high
- evidence: T5 requires “actual generation route equals applied route” but only verifies with `cd pi/tests && pnpm run test -- prompt-router.test.ts`. The plan does not define what Pi API/test seam exposes the actual provider/model/thinking used by same-turn generation, or how a Vitest unit can observe it without mocking the thing being proven.
- required_fix: Add a concrete harness design: target API/hook, captured fields, fixture flow, assertion source, and failure/blocker artifact path. If this needs manual Pi execution, make it an explicit gate separate from Vitest.

## Finding 2
- severity: high
- evidence: The checklist says checked items must include evidence, but validation gates only say “run tests” and “create a fix task” without defining where command output, manual transcripts, blocker notes, or rerun evidence must be stored. A fresh `/do-it` session could mark boxes based on transient terminal output.
- required_fix: Define an evidence convention for every task/gate, such as embedding command, exit code, timestamp, and summary in each item’s Evidence field plus linking artifacts under the spec directory for manual/status transcripts.

## Finding 3
- severity: medium
- evidence: T2 says invalid mode “returns explicit error/fallback reason,” while constraints say “reject invalid modes without silent ensemble fallback” and success criterion says invalid classifier modes “fail closed.” “Fallback reason” can pass without failing closed.
- required_fix: Choose one behavior for invalid modes: fail configuration/load/classification with a named error and no routing fallback, or allow a specific safe fallback. Update T2 acceptance, validation contract, and eval invalid-mode check to match.

## Finding 4
- severity: medium
- evidence: Several acceptance criteria rely on subjective terms: “truthful and canonical,” “operator summary,” “policy fingerprint,” “runtime-comparable metrics,” “context-window safety checks,” and “owner-only permissions where possible.” These can pass with incomplete or inconsistent output.
- required_fix: Add explicit schemas/field lists and exact expected values for status, explain, JSONL telemetry, eval output, and permission behavior, including platform-specific expectations or documented skips on Windows/MSYS.

## Finding 5
- severity: medium
- evidence: Automation plan lists Python eval/classifier commands “documented per task,” but T8’s required command is “the project-specific eval command added by this task.” That means initial `/do-it` lacks a runnable command to verify completion until after implementation, and no minimum dataset/fixture path is named.
- required_fix: Specify the intended eval command shape, required fixture files, minimal dataset size, and expected output keys before implementation. Require the task to update the command only if justified and record the final command in the plan evidence.
