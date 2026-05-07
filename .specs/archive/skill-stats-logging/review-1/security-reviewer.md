---
reviewer: security-reviewer
status: complete
---
# Findings
- severity: high
  evidence: 'Automation Plan / Preflight: `git status --short && git branch --show-current && find .specs -maxdepth 2 -name plan.md | sort`; Archive rule allows archiving after gates, but no explicit clean-working-tree or touched-file ownership gate.'
  required_fix: 'Add an archive preflight that fails if unexpected files changed, any `.env`/secret-like files changed, or existing unrelated modifications are not documented and excluded before archive.'

- severity: medium
  evidence: 'T1 acceptance criterion requires targeted grep through `~/.pi/agent/sessions` for `/skill:`, `<skill name=`, `SKILL.md`, and `customType`; reports include sessions directory and evidence caveat.'
  required_fix: 'Require redaction/summarization of session-log evidence in notes and artifacts: no raw prompts, tool outputs, file contents, absolute private paths beyond the sessions root, tokens, emails, or credentials.'

- severity: medium
  evidence: 'T4 acceptance: "Future explicit skill expansions emit one structured session-log event per loaded skill with name, file path, source, and timestamp."'
  required_fix: 'Constrain event payload to minimal metadata and normalized paths. Do not log user prompt text, expanded skill content, tool arguments, or full home-directory paths; document the exact allowed fields in the schema.'

- severity: medium
  evidence: 'Rollback says `git checkout -- pi/extensions <other touched files>`.'
  required_fix: 'Replace placeholder rollback with an exact rollback procedure generated after implementation, including every touched tracked file and how to remove any new untracked test/fixture files without deleting unrelated work.'

- severity: low
  evidence: 'Manual validation asks to run `/skill:docs test skill logging`, which intentionally writes a session event and may pollute user metrics.'
  required_fix: 'Specify a disposable/test session or fixture-only validation path for logging checks, or require the report to label validation events so they can be excluded from real usage summaries.'
