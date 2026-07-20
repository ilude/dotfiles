# Rust Projects Workflow

## Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Lint | Clippy | `cargo clippy` |
| Format | rustfmt | `cargo fmt` |
| Type check | built-in | `cargo check` |
| Build | cargo | `cargo build` |
| Test | cargo | `cargo test` |
| Security | cargo-audit | `cargo audit` |
| Coverage | cargo-tarpaulin | `cargo tarpaulin` |
| Docs | rustdoc | `cargo doc` |

## Workflow Commands

### Development Cycle
```bash
# Check before commit
cargo fmt --check && cargo clippy -- -D warnings && cargo test

# Full validation
cargo fmt && cargo clippy --fix --allow-dirty && cargo test && cargo doc --no-deps
```

### Release Builds
```bash
cargo build --release
cargo test --release
```

---

## Trait Requirements

### Public Types
Implement traits that the requested public contract needs:
- `Debug` for error messages and debugging
- `Clone` when callers need copyable values and the type does not manage unique resources
- `PartialEq` and `Eq` when equality comparison is meaningful
- `Hash` when the type may be used as a key
- `Default` when a sensible default exists

### Display Trait
Types representing user-facing values SHOULD implement `Display`:
```rust
use std::fmt;

impl fmt::Display for UserId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}
```

---

## Cargo.lock Rules

### Binaries and Applications
- MUST commit `Cargo.lock` to version control
- Ensures reproducible builds across environments
- Add to `.gitignore` exceptions if using a global ignore

### Libraries
- MAY ignore `Cargo.lock` (add to `.gitignore`)
- Downstream consumers use their own lockfile
- RECOMMENDED to commit for CI reproducibility, but not required

### Workspaces
- MUST commit the root `Cargo.lock`
- All workspace members share the same lockfile

---

## Error Handling

### Libraries: Use `thiserror`
```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LibraryError {
    #[error("invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("resource not found: {resource}")]
    NotFound { resource: String },

    #[error(transparent)]
    Io(#[from] std::io::Error),
}
```

### Applications: Use `anyhow`
```rust
use anyhow::{Context, Result};

fn main() -> Result<()> {
    let config = load_config()
        .context("failed to load configuration")?;

    run_app(config)?;
    Ok(())
}
```

### Error Handling Rules
- MUST NOT use `.unwrap()` in library code (except tests)
- MUST NOT use `.expect()` without a meaningful message
- SHOULD use `?` operator for propagation
- SHOULD add context with `.context()` or `.with_context()`
- MAY use `.unwrap()` in `main()` for unrecoverable errors

### Result Type Aliases
Libraries SHOULD define a Result alias:
```rust
pub type Result<T> = std::result::Result<T, LibraryError>;
```

---

## Memory Safety

### Ownership Rules
- Each value has exactly one owner
- When the owner goes out of scope, the value is dropped
- Ownership can be transferred (moved) or borrowed

### Borrowing Rules
- Multiple immutable borrows (`&T`) allowed simultaneously
- Only one mutable borrow (`&mut T`) at a time
- Cannot mix mutable and immutable borrows

### Memory Safety Rules
- MUST NOT use raw pointers outside `unsafe` blocks
- SHOULD prefer `&[T]` over raw pointers for slices
- SHOULD use `Box<T>` for heap allocation
- SHOULD use `Arc<T>` or `Rc<T>` for shared ownership

---

## Module Organization

### File structure
Use `lib.rs` or `main.rs` as the crate root. Keep modules cohesive, expose a small public surface from module roots, and avoid a catch-all `utils` module.

### mod.rs Patterns
```rust
// src/handlers/mod.rs
mod auth;
mod api;

// Re-export public items
pub use auth::AuthHandler;
pub use api::{ApiClient, ApiError};

// Keep private implementation details
use auth::internal_helper;
```

### Visibility Rules
- MUST use `pub` only for intentional public API
- SHOULD use `pub(crate)` for crate-internal items
- SHOULD use `pub(super)` for parent-module access
- MAY use `pub(in path)` for fine-grained control

