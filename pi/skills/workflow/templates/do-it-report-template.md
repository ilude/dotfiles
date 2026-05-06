For plan-file execution, report with an unmistakable status. **The first line and the last line must both state whether the task fully completed.** Do not rely on the status bar, tool output, or indirect wording.

Do not use this template for raw Simple/Medium task execution unless a plan was actually created or executed.

Use one of these exact first-line forms:
- `✅ COMPLETE: <one-sentence outcome>` only when validation passed and the plan was archived.
- `❌ NOT COMPLETE: <one-sentence blocker>` when validation failed, manual validation remains, archiving did not happen, or any required gate failed.
- `⏸ BLOCKED: <one-sentence user decision needed>` when paused on an explicit user decision.

Then include a required `## Outcome` section before the detailed bullets:
- **Status:** `COMPLETE`, `NOT COMPLETE`, or `BLOCKED`
- **Reason:** one sentence naming the completion condition or blocker
- **Plan state:** archived path when complete, or active path plus whether `## Execution Status` was updated
- **Recommended next action:** `None` if complete; exact command/action if not complete

Then include:

1. **Route taken** — Simple / Medium / Complex / Execute Plan File — and why
2. **Completion classification** — one of `completed-and-archived`, `implemented-awaiting-manual-validation`, `blocked-by-failure`, or `blocked-by-user-decision`. For Simple/Medium raw tasks without a plan, use `completed` or `blocked` if the plan classifications do not apply.
3. **What was done** — specific files changed, commands run, or delegation dispatched
4. **Verification** — test results, lint output, validation gate results, or behavior confirmation. If any required validation failed, this section must say `Required validation failed` and name the failing command(s).
5. **Next steps** — follow-up tasks surfaced during implementation. If the plan was not archived, provide exact user steps to unblock completion: commands to run, services to start/stop, files/logs to inspect, expected success signals, and what to do if a step fails.
6. **Plan state note** — if a plan file was executed but not archived, explicitly say that `## Execution Status` was updated in the plan file and summarize what it records, including last completed wave/gate and next gate.
7. **Copy/paste commands** — when there is a useful follow-up command, print it verbatim in a fenced code block:
   - Plan created but not executed:
     ```bash
     /review-it <plan-path>
     /do-it <plan-path>
     ```
   - Plan executed successfully and archived with no specific follow-up needed: write `None.`
   - Plan executed successfully and archived, but follow-up review is specifically useful:
     ```bash
     /review-it .specs/archive/<slug>/plan.md
     ```
   - Plan executed but follow-up review is recommended before archiving:
     ```bash
     /review-it <plan-path>
     ```
   - Validation failed, live/manual validation remains, or the same active plan should be retried after user steps:
     ```bash
     /do-it <plan-path>
     ```

Never print `/do-it <plan-path>` as the next-step command after a successful archived plan. It is a retry/resume command for failed validation, incomplete execution, blocked user/manual validation, or active unarchived plans only.

   - No follow-up command is useful: write `None.`

