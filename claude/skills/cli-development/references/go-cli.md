---
name: cli-development/go-cli
description: Go CLI development patterns with Cobra.
---

# Go CLI Development

This document covers Go-specific CLI development patterns, primarily using Cobra.

## Cobra Overview

Cobra is the de facto standard for Go CLIs. Used by kubectl, hugo, gh, and many others.

### Project Structure

```
mycli/
  cmd/
    root.go       # Root command
    add.go        # add subcommand
    list.go       # list subcommand
    config/
      config.go   # config subcommand group
      show.go     # config show
      set.go      # config set
  internal/
    config/       # Configuration handling
    output/       # Output formatting
  main.go
  go.mod
```

## Basic Setup

### Main Entry Point

```go
// main.go
package main

import (
    "os"
    "mycli/cmd"
)

func main() {
    if err := cmd.Execute(); err != nil {
        os.Exit(1)
    }
}
```

### Root Command

```go
// cmd/root.go
package cmd

import (
    "fmt"
    "os"

    "github.com/spf13/cobra"
    "github.com/spf13/viper"
)

var (
    cfgFile string
    verbose bool
    debug   bool
)

var rootCmd = &cobra.Command{
    Use:   "mycli",
    Short: "A tool that does one thing well",
    Long: `A longer description that spans multiple lines
and provides more context about the application.`,
    PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
        return initConfig()
    },
}

func Execute() error {
    return rootCmd.Execute()
}

func init() {
    // Global flags
    rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "",
        "config file (default is $HOME/.mycli.yaml)")
    rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false,
        "verbose output")
    rootCmd.PersistentFlags().Bool("debug", false, "debug mode")

    // Bind to viper
    viper.BindPFlag("verbose", rootCmd.PersistentFlags().Lookup("verbose"))
    viper.BindPFlag("debug", rootCmd.PersistentFlags().Lookup("debug"))
}

func initConfig() error {
    if cfgFile != "" {
        viper.SetConfigFile(cfgFile)
    } else {
        home, err := os.UserHomeDir()
        if err != nil {
            return err
        }

        viper.AddConfigPath(home)
        viper.AddConfigPath(".")
        viper.SetConfigType("yaml")
        viper.SetConfigName(".mycli")
    }

    // Environment variables
    viper.SetEnvPrefix("MYCLI")
    viper.AutomaticEnv()

    // Read config file
    if err := viper.ReadInConfig(); err != nil {
        if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
            return err
        }
    }

    return nil
}
```

## Subcommands

### Simple Subcommand

```go
// cmd/add.go
package cmd

import (
    "fmt"

    "github.com/spf13/cobra"
    "github.com/spf13/viper"
)

var (
    priority int
    tags     []string
)

var addCmd = &cobra.Command{
    Use:   "add <name>",
    Short: "Add a new item",
    Long:  `Add a new item to the collection with optional priority and tags.`,
    Args:  cobra.ExactArgs(1),
    Example: `  mycli add "My Item"
  mycli add "Task" --priority 5 --tags work,urgent`,
    RunE: func(cmd *cobra.Command, args []string) error {
        name := args[0]

        if viper.GetBool("verbose") {
            fmt.Printf("Adding item: %s\n", name)
        }

        fmt.Printf("Added %s with priority %d\n", name, priority)
        if len(tags) > 0 {
            fmt.Printf("Tags: %v\n", tags)
        }

        return nil
    },
}

func init() {
    rootCmd.AddCommand(addCmd)

    addCmd.Flags().IntVarP(&priority, "priority", "p", 5,
        "priority level (1-10)")
    addCmd.Flags().StringSliceVarP(&tags, "tags", "t", nil,
        "comma-separated tags")

    // Mark flags
    addCmd.MarkFlagRequired("name")  // For named flags
}
```

### List Subcommand with Output Formats

