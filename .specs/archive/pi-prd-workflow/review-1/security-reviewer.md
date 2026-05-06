# Security Review Findings

## Finding 1
severity: MEDIUM
evidence: Plan requires automatic slug generation and writing `.specs/{auto-slug}/PRD.md`, but defines no slug sanitization, collision handling, path-boundary check, or symlink check before creating paths.
required_fix: Specify slug rules: lowercase safe characters only, reject `..`, separators, drive prefixes, control characters, and reserved names; write only under repo `.specs/`; handle existing directories explicitly; do not follow symlinked target directories.

## Finding 2
severity: MEDIUM
evidence: PRD workflow may capture fuzzy product ideas, requirements, risks, and handoff notes, but plan has no redaction/classification guidance before writing durable repo artifacts under `.specs/`.
required_fix: Add instruction to avoid secrets, credentials, customer data, proprietary evidence, private URLs/tokens, and sensitive personal data in PRDs; summarize or redact sensitive inputs before writing; ask before persisting sensitive business content.

## Finding 3
severity: LOW
evidence: Rollback command uses `git checkout -- pi/skills/workflow/prd-it.md pi/skills/workflow/templates/prd-template.md ...`; new untracked files are not restored/removed by checkout, leaving stale workflow artifacts after rollback.
required_fix: Replace rollback with explicit tracked/untracked handling, e.g. restore tracked edits and remove newly-created PRD files only after confirming they are untracked and match the expected paths.

## Finding 4
severity: LOW
evidence: Validation relies heavily on `grep` for keywords such as `Risks` and `Plan Handoff`; this can pass even if instructions are contradictory or unsafe, including mandatory PRD behavior or unsafe path writing.
required_fix: Add semantic validation checks: review generated skill text for optional-PRD behavior, safe path creation, PRD-vs-plan branching, no latest-filesystem discovery, and redaction guidance, not just keyword presence.
