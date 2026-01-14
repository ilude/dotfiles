# Research Vault Migration & Tooling - Implementation Plan

**Created**: 2026-01-14
**Goal**: Migrate research/ to structured vault with basic tooling for discovery
**Approach**: MVP - essential structure + simple indexer, no gold-plating

---

## Current State

```
research/
└── self-improving-skills.md          # 463 lines, comprehensive

claude/ideas/context-maintenance/
└── PLAN.md                           # 1,320 lines, detailed implementation
```

**Problem**: Flat structure doesn't scale, no discovery tools, manual grep required

---

## Target State (MVP)

```
research/
├── README.md                         # Map of Content (MOC)
├── .gitignore                        # Ignore .research/ cache
│
├── self-improving-systems/           # Topic area
│   ├── overview.md                   # Renamed from self-improving-skills.md
│   ├── context-maintenance-plan.md   # Moved from ideas/
│   └── .meta.yml                     # Topic metadata
│
├── _tools/                           # Tooling scripts
│   ├── README.md                     # Tool usage
│   ├── indexer.py                    # Build/update index
│   ├── search.py                     # Search CLI
│   └── validator.py                  # Check links/orphans
│
├── _templates/                       # Note templates
│   └── research-note.md              # Standard template
│
├── .research/                        # Tooling cache (gitignored)
│   ├── index.db                      # SQLite metadata
│   └── cache/
│       ├── links.json                # Link graph
│       └── tags.json                 # Tag index
│
└── pyproject.toml                    # Tool dependencies
```

**MVP Scope**: Structure + indexing + search. NO embeddings, NO graph viz, NO MCP (yet).

---

## Phase 1: Migration (2-3 hours)

### Step 1.1: Create Structure
```bash
# From repo root
mkdir -p research/{self-improving-systems,_tools,_templates,.research/cache}
```

### Step 1.2: Move Existing Files
```bash
# Move research file
mv research/self-improving-skills.md research/self-improving-systems/overview.md

# Move context maintenance plan
mv claude/ideas/context-maintenance/PLAN.md research/self-improving-systems/context-maintenance-plan.md
```

### Step 1.3: Add Frontmatter to Existing Notes

**Edit `research/self-improving-systems/overview.md`** - Add to top:
```yaml
---
id: self-improving-systems-overview
title: Self-Improving Systems Overview
created: 2026-01-14
updated: 2026-01-14
status: active
tags: [meta-learning, skills, hooks, implementation, autoskill]
related:
  - context-maintenance-plan
aliases: [autoskill-research, self-learning]
---
```

**Edit `research/self-improving-systems/context-maintenance-plan.md`** - Add to top:
```yaml
---
id: context-maintenance-plan
title: Context Maintenance System - Implementation Plan
created: 2025-01-24
updated: 2026-01-14
status: active
tags: [hooks, git-automation, status-md, claude-md, implementation]
related:
  - self-improving-systems-overview
aliases: [context-maintenance, memory-system]
---
```

### Step 1.4: Create Supporting Files

**File: `research/README.md`**
```markdown
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
```

**File: `research/_templates/research-note.md`**
```markdown
---
id: topic-name
title: Research Title
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: draft
tags: []
related: []
aliases: []
---

# Research Title

## Quick Summary
**What**:
**Why**:
**When**:

## Core Concepts

## Implementation Guide

## Sources

### Academic
- [Paper](https://example.com) - Key insight

### Practical
- [Article](https://example.com) - Implementation details
```

**File: `research/.gitignore`**
```
.research/
*.pyc
__pycache__/
.pytest_cache/
```

**File: `research/pyproject.toml`**
```toml
[project]
name = "research-vault-tools"
version = "0.1.0"
dependencies = [
    "python-frontmatter>=1.0.0",
    "click>=8.0",
]

[project.scripts]
research-index = "research._tools.indexer:main"
research-search = "research._tools.search:main"
research-validate = "research._tools.validator:main"
```

**File: `research/self-improving-systems/.meta.yml`**
```yaml
topic: self-improving-systems
description: Research on AI systems that learn from corrections and behavior
keywords: [meta-learning, autoskill, context-maintenance, hooks, skills]
notes:
  - overview.md
  - context-maintenance-plan.md
```

---

