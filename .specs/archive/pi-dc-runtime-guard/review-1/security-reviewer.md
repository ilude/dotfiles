---
reviewer: security-reviewer
status: complete
finding_count: 5
---

# Findings

- severity: high
  category: "operational safety"
  confidence: high
  evidence: "Automation Plan and Rollback include `git checkout -- pi/extensions pi/tests pi/README.md pi/extensions/README.md .specs/.../plan.md`; this is destructive to uncommitted local edits in those paths and needs no manual approval despite repo rules requiring confirmation for destructive git operations."
  required_fix: "Remove rollback as an executable default or require explicit user confirmation before any checkout. Prefer `git diff`/backup instructions and targeted reverse patches for only changes made by this plan."
- severity: high
  category: "permission/blast radius"
  confidence: medium
  evidence: "T3 permits patching upstream `C:/Projects/Personal/pi-mono/packages/...` if evidence finds a core bypass, while Risk says blast radius is only `personal-local-repo` and rollback only covers dotfiles paths. Upstream edits can affect a separate repo without validation/rollback gates."
  required_fix: "Split upstream Pi core changes into a separate gated plan or add explicit manual approval, preflight status for that repo, targeted rollback, and upstream-specific tests before allowing writes outside `.dotfiles`."
- severity: medium
  category: "destructive probe safety"
  confidence: high
  evidence: "The plan says not to run destructive commands outside temp dirs, but validation relies on reviewer/executor discipline. T2 only says tests must not spawn real commands; no acceptance check asserts mocks/stubs or scans for `exec`, `spawn`, `bash`, `rm -rf` execution in tests."
  required_fix: "Add an acceptance criterion that test code uses pure handler invocation or a mocked tool executor, plus a grep/static check for child_process/spawn/exec and shell invocations in `pi/tests/damage-control.test.ts`."
- severity: medium
  category: "evidence artifact safety"
  confidence: medium
  evidence: "T1/T4 allow evidence notes under `.specs/.../evidence/*.md` copied from source/terminal output. The plan only forbids `.env`/keys, but grep over arbitrary upstream paths and terminal output could capture absolute home paths, internal repo paths, or command arguments without redaction rules."
  required_fix: "Define evidence redaction: no secrets/tokens, no private key material, minimize absolute paths where not needed, and summarize command output instead of copying bulk logs. Add archive gate to inspect evidence files for sensitive patterns before completion."
- severity: low
  category: "archive gate"
  confidence: medium
  evidence: "F5 says Archive preflight complete, but the Archive rule only requires validations pass. There is no concrete preflight command checking dirty state, untracked evidence artifacts, accidental generated files, or secret-like content before archiving."
  required_fix: "Add a specific F5 checklist: `git status --short`, inspect generated/untracked files, run a secret-pattern scan over changed files, and confirm only intended files are included before archive."
