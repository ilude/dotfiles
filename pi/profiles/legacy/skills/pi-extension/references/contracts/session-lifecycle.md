# Session Lifecycle and Compaction

- Reconstruction: `/reload`, `/new`, `/resume`, and `/fork` create fresh extension instances. Rebuild required in-memory state from session entries, tool-result details, extension entries, or process-global managers according to the owning component.
- Invalid references: do not retain old session-bound contexts, UI objects, or callbacks across replacement. Generation guards must prevent stale asynchronous work from acting on a newer session.
- Active-turn compaction: compact only eligible tool-driven turns above the configured threshold and only when a valid cut point exists. Native pre-response compaction and overflow retry remain authoritative when they start first.
- Handoff: preserve completion evidence, the latest user correction, the response still owed, pending questions, pending operator decisions as a distinct field, per-task live attempt counts and caps, hard stop conditions, active root-task constraints, changed files, validation, blockers, and the next action.
- Continuation: retained messages and the new summary define the frontier. Newer user corrections supersede older summaries and task context; durable task state supplements rather than replaces the active request.
- Recovery: after successful extension-initiated compaction, enqueue one hidden continuation only when no newer interaction is pending. A failed native or extension threshold compaction opens the bounded failure circuit without disabling manual or overflow compaction; an aborted compaction does not open it.
- Process-local continuity: background terminals, schedules, and other explicitly process-global managers may survive session replacement but stop with the Pi process. Session-private extension state does not gain that lifetime implicitly.
- Startup and shutdown: startup preflights and observability initialization must be bounded. Shutdown invalidates callbacks, stops owned resources, emits best-effort lifecycle records, and archives the session where configured.
- Archival resilience: transcript or close-marker failure must not prevent primary session archival. Reload archives without pretending the logical conversation closed.
