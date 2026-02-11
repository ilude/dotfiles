---
name: csharp
description: C# and .NET development with testing and best practices. Activate when working with .cs, .csproj files, or discussing C#/.NET patterns.
---

# C# Skill

C# with .NET provides a strongly-typed, cross-platform ecosystem. Use async/await for I/O-bound work, dependency injection for loose coupling, records for immutable data, and LINQ for collection queries.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `dotnet build` | Build solution |
| `dotnet test` | Run all tests |
| `dotnet run` | Run project |
| `dotnet watch test` | Run tests on file change |
| `dotnet format` | Format code |
| `dotnet add package X` | Add NuGet package |

**Key patterns:** `async`/`await` for async I/O, `record` types for value semantics, pattern matching with `switch` expressions, LINQ (`Where`, `Select`, `GroupBy`), nullable reference types (`string?`).

## Contents

- [core.md](core.md) - C# 12+, .NET 8+, async/await, DI, records, LINQ
- [testing.md](testing.md) - xUnit, Moq, integration testing, coverage
