# Async Rust

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## Runtime Setup

### Tokio Runtime
```rust
// Application entry point
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Multi-threaded runtime (default)
    run().await
}

// Custom runtime configuration
fn main() -> anyhow::Result<()> {
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()?
        .block_on(run())
}

// Single-threaded (useful for testing or constrained environments)
#[tokio::main(flavor = "current_thread")]
async fn main() { /* ... */ }
```

### Runtime Rules
- MUST call `.await` on futures — constructing a future does nothing
- MUST NOT block the async runtime with synchronous I/O
- SHOULD use `tokio::main` for applications, manual `Runtime` for libraries

---

## Spawning Tasks

### `tokio::spawn`
```rust
use tokio::task::JoinHandle;

let handle: JoinHandle<String> = tokio::spawn(async {
    expensive_operation().await;
    "done".to_string()
});

// Await the result
let result = handle.await?; // JoinError if task panicked
```

### `JoinSet` for Managing Multiple Tasks
```rust
use tokio::task::JoinSet;

let mut set = JoinSet::new();

for url in urls {
    set.spawn(async move {
        fetch(url).await
    });
}

// Collect results as they complete
while let Some(result) = set.join_next().await {
    match result {
        Ok(response) => process(response),
        Err(join_err) => eprintln!("task failed: {join_err}"),
    }
}
```

### Spawn Rules
- MUST ensure spawned futures are `Send + 'static`
- MUST handle `JoinError` (task panic or cancellation)
- SHOULD use `JoinSet` over manual `Vec<JoinHandle>` for multiple tasks
- SHOULD use `spawn_blocking` for CPU-heavy or synchronous work

### `spawn_blocking` for Sync Work
```rust
// Move blocking work off the async runtime
let result = tokio::task::spawn_blocking(move || {
    // CPU-intensive or blocking I/O
    compute_hash(&data)
}).await?;
```

---

## Select and Cancellation

### `tokio::select!`
```rust
use tokio::time::{sleep, Duration};

tokio::select! {
    result = async_operation() => {
        println!("operation completed: {result:?}");
    }
    _ = sleep(Duration::from_secs(5)) => {
        println!("timeout");
    }
    _ = shutdown_signal() => {
        println!("shutting down");
    }
}
```

### Select Rules
- Unselected branches are **dropped** (cancelled)
- MUST NOT rely on side effects in cancelled branches
- SHOULD use `biased;` when priority ordering matters:
```rust
tokio::select! {
    biased;
    _ = shutdown.recv() => return, // Always check shutdown first
    msg = rx.recv() => handle(msg),
}
```

### Cancellation Safety
```rust
// WRONG — partial read lost on cancellation
tokio::select! {
    data = reader.read_to_end(&mut buf) => { /* ... */ }
    _ = cancel => { /* buf may have partial data */ }
}

// RIGHT — use cancellation-safe methods
tokio::select! {
    result = reader.read(&mut buf) => { /* reads one chunk */ }
    _ = cancel => { /* no partial state */ }
}
```

- MUST use cancellation-safe methods in `select!` branches
- Check tokio docs for which methods are cancellation-safe
- `recv()` on channels is cancellation-safe; `read_to_end()` is NOT

---

## Channels

### mpsc (Multi-Producer, Single-Consumer)
```rust
use tokio::sync::mpsc;

let (tx, mut rx) = mpsc::channel::<Message>(100); // bounded

// Send
tx.send(Message::new()).await?; // SendError if receiver dropped

// Receive
while let Some(msg) = rx.recv().await {
    process(msg);
}
// recv() returns None when all senders dropped
```

### oneshot (Single Value, Once)
```rust
use tokio::sync::oneshot;

let (tx, rx) = oneshot::channel::<Response>();

// Responder
tokio::spawn(async move {
    let result = compute().await;
    let _ = tx.send(result); // Ignore error if receiver dropped
});

// Requester
let response = rx.await?; // RecvError if sender dropped
```

