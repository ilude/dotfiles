---
name: database
description: Database design, SQL, ORM patterns, migrations, and optimization. Activate when working with .sql files, database schemas, migrations, ORMs, query optimization, indexing, transactions, EXPLAIN plans, or discussing database patterns, PostgreSQL, MySQL, SQLite, DynamoDB, or Redis.
---

# Database Workflow

Language-agnostic guidance for schema design, migrations, ORM use, and query optimization.

## Avoid complexity theater

**Default to simplicity. Optimize only when you have measured evidence of a problem.**

- Don't add indexes "just in case"
- Don't over-normalize without understanding query patterns
- Don't implement complex caching without profiling first
- Measure before optimizing with EXPLAIN, query logs, and monitoring

### The Database Complexity Litmus Test

> "If I remove this optimization, what specific query slows down and by how much?"

If the answer is vague ("might be slow", "best practices", "scales better"), the optimization may be theater.

### Database Anti-Patterns to Avoid

| Anti-Pattern | Example | Problem |
|--------------|---------|---------|
| **Premature indexing** | "Index every foreign key" | Slows writes, may never be queried |
| **Over-normalization** | "6NF for theoretical purity" | Joins slow down reads, rarely updated |
| **Premature sharding** | "Shard for future scale" | Adds complexity before you have data |
| **Caching everything** | "Redis for all queries" | Before measuring if queries are slow |
| **CQRS theater** | "Separate read/write DBs" | For a CRUD app with 100 users |

## Reference Documentation

- [SQL Workflow](sql.md) - conventions, query safety, and transactions
- [Migration Patterns](migration-patterns.md) - versioning, rollout, and rollback
- [ORM Patterns](orm-patterns.md) - loading, transactions, and tests
- [SQL Optimization](sql-optimization.md) - EXPLAIN, indexes, and pagination

## Design Rules

- Model relationships and enforce integrity with primary keys, foreign keys, and constraints.
- Normalize by default; denormalize only for a measured read bottleneck with an ownership and refresh plan.
- Use immutable, stable natural keys only when they are genuinely suitable; otherwise prefer surrogate keys.
- Choose deletion behavior deliberately. `RESTRICT` is the safe default; use `CASCADE` only for dependent data and `SET NULL` only for optional relationships.
- Choose a datastore for a demonstrated access pattern, not presumed scale.

| Store | Choose when | Avoid when |
|-------|-------------|------------|
| Relational | Relationships, consistency, or multi-record transactions matter | A simple key lookup is the only access pattern |
| Document | Records have flexible, independently retrieved attributes | Cross-document relationships or transactions dominate |
| Key-value | Caching, sessions, rate limits, or direct key lookup dominate | Queries need joins, filtering, or multiple access paths |
| Graph | Traversals and relationship queries are the primary workload | Relationships are shallow and relational queries are sufficient |

## Common Patterns

- Soft deletes require every normal read path to exclude deleted rows and an index supporting that predicate when measured.
- Audit logs need actor, entity, action, timestamp, and before/after values appropriate to the retention policy.
- Store timestamps with time zones and define which writes own `updated_at`.
- For trees, use an adjacency list by default; adopt closure tables only when ancestor or descendant queries justify the write and storage cost.

## Common Pitfalls

| Pitfall | Problem | Fix |
|---------|---------|-----|
| **N+1 queries** | One query per item | Eager loading or batch queries |
| **Missing indexes** | Slow queries | Inspect EXPLAIN; index measured WHERE, JOIN, and ordering paths |
| **No transaction boundaries** | Inconsistent data | Wrap related writes in a transaction |
| **Unbounded queries** | Memory exhaustion | Limit and paginate |
| **Wrong cascade rules** | Data loss or orphans | Choose CASCADE, RESTRICT, or SET NULL deliberately |
| **Plain text passwords** | Security breach | Store password hashes |
| **Type mismatches** | Incorrect comparison or storage | Use appropriate numeric, temporal, and identifier types |
| **No query timeouts** | Locks and cascading failures | Set production statement timeouts |
