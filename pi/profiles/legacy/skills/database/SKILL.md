---
name: database
description: SQL, schemas, migrations, ORMs, query optimization, indexing, transactions, EXPLAIN, PostgreSQL, MySQL, SQLite, DynamoDB, or Redis.
---

# Database Workflow

## References

Load only what the request needs:

- [SQL workflow](sql.md)
- [Migrations](migration-patterns.md)
- [ORM patterns](orm-patterns.md)
- [Query optimization](sql-optimization.md)

## Design

- Start from required data relationships, integrity rules, access patterns, and transaction boundaries.
- Enforce shared invariants with keys, constraints, and transactions when the database serializes competing writes; do not rely on application-level check-then-write logic.
- Normalize by default. Denormalize only for a measured read problem with a clear update owner.
- Use stable natural keys only when they are genuinely immutable; otherwise use surrogate keys.
- Choose `RESTRICT`, `CASCADE`, or `SET NULL` deliberately for each relationship.
- Choose a datastore for demonstrated access patterns, not presumed future scale.
- For trees, start with adjacency lists. Use closure tables only when measured traversal needs justify them.

## Performance

- Measure with query plans, query logs, and production-shaped data before adding indexes, caches, replicas, sharding, CQRS, or denormalized read models.
- Index measured filter, join, and ordering paths. Account for write cost and storage.
- Bound queries that can return large result sets.
- Use transactions for related writes and production statement timeouts where blocked queries could cascade.
- Fix N+1 access with batching or eager loading after confirming the query pattern.

## Data handling

- Store timestamps with time-zone semantics and define who updates audit fields.
- Soft deletes require a consistent read filter and, when measured, an index supporting it.
- Audit logs need the actor, entity, action, timestamp, and retention-appropriate before/after data.
- Store password hashes, never plaintext passwords.
- Keep schema, application types, and identifier representations consistent.