### broadcast (Multi-Producer, Multi-Consumer)
```rust
use tokio::sync::broadcast;

let (tx, _) = broadcast::channel::<Event>(16);

let mut rx1 = tx.subscribe();
let mut rx2 = tx.subscribe();

tx.send(Event::Shutdown)?;

// Both receivers get the event
let event = rx1.recv().await?;
```

### watch (Single Value, Latest-Wins)
```rust
use tokio::sync::watch;

let (tx, mut rx) = watch::channel(AppState::Starting);

// Update state
tx.send(AppState::Ready)?;

// Wait for changes
rx.changed().await?;
let current = rx.borrow().clone();
```

### Channel Selection Guide

| Channel | Producers | Consumers | Values | Use Case |
|---------|-----------|-----------|--------|----------|
| `mpsc` | Many | One | Stream | Work queues, event streams |
| `oneshot` | One | One | Single | Request/response, completion signal |
| `broadcast` | Many | Many | Stream | Event bus, pub/sub |
| `watch` | One | Many | Latest | Config updates, state sharing |

---

## Common Pitfalls

### Blocking in Async Context
```rust
// WRONG — blocks the runtime thread
async fn bad() {
    std::thread::sleep(Duration::from_secs(1)); // blocks!
    std::fs::read_to_string("file.txt").unwrap(); // blocks!
}

// RIGHT — use async equivalents or spawn_blocking
async fn good() {
    tokio::time::sleep(Duration::from_secs(1)).await;
    tokio::fs::read_to_string("file.txt").await.unwrap();
}
```

### Send + 'static Requirements
```rust
// WRONG — borrows local data
let data = vec![1, 2, 3];
tokio::spawn(async {
    println!("{data:?}"); // error: data does not live long enough
});

// RIGHT — move ownership into the task
let data = vec![1, 2, 3];
tokio::spawn(async move {
    println!("{data:?}");
});
```

### Holding Locks Across Await
```rust
use tokio::sync::Mutex;

// WRONG — MutexGuard held across await point
let guard = mutex.lock().await;
some_async_fn().await; // other tasks can't lock during this await
drop(guard);

// RIGHT — minimize lock scope
{
    let mut guard = mutex.lock().await;
    guard.update(value);
} // guard dropped before await
some_async_fn().await;
```

### Forgetting to Poll Futures
```rust
// WRONG — future is created but never polled
async fn bad() {
    some_async_fn(); // does nothing! Missing .await
}

// RIGHT
async fn good() {
    some_async_fn().await;
}
```

---

## Async Patterns

### Graceful Shutdown
```rust
use tokio::signal;
use tokio::sync::watch;

async fn run() -> anyhow::Result<()> {
    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    let worker = tokio::spawn(worker_loop(shutdown_rx.clone()));

    signal::ctrl_c().await?;
    let _ = shutdown_tx.send(true);

    worker.await?;
    Ok(())
}

async fn worker_loop(mut shutdown: watch::Receiver<bool>) {
    loop {
        tokio::select! {
            biased;
            _ = shutdown.changed() => {
                if *shutdown.borrow() { return; }
            }
            _ = do_work() => {}
        }
    }
}
```

### Timeout Wrapper
```rust
use tokio::time::{timeout, Duration};

match timeout(Duration::from_secs(5), async_operation()).await {
    Ok(result) => result?,
    Err(_elapsed) => return Err(anyhow::anyhow!("operation timed out")),
}
```

### Retry with Backoff
```rust
use tokio::time::{sleep, Duration};

async fn retry<F, Fut, T, E>(mut f: F, max_retries: u32) -> Result<T, E>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
{
    let mut attempt = 0;
    loop {
        match f().await {
            Ok(val) => return Ok(val),
            Err(e) if attempt < max_retries => {
                attempt += 1;
                sleep(Duration::from_millis(100 * 2u64.pow(attempt))).await;
            }
            Err(e) => return Err(e),
        }
    }
}
```