## Phase 2: Basic Tooling (3-4 hours)

### Step 2.1: Indexer (Core Foundation)

**File: `research/_tools/indexer.py`**

```python
#!/usr/bin/env python
"""
Indexer for research vault.
Parses markdown files with YAML frontmatter, extracts links and tags.
Builds SQLite index for fast queries.
"""

import frontmatter
import re
import sqlite3
from pathlib import Path
from datetime import datetime
import click

VAULT_ROOT = Path(__file__).parent.parent
DB_PATH = VAULT_ROOT / ".research/index.db"


def init_db():
    """Create index database schema."""
    conn = sqlite3.connect(DB_PATH)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT,
            path TEXT,
            status TEXT,
            created DATE,
            updated DATE,
            content_preview TEXT
        );

        CREATE TABLE IF NOT EXISTS links (
            source_id TEXT,
            target_id TEXT,
            link_text TEXT,
            PRIMARY KEY (source_id, target_id)
        );

        CREATE TABLE IF NOT EXISTS tags (
            note_id TEXT,
            tag TEXT,
            PRIMARY KEY (note_id, tag)
        );

        CREATE INDEX IF NOT EXISTS idx_tags ON tags(tag);
        CREATE INDEX IF NOT EXISTS idx_status ON notes(status);
    """)
    conn.commit()
    conn.close()


def extract_wikilinks(content: str) -> list[dict]:
    """Extract [[wikilinks]] from content."""
    pattern = r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]'
    matches = re.findall(pattern, content)

    links = []
    for target, text in matches:
        links.append({
            'target': target.strip(),
            'text': text.strip() if text else target.strip()
        })
    return links


def index_note(note_path: Path, conn: sqlite3.Connection):
    """Parse note and add to index."""
    try:
        with open(note_path, encoding='utf-8') as f:
            post = frontmatter.load(f)
    except Exception as e:
        print(f"Error parsing {note_path}: {e}")
        return

    # Extract metadata
    note_id = post.get('id', note_path.stem)
    title = post.get('title', note_path.stem)
    status = post.get('status', 'unknown')
    created = post.get('created', None)
    updated = post.get('updated', None)
    tags = post.get('tags', [])

    # Content preview (first 200 chars)
    preview = post.content[:200].replace('\n', ' ')

    # Relative path from vault root
    rel_path = note_path.relative_to(VAULT_ROOT)

    # Insert/update note
    conn.execute("""
        INSERT OR REPLACE INTO notes (id, title, path, status, created, updated, content_preview)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (note_id, title, str(rel_path), status, created, updated, preview))

    # Delete old tags/links for this note
    conn.execute("DELETE FROM tags WHERE note_id = ?", (note_id,))
    conn.execute("DELETE FROM links WHERE source_id = ?", (note_id,))

    # Insert tags
    for tag in tags:
        conn.execute("INSERT OR IGNORE INTO tags (note_id, tag) VALUES (?, ?)", (note_id, tag))

    # Extract and insert links
    links = extract_wikilinks(post.content)
    for link in links:
        conn.execute("""
            INSERT OR IGNORE INTO links (source_id, target_id, link_text)
            VALUES (?, ?, ?)
        """, (note_id, link['target'], link['text']))

    print(f"Indexed: {note_id} ({len(tags)} tags, {len(links)} links)")


def build_index():
    """Build index from all markdown files in vault."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    init_db()

    conn = sqlite3.connect(DB_PATH)

    # Find all .md files (exclude templates and tools)
    md_files = []
    for pattern in ["**/*.md"]:
        for md_file in VAULT_ROOT.glob(pattern):
            # Skip templates, tools, and README
            if any(p in md_file.parts for p in ['_templates', '_tools', 'README.md']):
                continue
            md_files.append(md_file)

    print(f"Found {len(md_files)} notes to index")

    for md_file in md_files:
        index_note(md_file, conn)

    conn.commit()
    conn.close()

    print(f"\nIndex built: {DB_PATH}")
    print(f"Total notes: {len(md_files)}")


@click.command()
@click.option('--rebuild', is_flag=True, help='Rebuild entire index')
def main(rebuild):
    """Research vault indexer."""
    if rebuild:
        print("Rebuilding index...")
        build_index()
    else:
        print("Use --rebuild to build index")


if __name__ == '__main__':
    main()
```

