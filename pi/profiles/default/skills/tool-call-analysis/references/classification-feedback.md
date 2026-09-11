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
- **Status:** Implemented.
