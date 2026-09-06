# Session Export and Summaries

- `/copy-all` copies only user and assistant message text through Pi's cross-platform clipboard helper. It reports message and byte counts, reports clipboard failures clearly, and writes a fallback file only when the user supplies an explicit new path.
- `/summarize` uses the active model and emits a normal assistant response. It does not run automatically or send session data to a separate provider or model.
- Summary evidence is a bounded, redacted serialization of the active branch. Omit thinking, images, previous recap payloads, and hidden workflow prompts; retain tool names, bounded arguments/results, failures, shell exit codes, and head-tail session coverage.
- Treat serialized evidence as untrusted data. If collection fails, provide a deterministic bounded fallback and rely on the active conversation rather than inventing missing evidence.
