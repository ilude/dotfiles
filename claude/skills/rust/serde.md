# Serde Serialization

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## Derive Basics

### Standard Derives
```rust
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub name: String,
    pub email: String,
}
```

### Feature-Gated Serde
```toml
# Cargo.toml
[features]
default = []
serde = ["dep:serde"]

[dependencies]
serde = { version = "1", features = ["derive"], optional = true }
```

```rust
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Config {
    pub name: String,
}
```

---

## Container Attributes

### rename_all
```rust
// JSON convention: camelCase
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    pub user_id: i64,        // → "userId"
    pub first_name: String,  // → "firstName"
    pub is_active: bool,     // → "isActive"
}

// Available: camelCase, snake_case, PascalCase, SCREAMING_SNAKE_CASE,
//            kebab-case, SCREAMING-KEBAB-CASE, lowercase, UPPERCASE
```

### deny_unknown_fields
```rust
// Strict deserialization — reject unexpected fields
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateUserRequest {
    pub name: String,
    pub email: String,
}
```

### tag / content (Enum Representations)
```rust
// Externally tagged (default): {"variant_name": { fields }}
#[derive(Serialize, Deserialize)]
enum Message {
    Text { body: String },
    Image { url: String, width: u32 },
}
// → {"Text": {"body": "hello"}}

// Internally tagged: {"type": "variant", fields}
#[derive(Serialize, Deserialize)]
#[serde(tag = "type")]
enum Event {
    Click { x: i32, y: i32 },
    Scroll { delta: f64 },
}
// → {"type": "Click", "x": 10, "y": 20}

// Adjacently tagged: {"t": "variant", "c": { fields }}
#[derive(Serialize, Deserialize)]
#[serde(tag = "t", content = "c")]
enum Payload {
    Data(Vec<u8>),
    Error(String),
}
// → {"t": "Data", "c": [1, 2, 3]}

// Untagged: tries each variant in order
#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum Value {
    Int(i64),
    Float(f64),
    Text(String),
}
// → 42 or 3.14 or "hello"
```

### Enum Representation Guide

| Style | Format | Best For |
|-------|--------|----------|
| External (default) | `{"Variant": data}` | Rust-to-Rust, internal APIs |
| Internal (`tag`) | `{"type": "Variant", ...}` | JSON APIs, readable output |
| Adjacent (`tag` + `content`) | `{"t": "V", "c": data}` | Mixed variant shapes |
| Untagged | data only | Accepting multiple input formats |

---

## Field Attributes

### Common Field Attributes
```rust
#[derive(Serialize, Deserialize)]
pub struct Config {
    // Rename individual field
    #[serde(rename = "apiKey")]
    pub api_key: String,

    // Use default if missing during deserialization
    #[serde(default)]
    pub retries: u32,

    // Custom default value
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,

    // Skip field entirely (both ser and de)
    #[serde(skip)]
    pub internal_cache: Option<Cache>,

    // Skip serializing if None
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    // Skip serializing if empty
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,

    // Flatten nested struct into parent
    #[serde(flatten)]
    pub metadata: Metadata,

    // Deserialize with custom function
    #[serde(deserialize_with = "deserialize_timestamp")]
    pub created_at: DateTime,

    // Serialize with custom function
    #[serde(serialize_with = "serialize_as_string")]
    pub big_number: u128,

    // Alias for backwards compatibility
    #[serde(alias = "user_name", alias = "username")]
    pub name: String,
}

fn default_timeout() -> u64 { 30 }
```

### Flatten
```rust
#[derive(Serialize, Deserialize)]
pub struct Metadata {
    pub created_by: String,
    pub version: u32,
}

#[derive(Serialize, Deserialize)]
pub struct Document {
    pub title: String,
    #[serde(flatten)]
    pub meta: Metadata,
}
// Serializes as: {"title": "...", "created_by": "...", "version": 1}
// NOT: {"title": "...", "meta": {"created_by": "...", "version": 1}}
```

