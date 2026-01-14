# SQL Optimization

Query optimization techniques, indexing strategies, and EXPLAIN analysis.

## Index Usage

**Write queries that use indexes:**

\`\`\`sql
-- Uses index on email
SELECT * FROM users WHERE email = 'john@example.com';

-- Uses index on user_id, created_at
SELECT * FROM orders
WHERE user_id = 123 AND created_at > '2024-01-01'
ORDER BY created_at DESC;

-- Can't use index (function on column)
SELECT * FROM users WHERE LOWER(email) = 'john@example.com';
-- Fix: CREATE INDEX idx_users_email_lower ON users(LOWER(email));

-- Can't use index (leading wildcard)
SELECT * FROM users WHERE email LIKE '%@example.com';
-- Fix: Use full-text search or store domain separately

-- Can use index (trailing wildcard)
SELECT * FROM users WHERE email LIKE 'john%';
\`\`\`

## Query Analysis (EXPLAIN)

**Always analyze slow queries before optimizing:**

\`\`\`sql
-- PostgreSQL
EXPLAIN ANALYZE
SELECT * FROM orders o
JOIN users u ON o.user_id = u.id
WHERE u.email = 'john@example.com'
ORDER BY o.created_at DESC
LIMIT 10;

-- MySQL
EXPLAIN
SELECT * FROM orders o
JOIN users u ON o.user_id = u.id
WHERE u.email = 'john@example.com'
ORDER BY o.created_at DESC
LIMIT 10;
\`\`\`

**Look for:**
- Seq Scan (full table scan) - add index?
- Hash Join (expensive) - add index on join column
- Sort (expensive) - add index with correct sort order
- High execution time - which step is slow?

## Avoiding SELECT *

**Fetch only columns you need:**

\`\`\`sql
-- Fetches all columns (slower, more bandwidth)
SELECT * FROM orders WHERE user_id = 123;

-- Fetch only needed columns
SELECT id, user_id, total_amount, created_at
FROM orders
WHERE user_id = 123;

-- Reduces memory/bandwidth especially for large text columns
SELECT id, user_id, total_amount
FROM orders
WHERE user_id = 123;
\`\`\`

## Indexing Strategies

**Index only when needed. Measure first.**

\`\`\`sql
-- Create index for frequently searched columns
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- Avoid: Index on every column
-- Avoid: Index on low-cardinality columns (boolean flags)
-- Avoid: Duplicate indexes
\`\`\`

**Index types:**

1. **Single-column index (most common):**
\`\`\`sql
CREATE INDEX idx_users_email ON users(email);
\`\`\`

2. **Composite index (for multi-column WHERE/JOIN):**
\`\`\`sql
-- Good for: WHERE user_id = X AND created_at > Y
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
\`\`\`

3. **Partial index (index subset of rows):**
\`\`\`sql
-- Index only active users (avoid indexing soft-deleted rows)
CREATE INDEX idx_active_users_email ON users(email)
    WHERE deleted_at IS NULL;
\`\`\`

4. **Unique index (enforce constraint):**
\`\`\`sql
CREATE UNIQUE INDEX idx_users_email ON users(email);
\`\`\`

**Index maintenance:**
- Monitor for unused indexes (query database statistics)
- Drop unused indexes after measurement
- ANALYZE/VACUUM regularly to update statistics

## Connection Pooling

**Use connection pooling in production:**

\`\`\`python
# Anti-pattern: New connection per query
def get_user(user_id):
    conn = connect()  # New connection!
    user = conn.query('SELECT * FROM users WHERE id = ?', user_id)
    conn.close()
    return user

# Use connection pool
pool = ConnectionPool(
    host='localhost',
    database='myapp',
    min_size=5,
    max_size=20,
    timeout=30
)

def get_user(user_id):
    with pool.get_connection() as conn:  # Reuses from pool
        return conn.query('SELECT * FROM users WHERE id = ?', user_id)
\`\`\`

**Pool configuration (tune for your workload):**
- \`min_size\`: Minimum idle connections (default 5-10)
- \`max_size\`: Maximum concurrent connections (default 20-50)
- \`timeout\`: Connection acquisition timeout
- \`idle_timeout\`: Close idle connections after N seconds

## Pagination

**Implement efficient pagination:**

\`\`\`sql
-- OFFSET is slow for large offsets
SELECT * FROM orders LIMIT 10 OFFSET 100000;

-- Better: Keyset pagination (cursor-based)
SELECT * FROM orders
WHERE id > 12345  -- Last ID from previous page
ORDER BY id
LIMIT 10;

-- With composite key
SELECT * FROM orders
WHERE (user_id, created_at) > (123, '2024-11-17')
ORDER BY user_id, created_at
LIMIT 10;
\`\`\`

## Query Timeouts

**Problem:** Slow query locks database, cascading failures
**Fix:** Set statement timeouts and query timeouts in production

## Unbounded Queries

**Problem:** SELECT * without LIMIT causes memory exhaustion
**Fix:** Always LIMIT and paginate large result sets
