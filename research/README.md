# Research Vault

Knowledge base for Claude Code optimization, self-improving AI systems, and meta-learning.

## Research Areas

### Self-Improving Systems
- **[[self-improving-systems/overview]]** - Comparison of approaches (ACE, Voyager, SAGE, autoskill)
- **[[self-improving-systems/context-maintenance-plan]]** - Implementation roadmap for context automation

## How to Use

### Search
```bash
python _tools/search.py "autoskill hooks"
```

### Validate
```bash
python _tools/validator.py
```

### Re-index (after editing notes)
```bash
python _tools/indexer.py --rebuild
```

## Adding New Research

1. Copy `_templates/research-note.md`
2. Fill in frontmatter (id, title, tags)
3. Write content
4. Run `python _tools/indexer.py --rebuild`

## Design Decisions

See `claude/ideas/research-vault/DISCUSSION.md` for full context on why this structure was chosen and how it's designed to grow.

**Key principles:**
- Structured metadata (YAML frontmatter)
- Wikilinks for relationships
- SQLite index for fast queries
- Validation for quality
- MVP first, enhance later
