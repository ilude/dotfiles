---
name: go
description: "Go: .go, go.mod, go.sum, goroutines, channels, interfaces, go test, go vet, or concurrency."
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

## Supply-chain guardrails

- Treat `go install <module>@<version>` as code execution from that module. Pin reviewed versions; do not use `@latest` in committed scripts, CI, Dockerfiles, or docs examples.
- Run `go mod tidy`, inspect `go.mod`/`go.sum` diffs, and run `govulncheck ./...` after dependency changes.

## Contents

- [core.md](core.md) - Go modules, error handling, concurrency, naming conventions
- [testing.md](testing.md) - Table-driven tests, benchmarks, fuzzing, race detection
