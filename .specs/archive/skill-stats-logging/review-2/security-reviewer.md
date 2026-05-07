# Security / Redaction / Rollback Review

## Findings

1. **Severity: High — Discovery can persist sensitive session content via raw grep output.**
   - **Evidence:** T1 requires targeted grep/read of `$HOME/.pi/agent/sessions` for `/skill:`, `<skill name=`, `SKILL.md`, and `customType`, then writing summaries to `discovery.txt`; the first T1 verify command also writes raw `grep -R ... -n pi` output to an evidence file. Session JSONL can contain prompts, tool outputs, paths, emails, tokens, or expanded skill content, while the redaction rule says evidence artifacts must not store raw prompts/tool outputs/expanded skill content/tokens/credentials/emails/private absolute paths.
   - **Required fix:** Replace any session-log grep redirected to evidence with a sanitizer that records only field names, event types, counts, redacted path labels, and hash/line references. Add an explicit validation step that scans `.specs/skill-stats-logging/evidence/` for raw home paths, emails, tokens, prompt text markers, and expanded `<skill>` content before archiving.

2. **Severity: High — Forward logging schema allows private local path leakage.**
   - **Evidence:** T2 allows `filePath` or repo/skill-relative path and `baseDir` or source scope in structured events. T4 requires persisted events containing `skill`, `source`, and `timestamp`, but does not require asserting that `filePath`/`baseDir` are normalized or redacted. The constraints explicitly forbid private absolute paths beyond a root label.
   - **Required fix:** Define a path redaction function and require structured events to store only `skill`, `source`, `timestamp`, optional IDs, and either a safe scope label (`user`, `project`, `repo`, `builtin`) or a repo/skill-relative path. Add fixture/manual assertions that no event contains `$HOME`, drive roots, usernames, or absolute paths.

3. **Severity: High — Rollback procedure is underspecified for generated evidence and untracked files.**
   - **Evidence:** The rollback row says restore only exact owned paths after user confirmation and remove only listed untracked files, but owned files include broad entries like `pi/lib`, `pi/tests`, and `.specs/skill-stats-logging`. This can accidentally delete review/evidence artifacts or unrelated untracked files created by other agents under the same directories.
   - **Required fix:** Require an exact file manifest before edits, not directory globs, and update it whenever a file is created. Rollback must operate only on that manifest, preserve reviewer artifacts unless explicitly included, and write `rollback.txt` with commands run and files affected.

4. **Severity: Medium — Parser/report may disclose sensitive skill names or session paths in user-visible output.**
   - **Evidence:** Success Criteria #1 requires the report to include skill rows, evidence/source labels, generated timestamp, and session path. Skill names can be custom/project-local identifiers, and session paths under `$HOME/.pi/agent/sessions` may reveal usernames or local directory structure.
   - **Required fix:** Report only normalized session root labels plus counts, not full session paths. Escape Markdown table cells for skill/source labels, cap displayed label length, and add tests for malicious or unusual skill names containing pipes, links, backticks, ANSI sequences, or path separators.

5. **Severity: Medium — Forbidden-change scan is pattern-based and can miss secret-bearing artifacts.**
   - **Evidence:** V2 checks `git diff --name-only | grep -E '(^|/)\.env|secret|credential|node_modules'`, but evidence files themselves can contain copied credentials or raw session snippets without filenames matching those terms. The plan also permits writing `implementation.diff`, `manual.txt`, and discovery evidence under `.specs/`.
   - **Required fix:** Add content-based redaction validation for all new/modified `.specs` and implementation files using patterns for common tokens, private keys, emails, Windows home paths, and expanded skill blocks. Treat matches as blockers requiring redaction or documented false-positive classification.
