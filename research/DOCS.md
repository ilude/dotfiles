# Research Vault Documentation

Complete guide to the research vault system.

## Table of Contents

- [What is the Research Vault?](#what-is-the-research-vault)
- [Quick Start](#quick-start)
- [Daily Usage](#daily-usage)
- [Architecture](#architecture)
- [Adding Research](#adding-research)
- [Searching](#searching)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)
- [Future Enhancements](#future-enhancements)

---

## What is the Research Vault?

A structured knowledge base for technical research, designed like an Obsidian vault but with custom tooling for fast discovery.

**Key features:**
- **Structured metadata** - YAML frontmatter for machine-readable notes
- **Wikilinks** - `[[note-id]]` for explicit relationships
- **Fast search** - SQLite index (sub-second queries)
- **Quality checks** - Validator catches broken links, orphans
- **Portable** - Plain markdown + git, works anywhere

**Philosophy:** Start simple (MVP), grow organically, no gold-plating.

---

## Quick Start

### Initial Setup

```bash
cd research

# Install dependencies
uv pip install python-frontmatter click

# Build index
uv run python _tools/indexer.py --rebuild
```

### Basic Usage

```bash
# Search by keyword
uv run python _tools/search.py "autoskill"

# Search by tag
uv run python _tools/search.py hooks --tag

# Find backlinks
uv run python _tools/search.py context-maintenance-plan --backlinks

# Validate vault
uv run python _tools/validator.py
```

---

## Daily Usage

### When You Add/Edit Research

1. **Write the note** (use template from `_templates/research-note.md`)
2. **Add frontmatter** with id, title, tags, related notes
3. **Add wikilinks** to connect to other notes: `[[other-note-id]]`
4. **Rebuild index**: `uv run python _tools/indexer.py --rebuild`
5. **Validate**: `uv run python _tools/validator.py` (optional but recommended)

### When You Need Information

**Option 1: Search by keyword**
```bash
uv run python _tools/search.py "learning from corrections"
```

**Option 2: Search by tag**
```bash
uv run python _tools/search.py implementation --tag
```

**Option 3: Find related notes**
```bash
uv run python _tools/search.py note-id --backlinks
```

**Option 4: Browse directly**
- Navigate `research/` by topic folders
- Read `README.md` for overview
- Follow wikilinks `[[like-this]]` between notes

---

## Architecture

### Directory Structure

```
research/
├── README.md                    # Vault entry point
├── DOCS.md                      # This file
├── .gitignore                   # Excludes .research/ cache
├── pyproject.toml              # Tool dependencies
│
├── {topic}/                     # Research areas (e.g., self-improving-systems/)
│   ├── .meta.yml               # Topic metadata
│   ├── note1.md                # Research notes
│   └── note2.md
│
├── _tools/                      # CLI tooling
│   ├── indexer.py              # Parse notes → SQLite
│   ├── search.py               # Query index
│   └── validator.py            # Quality checks
│
├── _templates/                  # Note templates
│   └── research-note.md        # Standard format
│
└── .research/                   # Cache (gitignored)
    ├── index.db                # SQLite index
    └── cache/                  # Cached computations
```

### How It Works

**1. Notes have structured metadata:**
```yaml
---
id: unique-note-id
title: Human Readable Title
created: 2026-01-14
updated: 2026-01-14
status: active
tags: [tag1, tag2, tag3]
related:
  - other-note-id
aliases: [nickname, alternative-name]
---

# Note Content
```

**2. Indexer extracts metadata:**
- Parses YAML frontmatter
- Extracts wikilinks `[[note-id]]`
- Stores in SQLite for fast queries

**3. Search queries the index:**
```sql
-- Keyword search
SELECT * FROM notes WHERE title LIKE '%keyword%';

-- Tag search
SELECT * FROM notes n
JOIN tags t ON n.id = t.note_id
WHERE t.tag = 'implementation';

-- Backlinks
SELECT * FROM notes n
JOIN links l ON n.id = l.source_id
WHERE l.target_id = 'target-note';
```

**4. Validator ensures quality:**
- Broken links: `[[target]]` where target doesn't exist
- Orphans: Notes with no incoming/outgoing links
- Missing metadata: Notes without required fields

### Data Model

**SQLite schema:**
```sql
notes (id, title, path, status, created, updated, content_preview)
links (source_id, target_id, link_text)
tags (note_id, tag)
```

**Why SQLite?**
- Fast: Queries in <100ms
- Simple: No server to run
- Portable: Single .db file
- Upgradeable: Can add more tables later

---

## Adding Research

### From Template

```bash
# 1. Copy template
cp _templates/research-note.md self-improving-systems/my-new-research.md

# 2. Edit frontmatter
---
id: my-new-research
title: My New Research
created: 2026-01-14
updated: 2026-01-14
status: draft
tags: [relevant, tags]
related:
  - existing-note-id
---

# 3. Write content with wikilinks
See [[existing-note-id]] for background.

# 4. Rebuild index
uv run python _tools/indexer.py --rebuild
```

### Frontmatter Guidelines

**Required fields:**
- `id` - Unique identifier (used in wikilinks, kebab-case recommended)
- `title` - Human-readable name
- `created` - When note was created (YYYY-MM-DD)
- `updated` - Last modification date (YYYY-MM-DD)

**Recommended fields:**
- `status` - draft | active | archived
- `tags` - List of categorization tags
- `related` - List of related note IDs
- `aliases` - Alternative names for flexible linking

**Status meanings:**
- `draft` - Work in progress, incomplete
- `active` - Current, maintained research
- `archived` - Kept for reference, no longer active

### Wikilink Syntax

**Basic link:**
```markdown
[[note-id]]
```

**Link with custom text:**
```markdown
[[note-id|display text]]
```

**Multiple links:**
```markdown
See [[overview]] for context and [[plan]] for implementation.
```

**Best practices:**
- Use note `id` in links (not title, since titles can change)
- Link liberally - connections are valuable
- Use `related` frontmatter for primary relationships

---

## Searching

### Keyword Search

Search in title and content preview:
```bash
uv run python _tools/search.py "learning from corrections"
```

**Matches:**
- Title contains "learning" or "corrections"
- Content preview (first 200 chars) contains phrase

**Sorted by:** Most recently updated first

### Tag Search

Find all notes with a tag:
```bash
uv run python _tools/search.py hooks --tag
```

**Returns:** All notes tagged with "hooks"

**Use when:** You know the category but not specific note

### Backlink Search

Find notes linking to a note:
```bash
uv run python _tools/search.py context-maintenance-plan --backlinks
```

**Returns:** All notes with `[[context-maintenance-plan]]` wikilinks

**Use when:** You want to see what references a note

### Limitations (MVP)

**What works:**
- Exact keyword match
- Single tag search
- Direct backlinks

**What doesn't (yet):**
- Boolean operators (AND, OR, NOT)
- Multiple tag search
- Semantic search (find by meaning)
- Fuzzy matching

See [Future Enhancements](#future-enhancements) for roadmap.

---

## Maintenance

### After Editing Notes

Always rebuild the index:
```bash
uv run python _tools/indexer.py --rebuild
```

**Why:** Changes to frontmatter, tags, or wikilinks need re-parsing.

**How long:** <5 seconds for 100 notes

### Regular Validation

Run weekly or before commits:
```bash
uv run python _tools/validator.py
```

**Checks:**
- Broken links (target note doesn't exist)
- Orphaned notes (no connections)
- Missing metadata (required fields empty)

**Fix broken links:**
1. Find the note with broken link
2. Either create the missing target note
3. Or change the link to existing note
4. Rebuild index

**Fix orphans:**
1. Add wikilinks to/from orphaned note
2. Or add to `related` in frontmatter
3. Or document why it's intentionally standalone
4. Rebuild index

### Cleaning Up

**Remove old notes:**
1. Move to `archived/` subfolder (optional)
2. Update status to `archived` in frontmatter
3. Rebuild index

**Rename notes:**
1. Change filename
2. Update `id` in all notes that link to it
3. Rebuild index

**Reorganize:**
1. Move notes between topic folders
2. Update paths in docs if referenced
3. Rebuild index (paths auto-update)

---

## Troubleshooting

### Index Not Found

**Error:** "Index not found. Run: python _tools/indexer.py --rebuild"

**Fix:**
```bash
cd research
uv run python _tools/indexer.py --rebuild
```

### Module Not Found

**Error:** "ModuleNotFoundError: No module named 'frontmatter'"

**Fix:**
```bash
cd research
uv pip install python-frontmatter click
```

### Emoji Encoding Errors

**Error:** "UnicodeEncodeError: 'charmap' codec can't encode character"

**Fix:** Already fixed in tools (removed emojis). Update to latest version.

### Search Returns No Results

**Possible causes:**
1. Index not built: Run `uv run python _tools/indexer.py --rebuild`
2. Searching wrong term: Try tag search instead
3. Note doesn't have that keyword in title/preview (first 200 chars)

**Debug:**
```bash
# Check what's in the index
sqlite3 .research/index.db "SELECT id, title FROM notes;"
```

### Backlinks Don't Work

**Cause:** No wikilinks in notes

**Fix:**
1. Add `[[target-note-id]]` to notes
2. Rebuild index
3. Search again

### Validator Shows Orphans

**Not always a problem:** New notes start as orphans until linked.

**Fix if needed:**
1. Add wikilinks connecting to other notes
2. Or add to `related` in frontmatter
3. Or document why standalone (e.g., index pages)

---

## Future Enhancements

These are deliberately excluded from MVP. Add when pain points emerge.

### Phase 2: Semantic Search (When >20 Notes)

**What:** Find by meaning, not just keywords
```bash
uv run python _tools/search.py "systems that learn from user corrections" --semantic
```

**How:** ChromaDB for vector embeddings

**When:** Keyword search misses too often

### Phase 3: MCP Server (When Claude Needs Research)

**What:** Expose tools to Claude via Model Context Protocol
```json
{
  "tools": [
    "research_search",
    "research_backlinks",
    "research_related"
  ]
}
```

**How:** MCP server wrapping existing tools

**When:** Research becomes primary knowledge source for Claude

### Phase 4: Graph Visualization (When >50 Notes)

**What:** Interactive knowledge graph
- Nodes = notes (sized by backlink count)
- Edges = wikilinks
- Colors = status or topic

**How:** Plotly or PyVis

**When:** Browsing by folders becomes hard

### Phase 5: Auto-Maintenance (When Mature)

**What:**
- Auto-suggest tags based on content
- Auto-suggest links to related notes
- Detect duplicate research (similar content)
- Watch mode (auto-rebuild on file save)

**How:** NLP + file watchers

**When:** Manual maintenance becomes burdensome

---

## See Also

- **Design Context**: `claude/ideas/research-vault/DISCUSSION.md` - Why decisions were made
- **Implementation Plan**: `claude/ideas/research-vault/PLAN.md` - Step-by-step migration
- **Tool Docs**: `_tools/README.md` - Detailed tool usage
- **Template**: `_templates/research-note.md` - Note format

---

**Questions or issues?** Check [Troubleshooting](#troubleshooting) or create a note in `research/meta/` documenting the problem.
