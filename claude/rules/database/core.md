---
paths:
  - "**/*.sql"
  - "**/migrations/**/*"
  - "**/alembic/**/*"
  - "**/prisma/**/*"
  - "schema.prisma"
  - "knexfile.*"
  - "drizzle.config.*"
---

# Database Workflow

Language-agnostic guidelines for database design, migrations, schema management, ORM patterns, and query optimization.

## CRITICAL: Avoid Complexity Theater

**Default to simplicity. Optimize only when you have measured evidence of a problem.**

- Don't add indexes "just in case"
- Don't over-normalize without understanding query patterns
- Don't implement complex caching without profiling first
- Measure before optimizing (EXPLAIN, query logs, monitoring)

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

Detailed patterns and examples are available in the reference docs:

- **SQL Workflow** - @~/.claude/rules/database/sql.md
- **Migration Patterns** - @~/.claude/rules/database/migration-patterns.md
- **ORM Patterns** - @~/.claude/rules/database/orm-patterns.md
- **SQL Optimization** - @~/.claude/rules/database/sql-optimization.md

## Quick Reference Tables

### Schema Design Principles

| Principle | When to Apply | Example |
|-----------|---------------|---------|
| **1NF** | Always | No repeating groups, atomic values |
| **2NF** | Usually | No partial dependencies on composite keys |
| **3NF** | Usually | No transitive dependencies |
| **Denormalize** | When measured | Read-heavy, proven join bottleneck |

### Index Types

| Type | Use Case | Example |
|------|----------|---------|
| **Single-column** | Simple WHERE/JOIN | \`CREATE INDEX idx_email ON users(email)\` |
| **Composite** | Multi-column queries | \`CREATE INDEX idx_user_date ON orders(user_id, created_at)\` |
| **Partial** | Subset of rows | \`WHERE deleted_at IS NULL\` |
| **Unique** | Enforce constraint | \`CREATE UNIQUE INDEX ...\` |

### Primary Key Choices

| Type | When to Use | Example |
|------|-------------|---------|
| **Surrogate (BIGSERIAL)** | Default choice | Auto-incrementing ID |
| **Natural** | Immutable, short, stable | Country codes (CHAR(2)) |
| **Composite** | Junction tables | (user_id, role_id) |

### Foreign Key Actions

| Action | Behavior | When to Use |
|--------|----------|-------------|
| **RESTRICT** | Prevent parent deletion | Default, safest |
| **CASCADE** | Delete children with parent | Dependent data |
| **SET NULL** | Nullify reference | Optional relationships |

## Schema Design Principles

### Normalization (1NF, 2NF, 3NF)

**First Normal Form (1NF):**
- Eliminate repeating groups
- All columns contain atomic (non-divisible) values
- Each row is unique

**Second Normal Form (2NF):**
- Meets 1NF
- Remove partial dependencies (non-key columns depend on ALL of primary key)

**Third Normal Form (3NF):**
- Meets 2NF
- Remove transitive dependencies (non-key columns don't depend on other non-key columns)

### Denormalization (When and Why)

**Denormalize when:**
- Query patterns are read-heavy (much more than writes)
- Measurement shows join performance is a bottleneck
- Reporting queries need fast access to aggregated data
- Cache invalidation is simpler than join performance

**Common denormalization patterns:**
1. Stored aggregates (e.g., order_count on user)
2. Purposeful redundancy (e.g., user_email on order for reporting)
3. Pre-computed views (materialized views for dashboards)

### Primary Keys

**Use surrogate keys (auto-incrementing ID) by default.**

Natural keys only if column(s) are:
- Guaranteed immutable
- Never reassigned or repurposed
- Short and stable

### Foreign Keys and Constraints

**Always define foreign key relationships:**

\`\`\`sql
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount > 0)
);
\`\`\`

**Use constraints to enforce data integrity at database level:**
- NOT NULL, UNIQUE, CHECK constraints
- Foreign key references with explicit ON DELETE behavior

## SQL vs NoSQL Considerations

### When to Use SQL (ACID, Relations)

**Use SQL when:**
- Data has strong relationships (orders -> users -> addresses)
- Consistency is critical (financial transactions, inventory)
- Need complex queries with JOINs
- Data is structured and schema is stable
- Multi-record transactions (ACID guarantees)

### When to Use NoSQL (Scale, Flexibility)

**Use NoSQL when:**
- Data is unstructured or semi-structured
- Schema evolves rapidly (different object shapes)
- Horizontal scaling is priority (sharding)
- High write throughput needed
- Document-oriented data (JSON-like)

| Type | Good For | Examples |
|------|----------|----------|
| **Document DB** | Flexible attributes, profiles | MongoDB, Firebase |
| **Key-Value** | Caching, sessions, rate limiting | Redis, Memcached |
| **Graph DB** | Social networks, recommendations | Neo4j |

## Common Patterns

### Soft Deletes

\`\`\`sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL;

-- Soft delete
UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = 123;

-- Query only active records
SELECT * FROM users WHERE deleted_at IS NULL;
\`\`\`

### Audit Logs

\`\`\`sql
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(100),
    entity_id BIGINT,
    action VARCHAR(20), -- CREATE, UPDATE, DELETE
    old_values JSONB,
    new_values JSONB,
    changed_by BIGINT REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
\`\`\`

### Timestamps (Created/Updated)

\`\`\`sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
\`\`\`

### Hierarchical Data (Trees)

**Option 1: Adjacency List** - Simple, slow to query ancestors
**Option 2: Closure Table** - Trade space for query speed

## Common Pitfalls

| Pitfall | Problem | Fix |
|---------|---------|-----|
| **N+1 Queries** | One query per item | Eager loading, batch queries |
| **Missing Indexes** | Slow queries | EXPLAIN, add WHERE/JOIN indexes |
| **No Transaction Boundaries** | Inconsistent data | Wrap multi-step ops in transactions |
| **Over-Normalization** | Too many JOINs | Denormalize strategically |
| **Unbounded Queries** | Memory exhaustion | Always LIMIT and paginate |
| **Wrong Cascade Rules** | Data loss/orphans | Choose CASCADE/RESTRICT/SET NULL deliberately |
| **Plain Text Passwords** | Security breach | Store bcrypt hashes |
| **Type Mismatches** | VARCHAR for numbers | Use correct types (INTEGER, DECIMAL) |
| **No Query Timeouts** | DB locks, cascading failures | Set statement timeouts in production |

---

**See project-specific database configuration in \`.claude/CLAUDE.md\` if present.**
