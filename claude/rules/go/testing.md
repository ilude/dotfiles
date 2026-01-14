---
paths:
  - "**/*_test.go"
  - "**/testdata/**"
---

# Go Testing

Testing patterns and best practices for Go projects.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## Essential Commands

```bash
go test ./...                           # Run all tests
go test -v ./...                        # Verbose output
go test -race ./...                     # Race detection (MUST run in CI)
go test -cover ./...                    # With coverage
go test -coverprofile=coverage.out ./...  # Coverage to file
go test -fuzz=FuzzFunctionName -fuzztime=30s  # Fuzzing
```

---

## Table-Driven Tests

- You SHOULD use table-driven tests for testing multiple cases

```go
func TestAdd(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        expected int
    }{
        {"positive numbers", 2, 3, 5},
        {"negative numbers", -1, -2, -3},
        {"zero", 0, 0, 0},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := Add(tt.a, tt.b)
            if result != tt.expected {
                t.Errorf("Add(%d, %d) = %d; want %d", tt.a, tt.b, result, tt.expected)
            }
        })
    }
}
```

---

## Test Fixtures

- You SHOULD place test data in a `testdata/` directory
- The `testdata/` directory is ignored by the Go toolchain

```go
func TestParseConfig(t *testing.T) {
    data, err := os.ReadFile("testdata/config.json")
    if err != nil {
        t.Fatal(err)
    }
    // use data...
}
```

---

## Test Helpers

- You SHOULD use `t.Helper()` in test helper functions
- Helper functions SHOULD take `testing.TB` to work with both tests and benchmarks

```go
func assertNoError(t testing.TB, err error) {
    t.Helper()
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
}

func assertEqual[T comparable](t testing.TB, got, want T) {
    t.Helper()
    if got != want {
        t.Errorf("got %v; want %v", got, want)
    }
}
```

---

## Subtests and Parallel Execution

```go
func TestUserService(t *testing.T) {
    // Setup shared resources
    service := NewUserService()

    t.Run("Create", func(t *testing.T) {
        t.Parallel()  // Run in parallel with other subtests
        user, err := service.Create("test@example.com")
        if err != nil {
            t.Fatal(err)
        }
        if user.Email != "test@example.com" {
            t.Errorf("got %s; want test@example.com", user.Email)
        }
    })

    t.Run("Delete", func(t *testing.T) {
        t.Parallel()
        // ...
    })
}
```

---

## Race Detection

- You MUST run tests with `-race` flag in CI
- You SHOULD run `go test -race ./...` locally before pushing

```bash
# CI configuration
go test -race -coverprofile=coverage.out ./...
```

---

## Test Setup and Teardown

### Using t.Cleanup

```go
func TestWithDatabase(t *testing.T) {
    db := setupTestDatabase(t)
    t.Cleanup(func() {
        db.Close()
    })

    // Test using db...
}
```

### Using TestMain

```go
var testDB *sql.DB

func TestMain(m *testing.M) {
    // Setup
    testDB = setupDatabase()

    // Run tests
    code := m.Run()

    // Teardown
    testDB.Close()

    os.Exit(code)
}
```

---

## Mocking and Interfaces

- You SHOULD define interfaces at the point of use
- You SHOULD use interface-based mocking

```go
// In the consumer package, define what you need
type UserStore interface {
    GetUser(ctx context.Context, id string) (*User, error)
}

// Mock implementation for testing
type mockUserStore struct {
    users map[string]*User
    err   error
}

func (m *mockUserStore) GetUser(ctx context.Context, id string) (*User, error) {
    if m.err != nil {
        return nil, m.err
    }
    return m.users[id], nil
}

func TestHandler(t *testing.T) {
    store := &mockUserStore{
        users: map[string]*User{
            "123": {ID: "123", Name: "Test"},
        },
    }
    handler := NewHandler(store)
    // Test handler...
}
```

---

## Benchmarks

```go
func BenchmarkFibonacci(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Fibonacci(20)
    }
}

func BenchmarkWithSetup(b *testing.B) {
    data := setupLargeDataset()
    b.ResetTimer()  // Exclude setup from benchmark

    for i := 0; i < b.N; i++ {
        ProcessData(data)
    }
}
```

Run benchmarks:
```bash
go test -bench=. -benchmem ./...
```

---

## Fuzzing

```go
func FuzzParseJSON(f *testing.F) {
    // Add seed corpus
    f.Add([]byte(`{"name": "test"}`))
    f.Add([]byte(`{}`))
    f.Add([]byte(`[]`))

    f.Fuzz(func(t *testing.T, data []byte) {
        var result map[string]interface{}
        // Should not panic
        _ = json.Unmarshal(data, &result)
    })
}
```

Run fuzzing:
```bash
go test -fuzz=FuzzParseJSON -fuzztime=30s ./...
```

---

## Test Coverage

```bash
# Generate coverage report
go test -coverprofile=coverage.out ./...

# View in browser
go tool cover -html=coverage.out

# View in terminal
go tool cover -func=coverage.out
```

### Coverage Requirements

- You SHOULD aim for 80%+ coverage on business logic
- You MUST have coverage on critical paths
- You SHOULD NOT pursue 100% coverage at the expense of test quality

---

## Common Testing Anti-Patterns

### Avoid These

```go
// Bad: Testing implementation details
func TestInternalState(t *testing.T) {
    s := &service{internalCounter: 0}
    s.doSomething()
    if s.internalCounter != 1 {  // Don't test private state
        t.Error("...")
    }
}

// Bad: Overly complex setup
func TestWithMassiveSetup(t *testing.T) {
    // 50 lines of setup...
    result := fn()
    if result != expected {
        t.Error("...")
    }
}

// Bad: Non-deterministic tests
func TestWithRandomness(t *testing.T) {
    result := ProcessWithRandom()  // Uses time.Now() or rand
    // Flaky assertions...
}
```

### Prefer These

```go
// Good: Test public behavior
func TestService(t *testing.T) {
    s := NewService()
    result, err := s.Process(input)
    if err != nil {
        t.Fatal(err)
    }
    if result != expected {
        t.Errorf("got %v; want %v", result, expected)
    }
}

// Good: Use table-driven tests for complex setup
func TestMultipleCases(t *testing.T) {
    tests := []struct{...}
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {...})
    }
}

// Good: Inject time/randomness
func TestWithInjectedTime(t *testing.T) {
    fixedTime := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
    result := ProcessWithTime(fixedTime)
    // Deterministic assertions
}
```

---

## Integration Tests

- You SHOULD use build tags to separate integration tests
- You SHOULD skip integration tests in short mode

```go
//go:build integration

package mypackage

func TestDatabaseIntegration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test in short mode")
    }
    // Integration test code...
}
```

Run integration tests:
```bash
go test -tags=integration ./...
```

---

## Quick Reference

| Task | Command |
|------|---------|
| All tests | `go test ./...` |
| Verbose | `go test -v ./...` |
| Race detection | `go test -race ./...` |
| Coverage | `go test -cover ./...` |
| Single package | `go test ./pkg/...` |
| Single test | `go test -run TestName ./...` |
| Benchmarks | `go test -bench=. ./...` |
| Short mode | `go test -short ./...` |
| Fuzzing | `go test -fuzz=FuzzName -fuzztime=30s` |

**Key rules:**
- MUST run `-race` in CI
- MUST use `t.Helper()` in helper functions
- SHOULD use table-driven tests
- SHOULD use `testdata/` for fixtures
- SHOULD NOT test private state
- SHOULD NOT write flaky tests
