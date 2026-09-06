# SQL Workflow

SQL conventions, safety, and operational rules.

## Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Lint | SQLFluff | `sqlfluff lint` |
| Format | SQLFluff | `sqlfluff fix` |
| Analyze | Database | `EXPLAIN ANALYZE` |

## Conventions

- Use `snake_case`, descriptive names, plural table names, and `{table_singular}_id` foreign keys.
- Prefer `TEXT` unless a length limit is a business rule, `TIMESTAMP WITH TIME ZONE` for temporal data, `NUMERIC` for money, native `UUID` when available, and `JSONB` for PostgreSQL JSON queries.
- Keep keywords uppercase, identifiers lowercase, clauses on separate lines, and aliases meaningful. Use `AS` for column aliases.
- Name indexes `idx_{table}_{column(s)}`; name constraints `fk_{table}_{column}`, `chk_{table}_{description}`, and `uq_{table}_{column(s)}`.

## Migrations

- Name migrations `YYYYMMDD_HHMMSS_description.sql`.
- Keep each migration atomic and single-purpose. Wrap related writes in a transaction where the database and migration framework support it.
- Separate data changes from schema changes. Provide a down migration only when reversal is safe and supported by the deployment strategy.
- Make reruns safe when required by the migration tool; do not use `IF NOT EXISTS` to hide unexpected schema drift.

## Query Safety

- Parameterize values; never concatenate input into SQL.
- Use `IS NULL` and `IS NOT NULL`, never equality operators, for null checks. Use `COALESCE` and `NULLIF` only when their semantics are intended.
- Select required columns rather than `SELECT *` in production paths.
- Use an explicit ordering and bounded page size for collection queries.
- Use `EXISTS` for existence checks instead of counting rows.

## Indexes and Performance

- Read `EXPLAIN ANALYZE` before changing indexes or query shape.
- Index measured WHERE, JOIN, and ORDER BY with LIMIT paths. Composite index order must match the query predicates and ordering.
- Avoid duplicate indexes, indexes on low-cardinality columns without evidence, and unused indexes on write-heavy tables.
- Investigate sequential scans, join strategy, sorting, row estimates, and the slowest plan node before optimizing.

## Transactions

- Use a transaction for related writes that must succeed or fail together.
- Keep transactions short and select isolation levels for demonstrated consistency requirements.
- Set statement timeouts in production so a slow query cannot indefinitely hold resources.

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| `= NULL` comparison | Use `IS NULL` |
| `SELECT *` in production | Select explicit columns |
| Guessing query performance | Use `EXPLAIN ANALYZE` |
| Unbounded collection query | Add deterministic ordering and a limit |
| Missing transaction for related writes | Use one short transaction |
