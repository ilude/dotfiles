"""SQLite schema management for the local X research database."""

from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA_VERSION = 1

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations(version integer primary key, applied_at text not null);
CREATE TABLE IF NOT EXISTS profiles(
  id text primary key,
  handle text unique not null,
  name text,
  bio text,
  url text,
  followers_count integer,
  following_count integer,
  raw_json text,
  updated_at text not null
);
CREATE TABLE IF NOT EXISTS tweets(
  id text primary key,
  author_id text references profiles(id),
  text text not null,
  created_at text,
  raw_json text,
  updated_at text not null
);
CREATE TABLE IF NOT EXISTS follow_edges(
  observer_id text not null references profiles(id),
  subject_id text not null references profiles(id),
  direction text not null check(direction in ('followers','following')),
  is_active integer not null check(is_active in (0,1)),
  first_seen_at text not null,
  last_seen_at text not null,
  updated_at text not null,
  primary key(observer_id, subject_id, direction)
);
CREATE TABLE IF NOT EXISTS follow_snapshots(
  id text primary key,
  observer_id text not null references profiles(id),
  direction text not null check(direction in ('followers','following')),
  provider text not null,
  complete integer not null check(complete in (0,1)),
  item_count integer not null,
  page_count integer not null default 0,
  next_cursor text,
  created_at text not null
);
CREATE TABLE IF NOT EXISTS follow_events(
  id text primary key,
  observer_id text not null,
  subject_id text not null,
  direction text not null,
  event text not null check(event in ('started','ended')),
  event_at text not null,
  snapshot_id text references follow_snapshots(id),
  unique(observer_id, subject_id, direction, event, snapshot_id)
);
CREATE TABLE IF NOT EXISTS sync_runs(
  id text primary key,
  provider text not null,
  operation text not null,
  status text not null,
  started_at text not null,
  finished_at text,
  error text
);
CREATE INDEX IF NOT EXISTS idx_follow_edges_observer
  ON follow_edges(observer_id, direction, is_active);
CREATE INDEX IF NOT EXISTS idx_follow_edges_subject
  ON follow_edges(subject_id, direction, is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_handle ON profiles(handle);
CREATE INDEX IF NOT EXISTS idx_tweets_author_created ON tweets(author_id, created_at);
"""


def connect(db_path: Path) -> sqlite3.Connection:
    """Open and initialize the SQLite database."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    initialize(conn)
    return conn


def initialize(conn: sqlite3.Connection) -> None:
    """Apply idempotent schema migration."""
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, datetime('now'))",
        (SCHEMA_VERSION,),
    )
    conn.commit()
