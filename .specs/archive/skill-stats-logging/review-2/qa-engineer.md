# QA skeptical review: session JSONL fixture/de-duplication validation

## Findings

1. **Severity: High — De-duplication key is under-specified and can silently double-count real Pi records.**
   - **Evidence:** The plan defines `{sessionFile, turnIdOrLineNumber, skill}` as fallback same-turn key (plan.md:215), but T5 only requires “duplicate same-turn evidence” and “duplicate structured event” fixture cases (plan.md:294-297). It does not require mixed-shape duplicates across adjacent JSONL records when one record has `turnId`, another lacks it, or when assistant/user/tool records belonging to one turn occupy different line numbers.
   - **Required fix:** Add fixture rows/assertions for at least: structured + `<skill name>` same turn with shared `turnId`; structured + `/skill:name` where only one record has `turnId`; same logical turn represented by adjacent line numbers without `turnId`; duplicate structured events with different line numbers but identical event/session/turn metadata. Define expected counts explicitly.

2. **Severity: High — Real log-shape grounding can pass with invented fixtures after weak discovery.**
   - **Evidence:** T1 says if no real examples are found, T5 may create fixtures from “documented Pi message shapes” and mark confidence limited (plan.md:199-201, 298-301). That allows parser tests to pass against documentation or assumptions while missing actual persisted Pi JSONL envelopes, nested custom payload locations, or field names.
   - **Required fix:** Make T5 require at least one sanitized fixture copied from an actual session JSONL envelope for each evidence class found in discovery (`customType`, user message, assistant/expanded skill block, tool result). If an evidence class has no real record, the parser must label that source unsupported/limited in the report and tests must assert that limitation text.

3. **Severity: Medium — Exact test command does not guarantee the fixture matrix actually ran.**
   - **Evidence:** The accepted command is `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test -- skill-stats ...` (plan.md:291, 356). The pass condition only says command exits 0 and writes smoke output (plan.md:292), not that Vitest discovered the intended test file or executed the required number of matrix cases.
   - **Required fix:** Require smoke output/assertions to prove execution count, e.g. a named `describe("skill-stats evidence matrix")` and expected test count/case names in `smoke.txt`, or add a pre-test check that the target test file exists and Vitest output contains all matrix case labels.

4. **Severity: Medium — False positives from manual `SKILL.md` reads are excluded from ranking, but not tested against realistic review/research reads.**
   - **Evidence:** The plan recognizes review/research `SKILL.md` reads are noisy (plan.md:34) and says they are separate candidate evidence (plan.md:249-251), but the T5 matrix only includes a generic “candidate `SKILL.md` read” (plan.md:294). It does not require realistic tool-call paths from `~/.pi/agent/skills/.../SKILL.md`, repo-local skill files, or reads caused by this very implementation/review work.
   - **Required fix:** Add fixtures for tool-result/read records with absolute home skill paths, repo-relative skill paths, and multiple reads of the same `SKILL.md`; assert they never increase usage totals/ranking and are grouped only in candidate/manual-read sections with redacted paths.

5. **Severity: Medium — Window boundary and timestamp fallback counts are untested, so exact rolling counts can be wrong while parser tests pass.**
   - **Evidence:** Report windows are defined as `1/7/30` plus optional windows (plan.md:219), but T5’s matrix focuses on evidence types and malformed fields (plan.md:294-297), not records exactly on window boundaries, missing timestamps, session-file-derived timestamps, or future timestamps.
   - **Required fix:** Add deterministic time fixtures with injected `now` and expected counts for inside/outside/exact-boundary records for 1/7/30-day windows, plus missing/invalid/future timestamp behavior. The smoke test should assert the per-window count table, not just total usage.
