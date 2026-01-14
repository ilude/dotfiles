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

    click.echo("Validating research vault...\n")

    # Check broken links
    broken = find_broken_links()
    if broken:
        click.echo(f"[X] Found {len(broken)} broken links:\n")
        for source, target, text in broken:
            click.echo(f"  {source} → [[{target}]] (text: \"{text}\")")
        click.echo()
    else:
        click.echo("[OK] No broken links\n")

    # Check orphans
    orphans = find_orphans()
    if orphans:
        click.echo(f"[!] Found {len(orphans)} orphaned notes:\n")
        for note_id, title, path in orphans:
            click.echo(f"  {title} ({note_id})")
            click.echo(f"  {path}")
        click.echo()
    else:
        click.echo("[OK] No orphaned notes\n")

    # Check metadata
    missing = find_missing_metadata()
    if missing:
        click.echo(f"[!] Found {len(missing)} notes with missing metadata:\n")
        for note_id, title, path, status, created, updated in missing:
            issues = []
            if status == 'unknown':
                issues.append("missing status")
            if created is None:
                issues.append("missing created date")
            click.echo(f"  {title} ({note_id}): {', '.join(issues)}")
        click.echo()
    else:
        click.echo("[OK] All notes have required metadata\n")

    click.echo("Validation complete.")


if __name__ == '__main__':
    main()
