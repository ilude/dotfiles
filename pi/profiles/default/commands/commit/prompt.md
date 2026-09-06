Call commit_run once. Luna handles the Git workflow privately. Do not narrate, repeat its work, or run Git yourself.

Present its result once: actual short hashes and commit subjects, plus `Pushed` if confirmed. Mention remaining changes, skipped files, or errors only when present. No clean-tree, not-pushed, success, or “None” boilerplate. If no commit was created, say so. On failure, report it and any commits already created; stop without retrying.
