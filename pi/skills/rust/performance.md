# Performance

## Release Profile Optimization

### Cargo.toml Profiles
```toml
[profile.release]
lto = "thin"           # Link-Time Optimization (thin = good balance)
codegen-units = 1      # Single codegen unit for max optimization
strip = "symbols"      # Strip debug symbols from binary
panic = "abort"        # Smaller binary, no unwinding overhead

[profile.release-fast]
inherits = "release"
lto = "fat"            # Maximum LTO (slower build, fastest binary)
target-cpu = "native"  # Optimize for current CPU

[profile.dev]
opt-level = 0          # Fast compilation (default)

[profile.dev.package."*"]
opt-level = 2          # Optimize dependencies even in dev
```

### Profile Selection Guide

| Goal | LTO | codegen-units | strip | panic |
|------|-----|---------------|-------|-------|
| Fast dev builds | off | 256 (default) | no | unwind |
| Balanced release | thin | 1 | symbols | abort |
| Maximum speed | fat | 1 | symbols | abort |
| Minimum binary | fat | 1 | symbols | abort |
| Debuggable release | off | 16 | no | unwind |

---

## Benchmarking with Criterion

### Setup
```toml
# Cargo.toml
[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "my_benchmarks"
harness = false
```

### Benchmark Rules
- MUST use `black_box()` to prevent dead code elimination
- MUST separate setup from measured code
- SHOULD use `BenchmarkId` for parameterized benchmarks
- SHOULD compare before/after with `cargo bench -- --save-baseline`

```bash
# Run benchmarks
cargo bench

# Compare against baseline
cargo bench -- --save-baseline before
# ... make changes ...
cargo bench -- --baseline before
```

---

## Profiling with Flamegraph

### Cargo.toml for Profiling
```toml
# Enable debug info in release for profiling
[profile.release]
debug = 1  # Line-level info without full debug symbols
```

---

## Allocation Avoidance

### SmallVec for Small Collections
```rust
use smallvec::SmallVec;

// Stack-allocated for <= 4 elements, heap for more
let mut tags: SmallVec<[String; 4]> = SmallVec::new();
tags.push("rust".to_string());
// No heap allocation if 4 or fewer elements
```

### Iterator Chains Over Intermediate Collections
```rust
// WRONG - allocates intermediate Vec
let filtered: Vec<_> = items.iter().filter(|x| x.active).collect();
let mapped: Vec<_> = filtered.iter().map(|x| x.name.clone()).collect();

// RIGHT - single pass, no intermediate allocation
let names: Vec<_> = items.iter()
    .filter(|x| x.active)
    .map(|x| x.name.clone())
    .collect();
```

### String Optimization
```rust
// Preallocate when size is known
let mut s = String::with_capacity(1024);

// Use write! instead of format! + push_str
use std::fmt::Write;
write!(s, "count: {}", count).unwrap();

// Use &str parameters instead of String
fn greet(name: &str) -> String {  // Not String parameter
    format!("Hello, {name}")
}

// Join is faster than repeated push_str
let result = parts.join(", ");
```

---

## Inline Hints

### Inline Rules
- SHOULD let the compiler decide (no annotation) by default
- SHOULD use `#[inline]` for small functions in library crates (cross-crate inlining)
- MUST NOT use `#[inline(always)]` without benchmarks proving it helps
- SHOULD use `#[cold]` + `#[inline(never)]` for error handling paths

---

## Collection Performance

### Choosing the Right Collection

| Need | Collection | Why |
|------|-----------|-----|
| Ordered sequence | `Vec<T>` | Cache-friendly, fast iteration |
| Key-value lookup | `HashMap<K, V>` | O(1) average lookup |
| Sorted key-value | `BTreeMap<K, V>` | O(log n) lookup, ordered iteration |
| Unique set | `HashSet<T>` | O(1) membership test |
| Queue (FIFO) | `VecDeque<T>` | O(1) push/pop at both ends |
| Priority queue | `BinaryHeap<T>` | O(log n) push/pop max |
| Small fixed-size | `[T; N]` or `SmallVec` | Stack allocated |

### Capacity Hints
Preallocate collections only when a useful size estimate exists; use `extend` for iterator input instead of repeated `push`.

### HashMap Performance
```rust
// Use entry API to avoid double lookup
use std::collections::hash_map::Entry;

match map.entry(key) {
    Entry::Occupied(mut e) => { e.get_mut().count += 1; }
    Entry::Vacant(e) => { e.insert(Value { count: 1 }); }
}

// Or the simpler form
*map.entry(key).or_insert(0) += 1;
```

---

## Zero-Copy Patterns

### Borrowed Data in Structs
Borrow input only when the lifetime remains clear at the API boundary; otherwise own the data and measure before optimizing allocations.

### bytes::Bytes for Network Data
```rust
use bytes::Bytes;

// Reference-counted, cheaply cloneable byte buffer
let data = Bytes::from(vec![1, 2, 3, 4]);
let slice = data.slice(1..3); // No copy - shared reference
```
