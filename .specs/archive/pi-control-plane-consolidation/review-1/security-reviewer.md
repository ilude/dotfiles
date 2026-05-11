- severity: HIGH
  evidence: T3 allows `pi/multi-team/agents/` to be "archived/documented as non-source runtime history" instead of removed, while runtime discovery is changed in the same wave. If stale agent definitions remain under a discoverable path, Pi may still load older tool permissions or prompts despite docs saying `pi/agents/` is canonical.
  required_fix: Add an executable discovery test that enumerates actual runtime-loaded agent files and fails if any active definition is loaded from `pi/multi-team/agents/`; require quarantine outside discovery paths or deletion after backup.

- severity: HIGH
  evidence: T5 removes direct read/bash/edit/write tools from lead/orchestrator agents and removes subagent from workers, but no rollback path is specified. A bad config change can lock users out of repair workflows or force broad manual edits outside Pi.
  required_fix: Define a minimal emergency/admin agent or documented recovery command with narrow permissions, and add a config validation step that rejects an agent set with no authorized path for maintenance/rollback.

- severity: MEDIUM
  evidence: F3 says to move the plan and ensure old active `.specs/pi-agent-team-cleanup`, `.specs/pi-branch-tab`, and `.specs/pi-tasks-control-plane` directories no longer remain. This can delete unresolved evidence or review artifacts if implemented as a broad remove/move operation.
  required_fix: Require an archive manifest listing every moved/deleted path, preserve review/evidence artifacts, and prohibit directory deletion unless `git status --short` plus manifest review proves no untracked or unrelated files are inside.

- severity: MEDIUM
  evidence: T9 checks synthetic sentinel strings only and requires no raw sentinels in JSON/evidence logs. That does not cover realistic secret shapes entering branch argv, task metadata, slash-command output, or archived evidence.
  required_fix: Add denylist tests for representative token/private-key formats using fake values, and require evidence pre-archive scanning for high-entropy strings and PEM/key headers, with documented false-positive handling.

- severity: MEDIUM
  evidence: T7 requires failed writes not report success, but there is no requirement for atomic writes, backup, or corruption recovery for task persistence. Interruptions during task update/clear/archive can corrupt the registry and lose task state.
  required_fix: Require write-through temp file plus atomic rename, a recoverable backup or journal for destructive lifecycle operations, and tests simulating partial/corrupt writes before reporting persistence success.