### Step 2.2: Search Tool

**File: `research/_tools/search.py`**

```python
#!/usr/bin/env python
"""
Search tool for research vault.
Queries SQLite index for fast keyword/tag search.
"""

import sqlite3
from pathlib import Path
import click

VAULT_ROOT = Path(__file__).parent.parent
DB_PATH = VAULT_ROOT / ".research/index.db"


def search_keywords(query: str, limit: int = 10):
    """Search notes by keyword in title/preview."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    results = conn.execute("""
        SELECT id, title, path, status, content_preview
        FROM notes
        WHERE title LIKE ? OR content_preview LIKE ?
        ORDER BY updated DESC
        LIMIT ?
    """, (f'%{query}%', f'%{query}%', limit)).fetchall()

    conn.close()
    return results


def search_tags(tag: str):
    """Search notes by tag."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    results = conn.execute("""
        SELECT n.id, n.title, n.path, n.status
        FROM notes n
        JOIN tags t ON n.id = t.note_id
        WHERE t.tag = ?
        ORDER BY n.updated DESC
    """, (tag,)).fetchall()

    conn.close()
    return results


def get_backlinks(note_id: str):
    """Find notes that link to this note."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    results = conn.execute("""
        SELECT n.id, n.title, n.path, l.link_text
        FROM notes n
        JOIN links l ON n.id = l.source_id
        WHERE l.target_id = ?
        ORDER BY n.title
    """, (note_id,)).fetchall()

    conn.close()
    return results


@click.command()
@click.argument('query')
@click.option('--tag', is_flag=True, help='Search by tag instead of keyword')
@click.option('--backlinks', is_flag=True, help='Find backlinks to note ID')
@click.option('--limit', default=10, help='Max results')
def main(query, tag, backlinks, limit):
    """Search research vault."""
    if not DB_PATH.exists():
        click.echo("Index not found. Run: python _tools/indexer.py --rebuild")
        return

    if backlinks:
        results = get_backlinks(query)
        click.echo(f"\n📎 Backlinks to '{query}':\n")
        for r in results:
            click.echo(f"  - {r['title']} ({r['id']})")
            click.echo(f"    {r['path']}")
            click.echo(f"    Link text: \"{r['link_text']}\"\n")

    elif tag:
        results = search_tags(query)
        click.echo(f"\n🏷️  Notes tagged '{query}':\n")
        for r in results:
            click.echo(f"  - {r['title']} ({r['id']}) [{r['status']}]")
            click.echo(f"    {r['path']}\n")

    else:
        results = search_keywords(query, limit)
        click.echo(f"\n🔍 Search results for '{query}':\n")
        for r in results:
            click.echo(f"  - {r['title']} ({r['id']}) [{r['status']}]")
            click.echo(f"    {r['path']}")
            click.echo(f"    {r['content_preview'][:100]}...\n")

    if not results:
        click.echo("No results found.")


if __name__ == '__main__':
    main()
```

### Step 2.3: Validator

**File: `research/_tools/validator.py`**

