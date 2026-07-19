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

Integration tests MUST be in the `tests/` directory. Put shared test support in a child module so Cargo does not execute it as a separate test crate.

## Test patterns
Use fixtures for setup, test error paths directly, and reserve `#[should_panic]` for invariants that cannot be expressed as `Result` assertions.

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

## Assertion patterns
Assert observable behavior and failure variants. For floating point values, compare against a documented tolerance; include diagnostic context for invariant failures.

## Test Utilities

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


## Coverage with cargo-tarpaulin
Use `cargo tarpaulin` for coverage where its platform support fits the project; exclude generated code and keep threshold decisions in CI configuration.

## Test Quality Checklist

- Tests are isolated (no shared mutable state)
- Tests are deterministic (same result every time)
- Tests are fast (mock slow operations)
- Test names clearly describe behavior
- Edge cases covered (empty, none, boundary values)
- Error paths tested
- No tests depend on execution order
