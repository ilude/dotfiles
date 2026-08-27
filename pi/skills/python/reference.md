# Python reference

Use this reference after identifying the owning Python project's configuration. Project manifests, lockfiles, scripts, supported versions, and configured checks are authoritative; this file does not choose a package manager or framework.

## Compatibility

- Read the project's supported Python versions before using syntax, standard-library APIs, or dependency versions. An annotation may be evaluated at import time, and a newer syntax form can fail before the function runs.
- Preserve the project's declared compatibility floor and test the oldest supported environment when the change affects syntax, imports, packaging, or runtime behavior.
- Prefer the project's configured typing style. Type hints should describe a real contract, not force annotations into code where they obscure the behavior.

## Exceptions and boundaries

- Catch only exceptions the code can handle at that boundary. Preserve the original exception as context when translating it, and use specific exception types and stable messages where callers rely on them.
- Let missing required data, dependencies, or configuration fail explicitly. Do not add broad exception wrappers, silent defaults, or fallback paths that conceal the cause.
- Validate untrusted input at its boundary and return the established domain representation, not an unchecked original value.

## Resources and state

- Match resource lifetime to its owner. Use context managers for files, locks, database transactions, subprocesses, and clients when supported; use `try/finally` when explicit cleanup is required.
- Register cleanup when a resource is created so failed assertions and exceptions cannot skip it. Close child processes and handles before removing their sandbox.
- Inspect mutable default arguments, shared mutable module state, late binding, and accidental mutation of caller-owned values. Use factories or per-call state where the contract requires isolation.

## Imports and modules

- Check package layout and import mode before editing imports. Watch for circular imports, import-time side effects, module/package name collisions, and a module being run as a script versus imported as a package.
- Keep relative and absolute imports consistent with the owning package. Do not patch `sys.path` in individual tests to hide a packaging or module-layout problem.
- For CLI behavior, verify the project's supported invocation form and whether `__name__ == "__main__"` behavior differs from package import behavior.

## Data and structure

- Use the simplest representation that enforces the actual contract: built-in types, dataclasses, schemas, or a project-configured validation library as appropriate. A validation framework is not a universal requirement.
- Keep domain identity, lifecycle, and cross-operation rules in the model only when they clarify a real domain decision; ordinary functions and module boundaries are sufficient for isolated mechanics.
- Preserve public APIs and serialization behavior unless the requested change explicitly changes them.

## Testing and checks

- Read the shared testing guidance and the project's test configuration before selecting a runner. Use pytest or another framework only when configured by the project.
- Test observable behavior at the relevant seam, derive expectations independently, isolate files and environment, and clean up resources. Add a regression test when a reachable defect has a stable seam.
- Run the project's focused lint, type, packaging, or test command. Do not substitute an unconfigured tool or claim a check proves an external boundary it does not exercise.
