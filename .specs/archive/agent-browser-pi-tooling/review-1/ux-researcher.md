- severity: high
  evidence: Real-profile access is described as needing an explicit flag and warning, but no exact confirmation UX/token is specified for wrapper execution.
  required_fix: Define the required confirmation flow: exact warning text, required typed confirmation (for example `I UNDERSTAND THIS CONTROLS MY REAL BRAVE PROFILE`), session-scoped approval duration, and a mandatory abort path for non-interactive agents.

- severity: high
  evidence: Cleanup allows "agent-browser close" or owned PID/session cleanup, but success/failure messaging is not specified and users may not know whether a real browser/profile remains exposed on CDP.
  required_fix: Require cleanup output to state exactly what was closed, what remains open, CDP port status, and the command to verify/close only owned sessions. Failure must say no broad browser kill was attempted.

- severity: medium
  evidence: Proposed command modes use `--profile pi`, `--profile default`, and `--real-profile`; `default` could be misread as the safe default.
  required_fix: Rename real-profile mode to an unmistakable term such as `--real-brave-profile Default --confirm-real-profile`, and reserve `--profile pi`/default behavior for the dedicated Pi profile only. Help examples must not show real-profile first.

- severity: medium
  evidence: Manual login for the dedicated Pi profile is required, but the plan does not specify user-facing steps or expected signs that the login is isolated from daily Brave.
  required_fix: Add a manual-login quick start with exact profile path/name, visible browser title/profile indicator if available, expected success signal, and instructions to never paste secrets into chat or commit profile/auth files.

- severity: medium
  evidence: Status/help acceptance criteria require safety warnings, but not structured failure messages for missing Brave, port collision, existing CDP listener, or Chrome accidentally selected.
  required_fix: Require wrapper errors to identify the failing condition, chosen executable/profile/user-data-dir/port, next safe action, and whether any process was started. Add tests or examples for these failure states.
