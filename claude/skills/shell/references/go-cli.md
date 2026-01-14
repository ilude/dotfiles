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

- [CLI Development Guidelines](../cli-development.md) - Core principles and patterns
- [Python CLI Patterns](python-cli.md)
- [Node.js CLI Patterns](nodejs-cli.md)
- [Rust CLI Patterns](rust-cli.md)
