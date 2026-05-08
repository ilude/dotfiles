---
reviewer: devops-pro-runtime-rollout
status: complete
---

# Findings

- severity: high
  evidence: "Automation Plan only says runtime copies/symlinks may exist and manual validation says restart Pi; no required command records whether `~/.pi/agent/extensions/damage-control.ts` and new `damage-control-*.ts` modules resolve to repo files or stale runtime copies."
  required_fix: "Add a preflight/final gate that prints and archives `realpath pi/extensions/damage-control.ts ~/.pi/agent/extensions/damage-control.ts` plus each new module, compares checksums when not symlinked, and copies/installs runtime files or fails before live smoke."

- severity: high
  evidence: "T2 adds sibling modules and T3 may add the `yaml` package, but Manual validation only restarts Pi and probes behavior; it does not verify runtime module resolution or dependency availability from `~/.pi/agent/extensions`."
  required_fix: "Add a runtime import smoke after restart, e.g. `pi` session status/log check or minimal extension load evidence showing no `ERR_MODULE_NOT_FOUND` for `damage-control-*` or `yaml`, before running safety probes."

- severity: medium
  evidence: "Manual validation step 2 uses `cat .env >/dev/null`; if runtime pickup fails, the command executes successfully and may read a real secret file despite redirection."
  required_fix: "Replace the first live probe with a harmless sentinel path/rule or a temporary test-only deny rule, and only run `.env` probes after extension identity/version is confirmed loaded and blocking commands."

- severity: medium
  evidence: "Rollback says `git restore -- pi/extensions pi/tests pi/damage-control-rules.yaml pi/README.md`; it omits runtime files under `~/.pi/agent/extensions/` when they are copies rather than symlinks."
  required_fix: "Extend rollback to restore/remove any runtime-copied `damage-control*.ts`, rerun the dotfiles/Pi install or sync step, restart Pi, and verify the previous runtime module checksum/version is active."

- severity: low
  evidence: "V1 mentions inspecting/removing `.pi/damage-control-debug.log` or `~/.pi/agent/damage-control-debug.log`, but Final Gates do not require a generated-artifact sweep for nested test logs or accidental tracked additions."
  required_fix: "Add a final cleanup gate using `git status --short` plus `find . ~/.pi/agent -name '*damage-control-debug.log*' -print` and require removal or explicit non-git evidence archival before completion."