```python
#!/usr/bin/env python
"""
Validator for research vault.
Checks for broken links, orphaned notes, missing metadata.
"""

import sqlite3
from pathlib import Path
import click

VAULT_ROOT = Path(__file__).parent.parent
DB_PATH = VAULT_ROOT / ".research/index.db"


def find_broken_links():
    """Find links pointing to non-existent notes."""
    conn = sqlite3.connect(DB_PATH)

    results = conn.execute("""
        SELECT l.source_id, l.target_id, l.link_text
        FROM links l
        LEFT JOIN notes n ON l.target_id = n.id
        WHERE n.id IS NULL
        ORDER BY l.source_id
    """).fetchall()

    conn.close()
    return results


def find_orphans():
    """Find notes with no incoming or outgoing links."""
    conn = sqlite3.connect(DB_PATH)

    results = conn.execute("""
        SELECT id, title, path
        FROM notes
        WHERE id NOT IN (
            SELECT DISTINCT source_id FROM links
            UNION
            SELECT DISTINCT target_id FROM links
        )
        ORDER BY title
    """).fetchall()

    conn.close()
    return results


def find_missing_metadata():
    """Find notes missing required metadata."""
    conn = sqlite3.connect(DB_PATH)

    results = conn.execute("""
        SELECT id, title, path, status, created, updated
        FROM notes
        WHERE status = 'unknown' OR created IS NULL
        ORDER BY title
    """).fetchall()

    conn.close()
    return results


@click.command()
def main():
    """Validate research vault."""
    if not DB_PATH.exists():
        click.echo("Index not found. Run: python _tools/indexer.py --rebuild")
        return

    click.echo("🔍 Validating research vault...\n")

    # Check broken links
    broken = find_broken_links()
    if broken:
        click.echo(f"❌ Found {len(broken)} broken links:\n")
        for source, target, text in broken:
            click.echo(f"  {source} → [[{target}]] (text: \"{text}\")")
        click.echo()
    else:
        click.echo("✅ No broken links\n")

    # Check orphans
    orphans = find_orphans()
    if orphans:
        click.echo(f"⚠️  Found {len(orphans)} orphaned notes:\n")
        for note_id, title, path in orphans:
            click.echo(f"  {title} ({note_id})")
            click.echo(f"  {path}")
        click.echo()
    else:
        click.echo("✅ No orphaned notes\n")

    # Check metadata
    missing = find_missing_metadata()
    if missing:
        click.echo(f"⚠️  Found {len(missing)} notes with missing metadata:\n")
        for note_id, title, path, status, created, updated in missing:
            issues = []
            if status == 'unknown':
                issues.append("missing status")
            if created is None:
                issues.append("missing created date")
            click.echo(f"  {title} ({note_id}): {', '.join(issues)}")
        click.echo()
    else:
        click.echo("✅ All notes have required metadata\n")

    click.echo("Validation complete.")


if __name__ == '__main__':
    main()
```

### Step 2.4: Tool README

**File: `research/_tools/README.md`**

```markdown
# Research Vault Tools

Simple CLI tools for managing the research vault.

## Setup

```bash
cd research
uv venv
uv pip install -e .
```

## Usage

### Build Index

After adding/editing notes, rebuild the index:

```bash
python _tools/indexer.py --rebuild
```

This parses all markdown files, extracts frontmatter, links, and tags into SQLite.

### Search

**By keyword:**
```bash
python _tools/search.py "autoskill"
python _tools/search.py "hooks implementation"
```

**By tag:**
```bash
python _tools/search.py hooks --tag
```

**Find backlinks:**
```bash
python _tools/search.py context-maintenance-plan --backlinks
```

### Validate

Check for broken links, orphans, missing metadata:

```bash
python _tools/validator.py
```

## Index Format

The index is stored in `.research/index.db` (SQLite):

**Tables:**
- `notes` - Note metadata (id, title, path, status, dates)
- `links` - Wikilink relationships (source → target)
- `tags` - Note tags for categorization

**Queries:**
- Keyword search: Match title/content preview
- Tag search: Find by tag
- Backlinks: Find notes linking to a note
- Orphans: Notes with no links
- Broken links: Links to non-existent notes
```

---

## Phase 3: Documentation (1 hour)

### Step 3.1: Capture Discussion Context

