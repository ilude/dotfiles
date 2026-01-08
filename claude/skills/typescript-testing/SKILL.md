---
name: typescript-testing
description: TypeScript/JavaScript testing practices with Bun's test runner. Activate when working with bun test, .test.ts, .test.js, .spec.ts, .spec.js, testing TypeScript/JavaScript, bunfig.toml, testing configuration, or test-related tasks in Bun projects.
---

# TypeScript Testing with Bun

TypeScript/JavaScript-specific testing patterns and best practices using Bun's built-in test runner, complementing general testing-workflow skill.

---

## Philosophy

- **Test behavior, not implementation** - Tests should survive refactoring
- **Fast feedback loops** - Bun's fast test runner enables TDD workflow
- **Minimal mocking** - Mock at boundaries (APIs, DBs), not internal functions
- **Readable tests** - Test names should document expected behavior
- **Pragmatic coverage** - Cover critical paths, not vanity metrics

---

## Reference Documentation

For detailed patterns, see:
- [Mock Patterns](references/mock-patterns.md) - Mocking strategies, test doubles, spy patterns
- [Async Patterns](references/async-patterns.md) - Async testing, promises, event testing
- [DOM Testing](references/dom-testing.md) - DOM testing, React components, accessibility

---

## CRITICAL: Bun Test Execution

**NEVER use jest, vitest, or other test runners in Bun projects:**

```bash
# CORRECT - Bun test execution
bun test
bun test --watch
bun test src/__tests__
bun test --coverage
bun test --bail
bun test tests/unit.test.ts

# WRONG - Never use jest/vitest in Bun projects
# jest, vitest, npm run test (if mapped to jest)
```

---

## Quick Reference Tables

### Common Assertions

| Assertion | Description |
|-----------|-------------|
| `toBe(value)` | Strict equality (===) |
| `toEqual(obj)` | Deep equality |
| `toBeTruthy()` | Truthy value |
| `toBeFalsy()` | Falsy value |
| `toBeNull()` | Exactly null |
| `toBeUndefined()` | Exactly undefined |
| `toBeGreaterThan(n)` | Greater than number |
| `toBeLessThan(n)` | Less than number |
| `toBeCloseTo(n)` | Float comparison |
| `toMatch(/regex/)` | Regex match |
| `toContain(item)` | Array/string contains |
| `toHaveLength(n)` | Array/string length |
| `toHaveProperty(key)` | Object has property |
| `toThrow()` | Function throws |

### Test Control

| Method | Description |
|--------|-------------|
| `it.skip()` | Skip this test |
| `it.only()` | Run only this test |
| `it.todo()` | Placeholder for future test |
| `describe.skip()` | Skip entire suite |

### CLI Options

| Flag | Description |
|------|-------------|
| `--watch` | Watch mode |
| `--coverage` | Generate coverage |
| `--bail` | Stop on first failure |
| `--coverage-html` | HTML coverage report |

---

## Test File Organization

### File Naming Conventions

Bun recognizes test files by standard conventions:

```
src/
├── utils/
│   ├── math.ts
│   ├── math.test.ts              # Standard .test.ts
│   └── validation/
│       ├── validator.ts
│       └── validator.test.ts
├── services/
│   └── __tests__/                # __tests__ directory
│       └── api.test.ts
└── components/
    ├── Button.tsx
    └── Button.test.tsx           # React component tests
```

### Discovery Patterns

Bun automatically finds tests matching:
- `*.test.ts` / `*.test.tsx` / `*.test.js` / `*.test.jsx`
- `*.spec.ts` / `*.spec.tsx` / `*.spec.js` / `*.spec.jsx`
- Files in `__tests__` directories

---

## Basic Test Structure

```typescript
import { describe, it, expect } from "bun:test";
import { add, multiply } from "./math";

describe("Math utilities", () => {
  it("should add two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });

  it("should multiply two numbers", () => {
    expect(multiply(4, 5)).toBe(20);
  });
});
```

### Nested Describe Blocks

```typescript
import { describe, it, expect } from "bun:test";
import { UserService } from "./user-service";

describe("UserService", () => {
  describe("create", () => {
    it("should create user with valid data", () => {
      // Test implementation
    });
  });

  describe("update", () => {
    it("should update user properties", () => {
      // Test implementation
    });
  });
});
```

---

## Setup and Teardown

### beforeEach and afterEach

```typescript
import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import { Database } from "./database";

describe("Database operations", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.initialize();
  });

  afterEach(() => {
    db.close();
  });

  it("should insert and retrieve data", () => {
    db.insert("users", { id: 1, name: "John" });
    const user = db.query("SELECT * FROM users WHERE id = 1");
    expect(user.name).toBe("John");
  });
});
```

