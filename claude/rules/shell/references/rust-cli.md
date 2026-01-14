# Rust CLI Development

This document covers Rust-specific CLI development patterns using Clap and related crates.

## Clap Overview

Clap is the dominant CLI library in the Rust ecosystem. It offers both derive-based and builder-based APIs.

### Project Structure

```
mycli/
  src/
    main.rs
    cli.rs           # CLI definition
    commands/
      mod.rs
      add.rs
      list.rs
      config.rs
    config.rs        # Configuration handling
    error.rs         # Error types
    output.rs        # Output formatting
  Cargo.toml
```

## Cargo.toml Setup

```toml
[package]
name = "mycli"
version = "0.1.0"
edition = "2021"

[dependencies]
clap = { version = "4", features = ["derive", "env"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serde_yaml = "0.9"
anyhow = "1"           # Error handling
thiserror = "1"        # Custom errors
colored = "2"          # Color output
indicatif = "0.17"     # Progress bars
dialoguer = "0.11"     # Interactive prompts
config = "0.14"        # Configuration
dirs = "5"             # Cross-platform directories
```

## Derive-Based CLI

### Main Structure

```rust
// src/cli.rs
use clap::{Parser, Subcommand, Args, ValueEnum};

#[derive(Parser)]
#[command(name = "mycli")]
#[command(author, version, about, long_about = None)]
#[command(propagate_version = true)]
pub struct Cli {
    /// Enable verbose output
    #[arg(short, long, global = true)]
    pub verbose: bool,

    /// Enable debug mode
    #[arg(long, global = true, env = "MYCLI_DEBUG")]
    pub debug: bool,

    /// Config file path
    #[arg(short, long, global = true, value_name = "FILE")]
    pub config: Option<PathBuf>,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Add a new item
    Add(AddArgs),
    /// List all items
    List(ListArgs),
    /// Manage configuration
    #[command(subcommand)]
    Config(ConfigCommands),
}

#[derive(Args)]
pub struct AddArgs {
    /// Item name
    pub name: String,

    /// Priority level (1-10)
    #[arg(short, long, default_value = "5", value_parser = clap::value_parser!(u8).range(1..=10))]
    pub priority: u8,

    /// Tags (comma-separated)
    #[arg(short, long, value_delimiter = ',')]
    pub tags: Vec<String>,
}

#[derive(Args)]
pub struct ListArgs {
    /// Output format
    #[arg(short, long, default_value = "table", value_enum)]
    pub format: OutputFormat,

    /// Filter by status
    #[arg(long)]
    pub status: Option<String>,
}

#[derive(Clone, ValueEnum)]
pub enum OutputFormat {
    Table,
    Json,
    Yaml,
    Csv,
}

#[derive(Subcommand)]
pub enum ConfigCommands {
    /// Show configuration
    Show,
    /// Set a configuration value
    Set {
        key: String,
        value: String,
    },
}
```

### Main Entry Point

```rust
// src/main.rs
mod cli;
mod commands;
mod config;
mod error;
mod output;

use clap::Parser;
use cli::{Cli, Commands};

fn main() {
    if let Err(e) = run() {
        eprintln!("Error: {e}");
        std::process::exit(1);
    }
}

fn run() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Initialize config
    let config = config::load(&cli.config)?;

    match cli.command {
        Commands::Add(args) => commands::add::run(args, &config, cli.verbose)?,
        Commands::List(args) => commands::list::run(args, &config)?,
        Commands::Config(cmd) => match cmd {
            cli::ConfigCommands::Show => commands::config::show(&config)?,
            cli::ConfigCommands::Set { key, value } => {
                commands::config::set(&key, &value)?
            }
        },
    }

    Ok(())
}
```

## Command Implementation

### Add Command

```rust
// src/commands/add.rs
use crate::cli::AddArgs;
use crate::config::Config;
use anyhow::Result;
use colored::Colorize;

pub fn run(args: AddArgs, config: &Config, verbose: bool) -> Result<()> {
    if verbose {
        println!("{} Adding item: {}", "INFO".blue(), args.name);
    }

    // Actual implementation...

    println!(
        "{} Added {} with priority {}",
        "✓".green(),
        args.name.bold(),
        args.priority
    );

    if !args.tags.is_empty() {
        println!("Tags: {}", args.tags.join(", "));
    }

    Ok(())
}
```

