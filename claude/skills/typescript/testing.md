# TypeScript Testing with Bun

TypeScript/JavaScript testing patterns using Bun's built-in test runner.

## Philosophy

- **Test behavior, not implementation** - Tests should survive refactoring
- **Fast feedback loops** - Bun's fast test runner enables TDD workflow
- **Minimal mocking** - Mock at boundaries (APIs, DBs), not internal functions
- **Readable tests** - Test names should document expected behavior
- **Pragmatic coverage** - Cover critical paths, not vanity metrics

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
```

## Quick Reference

### Common Assertions

| Assertion | Description |
|-----------|-------------|
| `toBe(value)` | Strict equality (===) |
| `toEqual(obj)` | Deep equality |
| `toBeTruthy()` | Truthy value |
| `toBeFalsy()` | Falsy value |
| `toBeNull()` | Exactly null |
| `toBeUndefined()` | Exactly undefined |
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

### CLI Options

| Flag | Description |
|------|-------------|
| `--watch` | Watch mode |
| `--coverage` | Generate coverage |
| `--bail` | Stop on first failure |

## Test File Organization

```
src/
├── utils/
│   ├── math.ts
│   ├── math.test.ts              # Standard .test.ts
├── services/
│   └── __tests__/                # __tests__ directory
│       └── api.test.ts
└── components/
    ├── Button.tsx
    └── Button.test.tsx           # React component tests
```

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

## Setup and Teardown

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

## Common Patterns

### Arrange-Act-Assert

```typescript
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
describe("validateEmail", () => {
  it("should validate correct email", () => {
    expect(validateEmail("test@example.com")).toBe(true);
  });

  it("should reject invalid emails", () => {
    expect(validateEmail("not-an-email")).toBe(false);
  });

  it("should throw on null input", () => {
    expect(() => validateEmail(null as any)).toThrow();
  });
});
```

## Coverage Configuration

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

## Test Fixtures

```typescript
// tests/fixtures/users.ts
export const testUsers = {
  admin: { id: "1", email: "admin@example.com", role: "admin" },
  user: { id: "2", email: "user@example.com", role: "user" },
};

// Fixture factory
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "test-id",
    email: "test@example.com",
    name: "Test User",
    ...overrides,
  };
}
```

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

## React Component Testing

Tests MUST use accessible queries. Priority order:

1. `getByRole` (RECOMMENDED)
2. `getByLabelText` (for form fields)
3. `getByText` (for non-interactive elements)
4. `getByTestId` (last resort)

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('submits form with user data', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();

  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByRole('textbox', { name: /email/i }), 'test@example.com');
  await user.click(screen.getByRole('button', { name: /log in/i }));

  expect(onSubmit).toHaveBeenCalled();
});
```

## Makefile Integration

```makefile
.PHONY: test test-watch test-coverage

test:
	bun test

test-watch:
	bun test --watch

test-coverage:
	bun test --coverage

check: test lint type-check
	@echo "All checks passed!"
```

## Testing Strategy

### Test Pyramid
1. **Unit Tests (70%)** - Fast, isolated, test individual functions/classes
2. **Integration Tests (20%)** - Test component interactions
3. **End-to-End Tests (10%)** - Full system tests

### What to Test
**DO test:**
- Public APIs and interfaces
- Business logic and calculations
- Edge cases (empty inputs, null values, boundaries)
- Error handling and exceptions
- Data validation
- Critical paths through the application

**DON'T test:**
- Private implementation details
- Third-party library internals
- Trivial getters/setters
- Framework magic (unless you suspect bugs)

### Coverage Requirements
- **Minimum:** 80% overall coverage
- **Critical paths:** 100% coverage
- **New code:** Should not decrease overall coverage
- **Focus:** Behavior over line count
