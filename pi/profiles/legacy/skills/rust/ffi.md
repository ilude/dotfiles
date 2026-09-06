# Foreign Function Interface (FFI)

## C FFI Fundamentals

### Exporting Functions
```rust
// lib.rs - crate-type = ["cdylib"] in Cargo.toml

/// # Safety
/// `name` must be a valid null-terminated C string.
#[no_mangle]
pub unsafe extern "C" fn greet(name: *const std::ffi::c_char) -> *mut std::ffi::c_char {
    let name = unsafe { std::ffi::CStr::from_ptr(name) };
    let name = name.to_str().unwrap_or("unknown");
    let greeting = format!("Hello, {name}!");
    std::ffi::CString::new(greeting).unwrap().into_raw()
}

/// Free a string allocated by this library.
///
/// # Safety
/// `ptr` must have been returned by a function in this library.
#[no_mangle]
pub unsafe extern "C" fn free_string(ptr: *mut std::ffi::c_char) {
    if !ptr.is_null() {
        unsafe { drop(std::ffi::CString::from_raw(ptr)); }
    }
}
```

### Cargo.toml for C Library
```toml
[lib]
crate-type = ["cdylib", "staticlib"]  # .so/.dll and .a/.lib
```

### C FFI Rules
- MUST use `#[no_mangle]` on exported functions
- MUST use `extern "C"` calling convention
- MUST document `# Safety` on all `pub unsafe` functions
- MUST provide a `free_*` function for every allocation returned to C
- MUST check for null pointers on all incoming raw pointers
- MUST NOT let panics unwind across FFI boundary

---

## Repr and Layout

### #[repr(C)]
```rust
// C-compatible memory layout (predictable field order and padding)
#[repr(C)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[repr(C)]
pub struct Buffer {
    pub data: *const u8,
    pub len: usize,
}

// C-compatible enum (integer representation)
#[repr(C)]
pub enum Status {
    Ok = 0,
    Error = 1,
    NotFound = 2,
}

// Fixed-size integer repr
#[repr(u32)]
pub enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
}
```

### Layout Rules
- MUST use `#[repr(C)]` on all types shared with C
- MUST use integer repr (`#[repr(u8)]`, `#[repr(i32)]`, etc.) for enums crossing FFI
- MUST NOT use Rust-specific types (`String`, `Vec`, `Option`) in `#[repr(C)]` structs
- Use `bool` carefully - C `_Bool` and Rust `bool` differ on some platforms; prefer `u8`

---

## String Handling

### CString and CStr
```rust
use std::ffi::{CStr, CString, c_char};

// Rust to C: CString (owned, null-terminated)
let rust_string = "hello";
let c_string = CString::new(rust_string)?; // Fails if string contains \0
let ptr: *const c_char = c_string.as_ptr();
// c_string must live as long as ptr is used

// C to Rust: CStr (borrowed view of C string)
unsafe fn from_c(ptr: *const c_char) -> String {
    let c_str = unsafe { CStr::from_ptr(ptr) };
    c_str.to_string_lossy().into_owned()
}
```

### Slice Passing
```rust
// Pass Rust slice to C as pointer + length
#[no_mangle]
pub extern "C" fn process_data(data: *const u8, len: usize) -> i32 {
    if data.is_null() { return -1; }
    let slice = unsafe { std::slice::from_raw_parts(data, len) };
    // ... process slice ...
    0
}

// Return data to C via caller-provided buffer
#[no_mangle]
pub extern "C" fn fill_buffer(out: *mut u8, out_len: usize) -> usize {
    if out.is_null() { return 0; }
    let data = b"hello";
    let copy_len = data.len().min(out_len);
    unsafe {
        std::ptr::copy_nonoverlapping(data.as_ptr(), out, copy_len);
    }
    copy_len
}
```

---

## Opaque Type Pattern

```rust
// Expose complex Rust types to C as opaque pointers

pub struct Engine {
    // Complex Rust internals - not exposed to C
    config: Config,
    state: HashMap<String, Value>,
}

// Create
#[no_mangle]
pub extern "C" fn engine_new() -> *mut Engine {
    Box::into_raw(Box::new(Engine::default()))
}

// Use
/// # Safety
/// `engine` must be a valid pointer from `engine_new`.
#[no_mangle]
pub unsafe extern "C" fn engine_process(engine: *mut Engine, input: *const c_char) -> i32 {
    if engine.is_null() || input.is_null() { return -1; }
    let engine = unsafe { &mut *engine };
    let input = unsafe { CStr::from_ptr(input) }.to_str().unwrap_or("");

    match engine.process(input) {
        Ok(_) => 0,
        Err(_) => -1,
    }
}

// Destroy
/// # Safety
/// `engine` must be a valid pointer from `engine_new`. Must not be used after this call.
#[no_mangle]
pub unsafe extern "C" fn engine_free(engine: *mut Engine) {
    if !engine.is_null() {
        unsafe { drop(Box::from_raw(engine)); }
    }
}
```

