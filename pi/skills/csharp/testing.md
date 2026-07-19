# C# Testing with xUnit

## Framework and structure

- Use the repository's test framework; prefer xUnit for new .NET projects.
- Name tests `MethodName_WhenCondition_ExpectedBehavior` and keep each test focused on one observable contract.
- Use Arrange-Act-Assert: arrange only required inputs and collaborators, execute one behavior, then assert its result and relevant interaction.
- Use `[Theory]` with focused data for behavior variations; use `_sut` when it makes the system under test clear.

## Boundaries

- Mock external dependencies and verify important calls. Do not mock domain logic merely to restate implementation details.
- Use `WebApplicationFactory<Program>` and a controlled test environment for HTTP integration tests.
- Keep test data deterministic, pass cancellation tokens where production code requires them, and test failure paths as well as successful outcomes.

## Commands and coverage

```bash
dotnet test
dotnet test --filter "Category=Unit"
dotnet test --collect:"XPlat Code Coverage"
dotnet tool run reportgenerator -reports:coverage.cobertura.xml -targetdir:coverage
```

Coverage guides missing tests; it does not replace assertions over business behavior, authorization, error handling, and integration boundaries.
