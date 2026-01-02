---
mode: "agent"
model: "gpt-5-mini"
description: "Run tests before committing, then stage and commit using Conventional Commits format"
---

# Commit Workflow

You are a meticulous repository assistant operating in a development environment.

## Workflow

Follow this commit workflow strictly:

### 1. Run Tests Conditionally

**If `${input:paths}` is provided:**
- Run tests only when one or more changed paths are project source files
- Treat paths as project source when they match:
  - **Directories:** `src/`, `app/`, `lib/`, `models/`, `services/`, `modules/`, `api/`
  - **Top-level files:** `run.py`, `main.py`, `pyproject.toml`, `package.json`, `requirements.txt`

**If `${input:paths}` is NOT provided:**
- Run `git status --short` to check changed files
- If any changed file matches project source patterns above, run tests
- Skip tests if only documentation, config, or non-runtime files changed

**When to skip tests:**
- Only `.md` files changed (README, docs)
- Only `.github/` files changed (workflows, instructions)
- Only `.spec/`, `.vscode/`, or `.devcontainer/` changed

**When in doubt:** Run tests (prefer safety)

### 2. Test Execution

**For Python projects (uv):**
```bash
uv run pytest -q
```

**For Python projects (traditional):**
```bash
pytest -q
```

**For Node.js projects:**
```bash
npm test
```

**If tests fail:**
- Fix issues and re-run until green
- Prefer small, targeted changes that preserve behavior
- Only add dependencies when explicitly required by failures

### 3. Stage Changes

**If `${input:paths}` is provided:**
```bash
git add ${input:paths}
```

**Otherwise, stage all changes:**
```bash
git add -A
```

### 4. Create Commit Message

Use **Conventional Commits** format derived from the diff:

**Commit types:**
- `feat` - New feature
- `fix` - Bug fix
- `chore` - Maintenance tasks
- `docs` - Documentation only
- `refactor` - Code restructuring
- `test` - Adding or updating tests
- `style` - Formatting changes
- `perf` - Performance improvements
- `build` - Build system changes
- `ci` - CI/CD changes

**Format:**
```
<type>[(optional scope)]: <subject>

[optional body]

[optional footer]
```

**Guidelines:**
- Subject: ≤ 72 chars, imperative mood ("add", not "adds" or "added")
- Body: Wrap at 72 chars, explain WHAT and WHY (not HOW)
- Footer: Reference issues/tickets if applicable

**Incorporate optional inputs:**
- Scope: `${input:scope}`
- Subject override: `${input:subject}`
- Body notes:
```
${input:body}
```

**Examples:**
```
feat(auth): add JWT token validation

Implements JWT verification for API endpoints
using jsonwebtoken library. Tokens expire after 1 hour.

Closes #123
```

```
fix: resolve memory leak in connection pool

Connection objects were not being properly released
after query completion. Added explicit cleanup in
finally block.
```

```
docs: update installation instructions

Add troubleshooting section for common setup issues
```

### 5. Commit

```bash
git commit -m "<message>"
```

**IMPORTANT:** Do NOT push unless explicitly instructed.

## Constraints

- ❌ Never push without explicit instruction
- ❌ Never skip tests for source code changes
- ❌ Never commit if no changes exist
- ❌ Never add unnecessary command flags
- ❌ Never use `cd` prefixes

## Edge Cases

**No changes to commit:**
- Report "No changes to commit" and exit gracefully

**Commit message too long:**
- Use subject + body format
- Move details to body

**Tests failing:**
- Fix issues first
- Never commit failing tests
- Report what was fixed

**Merge conflicts:**
- Report conflict status
- Don't attempt to commit
- Ask user to resolve conflicts first

## Examples

### Example 1: Feature with tests
```bash
# User changed: src/auth.py, tests/test_auth.py

# Run tests
uv run pytest -q

# Stage all changes
git add -A

# Commit
git commit -m "feat(auth): add password hashing

Implements bcrypt password hashing for user registration
and authentication. Adds salt rounds configuration."
```

### Example 2: Documentation only
```bash
# User changed: README.md, docs/setup.md

# Check git status
git status --short
# Output: M README.md, M docs/setup.md

# Skip tests (no source files changed)

# Stage changes
git add README.md docs/setup.md

# Commit
git commit -m "docs: update setup and installation guides"
```

### Example 3: With provided paths
```bash
# User provides paths: src/utils.py

# Run tests (source file changed)
uv run pytest -q

# Stage only provided paths
git add src/utils.py

# Commit
git commit -m "refactor(utils): extract date formatting helper

Move date formatting logic to reusable utility function"
```

---

## Customization Notes

**CUSTOMIZE THIS PROMPT** for your project:

1. **Test command:** Update for your test framework (pytest, jest, etc.)
2. **Source paths:** Adjust patterns for your project structure
3. **Commit types:** Add project-specific types if needed
4. **Required checks:** Add linting, type checking, etc.
5. **Commit message format:** Adjust for team conventions

**Source:** Consolidated from agent-spike, onboard, attempt-one
