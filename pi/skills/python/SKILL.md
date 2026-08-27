---
name: python
description: "Python files, pyproject.toml, Python packaging, pytest, or Python-specific runtime behavior. Use for Python syntax, imports, exceptions, resource cleanup, and compatibility traps. Not for general repository policy."
---

# Python

Use this card when the task changes Python or its project configuration.

## Activation and routing

1. Identify the owning project from its nearest `pyproject.toml`, lockfile, scripts, and configuration.
2. Read [reference.md](reference.md) for compatibility, exception, cleanup, mutable-default, and import/module traps.
3. Read [testing.md](testing.md) when pytest or another configured test framework is involved; use framework references only when the project uses that framework.
4. Use the project's configured package manager, runner, formatter, linter, and type checker. Do not infer them from this skill.

Completion evidence: the owning project configuration and the applicable reference sections are identified before editing, and the focused project check passes or its failure is reported.

## Recurring traps

- Check the supported Python versions before using syntax or library APIs; annotations and imports can change runtime compatibility.
- Catch and raise specific exceptions only where the boundary requires it. Preserve required exception details and do not hide missing data or dependencies.
- Close files, processes, sockets, and other owned resources with context managers or `finally`-equivalent cleanup.
- Inspect mutable defaults, import-time side effects, circular imports, package/module name collisions, and module execution semantics when they are relevant.
- Keep tests focused on observable behavior and use the configured framework conditionally rather than assuming pytest.
