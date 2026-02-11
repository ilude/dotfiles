---
name: go
description: Go development with testing, modules, and best practices. Activate when working with .go files, go.mod, or discussing Go patterns.
---

# Go Skill

Go emphasizes simplicity, explicit error handling, and strong concurrency primitives. Prefer composition over inheritance, return errors instead of panicking, and keep packages small and focused.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `go build ./...` | Build all packages |
| `go test ./...` | Run all tests |
| `go test -race ./...` | Run tests with race detector |
| `go fmt ./...` | Format all code |
| `go vet ./...` | Static analysis |
| `go mod tidy` | Clean up module dependencies |
| `golangci-lint run` | Comprehensive linting |

**Error handling pattern:**
```go
if err != nil {
    return fmt.Errorf("operation failed: %w", err)
}
```

## Contents

- [core.md](core.md) - Go modules, error handling, concurrency, naming conventions
- [testing.md](testing.md) - Table-driven tests, benchmarks, fuzzing, race detection
