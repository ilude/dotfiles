# Context separation options

Read this only when process discussion is starting to displace the task. Offer choices; do not branch, interrupt work, or deliver a handoff automatically.

## Start a focused instance

`/new-instance [title]` opens a fresh Pi tab with the same profile and cwd but no conversation handoff. Give the operator a short handoff they can approve or edit: source session or evidence references, the concrete issue, established facts versus hypotheses, and the authorization boundary. Do not copy the full discussion by default.

`/branch [title]` opens an independent child containing the current active path. Parent and child use separate session files and record reciprocal visible branch metadata outside model context. It preserves the discussion rather than removing it. Focused automated and loader checks passed; live two-tab behavior has not been tested.

## Return to context before a digression

Native `/fork` selects an earlier user message, switches the current Pi process to a new session whose context ends before that message, and restores the selected text to the editor unsent. Replace that text with the task continuation rather than resubmitting the digression. Forking from before a compaction also avoids a summary that already contains the digression.

Native `/tree` stays in the same session file. Selecting a pre-digression checkpoint with **No summary** excludes the later branch from active context while preserving it in stored history. A generated summary can carry the unwanted discussion back into context. `/clone` copies the current active path into a new session, so it does not remove a digression.

## Resume saved work

`pp --session <session-id-or-path>` opens an existing saved session. Use `pp -p <profile> --session ...` when the profile differs from default. In Herdr, `herdr_layout` with `{"action":"resume","session":"<UUID>"}` opens and focuses that saved session; it resumes rather than forks.

These operations change conversation history, not files, commits, deployments, schedules, or current instructions. A resumed task needs a brief update about material external changes since its checkpoint. TUI picker/editor and new-tab appearance were source-inspected or covered by focused checks where noted, not exercised live during the original investigation.
