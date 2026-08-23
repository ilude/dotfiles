---
name: powershell
description: "PowerShell syntax and scripts: .ps1, cmdlets, modules, script blocks, pipelines, quoting, interpolation, native commands, error semantics, or PowerShell 5.1/7 compatibility. Not for Bash/POSIX shell; use shell."
---

# PowerShell

## Boundary

Use this skill for PowerShell command and script implementation. Use `shell` for Bash, POSIX sh, and zsh. Use a domain skill as well when PowerShell is only the automation language for another system.

This skill targets recurring command and script failures. It is not a PowerShell language reference.

## Command construction

1. Use the `pwsh` tool for Windows-native cmdlets, .NET, the registry, and PowerShell modules. Use Bash for Git, Node, and POSIX pipelines.
2. Keep `-Command` input short. Put multiline logic, nested quoting, loops, regular expressions, or multiple pipelines in a `.ps1` file under `.tmp/`, then run it with `pwsh -File`.
3. Use approved cmdlet names and `$env:NAME` for environment variables.
4. Use single quotes for literal strings. Use double quotes only when interpolation is required. Prefer format strings or variables over nested escaped quotes.
5. Place compound statements before a pipeline in an expression or variable; do not leave an empty pipeline element after `if`, `foreach`, or `try` blocks.
6. Use arrays for native executable arguments when invoking through an API. Check `$LASTEXITCODE` for native commands and exceptions or `$?` for PowerShell commands.

## Data and error handling

- Wrap potentially scalar pipeline output in `@()` when later logic requires an array.
- Use readable multiline hashtables and `[pscustomobject]` values. Use calculated properties only when a direct object projection is insufficient.
- Distinguish terminating from non-terminating errors. Use `-ErrorAction Stop` only where failure must transfer control to `catch`.
- Validate required commands, modules, paths, and authentication before a long operation.
- Set timeouts for known network, module-import, package, or infrastructure work before starting it. Do not retry an unchanged timeout with the same bound.

## Script compatibility and safety

- Match the repository's documented PowerShell version. Otherwise, target Windows PowerShell 5.1 for legacy/on-prem scripts and PowerShell 7 for Pi-owned runtime tooling.
- For administrative mutation scripts, use `[CmdletBinding(SupportsShouldProcess)]` and guard mutations with `ShouldProcess` when preview behavior is part of the contract.
- Do not run a newly generated mutation script unless the user requested execution.
- Use `Set-StrictMode` only when it matches the owning script or repository; do not add it as unrelated cleanup.

## Validation

For a nontrivial script, parse it before execution and run PSScriptAnalyzer when the repository uses it. Validation is complete when the parser reports no syntax errors and the smallest repository check exercising the changed behavior passes.

## Anti-patterns

- Dense one-line control flow or object construction.
- Mixing PowerShell cmdlets into Bash or POSIX syntax into PowerShell.
- Treating `$?` as a native executable exit code.
- Installing a missing module globally instead of declaring it in the owning workflow.
- Retrying parser errors, missing dependencies, or authentication failures unchanged.
