# Agent process failure log

## APR-069 - Retained completed subagents and delayed recovery after partial result

- **Reference:** Default session `01a0d212-1862-72be-825b-4865b83bbd33`, 2026-09-24; validator child session `99e5a8d3-4e52-4508-b3a8-d55ae1f3a8c2`.
- **Observed:** The coordinator explicitly retained developers for speculative future work. After correction, it finished idle Clara and Iris. Later, validator emitted a partial at 15:05:51Z saying recovery checks were being run, but had actually settled. The coordinator reported checks still running and did not resume until the operator asked “so what is going on here?” around 15:18. Inspection confirmed the work was settled; an explicit follow-up completed checks, final validation completed, and the worker closed promptly.
- **Finding:** Caller-side retention and outcome handling were at fault. The record does not establish a backend defect.
- **Related:** AIF-067 (foreground Strategist outcome handling); APR-017 (integrating delivered outcomes rather than duplicating or overlooking them); AIF-087 (distinguishing runtime ownership and pane state).
- **Remediation:** Retain a child only for a concrete expected follow-up, not speculative later work. Treat a delivered partial as settled unless current status proves it is still active; continue with an explicit concrete follow-up when needed.
- **Status:** Recovery completed. Log-only feedback; no instruction or runtime change authorized.

## APR-068 - Requested cache default left pending reconfirmation

- **Reference:** Default-profile Mantle accounting discussion, 2026-09-24, session `01a0d39b-3fb2-73a0-825d-761f5467d6d4`.
- **Observed:** The operator specified five-minute cache writes while approving the accounting fix. The orchestrator fixed accounting but asked for confirmation of the default and then reported it as pending. The operator had to repeat the requested default.
- **Finding:** The orchestrator treated the requested behavior as an unresolved proposal. Existing scope and intent guidance applied; no additional approval rule was needed.
- **Related:** APR-064 (corrections did not carry through to the next action); APR-066 (confusing requested work with proposals).
- **Remediation:** Changed both PowerShell and zsh defaults to `short`, preserving explicit overrides. Syntax and default/override checks passed. Existing Pi processes must be relaunched with the updated environment. No instruction changes.
