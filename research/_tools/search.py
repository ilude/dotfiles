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
        click.echo(f"\nBacklinks to '{query}':\n")
        for r in results:
            click.echo(f"  - {r['title']} ({r['id']})")
            click.echo(f"    {r['path']}")
            click.echo(f"    Link text: \"{r['link_text']}\"\n")

    elif tag:
        results = search_tags(query)
        click.echo(f"\nNotes tagged '{query}':\n")
        for r in results:
            click.echo(f"  - {r['title']} ({r['id']}) [{r['status']}]")
            click.echo(f"    {r['path']}\n")

    else:
        results = search_keywords(query, limit)
        click.echo(f"\nSearch results for '{query}':\n")
        for r in results:
            click.echo(f"  - {r['title']} ({r['id']}) [{r['status']}]")
            click.echo(f"    {r['path']}")
            click.echo(f"    {r['content_preview'][:100]}...\n")

    if not results:
        click.echo("No results found.")


if __name__ == '__main__':
    main()
