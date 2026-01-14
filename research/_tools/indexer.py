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