**File: `claude/ideas/research-vault/DISCUSSION.md`**
```markdown
# Research Vault Design - Discussion Context

**Date**: 2026-01-14
**Participants**: User, Claude (Sonnet 4.5)
**Topic**: Structuring research/ directory as Obsidian-style vault with tooling

---

## Problem Statement

Current research structure is flat and doesn't scale:
- `research/self-improving-skills.md` - Single file becoming too large
- `claude/ideas/context-maintenance/PLAN.md` - Related but in different location
- No discovery mechanism beyond manual grep
- No link tracking or relationship awareness

---

## Solution: Research Vault Architecture

### Key Design Decisions

**1. Treat research/ like an Obsidian vault**
- Topic-based folders (e.g., `self-improving-systems/`)
- Wikilinks for cross-references: `[[note-id]]`
- YAML frontmatter for structured metadata
- Templates for consistency

**2. Build tooling for discovery**
- SQLite index for fast queries (not grep)
- Link graph tracking (backlinks, orphans)
- Tag-based organization
- Validation (broken links, missing metadata)

**3. Design for future growth**
- Vector embeddings (semantic search) - Phase 2
- MCP server (Claude integration) - Phase 3
- Graph visualization - Phase 4
- But start with MVP: indexing + search + validation

### Why This Structure Supports Tooling

**YAML Frontmatter = Machine-Readable Metadata**
```yaml
---
id: unique-note-id
title: Human Readable Title
tags: [tag1, tag2]
related: [other-note-id]
---
```

Enables:
- Parse metadata without reading full file
- Build index of relationships
- Query by tag, status, date
- Auto-suggest related notes

**SQLite Index = Fast Queries**
Instead of:
```bash
grep -r "autoskill" research/  # Slow, reads every file
```

Use:
```sql
SELECT * FROM notes WHERE title LIKE '%autoskill%';  # <1ms
```

**Wikilinks = Explicit Relationships**
- `[[context-maintenance-plan]]` → Parsed into links table
- Enables backlink queries: "What references this note?"
- Detects orphans: Notes with no connections
- Validates: Catch broken links

### MVP Scope

**Include (Phase 1):**
- Basic structure (topic folders, templates)
- Indexer (parse notes → SQLite)
- Search (keyword, tag, backlinks)
- Validator (broken links, orphans)

**Exclude (Future):**
- Vector embeddings / semantic search
- Graph visualization
- MCP server integration
- Auto-tagging / auto-linking
- Watch mode (file system observer)

Rationale: Get foundation working first, add advanced features when needed.

---

## Implementation Decisions

### File Organization

**Topic folders over flat structure:**
```
research/
├── self-improving-systems/
│   ├── overview.md
│   └── context-maintenance-plan.md
```

Better than:
```
research/
├── self-improving-systems.md
├── context-maintenance.md
```

Why: Related notes stay together, easier to navigate, scales to 100+ notes.

**Hidden _tools/ and .research/ directories:**
- `_tools/` - Scripts (underscore = not research content)
- `.research/` - Cache (gitignored, regenerated)

**Templates in _templates/:**
- Standard frontmatter format
- Consistent structure across notes
- Easy to copy for new research

### Metadata Schema

**Required fields:**
- `id` - Unique identifier (used in wikilinks)
- `title` - Human-readable name
- `created` - When note was created
- `updated` - Last modification date

**Optional but recommended:**
- `status` - draft | active | archived
- `tags` - Categorization
- `related` - Explicit relationships
- `aliases` - Alternative names for linking

**Why these fields:**
- `id` - Stable reference even if title changes
- `dates` - Track freshness, sort by recency
- `status` - Filter active research vs archived
- `tags` - Multi-dimensional categorization
- `related` - Explicit relationships (vs inferred from content)

### Tooling Approach

**Python + SQLite (not custom DB/vector store initially)**

Why:
- Simple: No external services to run
- Fast: SQLite is built-in, efficient for 1000s of notes
- Portable: Single .db file, works anywhere
- Incrementally upgradable: Can add ChromaDB later for embeddings

**CLI tools (not web UI initially)**

Why:
- Faster to build
- Works in terminal workflow
- Can be wrapped in MCP server later
- No complexity of web stack

**Explicit re-index (not automatic watch initially)**

Why:
- Simpler implementation
- Avoids file watcher complexity
- User controls when index updates
- Can add `--watch` mode later

---

## Future Enhancements (Deliberately Excluded from MVP)

### Phase 2: Semantic Search
- Add ChromaDB for vector embeddings
- `research_semantic("systems that learn from git commits")`
- Find by meaning, not just keywords

### Phase 3: MCP Server
- Expose tools to Claude via MCP
- `research_search`, `research_backlinks`, `research_related`
- Claude can query vault without manual grep

### Phase 4: Graph Visualization
- Generate interactive knowledge graph
- See clusters of related research
- Identify knowledge gaps (sparse areas)

### Phase 5: Auto-Maintenance
- Auto-suggest tags based on content
- Auto-suggest links to related notes
- Detect duplicate research (similar content)

---

## Key Quotes from Discussion

**On discovery:**
> "does this structure support us adding tooling via python scripts and services in the future that would possibly help you to discover links and retrieval info without needing to search/grep every document"

**On scaling:**
> "I'm thinking that research/ directory ends up like an obsidian vault over time"

**On approach:**
> "Do not gold plate things... this is an mvp."

---

## Success Criteria

**After Phase 1 (MVP), we should have:**
1. Structured vault with topic folders
2. All existing research migrated with frontmatter
3. Working indexer that parses notes → SQLite
4. Search tool that queries index in <1ms
5. Validator that catches broken links/orphans
6. Documentation for adding new research

**Metrics:**
- Index build time: <5 seconds for 10 notes
- Search response time: <100ms
- Zero broken links after validation
- Zero orphans (or explicitly documented why)

---

## Related Research

This vault structure complements:
- `self-improving-systems/overview.md` - Autoskill learning from corrections
- `self-improving-systems/context-maintenance-plan.md` - Git-based pattern extraction

Both systems benefit from structured knowledge storage:
- Autoskill learns patterns → Store in research vault
- Context maintenance extracts conventions → Add to vault
- Tools help discover existing knowledge → Prevent duplication
```

