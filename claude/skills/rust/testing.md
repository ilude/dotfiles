# Rust Testing

Comprehensive testing patterns for Rust projects.

## Unit Tests

Unit tests MUST be in the same file as the code being tested:
```rust
// src/calculator.rs
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_positive() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn test_add_negative() {
        assert_eq!(add(-1, -1), -2);
    }
}
```

## Integration Tests

Integration tests MUST be in the `tests/` directory:
```
tests/
├── common/
│   └── mod.rs      # Shared test utilities
├── api_tests.rs    # Integration test file
└── cli_tests.rs    # Another test file
```

## Test Patterns

```rust
// Use test fixtures
#[test]
fn test_with_fixture() {
    let fixture = TestFixture::new();
    // test code
}

// Test error conditions
#[test]
fn test_invalid_input() {
    let result = parse("");
    assert!(result.is_err());
}

// Use should_panic for expected panics
#[test]
#[should_panic(expected = "index out of bounds")]
fn test_panic_condition() {
    let v = vec![1, 2, 3];
    let _ = v[10];
}
```

## Test Configuration

```rust
// Run expensive tests only with --ignored
#[test]
#[ignore]
fn expensive_test() { /* ... */ }

// Async tests (with tokio)
#[tokio::test]
async fn async_test() { /* ... */ }
```

## Testing Rules

- MUST have unit tests for public functions
- SHOULD have integration tests for public API
- SHOULD use `#[ignore]` for slow tests
- MUST NOT have tests that depend on execution order

## Essential Commands

```bash
cargo test                          # Run all tests
cargo test --lib                    # Run library tests only
cargo test --doc                    # Run doc tests only
cargo test -- --nocapture           # Show println output
cargo test -- --test-threads=1     # Run tests serially
cargo test specific_test            # Run specific test
cargo test -- --ignored             # Run ignored tests
cargo test --release                # Run in release mode
```

## Assertion Patterns

```rust
// Basic assertions
assert!(condition);
assert_eq!(actual, expected);
assert_ne!(actual, not_expected);

// With custom messages
assert!(value > 0, "value must be positive, got {}", value);

// Floating point comparisons
let epsilon = 1e-10;
assert!((actual - expected).abs() < epsilon);

// Result assertions
assert!(result.is_ok());
assert!(result.is_err());

// Option assertions
assert!(option.is_some());
assert!(option.is_none());
```

## Test Utilities

### Shared Test Code

```rust
// tests/common/mod.rs
pub struct TestContext {
    pub db: Database,
    pub config: Config,
}

impl TestContext {
    pub fn new() -> Self {
        Self {
            db: Database::in_memory(),
            config: Config::test(),
        }
    }
}

impl Drop for TestContext {
    fn drop(&mut self) {
        // Cleanup
    }
}

// tests/api_tests.rs
mod common;
use common::TestContext;

#[test]
fn test_api_endpoint() {
    let ctx = TestContext::new();
    // Use ctx.db, ctx.config
}
```

### Test Fixtures with rstest

```rust
use rstest::rstest;

#[rstest]
#[case(0, 0)]
#[case(1, 1)]
#[case(2, 4)]
#[case(3, 9)]
fn test_square(#[case] input: i32, #[case] expected: i32) {
    assert_eq!(input * input, expected);
}

#[fixture]
fn database() -> Database {
    Database::in_memory()
}

#[rstest]
fn test_with_database(database: Database) {
    assert!(database.is_connected());
}
```

## Mocking

### Using mockall

```rust
use mockall::automock;

#[automock]
trait UserRepository {
    fn find(&self, id: &str) -> Option<User>;
    fn save(&mut self, user: &User) -> Result<(), Error>;
}

#[test]
fn test_user_service() {
    let mut mock = MockUserRepository::new();
    mock.expect_find()
        .with(eq("user123"))
        .returning(|_| Some(User { id: "user123".into(), name: "Test".into() }));

    let service = UserService::new(mock);
    let user = service.get_user("user123");
    assert!(user.is_some());
}
```

## Coverage with cargo-tarpaulin

```bash
# Generate coverage report
cargo tarpaulin --out Html

# With specific configuration
cargo tarpaulin --ignore-tests --out Xml --output-dir coverage/

# Exclude specific files
cargo tarpaulin --exclude-files "*/tests/*" --exclude-files "*/examples/*"
```

## Test Quality Checklist

- Tests are isolated (no shared mutable state)
- Tests are deterministic (same result every time)
- Tests are fast (mock slow operations)
- Test names clearly describe behavior
- Edge cases covered (empty, none, boundary values)
- Error paths tested
- No tests depend on execution order