### Prelude Pattern (Optional)
```rust
// src/prelude.rs
pub use crate::config::Config;
pub use crate::error::{Error, Result};
pub use crate::traits::*;
```

---

## Testing

Testing rules are automatically loaded when working with test files. For comprehensive Rust testing patterns see [testing.md](testing.md).

### Quick Reference
```bash
cargo test                    # Run all tests
cargo test --lib              # Run library tests only
cargo test --doc              # Run doc tests only
cargo test -- --nocapture     # Show println output
```

---

## Documentation

### Documentation Rules
Document public items when the requested public contract or local conventions require it. For documented functions, include relevant `# Examples`, `# Panics`, `# Errors`, and `# Safety` sections. `#[doc(hidden)]` remains appropriate for public-but-internal items.

### Doc Tests
Examples in documentation are compiled and run as tests:
```rust
/// ```
/// # use mylib::Config;  // Hidden setup line
/// let config = Config::default();
/// assert!(config.is_valid());
/// ```
```

---

## Unsafe Code

### Minimization Rules
- MUST minimize use of `unsafe` blocks
- MUST encapsulate `unsafe` in safe abstractions
- MUST NOT use `unsafe` for convenience/performance without justification

### Documentation Requirements
```rust
/// Reads a value from the given pointer.
///
/// # Safety
///
/// The caller MUST ensure:
/// - `ptr` is valid and properly aligned
/// - `ptr` points to initialized memory
/// - No other references to this memory exist
pub unsafe fn read_ptr<T>(ptr: *const T) -> T {
    // SAFETY: Caller guarantees pointer validity per function contract
    unsafe { std::ptr::read(ptr) }
}
```

### Safe abstractions
Keep `unsafe` implementation details private, validate every invariant at the boundary, and expose only operations that preserve those invariants.

### Unsafe Code Rules
- MUST add `// SAFETY:` comment before every `unsafe` block
- MUST document safety requirements in function docs
- SHOULD use `#[deny(unsafe_op_in_unsafe_fn)]`
- SHOULD audit unsafe code regularly

---

## No Magic Values

Extract literals to `const`, enums, or associated constants when they represent a repeated or shared domain concept, configuration, or when the requested change needs a named value.

### Patterns

```rust
// BAD: magic values
if user.role == "admin" { /* ... */ }
let timeout = Duration::from_secs(30);
let addr = "127.0.0.1:8080";

// GOOD: enums (preferred for fixed sets)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Role {
    Admin,
    User,
    Guest,
}

// GOOD: const for primitives and &str
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_ADDR: &str = "127.0.0.1:8080";
const MAX_RETRIES: u32 = 3;

// GOOD: associated constants on types
impl Config {
    pub const DEFAULT_PORT: u16 = 8080;
}
```

### const vs static

| Use | When |
|-----|------|
| `const` | Compile-time values, inlined at each use site |
| `static` | Single allocation, interior mutability (`Mutex`, `OnceLock`), FFI |

### When Literals Are Fine

- Array indices (`0`, `1`), boolean flags, empty strings/collections
- Test assertions and fixture data
- Single-use format strings and log messages
- Well-known protocol values used once

---
## Common Patterns

### Builder and newtype patterns
Use builders when optional configuration would otherwise make a constructor unclear. Use newtypes to make invalid states unrepresentable; validate at construction and expose only the intended operations.

### Type state pattern
Use type states when transitions make invalid operations unrepresentable and the additional public API complexity is justified.

---

## Clippy Configuration

### Recommended Lints
Add to `Cargo.toml` or `clippy.toml`:
```toml
# Cargo.toml
[lints.clippy]
pedantic = "warn"
nursery = "warn"
unwrap_used = "deny"
expect_used = "warn"
```

### Allowing Specific Lints
```rust
#[allow(clippy::too_many_arguments)]
fn complex_function(/* many args */) { /* ... */ }
```

### CI Configuration
```bash
cargo clippy -- -D warnings -D clippy::unwrap_used
```
