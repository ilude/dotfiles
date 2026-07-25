# Pi Tooling Contracts

This file records the current accepted semantics for Pi extensions and tools. It is living guidance and must evolve when tooling behavior is refined. Keep only the accepted current state here; Git history preserves superseded decisions.

## Ownership

- The owning extension defines each tool's callable contract and model guidance.
- Tool-specific semantics belong here and in the owning extension, not in `AGENTS.md`.
- Reconcile this contract with descriptions, prompt snippets, prompt guidelines, activation, runtime gates, and operator documentation whenever behavior changes.
- Use tests for executable behavior, not as the primary store for design intent or policy prose.

## Scheduler

- Classification: process-local workflow control.
- Authorization: creating, using, listing, and cancelling schedules do not require a user request, approval, or confirmation.
- Use: delayed workflow continuation, status follow-ups, reminders, and recurring checks.
- Waiting: for waits of 60 seconds or longer, use a scheduled follow-up instead of shell sleep loops, polling loops, or background workers used only as timers.
- Timing: schedule a follow-up near half the expected wait, bounded between 60 seconds and 15 minutes; use five minutes when the duration is unknown.
- Clarification: ask only when a required value such as timing, recurrence, or timezone is missing or ambiguous. Do not frame clarification as approval or confirmation.
- Cancellation: cancel schedules directly when they are no longer needed or their completion condition is satisfied.
- Availability: keep the schedule tool active so its guidance remains available when a waiting requirement is discovered during execution.
- Lifetime: schedules survive session changes in the current Pi process and stop when that process exits.
- Prompt boundary: scheduled prompts cannot be slash commands.
