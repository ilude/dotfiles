# C# Projects Workflow

## Tool Grid

| Task | Command |
|------|---------|
| Lint | `dotnet roslynator analyze` |
| Format | `dotnet format` |
| Build | `dotnet build` |
| Test | `dotnet test` |
| Publish | `dotnet publish` |
| Watch | `dotnet watch run` |
| Restore | `dotnet restore` |

## C# 12+ and .NET 8+

- Use file-scoped namespaces and enable nullable reference types in every project.
- Use primary constructors for simple dependency injection or initialization; use an explicit constructor when validation, ownership, or initialization logic needs a body.
- Use collection expressions when the target type is clear, raw string literals for structured multiline text, and records for DTOs and immutable value objects.
- Use minimal APIs for small, cohesive endpoints; use controllers when routing, filters, versioning, or endpoint complexity warrants their structure.
- For native AOT, avoid reflection-heavy paths, prefer source generators, and use `JsonSerializerContext` with `[JsonSerializable]`.
- Use keyed services only for genuine named implementations, not as a replacement for a clear interface boundary.

## Naming, values, and nullability

- Use PascalCase for public members and constants, `_camelCase` for private fields, camelCase for locals, `I`-prefixed interfaces, `T`-prefixed type parameters, and `Async`-suffixed asynchronous methods.
- Name repeated domain values with `const`, `static readonly`, or enums. Inline literals are appropriate for tests, indices, one-off messages, and well-known framework values.
- Declare optional references as nullable, use `required` for required initialization, and avoid null-forgiving operators except where a checked invariant cannot be represented otherwise.

## Async and errors

- Keep I/O asynchronous end-to-end, accept `CancellationToken` for cancellable work, and use `ConfigureAwait(false)` in library code.
- Reserve `ValueTask` for measured hot paths with frequent synchronous completion; never use `async void` except event handlers.
- Catch specific exceptions, preserve useful context, and do not swallow failures. Use result types for expected domain failures and exceptions for exceptional conditions.

## Dependency injection

- Use constructor injection for required dependencies; never use a service locator.
- Register singleton services only when thread-safe and state is application-wide, scoped services for request or unit-of-work state such as `DbContext`, and transient services for lightweight stateless operations.
- Do not capture scoped services in singletons. Match disposal ownership to the container lifetime.

## Data, configuration, and quality

- Prefer method-syntax LINQ, materialize queries before repeated enumeration, use `Any()` for existence checks, and benchmark hot paths before retaining LINQ there.
- Bind configuration with the Options pattern rather than reading configuration throughout application code.
- Centralize target framework, nullable settings, and warning policy in `Directory.Build.props` when the solution shares them. Keep `.editorconfig` and analyzers aligned with repository policy.

## Tests and layout

See [testing.md](testing.md) for test rules.

```text
MySolution/
  src/    # API, application, domain, infrastructure projects
  tests/  # unit and integration projects
  Directory.Build.props
  Directory.Packages.props
  MySolution.sln
```
