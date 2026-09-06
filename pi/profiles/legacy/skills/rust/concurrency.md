# Concurrency

## Shared State Primitives

### Arc (Atomic Reference Counting)
```rust
use std::sync::Arc;

let data = Arc::new(vec![1, 2, 3]);
let data_clone = Arc::clone(&data); // Increment reference count

std::thread::spawn(move || {
    println!("{data_clone:?}");
});
```

- MUST use `Arc::clone(&arc)` not `arc.clone()` for clarity
- `Arc<T>` provides shared ownership; does NOT provide interior mutability
- Combine with `Mutex` or `RwLock` for mutable shared state

### std::sync::Mutex vs tokio::sync::Mutex

| Feature | `std::sync::Mutex` | `tokio::sync::Mutex` |
|---------|--------------------|-----------------------|
| Blocking | Blocks thread | Yields to runtime |
| Across `.await` | MUST NOT hold | Safe to hold |
| Performance | Faster for sync | Required for async |
| Poisoning | Yes | No |

```rust
// Use std::sync::Mutex when lock is held briefly (no .await inside)
let data = Arc::new(std::sync::Mutex::new(HashMap::new()));
{
    let mut map = data.lock().unwrap();
    map.insert("key", "value");
} // Released immediately

// Use tokio::sync::Mutex when lock must be held across .await
let data = Arc::new(tokio::sync::Mutex::new(Connection::new()));
{
    let mut conn = data.lock().await;
    conn.query("SELECT 1").await?; // .await while holding lock
}
```

- SHOULD use `RwLock` when reads greatly outnumber writes
- SHOULD prefer `Mutex` when read/write ratio is balanced (simpler, less overhead)

### parking_lot alternatives
`parking_lot` provides non-poisoning `Mutex` and `RwLock` implementations with smaller, often faster locks; adopt it consistently rather than mixing lock families.

Benefits over `std::sync`:
- No lock poisoning (panics don't permanently lock)
- Smaller (1 byte for `Mutex`, 1 word for `RwLock`)
- Faster under contention
- `const fn` constructors

---

## Atomics

### Atomic Types
```rust
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};

static INITIALIZED: AtomicBool = AtomicBool::new(false);
static COUNTER: AtomicU64 = AtomicU64::new(0);

// Simple flag
INITIALIZED.store(true, Ordering::Release);
if INITIALIZED.load(Ordering::Acquire) { /* ... */ }

// Counter
let old = COUNTER.fetch_add(1, Ordering::Relaxed);
```

### Ordering Guide

| Ordering | Use Case |
|----------|----------|
| `Relaxed` | Counters, statistics - no ordering guarantees needed |
| `Acquire` | Reading a flag/value set by another thread (pairs with `Release`) |
| `Release` | Writing a flag/value to be read by another thread (pairs with `Acquire`) |
| `AcqRel` | Read-modify-write when both sides need ordering (e.g., `compare_exchange`) |
| `SeqCst` | When unsure - strictest ordering, always correct, slight perf cost |

### Ordering Rules
- MUST use `SeqCst` when unsure about correct ordering
- SHOULD use `Relaxed` for standalone counters and statistics
- SHOULD pair `Acquire` loads with `Release` stores
- MUST NOT use `Relaxed` when synchronizing access to non-atomic data

### Compare-and-Swap
```rust
use std::sync::atomic::{AtomicU32, Ordering};

let value = AtomicU32::new(5);

// Only update if current value is 5
match value.compare_exchange(5, 10, Ordering::AcqRel, Ordering::Acquire) {
    Ok(prev) => println!("updated from {prev}"),
    Err(actual) => println!("expected 5, found {actual}"),
}

// Weak version (may spuriously fail, but faster in loops)
loop {
    let current = value.load(Ordering::Acquire);
    let new = current + 1;
    if value.compare_exchange_weak(current, new, Ordering::AcqRel, Ordering::Acquire).is_ok() {
        break;
    }
}
```

---

## Send and Sync Traits

### Definitions
- `Send` - type can be **transferred** to another thread
- `Sync` - type can be **referenced** from another thread (`&T` is `Send`)

### Common Types

| Type | Send | Sync | Why |
|------|------|------|-----|
| `i32`, `String`, `Vec<T>` | Yes | Yes | No interior mutability |
| `Arc<T>` | If T: Send + Sync | If T: Send + Sync | Shared ownership |
| `Mutex<T>` | If T: Send | Yes | Synchronizes access |
| `Cell<T>` | If T: Send | **No** | Interior mutability, not thread-safe |
| `Rc<T>` | **No** | **No** | Non-atomic reference count |
| `*const T` / `*mut T` | **No** | **No** | Raw pointers |

### Asserting Thread Safety
```rust
fn assert_send<T: Send>() {}
fn assert_sync<T: Sync>() {}

// Compile-time check
assert_send::<MyType>();
assert_sync::<MyType>();
```

---

## Crossbeam

### Scoped Threads
Use `crossbeam::scope` when threads must borrow enclosing data; its scope guarantees joins before borrowed data can go out of scope.

### Crossbeam Channels
Use bounded channels for backpressure and `select!` to receive from multiple sources.

---

## Deadlock Prevention

### Rules
1. MUST acquire locks in a consistent global order
2. MUST NOT hold a lock while acquiring another (when possible)
3. SHOULD minimize lock scope
4. SHOULD prefer message passing over shared mutable state

### Lock Ordering Pattern
```rust
struct Database {
    users: Mutex<HashMap<u64, User>>,
    sessions: Mutex<HashMap<String, Session>>,
}

impl Database {
    fn transfer(&self) {
        // ALWAYS lock users before sessions
        let users = self.users.lock().unwrap();
        let sessions = self.sessions.lock().unwrap();
        // ... use both
    }
}
```

### Prefer Message Passing
```rust
use tokio::sync::mpsc;

// Instead of shared mutable state with locks:
enum Command {
    Get { key: String, resp: oneshot::Sender<Option<String>> },
    Set { key: String, value: String },
}

async fn state_manager(mut rx: mpsc::Receiver<Command>) {
    let mut map = HashMap::new();
    while let Some(cmd) = rx.recv().await {
        match cmd {
            Command::Get { key, resp } => {
                let _ = resp.send(map.get(&key).cloned());
            }
            Command::Set { key, value } => {
                map.insert(key, value);
            }
        }
    }
}
```

---

## Thread Pool Patterns

### Rayon for Data Parallelism
```rust
use rayon::prelude::*;

// Parallel iterator
let sum: i64 = (0..1_000_000i64)
    .into_par_iter()
    .filter(|&x| x % 2 == 0)
    .map(|x| x * x)
    .sum();

// Parallel sort
let mut data = vec![5, 3, 1, 4, 2];
data.par_sort();

// Parallel collection processing
let results: Vec<_> = items
    .par_iter()
    .map(|item| process(item))
    .collect();
```

### When to Use What

| Tool | Use Case |
|------|----------|
| `tokio::spawn` | Async I/O tasks |
| `spawn_blocking` | Blocking I/O in async context |
| `std::thread` | OS threads, simple parallelism |
| `crossbeam::scope` | Borrowing data across threads |
| `rayon` | Data-parallel computation (map/filter/reduce) |
