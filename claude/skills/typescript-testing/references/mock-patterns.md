---
name: typescript-testing/mock-patterns
description: TypeScript mocking strategies including test doubles, stubs, and spy patterns.
---

# Mock Patterns for TypeScript Testing

Comprehensive mocking strategies using Bun's built-in mock functionality.

## Using mock()

```typescript
import { mock } from "bun:test";
import { fetchUser } from "./api";

const mockFetch = mock((userId: string) => {
  return { id: userId, name: "Mock User" };
});

// Test mock behavior
const result = mockFetch("123");
expect(result.name).toBe("Mock User");
expect(mockFetch.mock.calls.length).toBe(1);
expect(mockFetch.mock.calls[0]).toEqual(["123"]);
```

## Mock Objects and Modules

```typescript
import { describe, it, expect, mock } from "bun:test";

describe("Service with mocked dependency", () => {
  it("should use mocked database", () => {
    const mockDb = {
      query: mock((sql: string) => [{ id: 1, name: "Test" }]),
      close: mock(() => {}),
    };

    const service = new Service(mockDb);
    const result = service.getUser(1);

    expect(result.name).toBe("Test");
    expect(mockDb.query.mock.calls.length).toBe(1);
  });
});
```

## Module Mocking

```typescript
import { describe, it, expect, mock } from "bun:test";
import { getUserFromAPI } from "./api";

// Mock entire modules
mock.module("./api", () => ({
  getUserFromAPI: mock((id: string) => ({
    id,
    name: "Mocked User",
  })),
}));

describe("API integration", () => {
  it("should work with mocked API", async () => {
    const user = await getUserFromAPI("123");
    expect(user.name).toBe("Mocked User");
  });
});
```

## Spy on Function Calls

```typescript
import { describe, it, expect, mock } from "bun:test";

describe("Spy on calls", () => {
  it("should track function calls", () => {
    const originalFunc = (x: number) => x * 2;
    const spied = mock(originalFunc);

    const result1 = spied(5);
    const result2 = spied(10);

    expect(result1).toBe(10);
    expect(result2).toBe(20);
    expect(spied.mock.calls.length).toBe(2);
    expect(spied.mock.results[0].value).toBe(10);
    expect(spied.mock.results[1].value).toBe(20);
  });
});
```

## Mock Return Values

```typescript
import { describe, it, expect, mock } from "bun:test";

describe("Mock return values", () => {
  it("should return configured values", () => {
    const mockFunc = mock();

    // Set return values for specific calls
    mockFunc.mock.returns = [
      { value: "first" },
      { value: "second" },
      { value: "third" },
    ];

    expect(mockFunc()).toEqual({ value: "first" });
    expect(mockFunc()).toEqual({ value: "second" });
  });

  it("should throw errors when configured", () => {
    const errorMock = mock(() => {
      throw new Error("Mocked error");
    });

    expect(() => errorMock()).toThrow("Mocked error");
  });
});
```

## Test Doubles Pattern

### Creating Test Doubles

```typescript
// tests/fixtures/setup.ts
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "test-id",
    email: "test@example.com",
    name: "Test User",
    role: "user",
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMockDatabase() {
  const users: User[] = [];

  return {
    addUser: (user: User) => {
      users.push(user);
      return user;
    },
    getUser: (id: string) => users.find(u => u.id === id),
    getAllUsers: () => [...users],
    clear: () => users.splice(0),
  };
}

// In test
import { describe, it, beforeEach, expect } from "bun:test";
import { createMockUser, createMockDatabase } from "./fixtures/setup";

describe("User repository", () => {
  let db: ReturnType<typeof createMockDatabase>;

  beforeEach(() => {
    db = createMockDatabase();
  });

  it("should add and retrieve users", () => {
    const user = createMockUser({ name: "John Doe" });
    db.addUser(user);

    expect(db.getUser(user.id)?.name).toBe("John Doe");
  });
});
```

## Mock API Properties

| Property | Description |
|----------|-------------|
| `mock.calls` | Array of all call arguments |
| `mock.calls.length` | Number of times called |
| `mock.results` | Array of return values |
| `mock.returns` | Configure sequential return values |

## Best Practices

1. **Mock at boundaries** - Mock external dependencies, not internal logic
2. **Reset mocks between tests** - Use `beforeEach` to create fresh mocks
3. **Verify call counts** - Ensure mocks are called expected number of times
4. **Use typed mocks** - Leverage TypeScript for type-safe mocking
5. **Avoid over-mocking** - Only mock what's necessary for isolation