```go
// cmd/list.go
package cmd

import (
    "encoding/csv"
    "encoding/json"
    "fmt"
    "os"
    "text/tabwriter"

    "github.com/spf13/cobra"
    "gopkg.in/yaml.v3"
)

var outputFormat string

type Item struct {
    Name     string `json:"name" yaml:"name"`
    Status   string `json:"status" yaml:"status"`
    Priority int    `json:"priority" yaml:"priority"`
}

var listCmd = &cobra.Command{
    Use:   "list",
    Short: "List all items",
    RunE: func(cmd *cobra.Command, args []string) error {
        items := []Item{
            {Name: "Item 1", Status: "active", Priority: 5},
            {Name: "Item 2", Status: "inactive", Priority: 3},
        }

        return outputItems(items)
    },
}

func init() {
    rootCmd.AddCommand(listCmd)

    listCmd.Flags().StringVarP(&outputFormat, "output", "o", "table",
        "output format (table, json, yaml, csv)")
}

func outputItems(items []Item) error {
    switch outputFormat {
    case "json":
        enc := json.NewEncoder(os.Stdout)
        enc.SetIndent("", "  ")
        return enc.Encode(items)

    case "yaml":
        enc := yaml.NewEncoder(os.Stdout)
        return enc.Encode(items)

    case "csv":
        w := csv.NewWriter(os.Stdout)
        defer w.Flush()
        w.Write([]string{"name", "status", "priority"})
        for _, item := range items {
            w.Write([]string{item.Name, item.Status, fmt.Sprint(item.Priority)})
        }
        return nil

    default: // table
        w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
        fmt.Fprintln(w, "NAME\tSTATUS\tPRIORITY")
        for _, item := range items {
            fmt.Fprintf(w, "%s\t%s\t%d\n", item.Name, item.Status, item.Priority)
        }
        return w.Flush()
    }
}
```

### Nested Subcommands

```go
// cmd/config/config.go
package config

import (
    "github.com/spf13/cobra"
)

var ConfigCmd = &cobra.Command{
    Use:   "config",
    Short: "Manage configuration",
}

func init() {
    ConfigCmd.AddCommand(showCmd)
    ConfigCmd.AddCommand(setCmd)
}

// cmd/config/show.go
package config

import (
    "fmt"

    "github.com/spf13/cobra"
    "github.com/spf13/viper"
)

var showCmd = &cobra.Command{
    Use:   "show",
    Short: "Show configuration",
    RunE: func(cmd *cobra.Command, args []string) error {
        settings := viper.AllSettings()
        for key, value := range settings {
            fmt.Printf("%s: %v\n", key, value)
        }
        return nil
    },
}

// cmd/config/set.go
package config

import (
    "fmt"

    "github.com/spf13/cobra"
    "github.com/spf13/viper"
)

var setCmd = &cobra.Command{
    Use:   "set <key> <value>",
    Short: "Set a configuration value",
    Args:  cobra.ExactArgs(2),
    RunE: func(cmd *cobra.Command, args []string) error {
        key, value := args[0], args[1]
        viper.Set(key, value)

        if err := viper.WriteConfig(); err != nil {
            return fmt.Errorf("failed to write config: %w", err)
        }

        fmt.Printf("Set %s = %s\n", key, value)
        return nil
    },
}

// Add to root.go init():
// rootCmd.AddCommand(config.ConfigCmd)
```

## Argument Validation

```go
var deleteCmd = &cobra.Command{
    Use:   "delete <name>",
    Short: "Delete an item",
    // Built-in validators
    Args: cobra.ExactArgs(1),  // Exactly 1 argument
    // Other options:
    // Args: cobra.MinimumNArgs(1),   // At least 1
    // Args: cobra.MaximumNArgs(2),   // At most 2
    // Args: cobra.RangeArgs(1, 3),   // Between 1 and 3
    // Args: cobra.NoArgs,            // No arguments
    RunE: func(cmd *cobra.Command, args []string) error {
        return nil
    },
}

// Custom validator
var customCmd = &cobra.Command{
    Use:  "custom <name>",
    Args: func(cmd *cobra.Command, args []string) error {
        if len(args) < 1 {
            return fmt.Errorf("requires at least 1 argument")
        }
        if len(args[0]) < 3 {
            return fmt.Errorf("name must be at least 3 characters")
        }
        return nil
    },
    RunE: func(cmd *cobra.Command, args []string) error {
        return nil
    },
}
```

## Interactive Prompts

Using `promptui` for interactive input:

```go
package cmd

import (
    "fmt"
    "strings"

    "github.com/manifoldco/promptui"
    "github.com/spf13/cobra"
)

var interactiveCmd = &cobra.Command{
    Use:   "interactive",
    Short: "Interactive mode",
    RunE: func(cmd *cobra.Command, args []string) error {
        // Text input
        prompt := promptui.Prompt{
            Label: "Name",
            Validate: func(input string) error {
                if len(strings.TrimSpace(input)) == 0 {
                    return fmt.Errorf("name cannot be empty")
                }
                return nil
            },
        }
        name, err := prompt.Run()
        if err != nil {
            return err
        }

        // Selection
        selectPrompt := promptui.Select{
            Label: "Priority",
            Items: []string{"Low", "Medium", "High"},
        }
        _, priority, err := selectPrompt.Run()
        if err != nil {
            return err
        }

        // Confirmation
        confirmPrompt := promptui.Prompt{
            Label:     "Confirm",
            IsConfirm: true,
        }
        _, err = confirmPrompt.Run()
        if err != nil {
            fmt.Println("Cancelled")
            return nil
        }

        fmt.Printf("Creating %s with %s priority\n", name, priority)
        return nil
    },
}
```

