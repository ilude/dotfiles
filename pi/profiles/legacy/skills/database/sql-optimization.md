# SQL Optimization

Optimize measured queries, not hypothetical workload.

## Investigation

1. Capture the slow query and representative parameters.
2. Run `EXPLAIN ANALYZE` against realistic data.
3. Identify the costly node, row-estimate error, scan, join, sort, or lock wait.
4. Change one query or index factor, then measure again.

## Index Usage

- A B-tree index supports equality, range, and ordered access according to column order. Design composite indexes from the actual predicates and sort order.
- Functions on indexed columns and leading-wildcard searches can prevent normal index use. Use a matching expression index, full-text search, or a different data model only after measurement.
- Partial indexes suit stable, selective predicates such as active rows. Unique indexes also enforce a constraint.
- Monitor usage and write cost. Remove an unused index only after confirming it has no constraint role or rare critical workload.

## Query Shape

- Select needed columns rather than `SELECT *`, especially when rows contain large values.
- Use `EXISTS` for existence checks and batch related reads instead of issuing one query per parent.
- Bound results and use deterministic ordering.
- Prefer keyset or cursor pagination for deep or changing result sets; offset pagination is acceptable for small, stable sets.

## Operations

- Use a connection pool sized for database capacity and observed concurrency; a new connection per query creates avoidable overhead.
- Set statement and connection-acquisition timeouts appropriate to the request budget.
- Keep transactions short, and avoid user or network waits while locks are held.
- Refresh statistics and maintain storage according to the database engine's operational guidance.

## Common Failure Modes

| Symptom | Investigate first |
|---------|-------------------|
| Sequential scan | Table size, predicate selectivity, and index suitability |
| Expensive sort | Required ordering and composite index order |
| Slow join | Join cardinality, indexes, and stale statistics |
| Deep-page latency | Keyset pagination and stable sort key |
| Pool exhaustion | Connection leaks, transaction duration, and pool limits |
