---
description: Create or update a project-local AGENTS.md with concise coding-agent guidance
argument-hint: "[focus, e.g. package, stack, or path]"
---

Create or update the project-local `AGENTS.md`. A supplied package, path, or other focus defines the scope; without a focus, work at repository scope:

$ARGUMENTS

Follow this workflow:

1. **Inspect first, then write.** Read applicable parent instructions, existing guidance in the requested scope, and relevant docs/tooling before drafting. Expand discovery only to resolve a concrete question needed for that scope, not to inventory unrelated packages or clients. At repository scope, inspect the main project structure and relevant nested guidance. Evidence sources include:
   - existing instruction files: `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md`, `GEMINI.md`, `.cursor/rules/`, `.github/instructions/`
   - project docs: `README*`, `CONTRIBUTING*`, `docs/`, architecture notes when obvious
   - package/tooling files: `package.json`, lockfiles, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Makefile`, `justfile`, CI workflows, test/lint configs
   - repository structure and any nested `AGENTS.md` files

2. **Infer only from evidence.** Do not invent commands, standards, architecture, or policies. If important facts cannot be determined, ask one or two targeted questions or add a short `Open questions` section.

3. **Preserve existing content.** If `AGENTS.md` already exists, improve it in place:
   - keep user-authored guidance unless it is clearly obsolete or duplicated
   - prefer small edits over wholesale rewrites
   - merge new findings into existing sections when possible
   - preserve comments and project-specific warnings

4. **Draft concise agent guidance.** Aim for under 200 lines. Use Markdown headings and bullets. Prefer sections like:
   - `Overview`
   - `Primary Commands`
   - `Validation`
   - `Architecture / Project Structure`
   - `Coding Conventions`
   - `Testing Guidance`
   - `Security / Secrets`
   - `Agent Notes`

5. **Use other client guidance as evidence.** Copy relevant shared guidance into `AGENTS.md` without removing the original or copying client-specific behavior. Preserve other clients' files. Ask before migrating content or creating/modifying another client's instructions; those changes are outside `/init`'s default scope.

6. **Safety rules.** Never read or copy secrets from `.env` files or credential stores. Do not modify generated dependency directories such as `node_modules/`, `.venv/`, `target/`, `dist/`, or `build/`.

7. **Verify.** After editing, read the resulting `AGENTS.md` and check that commands and claims are supported by repository evidence. Run lightweight formatting/JSON validation only when relevant; do not run expensive test suites unless needed for this documentation change.

Finish with a short summary of what changed and any open questions for the user.
