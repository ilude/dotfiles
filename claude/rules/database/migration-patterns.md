# Migration Patterns

Database migration strategies for version control, rollback, and idempotent operations.

## Version Control for Schema Changes

**Treat migrations as code:**
- Store in version control alongside application code
- Timestamp or sequential numbering (001, 002, 003...)
- Atomic, single-responsibility changes
- Document WHY in migration files, not just WHAT

**Naming convention:**
```
migrations/
├── 001_create_users_table.sql
├── 002_add_email_index.sql
├── 003_create_orders_table.sql
└── 004_add_user_fk_to_orders.sql
```

## Up/Down Migrations

**Every migration must be reversible:**

```sql
-- UP: Create table
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DOWN: Remove table
-- (Use appropriate reversal command for your database)
```

**Complex reversals require care:**
```sql
-- UP: Add constraint
ALTER TABLE orders ADD CONSTRAINT fk_user
    FOREIGN KEY (user_id) REFERENCES users(id);

-- DOWN: Remove constraint (PostgreSQL)
ALTER TABLE orders DROP CONSTRAINT fk_user;
```

## Idempotent Migrations

**Migrations must be safely re-runnable:**

```sql
-- Good: Idempotent (safe to run multiple times)
CREATE TABLE IF NOT EXISTS users (...);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Bad: Fails if run twice
CREATE TABLE users (...);
CREATE INDEX idx_users_email ON users(email);
```

## Rollback Strategies

**Two approaches:**

1. **Down migrations (reversible):**
   - Run DOWN SQL to undo changes
   - Works if migration is reversible
   - Better for critical systems

2. **Snapshot migrations (not reversible):**
   - Never roll back; always migrate forward
   - Create new migration to fix issues
   - Simpler, safer in practice
   - Better for high-availability systems

**Best practice:** Design migrations to be reversible when possible, but plan for forward-only rollbacks in production.

## Migration Naming Conventions

**Use descriptive, action-oriented names:**

```
Good:
- 001_create_users_table
- 002_add_email_unique_constraint
- 003_create_index_users_email
- 004_rename_column_user_id_to_author_id
- 005_add_soft_delete_columns

Bad:
- 001_update
- 002_fix
- 003_schema_change
- 004_v2
```

**Include timestamp + sequence:**
```
2024_11_17_001_create_users_table.sql
2024_11_17_002_add_email_index.sql
```

## Testing Migrations

**Problem:** Migration fails in production, downtime
**Fix:** Test migrations on production-like data before deploying

## Schema Changes Without Backward Compatibility

**Problem:** Old application code breaks with new schema
**Fix:** Support both old and new columns temporarily, add deprecation period
