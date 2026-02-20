# Workspaces & Feature Flags

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## Workspace Layout

### Basic Structure
```
my-project/
├── Cargo.toml          # Workspace root
├── Cargo.lock          # Shared lockfile (MUST commit for workspaces)
├── crates/
│   ├── core/
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   ├── api/
│   │   ├── Cargo.toml
│   │   └── src/main.rs
│   └── cli/
│       ├── Cargo.toml
│       └── src/main.rs
└── README.md
```

### Root Cargo.toml
```toml
[workspace]
members = ["crates/*"]
resolver = "2"  # MUST use resolver 2 for edition 2021+

[workspace.package]
version = "0.1.0"
edition = "2021"
rust-version = "1.75"
license = "MIT"

[workspace.dependencies]
# Pin shared dependencies here
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
anyhow = "1"
thiserror = "2"
tracing = "0.1"
```

### Member Cargo.toml
```toml
[package]
name = "my-api"
version.workspace = true
edition.workspace = true

[dependencies]
my-core = { path = "../core" }
serde.workspace = true
tokio.workspace = true
anyhow.workspace = true
tracing.workspace = true

[dev-dependencies]
tokio = { workspace = true, features = ["test-util"] }
```

### Workspace Rules
- MUST use `resolver = "2"` with edition 2021+
- MUST define shared dependencies in `[workspace.dependencies]`
- MUST commit `Cargo.lock` for workspaces containing binaries
- SHOULD use `crates/` directory for members (flat or grouped)
- SHOULD inherit `version`, `edition`, `license` from workspace

---

## Workspace Commands

```bash
# Build everything
cargo build --workspace

# Test everything
cargo test --workspace

# Build specific member
cargo build -p my-api

# Run specific binary
cargo run -p my-cli -- --help

# Check specific member
cargo check -p my-core

# Clippy across workspace
cargo clippy --workspace -- -D warnings
```

---

## Feature Flags

### Defining Features
```toml
# crates/core/Cargo.toml
[features]
default = ["json"]
json = ["dep:serde_json"]
yaml = ["dep:serde_yaml"]
full = ["json", "yaml", "tracing"]
tracing = ["dep:tracing"]

[dependencies]
serde_json = { version = "1", optional = true }
serde_yaml = { version = "0.9", optional = true }
tracing = { version = "0.1", optional = true }
```

### Using Features in Code
```rust
// Conditional compilation
#[cfg(feature = "json")]
pub mod json {
    pub fn parse(input: &str) -> Result<Value, Error> { /* ... */ }
}

// Conditional imports
#[cfg(feature = "tracing")]
use tracing::instrument;

// Conditional derives
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Config {
    pub name: String,
}

// Conditional function body
pub fn log_event(event: &Event) {
    #[cfg(feature = "tracing")]
    tracing::info!(?event, "processing event");

    #[cfg(not(feature = "tracing"))]
    eprintln!("processing event: {event:?}");
}
```

### Feature Flag Rules
- MUST NOT use features for mutually exclusive options (use cfg instead)
- MUST make features additive — enabling a feature should never break compilation
- SHOULD name features after the optional dependency they gate
- SHOULD provide a `default` feature set for common use
- MAY provide a `full` feature for enabling everything

---

## Conditional Compilation

### Platform Detection
```rust
#[cfg(target_os = "linux")]
fn platform_specific() { /* Linux only */ }

#[cfg(target_os = "windows")]
fn platform_specific() { /* Windows only */ }

#[cfg(unix)]
fn unix_only() { /* Unix-like (Linux, macOS, BSD) */ }

// Multiple conditions
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn linux_x64_only() { /* ... */ }

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn posix_like() { /* ... */ }
```

### Build Scripts (build.rs)
```rust
// build.rs
fn main() {
    // Set cfg flags from build script
    println!("cargo::rustc-cfg=has_feature_x");

    // Conditional on environment
    if std::env::var("DATABASE_URL").is_ok() {
        println!("cargo::rustc-cfg=has_database");
    }

    // Re-run conditions
    println!("cargo::rerun-if-changed=build.rs");
    println!("cargo::rerun-if-env-changed=DATABASE_URL");
}
```

### cfg_attr for Conditional Attributes
```rust
// Only derive Serialize when serde feature is enabled
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Point { x: f64, y: f64 }

// Platform-specific attributes
#[cfg_attr(target_os = "windows", path = "windows.rs")]
#[cfg_attr(not(target_os = "windows"), path = "unix.rs")]
mod platform;
```

---

## Dependency Management

### Version Pinning Strategy
```toml
[workspace.dependencies]
# Pin major version for stability
serde = "1"            # ^1.0.0 — any 1.x
tokio = "1"            # ^1.0.0 — any 1.x

# Pin minor for tighter control
sqlx = "0.8"           # ^0.8.0 — any 0.8.x

# Exact pin only when necessary (rare)
openssl-sys = "=0.9.93"
```

### Workspace Dependency Inheritance
```toml
# Root Cargo.toml — define once
[workspace.dependencies]
serde = { version = "1", features = ["derive"] }

# Member Cargo.toml — inherit
[dependencies]
serde.workspace = true

# Member can add features on top
[dev-dependencies]
serde = { workspace = true, features = ["rc"] }
```

### Dependency Rules
- MUST define shared dependencies in `[workspace.dependencies]`
- MUST NOT duplicate version specs across workspace members
- SHOULD use `cargo deny` or `cargo audit` in CI
- SHOULD review `cargo tree` output for unexpected transitive dependencies