### List Command with Output Formatting

```rust
// src/commands/list.rs
use crate::cli::{ListArgs, OutputFormat};
use crate::config::Config;
use crate::output;
use anyhow::Result;
use serde::Serialize;

#[derive(Serialize)]
struct Item {
    name: String,
    status: String,
    priority: u8,
}

pub fn run(args: ListArgs, config: &Config) -> Result<()> {
    let items = vec![
        Item { name: "Item 1".into(), status: "active".into(), priority: 5 },
        Item { name: "Item 2".into(), status: "inactive".into(), priority: 3 },
    ];

    // Filter if needed
    let items: Vec<_> = if let Some(status) = &args.status {
        items.into_iter().filter(|i| &i.status == status).collect()
    } else {
        items
    };

    output::print(&items, &args.format)
}
```

## Error Handling

### Custom Error Types

```rust
// src/error.rs
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CliError {
    #[error("item '{0}' not found")]
    NotFound(String),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("permission denied: {0}")]
    Permission(String),

    #[error("configuration error: {0}")]
    Config(String),

    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

impl CliError {
    pub fn exit_code(&self) -> i32 {
        match self {
            CliError::NotFound(_) => 66,
            CliError::InvalidInput(_) => 2,
            CliError::Permission(_) => 77,
            CliError::Config(_) => 78,
            _ => 1,
        }
    }
}
```

### Error Handling in Main

```rust
// src/main.rs
use crate::error::CliError;

fn main() {
    if let Err(e) = run() {
        let code = if let Some(cli_err) = e.downcast_ref::<CliError>() {
            eprintln!("Error: {cli_err}");
            cli_err.exit_code()
        } else {
            eprintln!("Error: {e}");
            if std::env::var("MYCLI_DEBUG").is_ok() {
                eprintln!("{e:?}");
            }
            1
        };
        std::process::exit(code);
    }
}
```

## Progress Indicators

### Using indicatif

```rust
use indicatif::{ProgressBar, ProgressStyle, MultiProgress};
use std::time::Duration;

// Simple progress bar
fn process_with_progress(items: &[Item]) -> Result<()> {
    let pb = ProgressBar::new(items.len() as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{bar:40.cyan/blue}] {pos}/{len} ({eta})")?
            .progress_chars("#>-")
    );

    for item in items {
        process_item(item)?;
        pb.inc(1);
    }

    pb.finish_with_message("Done!");
    Ok(())
}

// Spinner for indeterminate progress
fn fetch_with_spinner() -> Result<Data> {
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .template("{spinner:.green} {msg}")?
    );
    spinner.set_message("Fetching data...");
    spinner.enable_steady_tick(Duration::from_millis(100));

    let result = fetch_data()?;

    spinner.finish_with_message("Data fetched!");
    Ok(result)
}
```

## Interactive Prompts

### Using dialoguer

```rust
use dialoguer::{Confirm, Input, Select, MultiSelect, Password, theme::ColorfulTheme};

fn interactive_create() -> Result<Item> {
    let theme = ColorfulTheme::default();

    // Text input
    let name: String = Input::with_theme(&theme)
        .with_prompt("Item name")
        .validate_with(|input: &String| {
            if input.is_empty() {
                Err("Name cannot be empty")
            } else {
                Ok(())
            }
        })
        .interact_text()?;

    // Selection
    let priorities = vec!["Low", "Medium", "High"];
    let priority_idx = Select::with_theme(&theme)
        .with_prompt("Select priority")
        .items(&priorities)
        .default(1)
        .interact()?;

    // Multi-selection
    let tags = vec!["work", "personal", "urgent", "optional"];
    let selected_tags = MultiSelect::with_theme(&theme)
        .with_prompt("Select tags")
        .items(&tags)
        .interact()?;

    let selected_tag_names: Vec<_> = selected_tags
        .iter()
        .map(|&i| tags[i].to_string())
        .collect();

    // Confirmation
    if !Confirm::with_theme(&theme)
        .with_prompt("Create item?")
        .default(true)
        .interact()?
    {
        anyhow::bail!("Cancelled");
    }

    // Password (hidden input)
    let _secret: String = Password::with_theme(&theme)
        .with_prompt("Enter secret")
        .interact()?;

    Ok(Item {
        name,
        priority: (priority_idx + 1) as u8,
        tags: selected_tag_names,
    })
}
```

