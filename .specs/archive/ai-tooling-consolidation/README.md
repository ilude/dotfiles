# AI Dev Tooling Consolidation

Working notes for consolidating ideas scattered across `.specs/`, the research
Obsidian vault, the onclave repo, Pi runtime docs, and personal project repos
into one consistent view of the future of the AI dev tooling and workflow
stack. Goal: a durable reference so future improvement discussions do not
rehash prior decisions and parked ideas.

## Layout

| File | Corpus |
| --- | --- |
| `notes-specs-active.md` | Active `.specs/` plans and PRDs |
| `notes-specs-archive.md` | Archived specs, improvement reports, research specs |
| `notes-obsidian-vault.md` | `docs/research/obsidian-vault/` |
| `notes-onclave.md` | Onclave repo curated markdown |
| `notes-pi-runtime.md` | Pi runtime current state (docs, extensions, skills) |
| `notes-personal-repos.md` | `/c/projects/Personal` repo survey |
| `future-view.md` | Consolidated synthesis (written last) |

All notes are written by GPT subagents. Each note records: inventory reviewed,
ideas found with source paths, status classification (implemented, in
progress, parked, superseded, abandoned), recurring themes, contradictions,
explicit future-direction statements, and open questions.

## Authority convention

- Research and unpromoted ideas live in the Obsidian vault; approved bounded work lives in active `.specs/`; completed, superseded, or dormant plans move to `.specs/archive/` with a disposition note.
- Implementation truth lives in the owning repository's README and status docs, never in specs or research notes.
- Cross-system decisions and direction live in `future-view.md` (section 6 is the decision queue and ledger).
- The `notes-*.md` files here are dated evidence snapshots, not current truth; regenerate rather than edit them.