## Progress and Spinners

Using `spinner` for progress indication:

```go
package cmd

import (
    "time"

    "github.com/briandowns/spinner"
    "github.com/spf13/cobra"
)

var processCmd = &cobra.Command{
    Use:   "process",
    Short: "Process with progress",
    RunE: func(cmd *cobra.Command, args []string) error {
        s := spinner.New(spinner.CharSets[14], 100*time.Millisecond)
        s.Suffix = " Processing..."
        s.Start()

        // Simulate work
        time.Sleep(3 * time.Second)

        s.Stop()
        fmt.Println("Done!")
        return nil
    },
}
```

Using `progressbar`:

```go
package cmd

import (
    "time"

    "github.com/schollz/progressbar/v3"
    "github.com/spf13/cobra"
)

var downloadCmd = &cobra.Command{
    Use:   "download",
    Short: "Download with progress",
    RunE: func(cmd *cobra.Command, args []string) error {
        bar := progressbar.Default(100, "Downloading")

        for i := 0; i < 100; i++ {
            bar.Add(1)
            time.Sleep(50 * time.Millisecond)
        }

        return nil
    },
}
```

## Color Output

Using `color`:

```go
package cmd

import (
    "github.com/fatih/color"
    "github.com/spf13/cobra"
)

func printStatus(status string) {
    switch status {
    case "success":
        green := color.New(color.FgGreen).SprintFunc()
        fmt.Printf("%s Operation completed\n", green("✓"))
    case "warning":
        yellow := color.New(color.FgYellow).SprintFunc()
        fmt.Printf("%s Warning message\n", yellow("!"))
    case "error":
        red := color.New(color.FgRed).SprintFunc()
        fmt.Printf("%s Error occurred\n", red("✗"))
    }
}

// Disable color when needed
func init() {
    if os.Getenv("NO_COLOR") != "" {
        color.NoColor = true
    }
}
```

## Error Handling

### Custom Error Types

```go
// internal/errors/errors.go
package errors

import (
    "fmt"
)

type CliError struct {
    Message  string
    ExitCode int
    Cause    error
}

func (e *CliError) Error() string {
    if e.Cause != nil {
        return fmt.Sprintf("%s: %v", e.Message, e.Cause)
    }
    return e.Message
}

func (e *CliError) Unwrap() error {
    return e.Cause
}

func NewCliError(message string, exitCode int) *CliError {
    return &CliError{Message: message, ExitCode: exitCode}
}

func WrapError(message string, exitCode int, cause error) *CliError {
    return &CliError{Message: message, ExitCode: exitCode, Cause: cause}
}

// Common errors
var (
    ErrNotFound       = NewCliError("resource not found", 66)
    ErrInvalidInput   = NewCliError("invalid input", 2)
    ErrPermission     = NewCliError("permission denied", 77)
    ErrConfiguration  = NewCliError("configuration error", 78)
)
```

### Error Handler in Main

```go
// main.go
package main

import (
    "fmt"
    "os"

    "mycli/cmd"
    "mycli/internal/errors"
)

func main() {
    if err := cmd.Execute(); err != nil {
        var cliErr *errors.CliError
        if errors.As(err, &cliErr) {
            fmt.Fprintf(os.Stderr, "Error: %s\n", cliErr.Message)
            os.Exit(cliErr.ExitCode)
        }

        fmt.Fprintf(os.Stderr, "Error: %v\n", err)
        os.Exit(1)
    }
}
```

## Configuration with Viper

### Complete Configuration Example

