---
reviewer: security-reviewer
status: complete
---

# Findings

- severity: high
  evidence: "Constraints: real Brave profile exposes logged-in sessions to any local process attached to the CDP port; T3/Success Criteria use fixed `--remote-debugging-port=9222`/CDP connect."
  required_fix: "Do not use a fixed CDP port by default. Allocate an ephemeral localhost-only port, record it in owned state, verify the listening process command line/user-data-dir before connecting, and require explicit override for fixed ports."

- severity: high
  evidence: "Archive rule requires evidence for wrapper smoke/docs/repo validation; Manual validation says snapshot includes logged-in UI; guidance requires screenshots for visual evidence."
  required_fix: "Add an evidence handling gate: never archive real-profile screenshots/snapshots/raw page text unless explicitly approved, redact account names/tokens/cookies/URLs with auth parameters, and store only minimal command/status evidence for authenticated sessions."

- severity: medium
  evidence: "T3 cleanup relies on 'owned PID/session state' and says cleanup affects only owned session, but no PID reuse or process identity validation is specified."
  required_fix: "Require cleanup to validate PID start time, executable path, CDP port, and user-data-dir/session marker before termination; if validation fails, refuse to kill and print manual cleanup instructions."

- severity: medium
  evidence: "Preflight and validation use `npx -y agent-browser --version`; install fallback mentions `pnpm add -g agent-browser` without pinning."
  required_fix: "Pin the expected `agent-browser` version or version range in install/validation docs, prefer the installed binary for repeated checks, and document update procedure instead of executing latest transient packages by default."

- severity: medium
  evidence: "Handoff Notes include absolute local Brave profile paths and display name `Work`; archive rule requires evidence paths for install/wrapper/docs validation."
  required_fix: "Add redaction requirements for user paths, profile display names, and account identifiers in plan archives/review artifacts; use placeholders in docs and scrub generated evidence before archive."
