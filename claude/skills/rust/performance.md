# Performance

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

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

### Writing Benchmarks
```rust
// benches/my_benchmarks.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};

fn bench_sort(c: &mut Criterion) {
    let mut group = c.benchmark_group("sorting");

    for size in [100, 1_000, 10_000] {
        group.bench_with_input(
            BenchmarkId::new("vec_sort", size),
            &size,
            |b, &size| {
                let data: Vec<u64> = (0..size).rev().collect();
                b.iter(|| {
                    let mut d = data.clone();
                    d.sort();
                    black_box(d)
                });
            },
        );
    }
    group.finish();
}

criterion_group!(benches, bench_sort);
criterion_main!(benches);
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

### Setup and Usage
```bash
# Install
cargo install flamegraph

# Generate flamegraph (requires perf on Linux, dtrace on macOS)
cargo flamegraph --bin my-app -- --some-args

# Profile specific benchmark
cargo flamegraph --bench my_benchmarks -- --bench "sorting"
```

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

### Cow for Flexible Ownership
```rust
use std::borrow::Cow;

// Avoids cloning when input is already owned
fn process(input: Cow<'_, str>) -> Cow<'_, str> {
    if input.contains("bad") {
        Cow::Owned(input.replace("bad", "good"))
    } else {
        input // No allocation — returns borrowed data
    }
}

// Usage
process(Cow::Borrowed("hello"));           // No allocation
process(Cow::Owned(String::from("hello"))); // Takes ownership
```

### Iterator Chains Over Intermediate Collections
```rust
// WRONG — allocates intermediate Vec
let filtered: Vec<_> = items.iter().filter(|x| x.active).collect();
let mapped: Vec<_> = filtered.iter().map(|x| x.name.clone()).collect();

// RIGHT — single pass, no intermediate allocation
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

### When to Use
```rust
// Small, hot functions called in tight loops
#[inline]
fn is_valid(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

// Force inlining for critical hot paths
#[inline(always)]
fn fast_hash(key: u64) -> u64 {
    key.wrapping_mul(0x517cc1b727220a95)
}

// Prevent inlining for cold error paths
#[cold]
#[inline(never)]
fn handle_error(err: Error) -> ! {
    eprintln!("fatal: {err}");
    std::process::exit(1);
}
```

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
```rust
// Preallocate when size is known or estimatable
let mut map = HashMap::with_capacity(1000);
let mut vec = Vec::with_capacity(items.len());
let mut s = String::with_capacity(256);

// Extend instead of repeated push
vec.extend(iter);
```

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
```rust
// Borrow input instead of cloning
struct Parser<'a> {
    input: &'a [u8],
    position: usize,
}

impl<'a> Parser<'a> {
    fn next_token(&mut self) -> &'a [u8] {
        let start = self.position;
        // ... advance position ...
        &self.input[start..self.position]
    }
}
```

### bytes::Bytes for Network Data
```rust
use bytes::Bytes;

// Reference-counted, cheaply cloneable byte buffer
let data = Bytes::from(vec![1, 2, 3, 4]);
let slice = data.slice(1..3); // No copy — shared reference
```