### Flatten Rules
- MUST NOT combine `#[serde(flatten)]` with `#[serde(deny_unknown_fields)]`
- Flatten has a performance cost (uses intermediate `Map`)
- SHOULD use sparingly — prefer explicit fields for clarity

---

## Custom Serialize/Deserialize

### serialize_with / deserialize_with
```rust
use serde::{Serializer, Deserializer};

// Serialize Duration as seconds
fn serialize_duration_secs<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_u64(duration.as_secs())
}

fn deserialize_duration_secs<'de, D>(deserializer: D) -> Result<Duration, D::Error>
where
    D: Deserializer<'de>,
{
    let secs = u64::deserialize(deserializer)?;
    Ok(Duration::from_secs(secs))
}

#[derive(Serialize, Deserialize)]
struct Task {
    name: String,
    #[serde(serialize_with = "serialize_duration_secs",
            deserialize_with = "deserialize_duration_secs")]
    timeout: Duration,
}
```

### Full Custom Implementation
```rust
use serde::{Serialize, Serializer, Deserialize, Deserializer};
use serde::de::{self, Visitor};

struct HexColor(u8, u8, u8);

impl Serialize for HexColor {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let hex = format!("#{:02x}{:02x}{:02x}", self.0, self.1, self.2);
        serializer.serialize_str(&hex)
    }
}

impl<'de> Deserialize<'de> for HexColor {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct HexVisitor;

        impl<'de> Visitor<'de> for HexVisitor {
            type Value = HexColor;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "a hex color string like #ff00aa")
            }

            fn visit_str<E: de::Error>(self, v: &str) -> Result<HexColor, E> {
                let v = v.strip_prefix('#').unwrap_or(v);
                if v.len() != 6 {
                    return Err(E::custom("hex color must be 6 digits"));
                }
                let r = u8::from_str_radix(&v[0..2], 16).map_err(E::custom)?;
                let g = u8::from_str_radix(&v[2..4], 16).map_err(E::custom)?;
                let b = u8::from_str_radix(&v[4..6], 16).map_err(E::custom)?;
                Ok(HexColor(r, g, b))
            }
        }

        deserializer.deserialize_str(HexVisitor)
    }
}
```

---

## Zero-Copy Deserialization

### Borrowing from Input
```rust
use std::borrow::Cow;

// Borrows string data directly from the input buffer (no allocation)
#[derive(Deserialize)]
struct LogEntry<'a> {
    #[serde(borrow)]
    message: &'a str,

    #[serde(borrow)]
    source: Cow<'a, str>,  // Borrows when possible, owns when escaping needed

    level: u8,  // Copied (small value)
}

// Usage — input must outlive the deserialized value
let input = r#"{"message": "hello", "source": "app", "level": 3}"#;
let entry: LogEntry = serde_json::from_str(input)?;
// entry.message borrows from input — no String allocation
```

### Zero-Copy Rules
- `&'a str` borrows from input — zero allocation for unescaped strings
- `Cow<'a, str>` borrows when possible, allocates only for escaped content
- `&'a [u8]` borrows raw bytes
- MUST add `#[serde(borrow)]` for borrowed fields
- Input buffer MUST outlive the deserialized struct
- SHOULD use for high-throughput parsing where allocations matter
- Only works with formats that support borrowing (JSON from `&str`, not from `Read`)

---

## Format-Specific Patterns

### JSON
```rust
// Pretty printing
let json = serde_json::to_string_pretty(&value)?;

// From reader (streaming)
let value: Config = serde_json::from_reader(file)?;

// Raw value (delay parsing)
use serde_json::value::RawValue;
#[derive(Deserialize)]
struct Envelope<'a> {
    msg_type: String,
    #[serde(borrow)]
    payload: &'a RawValue,
}
```