```go
// internal/config/config.go
package config

import (
    "fmt"
    "os"
    "path/filepath"

    "github.com/spf13/viper"
)

type Config struct {
    Debug    bool   `mapstructure:"debug"`
    Verbose  bool   `mapstructure:"verbose"`
    Timeout  int    `mapstructure:"timeout"`
    Format   string `mapstructure:"format"`
    API      API    `mapstructure:"api"`
}

type API struct {
    Endpoint string `mapstructure:"endpoint"`
    Token    string `mapstructure:"token"`
    Timeout  int    `mapstructure:"timeout"`
}

var cfg Config

func Init(cfgFile string) error {
    // Set defaults
    viper.SetDefault("debug", false)
    viper.SetDefault("verbose", false)
    viper.SetDefault("timeout", 30)
    viper.SetDefault("format", "table")
    viper.SetDefault("api.endpoint", "https://api.example.com")
    viper.SetDefault("api.timeout", 10)

    // Config file
    if cfgFile != "" {
        viper.SetConfigFile(cfgFile)
    } else {
        home, err := os.UserHomeDir()
        if err != nil {
            return err
        }

        // Search paths
        viper.AddConfigPath(filepath.Join(home, ".config", "mycli"))
        viper.AddConfigPath(home)
        viper.AddConfigPath(".")
        viper.SetConfigName("config")
        viper.SetConfigType("yaml")
    }

    // Environment variables
    viper.SetEnvPrefix("MYCLI")
    viper.AutomaticEnv()

    // Read config
    if err := viper.ReadInConfig(); err != nil {
        if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
            return fmt.Errorf("error reading config: %w", err)
        }
    }

    // Unmarshal
    if err := viper.Unmarshal(&cfg); err != nil {
        return fmt.Errorf("error parsing config: %w", err)
    }

    return nil
}

func Get() *Config {
    return &cfg
}
```

## Testing

### Testing Commands

```go
// cmd/add_test.go
package cmd

import (
    "bytes"
    "testing"

    "github.com/stretchr/testify/assert"
)

func TestAddCommand(t *testing.T) {
    tests := []struct {
        name     string
        args     []string
        wantOut  string
        wantErr  bool
    }{
        {
            name:    "add item",
            args:    []string{"add", "test-item"},
            wantOut: "Added test-item",
            wantErr: false,
        },
        {
            name:    "add with priority",
            args:    []string{"add", "test-item", "--priority", "8"},
            wantOut: "Added test-item with priority 8",
            wantErr: false,
        },
        {
            name:    "missing name",
            args:    []string{"add"},
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            buf := new(bytes.Buffer)
            rootCmd.SetOut(buf)
            rootCmd.SetErr(buf)
            rootCmd.SetArgs(tt.args)

            err := rootCmd.Execute()

            if tt.wantErr {
                assert.Error(t, err)
            } else {
                assert.NoError(t, err)
                assert.Contains(t, buf.String(), tt.wantOut)
            }
        })
    }
}
```

### Testing with Cobra's Built-in Testing

```go
func TestRootCommand(t *testing.T) {
    cmd := rootCmd
    cmd.SetArgs([]string{"--help"})

    err := cmd.Execute()
    assert.NoError(t, err)
}

func TestVersionFlag(t *testing.T) {
    buf := new(bytes.Buffer)
    rootCmd.SetOut(buf)
    rootCmd.SetArgs([]string{"--version"})

    err := rootCmd.Execute()
    assert.NoError(t, err)
    assert.Contains(t, buf.String(), "1.0.0")
}
```

### Integration Tests

```go
// cmd/integration_test.go
// +build integration

package cmd

import (
    "os/exec"
    "testing"

    "github.com/stretchr/testify/assert"
)

func TestCLIIntegration(t *testing.T) {
    tests := []struct {
        name     string
        args     string
        wantOut  string
        wantCode int
    }{
        {
            name:     "help",
            args:     "--help",
            wantOut:  "Usage:",
            wantCode: 0,
        },
        {
            name:     "add item",
            args:     "add test-item",
            wantOut:  "Added",
            wantCode: 0,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            cmd := exec.Command("./mycli", strings.Split(tt.args, " ")...)
            out, err := cmd.CombinedOutput()

            if tt.wantCode == 0 {
                assert.NoError(t, err)
            }
            assert.Contains(t, string(out), tt.wantOut)
        })
    }
}
```

## Build and Distribution

### Makefile

```makefile
BINARY_NAME=mycli
VERSION=$(shell git describe --tags --always --dirty)
BUILD_TIME=$(shell date -u '+%Y-%m-%d_%H:%M:%S')
LDFLAGS=-ldflags "-X main.Version=$(VERSION) -X main.BuildTime=$(BUILD_TIME)"

.PHONY: build
build:
	go build $(LDFLAGS) -o $(BINARY_NAME) .

.PHONY: install
install:
	go install $(LDFLAGS) .

.PHONY: test
test:
	go test -v ./...

.PHONY: lint
lint:
	golangci-lint run

.PHONY: clean
clean:
	rm -f $(BINARY_NAME)
```

### Version Information

```go
// main.go
package main

var (
    Version   = "dev"
    BuildTime = "unknown"
)

// In root.go
rootCmd.Version = fmt.Sprintf("%s (built %s)", Version, BuildTime)
```

## See Also

- [CLI Development Guidelines](../SKILL.md) - Core principles and patterns
- [Python CLI Patterns](python-cli.md)
- [Node.js CLI Patterns](nodejs-cli.md)
- [Rust CLI Patterns](rust-cli.md)
