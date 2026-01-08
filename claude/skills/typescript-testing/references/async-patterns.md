---
name: typescript-testing/async-patterns
description: Async testing patterns including promises, timers, and event testing in TypeScript.
---

# Async Testing Patterns

Patterns for testing asynchronous code with Bun's test runner.

## Async/Await in Tests

```typescript
import { describe, it, expect } from "bun:test";
import { fetchUser } from "./api";

describe("Async operations", () => {
  it("should fetch user data", async () => {
    const user = await fetchUser("123");
    expect(user.id).toBe("123");
    expect(user.name).toBeDefined();
  });

  it("should handle fetch errors", async () => {
    expect(fetchUser("invalid")).rejects.toThrow();
  });
});
```

## Promise Testing

```typescript
import { describe, it, expect } from "bun:test";

describe("Promise handling", () => {
  it("should resolve with data", () => {
    const promise = Promise.resolve({ id: 1, name: "User" });
    return expect(promise).resolves.toEqual({ id: 1, name: "User" });
  });

  it("should reject with error", () => {
    const promise = Promise.reject(new Error("Failed"));
    return expect(promise).rejects.toThrow("Failed");
  });
});
```

## Concurrent Async Tests

```typescript
import { describe, it, expect } from "bun:test";

describe("Concurrent operations", () => {
  it("should handle multiple concurrent requests", async () => {
    const results = await Promise.all([
      fetchData("1"),
      fetchData("2"),
      fetchData("3"),
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe("1");
    expect(results[1].id).toBe("2");
    expect(results[2].id).toBe("3");
  });

  it("should race multiple promises", async () => {
    const winner = await Promise.race([
      slowOperation(100),
      slowOperation(50),
      slowOperation(200),
    ]);

    expect(winner).toBeDefined();
  });
});
```

## Async Setup and Teardown

```typescript
import { describe, it, beforeAll, afterAll, expect } from "bun:test";
import { startServer, stopServer } from "./server";

describe("API Integration", () => {
  let baseUrl: string;

  beforeAll(async () => {
    const server = await startServer();
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await stopServer();
  });

  it("should create a user", async () => {
    const response = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBeDefined();
  });
});
```

## Database Integration Testing

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "./database";

describe("Database operations", () => {
  let db: Database;

  beforeAll(async () => {
    db = new Database(":memory:");
    await db.initialize();
    await db.runMigrations();
  });

  afterAll(async () => {
    await db.close();
  });

  it("should perform CRUD operations", async () => {
    // Create
    const user = await db.users.create({
      email: "test@example.com",
      name: "Test User",
    });
    expect(user.id).toBeDefined();

    // Read
    const retrieved = await db.users.findById(user.id);
    expect(retrieved.email).toBe("test@example.com");

    // Update
    await db.users.update(user.id, { name: "Updated" });
    const updated = await db.users.findById(user.id);
    expect(updated.name).toBe("Updated");

    // Delete
    await db.users.delete(user.id);
    const deleted = await db.users.findById(user.id);
    expect(deleted).toBeNull();
  });
});
```

## Testing HTTP APIs

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "./server";

describe("API Integration", () => {
  let baseUrl: string;

  beforeAll(async () => {
    const server = await startServer();
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(async () => {
    await stopServer();
  });

  it("should create a user", async () => {
    const response = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBeDefined();
  });

  it("should retrieve user", async () => {
    const response = await fetch(`${baseUrl}/api/users/1`);
    expect(response.status).toBe(200);
  });
});
```

## Async Promise Matchers

| Matcher | Description |
|---------|-------------|
| `resolves.toBe()` | Promise resolves to exact value |
| `resolves.toEqual()` | Promise resolves to deep equal value |
| `rejects.toThrow()` | Promise rejects with error |
| `rejects.toThrow(Error)` | Promise rejects with specific error type |
| `rejects.toThrow(/pattern/)` | Promise rejects with matching message |

## Timeout Configuration

```toml
# bunfig.toml
[test]
timeout = 30000  # 30 second timeout for async tests
```

## Best Practices

1. **Always await async operations** - Never leave promises unhandled
2. **Use async/await over .then()** - Clearer error stack traces
3. **Clean up resources** - Use `afterAll` to close connections
4. **Set appropriate timeouts** - Long-running tests need higher limits
5. **Test error paths** - Verify async rejection handling