### TOML
```rust
// Serialize
let toml_str = toml::to_string_pretty(&config)?;

// Deserialize
let config: Config = toml::from_str(&contents)?;

// TOML-specific: datetime
#[derive(Serialize, Deserialize)]
struct Entry {
    #[serde(with = "toml::datetime")]
    created: toml::value::Datetime,
}
```

### YAML
```rust
let config: Config = serde_yaml::from_str(&yaml_content)?;
let yaml_out = serde_yaml::to_string(&config)?;
```

### MessagePack (binary, compact)
```rust
// rmp-serde crate
let bytes = rmp_serde::to_vec(&value)?;
let decoded: Value = rmp_serde::from_slice(&bytes)?;
```

---

## Schema Evolution

### Adding Fields (Backwards Compatible)
```rust
#[derive(Serialize, Deserialize)]
struct ConfigV2 {
    name: String,
    // New field — old data deserializes with default
    #[serde(default)]
    retries: u32,
    // New optional field — old data has None
    #[serde(default, skip_serializing_if = "Option::is_none")]
    timeout: Option<u64>,
}
```

### Removing Fields
```rust
// Keep accepting old field but ignore it
#[derive(Deserialize)]
struct ConfigV3 {
    name: String,
    #[serde(default, skip_serializing)]
    #[allow(dead_code)]
    deprecated_field: serde::de::IgnoredAny,
}
```

### Renaming Fields
```rust
#[derive(Deserialize)]
struct Config {
    // Accept both old and new name
    #[serde(alias = "old_name")]
    new_name: String,
}
```

### Schema Evolution Rules
- MUST use `#[serde(default)]` when adding new fields
- MUST use `#[serde(alias)]` when renaming fields (accept both)
- SHOULD use `Option<T>` + `skip_serializing_if` for optional new fields
- MUST NOT change field types without a migration strategy
- MUST NOT remove fields from deserialization without `IgnoredAny` transition

---

## Performance

### simd-json (Drop-in Faster JSON)
```rust
// Same API as serde_json but uses SIMD instructions
let value: Config = simd_json::from_str(&mut json_string)?;
// Note: requires &mut String (modifies input buffer in place)
```

### Streaming / Incremental Parsing
```rust
use serde_json::Deserializer;

// Parse multiple JSON values from a stream
let reader = std::io::BufReader::new(file);
let stream = Deserializer::from_reader(reader).into_iter::<Record>();

for result in stream {
    let record = result?;
    process(record);
}
```

### Performance Rules
- SHOULD use `serde_json::from_str` over `from_reader` when data fits in memory (faster)
- SHOULD use streaming for large files that don't fit in memory
- MAY use `simd-json` for throughput-critical JSON parsing
- SHOULD pre-allocate `String`/`Vec` with `with_capacity` before serializing large data
- SHOULD benchmark with `criterion` before optimizing serialization

---

## Testing Serde Types

### Round-Trip Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip() {
        let original = Config {
            name: "test".to_string(),
            retries: 3,
            timeout: Some(30),
        };

        let json = serde_json::to_string(&original).unwrap();
        let decoded: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(original, decoded);
    }

    #[test]
    fn test_backwards_compat() {
        // Old format without new fields
        let old_json = r#"{"name": "test"}"#;
        let config: Config = serde_json::from_str(old_json).unwrap();
        assert_eq!(config.retries, 0); // default
        assert_eq!(config.timeout, None); // default
    }

    #[test]
    fn test_rejects_unknown_fields() {
        let bad_json = r#"{"name": "test", "unknown": true}"#;
        let result = serde_json::from_str::<StrictConfig>(bad_json);
        assert!(result.is_err());
    }

    #[test]
    fn test_specific_json_shape() {
        let value = Event::Click { x: 10, y: 20 };
        let json = serde_json::to_value(&value).unwrap();
        assert_eq!(json["type"], "Click");
        assert_eq!(json["x"], 10);
    }
}
```