## Color Output

### Using colored

```rust
use colored::Colorize;

fn print_status(status: &str, message: &str) {
    match status {
        "success" => println!("{} {}", "✓".green().bold(), message),
        "warning" => println!("{} {}", "!".yellow().bold(), message),
        "error" => println!("{} {}", "✗".red().bold(), message),
        "info" => println!("{} {}", "i".blue().bold(), message),
        _ => println!("{}", message),
    }
}

fn print_diff(old: &str, new: &str) {
    println!("{} {}", "-".red(), old.red());
    println!("{} {}", "+".green(), new.green());
}

// Respect NO_COLOR
fn init_colors() {
    if std::env::var("NO_COLOR").is_ok() {
        colored::control::set_override(false);
    }
}
```

## Testing

### Unit Tests

```rust
// src/cli.rs tests
#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[test]
    fn test_add_command() {
        let cli = Cli::try_parse_from([
            "mycli", "add", "test-item", "--priority", "8"
        ]).unwrap();

        match cli.command {
            Commands::Add(args) => {
                assert_eq!(args.name, "test-item");
                assert_eq!(args.priority, 8);
            }
            _ => panic!("Expected Add command"),
        }
    }

    #[test]
    fn test_priority_validation() {
        let result = Cli::try_parse_from([
            "mycli", "add", "test", "--priority", "15"
        ]);

        assert!(result.is_err());
    }

    #[test]
    fn test_tags_parsing() {
        let cli = Cli::try_parse_from([
            "mycli", "add", "test", "--tags", "a,b,c"
        ]).unwrap();

        match cli.command {
            Commands::Add(args) => {
                assert_eq!(args.tags, vec!["a", "b", "c"]);
            }
            _ => panic!("Expected Add command"),
        }
    }
}
```

### Integration Tests

```rust
// tests/integration_test.rs
use assert_cmd::Command;
use predicates::prelude::*;

#[test]
fn test_help() {
    let mut cmd = Command::cargo_bin("mycli").unwrap();
    cmd.arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Usage:"));
}

#[test]
fn test_version() {
    let mut cmd = Command::cargo_bin("mycli").unwrap();
    cmd.arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains(env!("CARGO_PKG_VERSION")));
}

#[test]
fn test_add_command() {
    let mut cmd = Command::cargo_bin("mycli").unwrap();
    cmd.args(["add", "test-item", "--priority", "5"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Added test-item"));
}

#[test]
fn test_invalid_command() {
    let mut cmd = Command::cargo_bin("mycli").unwrap();
    cmd.arg("invalid")
        .assert()
        .failure()
        .stderr(predicate::str::contains("error"));
}

#[test]
fn test_json_output() {
    let mut cmd = Command::cargo_bin("mycli").unwrap();
    cmd.args(["list", "--format", "json"])
        .assert()
        .success()
        .stdout(predicate::str::starts_with("["));
}
```

## Build Configuration

### Cargo.toml for Release

```toml
[profile.release]
lto = true
codegen-units = 1
strip = true

[profile.release-with-debug]
inherits = "release"
debug = true
strip = false
```

### Build Script for Version Info

```rust
// build.rs
fn main() {
    // Set build-time info
    println!("cargo:rustc-env=BUILD_DATE={}", chrono::Utc::now().format("%Y-%m-%d"));

    // Git info
    if let Ok(output) = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
    {
        if output.status.success() {
            let commit = String::from_utf8_lossy(&output.stdout);
            println!("cargo:rustc-env=GIT_COMMIT={}", commit.trim());
        }
    }
}
```

## See Also

- [CLI Development Guidelines](../cli-development.md) - Core principles and patterns
- [Python CLI Patterns](python-cli.md)
- [Node.js CLI Patterns](nodejs-cli.md)
- [Go CLI Patterns](go-cli.md)
