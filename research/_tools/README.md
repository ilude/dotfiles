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
