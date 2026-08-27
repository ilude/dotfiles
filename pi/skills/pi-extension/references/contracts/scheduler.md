# Scheduler

- Classification: process-local workflow control.
- Authorization: creating, using, listing, and cancelling schedules do not require a user request, approval, or confirmation.
- Use: delayed workflow continuation, status follow-ups, reminders, and recurring checks. Schedule controls when Pi receives a prompt; it does not store todo state, dependencies, or process lifecycle.
- Waiting: for waits of 60 seconds or longer, use a scheduled follow-up instead of shell sleep loops, polling loops, or background workers used only as timers.
- Timing: schedule a follow-up near half the expected wait, bounded between 60 seconds and 15 minutes; use five minutes when the duration is unknown.
- Clarification: ask only when a required value such as timing, recurrence, or timezone is missing or ambiguous. Do not frame clarification as approval or confirmation.
- Cancellation: cancel schedules directly when they are no longer needed or their completion condition is satisfied.
- Reporting: every successful schedule action reports the next active run as a human-readable `Next scheduled run:` line. Use the schedule's explicit timezone when set and the process-local timezone otherwise; report `none` when no active schedule remains. While a schedule exists, the footer shows the earliest next run as `sched@ <time>` in the same applicable timezone and omits the segment when no schedule remains.
- Turn control: schedule actions do not inherently require ending the assistant turn. When a scheduled follow-up is the intended next step and no useful work remains before it runs, end the turn so the follow-up can be delivered when due; otherwise continue useful work.
- Availability: keep the schedule tool active so its guidance remains available when a waiting requirement is discovered during execution.
- Lifetime: schedules survive session changes in the current Pi process and stop when that process exits.
- Prompt boundary: scheduled prompts cannot be slash commands.
