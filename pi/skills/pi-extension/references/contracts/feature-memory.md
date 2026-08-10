# Feature Memory

- Registry: `pi/feature-memory.json` is the single tracked registry for curated feature definitions. Host-specific registries are not supported.
- Event ownership: runtime observations remain untracked. Each writer appends only to `events.<writer-id>.jsonl` in the configured feature-memory directory.
- Writer identity: `PI_FEATURE_MEMORY_WRITER_ID` supplies a stable writer ID; otherwise use the sanitized hostname.
- Retrieval: scan the configured directory for writer shards and the legacy `events.jsonl`, merge deterministically by recording time, deduplicate by event ID, and retain the existing bounded read and context limits.
- Synchronization: private directory synchronization is supported through separate writer shards. Do not store runtime event shards in the tracked dotfiles repository or a public Git worktree.
