---
name: rust
description: Rust development with Cargo, testing, and ownership patterns. Activate when working with .rs files, Cargo.toml, Cargo.lock, or discussing Rust patterns, ownership, borrowing, lifetimes, traits, cargo build/test/run, Result/Option types, or the borrow checker.
---

# Rust Skill

Rust guarantees memory safety without garbage collection through its ownership system. Prefer zero-cost abstractions, leverage the type system for correctness, and handle errors with `Result<T, E>` instead of panicking.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `cargo build` | Build project |
| `cargo test` | Run all tests |
| `cargo fmt` | Format code |
| `cargo clippy` | Lint with suggestions |
| `cargo check` | Type-check without building |
| `cargo doc --open` | Generate and view docs |
| `cargo bench` | Run benchmarks |

**Ownership basics:** Each value has one owner. When the owner goes out of scope, the value is dropped. Use references (`&T`, `&mut T`) to borrow without taking ownership.

## Contents

- [core.md](core.md) - Cargo, error handling, ownership, memory safety, modules
- [testing.md](testing.md) - Unit tests, integration tests, mocking, coverage
- [async.md](async.md) - Tokio runtime, spawn, JoinSet, select!, channels, cancellation
- [concurrency.md](concurrency.md) - Arc/Mutex/RwLock, parking_lot, atomics, Send/Sync, crossbeam
- [workspace.md](workspace.md) - Multi-crate workspaces, feature flags, conditional compilation
- [performance.md](performance.md) - Release profiles, criterion benchmarks, allocation avoidance
- [web.md](web.md) - Axum router/handlers/extractors, tower middleware, sqlx, JWT auth
- [serde.md](serde.md) - Derive patterns, custom serializers, zero-copy, format-specific patterns
- [ffi.md](ffi.md) - C interop, cbindgen, PyO3 Python bindings, wasm-bindgen