### Step 3.2: Update Main README

Add section to `research/README.md`:

```markdown
## Design Decisions

See `claude/ideas/research-vault/DISCUSSION.md` for full context on why this structure was chosen and how it's designed to grow.

**Key principles:**
- Structured metadata (YAML frontmatter)
- Wikilinks for relationships
- SQLite index for fast queries
- Validation for quality
- MVP first, enhance later
```

---

## Testing & Validation (30 mins)

### Step 4.1: Test Migration

```bash
# 1. Run indexer
cd research
python _tools/indexer.py --rebuild

# Expected: "Found 2 notes to index"
# Expected: "Indexed: self-improving-systems-overview"
# Expected: "Indexed: context-maintenance-plan"

# 2. Test search by keyword
python _tools/search.py "autoskill"
# Expected: Returns overview note

# 3. Test search by tag
python _tools/search.py hooks --tag
# Expected: Returns both notes

# 4. Test backlinks
python _tools/search.py context-maintenance-plan --backlinks
# Expected: Returns overview (it links to plan)

# 5. Test validator
python _tools/validator.py
# Expected: No broken links, possibly orphans (depends on wikilinks added)
```

### Step 4.2: Validation Checklist

- [ ] Both notes have frontmatter with all required fields
- [ ] Both notes have `id` that matches their wikilink references
- [ ] Index database created at `.research/index.db`
- [ ] Search finds notes by keyword
- [ ] Search finds notes by tag
- [ ] Backlinks work (overview → plan link detected)
- [ ] Validator runs without errors
- [ ] README.md has clear usage instructions
- [ ] Templates available in `_templates/`

---

## Cleanup (15 mins)

### Step 5.1: Update References

**File: `claude/ideas/context-maintenance/README.md`** (new)
```markdown
# Context Maintenance System

**NOTE**: This plan has been migrated to the research vault:

📍 **New location**: `research/self-improving-systems/context-maintenance-plan.md`

See research vault README for tooling: `research/README.md`
```

### Step 5.2: Update Git

```bash
# Add new structure
git add research/

# Stage moved files (if git doesn't auto-detect)
git add claude/ideas/context-maintenance/README.md

# Commit
git commit -m "feat: migrate research to structured vault with tooling

- Move self-improving-skills.md → self-improving-systems/overview.md
- Move context-maintenance PLAN.md → research vault
- Add YAML frontmatter to existing notes
- Implement indexer, search, validator tools
- Add templates and documentation
- Structure designed for future tooling (embeddings, MCP, graph viz)"
```

---

## Summary

**Time estimate**: 6-8 hours total
- Phase 1 (Migration): 2-3 hours
- Phase 2 (Tooling): 3-4 hours
- Phase 3 (Docs): 1 hour
- Testing: 30 mins
- Cleanup: 15 mins

**Deliverables**:
1. Structured research vault with topic folders
2. Migrated existing research with frontmatter
3. Working indexer (SQLite)
4. Search CLI (keyword, tag, backlinks)
5. Validator (broken links, orphans)
6. Templates for new research
7. Documentation capturing design decisions

**Next steps after MVP**:
- Add more research areas as needed
- Run validator weekly
- Rebuild index after editing notes
- Phase 2: Add semantic search when >20 notes
- Phase 3: MCP server when needed for Claude integration

---

**Status**: Ready to implement
**Blocker**: None
**Risk**: Low (simple migrations, proven tools)
