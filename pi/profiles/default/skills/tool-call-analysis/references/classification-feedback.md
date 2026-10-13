# Tool-call classification feedback

Operator decisions and corrections used by the `tool-call-analysis` skill. Read all entries before analysis. This log supplies durable context; `SKILL.md` remains the concise executable taxonomy.

## TCF-001 - A reported failure can prove that the tool worked

- **Reference:** Follow-up to TCA-001, 2026-09-11.
- **Feedback:** A Bash call that faithfully returns an invoked program's nonzero exit code is not a Bash tool-call failure. An HTTP tool faithfully returning status 500 can have succeeded while the target service failed. Do not describe such results as tools that "failed successfully."
- **Decision:** Classify the tool mechanism, caller usage, command or target-system outcome, and agent interpretation separately. Raw error presentation and unsuccessful requested outcomes do not determine the tool classification.
- **Related:** AIF-043, APR-027.
- **Status:** Incorporated into `SKILL.md`.

## TCF-002 - Incorrect invocation is a tool-use failure, not a tool defect

- **Reference:** Follow-up to TCA-001, 2026-09-11.
- **Feedback:** A misunderstanding of the right program flags, shell syntax, path shape, or other invocation contract is a real issue worth diagnosing even when Bash itself worked correctly.
- **Decision:** Record this as `tool-use failure`. Do not merge it with tool mechanism defects or ordinary application outcomes.
- **Related:** TCF-001, AIF-043.
- **Status:** Incorporated into `SKILL.md`.

## TCF-003 - Isolated incidents are noise for recurrence analysis

- **Reference:** Follow-up to TCA-001, 2026-09-11.
- **Feedback:** One occurrence in one session is not a repeated tool-call or subagent issue. Do not propose systemic remediation from isolated noise merely because it appeared in a failure review.
- **Decision:** A recurring issue requires the same demonstrated mechanism or caller misunderstanding in at least two independent sessions. Repetition inside one session may be reported as a loop or independently high-impact incident, but not as cross-session recurrence.
- **Related:** APR-027.
- **Status:** Incorporated into `SKILL.md`.

## TCF-004 - Preserve review and feedback history in the skill

- **Reference:** Operator request, 2026-09-11.
- **Feedback:** The skill must evolve like `agent-process`: retain when analysis last ran, which profiles and date ranges it covered, and later operator feedback about what is and is not a tool-call failure.
- **Decision:** The skill owns this feedback log and `analysis-log.md`, reads both before every review, appends review coverage and corrections, and updates executable taxonomy when directed or approved. No automatic monitoring or telemetry.
- **Status:** History preservation remains implemented. Mandatory complete analysis-log reading is superseded by TCF-006; classification corrections still require complete reading.

## TCF-005 - Keep failed checks separate from tool failures in delegation reviews

- **Reference:** Operator direction for TCA-012, 2026-09-24.
- **Feedback:** Do not call test failures tool errors when assessing Iris's delegation. Long model phases also do not establish inactivity.
- **Decision:** The six correctly invoked intermediate TypeScript/Vitest failures in TCA-012 are command/application outcomes because Bash and the runners faithfully reported them. Count invocation mistakes separately as tool-use failures, and assess child activity from recorded work rather than elapsed phase labels. This reaffirms TCF-001/TCF-002; it does not change the executable taxonomy.
- **Status:** Applied to TCA-012. No skill edit.

## TCF-006 - Retrieve relevant incident history instead of reading every report

- **Reference:** Operator-approved follow-up to the default Pi safety-gate review, 2026-10-13.
- **Feedback:** Keep reading classification corrections, but retrieve relevant past incidents rather than reading every historical failure report before each review.
- **Decision:** Read this feedback log completely. Search the analysis log for relevant mechanisms, tools, or comparable incidents, read matching entries, and expand only when missing evidence could change classification, cause, or remedy. Preserve durable history, review logging, and exhaustive session traversal when requested. No measured performance improvement or causal link to the stalled weekly review is claimed.
- **Status:** Implemented in `SKILL.md`; supersedes only TCF-004's complete analysis-log reading interpretation.
