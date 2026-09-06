# Instruction and Path Context

- Authority: `AGENTS.md`, more-specific nested instruction files, and loaded skills provide durable operating instructions. Runtime expertise records are not an instruction source.
- Discovery: for each accessed target, discover instructions from the target repository root through its ancestor directories in root-to-target order.
- Precedence: within one directory, `AGENTS.override.md` replaces `AGENTS.md`. Pi-native `CLAUDE.md` fallback context is removed; do not deliver it as a second instruction authority.
- Activation: successful `read`, `grep`, `find`, and `ls` results may activate path context. Failed access does not establish that scope.
- Mutation deferral: before `edit`, `write`, `text_edit`, or `structured_edit` targets an unseen scope, defer that call once and deliver the newly applicable instructions. Retry only after applying them.
- Cross-repository work: discover the target repository's chain rather than reusing the session repository's instructions.
- Delivery: inject hidden, bounded context; deduplicate files and identical content, omit already delivered native context, and replace stale target context rather than accumulating copies.
- Invalidation: direct input, cwd changes, session start, reload, and changed instruction content invalidate the applicable transient state. Fresh extension instances must reconstruct it.
- Scope: discovering instructions changes operating context, not filesystem authority. Tool policy and governed path boundaries remain independent.
