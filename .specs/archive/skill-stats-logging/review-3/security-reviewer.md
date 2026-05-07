# security_review

## finding_1

- severity: high
- evidence: The plan scans `$HOME/.pi/agent/sessions/**/*.jsonl` and counts explicit `/skill:<name>` prompts, expanded `<skill name="...">` blocks, custom entries, and `SKILL.md` reads. It requires redacted discovery summaries, but implementation tasks T3/T5 do not require tests proving raw user prompts, expanded skill bodies, tool outputs, emails, or absolute home paths are never retained in in-memory evidence objects, report rows, thrown errors, or fixture snapshots.
- required_fix: Define a sanitized internal evidence type that excludes raw JSONL lines/content by construction. Add tests with prompt text, expanded skill content, email, token-like strings, and private paths asserting parser results, report Markdown, diagnostics, and evidence files contain only allowed labels/counts/hashes.

## finding_2

- severity: high
- evidence: T4 trusts `event.systemPromptOptions.skills` as the forward-logging source and persists `pi.appendEntry("skill-load", data)`. The plan says allowed metadata only, but does not require schema validation against actual hook object shape before append. If the hook exposes raw path/baseDir/content/description/user command fields, a shallow spread or permissive mapper would persist private skill content into durable session logs.
- required_fix: Require an allowlist-only payload builder with runtime validation before `appendEntry`: `schemaVersion`, normalized `skill`, controlled `source`, generated `timestamp`, optional safe ids, optional safe `skillPathLabel`. Add a negative test proving unknown keys from the hook are dropped and append is skipped for invalid skill names/sources.

## finding_3

- severity: medium
- evidence: The redaction scan is regex-only over `.specs/.../evidence`, `pi/extensions`, `pi/lib`, and `pi/tests`. It can miss multiline secrets, JWTs, GitHub tokens, Windows backslash paths, UNC paths, encoded content, and private data written outside those paths. It also matches after evidence has already been created, so unsafe capture can persist in git-untracked artifacts until manually noticed.
- required_fix: Add pre-write redaction helpers for all discovery/manual/smoke outputs and fail closed on forbidden fields before writing artifacts. Expand scans to changed files plus all `.specs/skill-stats-logging/**`, include Windows backslash/UNC paths and common token formats, and require deletion/regeneration of tainted artifacts, not just documentation.

## finding_4

- severity: high
- evidence: The plan permits read-only inspection of `pi/extensions/node_modules/@mariozechner/pi-coding-agent` and checks only `git diff --name-only | grep node_modules`. Edits under ignored `node_modules` can persist locally without appearing in git diff, changing runtime behavior and bypassing review/rollback. This directly conflicts with the stated durable implementation requirement.
- required_fix: Add a pre/post filesystem manifest or checksum for inspected `node_modules` paths and a final `git status --ignored --short --untracked-files=all -- pi/extensions/node_modules`/targeted timestamp check. Require abort and reinstall/restore if any `node_modules` file metadata/content changes.

## finding_5

- severity: medium
- evidence: Rollback says restore/remove only listed files after user confirmation and preserve evidence/review artifacts unless listed. If evidence artifacts accidentally contain raw session data or secrets, this preservation rule conflicts with privacy cleanup. Rollback also depends on `owned-files.txt`, but that manifest is created before discovered helper/test paths are known and may omit later files.
- required_fix: Separate code rollback from privacy incident cleanup. Require immediate deletion/regeneration of tainted evidence without waiting for normal rollback approval, and update `owned-files.txt` whenever new paths are added. Add rollback verification that no untracked generated files, ignored runtime files, or tainted artifacts remain outside the current manifest.