### beforeAll and afterAll

```typescript
import { describe, it, beforeAll, afterAll, expect } from "bun:test";

describe("Resource-intensive operations", () => {
  let resource: any;

  beforeAll(() => {
    resource = setupExpensiveResource();
  });

  afterAll(() => {
    resource.teardown();
  });

  it("uses expensive resource", () => {
    expect(resource.isReady()).toBe(true);
  });
});
```

---

## Common Testing Patterns

### Arrange-Act-Assert

```typescript
import { describe, it, expect } from "bun:test";
import { calculateTotal } from "./calculator";

describe("calculateTotal", () => {
  it("should sum array of numbers", () => {
    // Arrange
    const items = [
      { price: 10, quantity: 2 },
      { price: 5, quantity: 3 },
    ];

    // Act
    const total = calculateTotal(items);

    // Assert
    expect(total).toBe(35);
  });
});
```

### Testing Error Conditions

```typescript
import { describe, it, expect } from "bun:test";
import { validateEmail } from "./validators";

describe("validateEmail", () => {
  it("should validate correct email", () => {
    expect(validateEmail("test@example.com")).toBe(true);
  });

  it("should reject invalid emails", () => {
    expect(validateEmail("not-an-email")).toBe(false);
    expect(validateEmail("@example.com")).toBe(false);
  });

  it("should throw on null input", () => {
    expect(() => validateEmail(null as any)).toThrow();
  });
});
```

### Edge Case Testing

```typescript
import { describe, it, expect } from "bun:test";
import { processArray } from "./processor";

describe("processArray edge cases", () => {
  it("should handle empty array", () => {
    expect(processArray([])).toEqual([]);
  });

  it("should handle single item", () => {
    expect(processArray([1])).toEqual([1]);
  });

  it("should handle undefined values", () => {
    const result = processArray([1, undefined, 3]);
    expect(result).toContain(1);
  });

  it("should handle special values", () => {
    expect(processArray([0, -0, NaN])).toBeDefined();
  });
});
```

---

## Coverage Configuration

### Running Coverage

```bash
bun test --coverage          # Text report
bun test --coverage --coverage-html  # HTML report
```

### bunfig.toml Configuration

```toml
[test]
coverage = true
coverageFormat = ["text", "html", "json"]
coverageThreshold = 80
coverageIgnore = ["**/node_modules/**", "**/dist/**"]
coverageRoot = "src"
```

---

## Test Fixtures

### Shared Test Data

```typescript
// tests/fixtures/users.ts
export const testUsers = {
  admin: { id: "1", email: "admin@example.com", role: "admin" },
  user: { id: "2", email: "user@example.com", role: "user" },
};

// In test file
import { testUsers } from "./fixtures/users";

describe("User roles", () => {
  it("should verify admin role", () => {
    expect(testUsers.admin.role).toBe("admin");
  });
});
```

### Fixture Setup Function

```typescript
// tests/fixtures/setup.ts
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "test-id",
    email: "test@example.com",
    name: "Test User",
    ...overrides,
  };
}
```

---

## Type Safety Testing

```typescript
import { describe, it, expectTypeOf } from "bun:test";
import { processUser } from "./user-processor";

describe("Type safety", () => {
  it("should have correct return type", () => {
    const result = processUser({ name: "John", age: 30 });
    expectTypeOf(result).toMatchTypeOf<{ success: boolean }>();
  });

  it("should enforce parameter types", () => {
    // @ts-expect-error - wrong type
    processUser({ name: 123 });
  });
});
```

---

## Zero-Warnings Policy

Running tests should produce zero warnings:

```bash
bun test

# Common warning causes:
# - Deprecated API usage
# - Unhandled promise rejections
# - Memory leaks in tests
# - Resource cleanup issues
```

---

## Makefile Integration

```makefile
.PHONY: test test-watch test-coverage

test:
	bun test

test-watch:
	bun test --watch

test-coverage:
	bun test --coverage

test-bail:
	bun test --bail

check: test lint type-check
	@echo "All checks passed!"
```

---

## Package.json Scripts

```json
{
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "test:bail": "bun test --bail"
  }
}
```

---

## Project Structure

```
src/
├── utils/
│   ├── math.ts
│   └── math.test.ts         # Colocated with source
├── __tests__/               # Centralized tests
│   ├── fixtures/
│   │   ├── users.ts
│   │   └── setup.ts
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── index.ts
```

---

**Note:** For general testing principles not specific to TypeScript/JavaScript, see the testing-workflow skill.