### Opaque Type Rules
- MUST pair every `*_new()` with a `*_free()` function
- MUST document ownership transfer in function docs
- MUST check null before dereferencing
- SHOULD use `Box::into_raw` / `Box::from_raw` for heap allocation
- MUST NOT expose struct fields - only accessor functions

---

## Error Handling Across FFI

### Error Code Pattern
```rust
#[repr(C)]
pub enum ErrorCode {
    Success = 0,
    NullPointer = 1,
    InvalidInput = 2,
    IoError = 3,
    Unknown = 99,
}

// Thread-local last error message
use std::cell::RefCell;

thread_local! {
    static LAST_ERROR: RefCell<Option<String>> = const { RefCell::new(None) };
}

fn set_last_error(msg: String) {
    LAST_ERROR.with(|e| *e.borrow_mut() = Some(msg));
}

#[no_mangle]
pub extern "C" fn get_last_error() -> *const c_char {
    LAST_ERROR.with(|e| {
        match &*e.borrow() {
            Some(msg) => {
                // Caller must copy before next FFI call
                CString::new(msg.as_str()).unwrap().into_raw()
            }
            None => std::ptr::null(),
        }
    })
}
```

### Panic Safety
```rust
use std::panic;

#[no_mangle]
pub extern "C" fn safe_operation(input: *const c_char) -> i32 {
    let result = panic::catch_unwind(|| {
        // All Rust code here - panics caught
        if input.is_null() { return -1; }
        let s = unsafe { CStr::from_ptr(input) };
        do_work(s.to_str().unwrap_or(""))
    });

    match result {
        Ok(code) => code,
        Err(_) => {
            set_last_error("internal panic occurred".to_string());
            -99
        }
    }
}
```

---

## cbindgen

### Setup
```toml
# Cargo.toml
[package.metadata.cxx]
# or install: cargo install cbindgen

[build-dependencies]
# Optional: run cbindgen from build.rs
```

### cbindgen.toml
```toml
language = "C"
include_guard = "MY_LIB_H"
autogen_warning = "/* Warning: this file is autogenerated by cbindgen. Don't modify this manually. */"

[export]
include = ["Engine", "ErrorCode", "Point"]

[fn]
prefix = "MYLIB_API"
```

### Generate Header
```bash
cbindgen --config cbindgen.toml --crate my-lib --output include/my_lib.h
```

---

## PyO3 (Python Bindings)

### Module design
Expose narrow `#[pyfunction]` and `#[pyclass]` APIs, translate Rust errors to Python exceptions, and release the GIL around CPU-bound Rust work.

### Cargo.toml for PyO3
```toml
[lib]
name = "my_module"
crate-type = ["cdylib"]

[dependencies]
pyo3 = { version = "0.22", features = ["extension-module"] }
```

### Error handling in PyO3
Map Rust failures to specific Python exception types and preserve actionable context without exposing internal details.

### Releasing the GIL
Release the GIL around CPU-intensive Rust work, but do not access Python objects while it is released.

### Building with Maturin
```bash
# Install
pip install maturin

# Development build (installs in current venv)
maturin develop --release

# Build wheel
maturin build --release

# Publish to PyPI
maturin publish
```

### pyproject.toml
```toml
[build-system]
requires = ["maturin>=1.0,<2.0"]
build-backend = "maturin"

[project]
name = "my-module"
requires-python = ">=3.9"

[tool.maturin]
features = ["pyo3/extension-module"]
```

---

## wasm-bindgen (WebAssembly)

### Basic Setup
```toml
# Cargo.toml
[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
```

### Exporting to JavaScript
Export small, ownership-clear APIs with `#[wasm_bindgen]`; do not expose pointers into reallocatable Rust storage without a lifetime and invalidation contract.

### Calling JavaScript from Rust
Declare imported JavaScript functions in an `extern "C"` block and keep conversion, exception, and ownership behavior explicit.

### web-sys (DOM Access)
Use `web-sys` for browser APIs and return `Result<_, JsValue>` for fallible DOM operations.

### Building with wasm-pack
Use `wasm-pack` with the target matching the consumer (bundler, web, or Node.js) and run browser tests in a target runtime.

---

## Testing FFI Code

### FFI tests
Exercise null input, ownership transfer, error codes, and allocation/free lifecycles from the foreign caller's perspective. Test Python and WebAssembly exports through their target runtimes.

### Memory Safety Checklist
- [ ] Every `*_new()` has a matching `*_free()`
- [ ] All null pointer inputs return error codes (not crash)
- [ ] No panics can unwind across FFI boundary
- [ ] All `unsafe` blocks have `// SAFETY:` comments
- [ ] Strings are properly null-terminated
- [ ] Buffer lengths are validated before access
- [ ] Thread safety is documented (is the type `Send`? `Sync`?)
