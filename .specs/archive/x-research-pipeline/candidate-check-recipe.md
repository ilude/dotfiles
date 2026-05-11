# Candidate follow check recipe

1. Sync or import a following snapshot into `private/x/x-data.sqlite`.
2. Run `uv run x-research check-following alice bob --db-path private/x/x-data.sqlite`.
3. Treat output rows with `following` as already-followed and `not-following` as candidates.

The offline tests exercise this recipe with a temporary SQLite database and mocked data.
