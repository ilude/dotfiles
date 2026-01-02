---
description: "Ignore file management - .gitignore and .dockerignore synchronization and organization"
applyTo: "**/.{gitignore,dockerignore}"
---

# Ignore Files Management Instructions

## Purpose

Maintain `.gitignore` and `.dockerignore` files with proper organization, alphabetical ordering, and appropriate synchronization to exclude unnecessary files from version control and Docker builds.

---

## File Organization Rules

### Alphabetical Ordering
- **All entries in alphabetical order** within sections
- Case-sensitive ordering (uppercase before lowercase)
- Special characters sorted by ASCII value
- Makes files easier to scan and maintain

### Section Organization
```
# Comments organize related entries
# Python
__pycache__/
*.pyc
*.pyo

# Testing
.coverage
.pytest_cache/

# IDEs
.idea/
.vscode/
```

---

## .gitignore Best Practices

### What to Include
✅ **Always gitignore:**
- **Build artifacts:** `build/`, `dist/`, `*.egg-info/`
- **Dependencies:** `node_modules/`, `.venv/`, `venv/`
- **Compiled code:** `*.pyc`, `*.pyo`, `__pycache__/`
- **Test outputs:** `.pytest_cache/`, `.coverage`, `htmlcov/`
- **Environment files:** `.env`, `.env.*` (except `.env.example`)
- **Logs:** `*.log`, `logs/`
- **OS files:** `.DS_Store`, `Thumbs.db`
- **IDE files:** `.vscode/`, `.idea/`, `*.swp`
- **Temporary files:** `tmp/`, `temp/`, `*.tmp`

❌ **Never gitignore:**
- **Source code:** Application code, tests
- **Configuration templates:** `.env.example`, `config.example.yml`
- **Documentation:** `README.md`, `docs/` (unless auto-generated)
- **Essential config:** `pyproject.toml`, `package.json`

### Python .gitignore Template
```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python

# Distribution / packaging
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Virtual environments
.venv/
venv/
ENV/
env/

# Testing
.coverage
.pytest_cache/
htmlcov/
.tox/
.nox/

# Type checking
.mypy_cache/
.dmypy.json
dmypy.json
.pytype/

# Linting
.ruff_cache/

# Jupyter
.ipynb_checkpoints/
*.ipynb_checkpoints

# Environment
.env
.env.*
!.env.example

# IDEs
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Temporary
tmp/
temp/
*.tmp
```

---

## .dockerignore Best Practices

### Purpose
Exclude files from Docker build context to:
- **Reduce build time** - Smaller context transfers faster
- **Reduce image size** - Less unnecessary files in layers
- **Improve security** - Don't accidentally copy secrets

### What to Include
✅ **Always dockerignore:**
- **Version control:** `.git/`, `.gitignore`, `.gitattributes`
- **Documentation:** `README.md`, `docs/`, `*.md` (unless needed at runtime)
- **CI/CD:** `.github/`, `.gitlab-ci.yml`, `Jenkinsfile`
- **Development:** `.devcontainer/`, `.vscode/`, `.idea/`
- **Tests:** `tests/`, `.spec/`, `*.test.js`
- **Build artifacts:** `build/`, `dist/`, `node_modules/`
- **Environment:** `.env`, `.env.*`
- **Logs:** `*.log`, `logs/`

⚠️ **Keep in build context:**
- **Source code** needed in the image
- **Dependencies** files: `requirements.txt`, `package.json`
- **Configuration** needed at runtime
- **Assets** served by the application

### Docker .dockerignore Template
```dockerignore
# Git
.git/
.gitattributes
.gitignore

# Documentation
*.md
docs/

# CI/CD
.github/
.gitlab-ci.yml
Jenkinsfile

# Development
.devcontainer/
.idea/
.vscode/

# Testing
.coverage
.pytest_cache/
htmlcov/
tests/
.spec/

# Python
__pycache__/
*.pyc
*.pyo
.mypy_cache/
.ruff_cache/

# Virtual environments (shouldn't be in context anyway)
.venv/
venv/

# Build artifacts
build/
dist/
*.egg-info/

# Environment files
.env
.env.*

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db

# Temporary
tmp/
temp/
*.tmp
```

---

## Synchronization Rules

### Shared Entries
Both `.gitignore` and `.dockerignore` should include:
- Python bytecode: `*.pyc`, `__pycache__/`
- Build artifacts: `build/`, `dist/`, `*.egg-info/`
- Testing outputs: `.coverage`, `.pytest_cache/`
- Environment files: `.env.*`
- Temporary files: `tmp/`, `*.tmp`

### .gitignore Only
Include in `.gitignore` but NOT `.dockerignore`:
- Nothing typically - if it shouldn't be in git, it probably shouldn't be in Docker either

### .dockerignore Only
Include in `.dockerignore` but NOT `.gitignore`:
- `.git/` - Git directory itself
- Documentation: `README.md`, `docs/`
- CI/CD files: `.github/`, workflows
- Tests: `tests/` (keep in git, exclude from Docker)

---

## Example: Complete Synchronized Files

### .gitignore
```gitignore
# Python
__pycache__/
*.py[cod]
*.so
.Python

# Virtual environments
.venv/
venv/
ENV/

# Testing
.coverage
.pytest_cache/
htmlcov/

# Type checking
.mypy_cache/

# Build artifacts
build/
dist/
*.egg-info/

# Environment
.env
.env.*
!.env.example

# IDEs
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Temporary
tmp/
temp/
```

### .dockerignore
```dockerignore
# Git
.git/
.gitignore

# Documentation
*.md
docs/

# CI/CD
.github/

# Development
.devcontainer/
.idea/
.vscode/

# Testing
.coverage
.pytest_cache/
htmlcov/
tests/

# Python
__pycache__/
*.pyc
*.pyo
.mypy_cache/

# Virtual environments
.venv/
venv/

# Build artifacts
build/
dist/
*.egg-info/

# Environment
.env
.env.*

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db

# Temporary
tmp/
temp/
```

---

## Maintenance Guidelines

### Regular Review
- Review ignore files quarterly
- Remove obsolete patterns
- Add patterns for new tools/frameworks
- Keep alphabetically sorted

### Testing Ignore Patterns
```bash
# Test what .gitignore ignores
git status --ignored

# Test what .dockerignore ignores
# Build with context listing
docker build --no-cache --progress=plain .

# Show Docker build context size
docker build --no-cache . 2>&1 | grep "Sending build context"
```

### Common Patterns by Language/Framework

**Node.js:**
```
node_modules/
npm-debug.log
.npm/
```

**Go:**
```
*.exe
*.test
vendor/
```

**Rust:**
```
target/
Cargo.lock
```

**General Development:**
```
*.swp
*.swo
*~
.DS_Store
Thumbs.db
```

---

## Project-Specific Customization

### Adding Custom Patterns
```gitignore
# Project-specific artifacts
data/raw/
models/trained/
cache/

# Generated documentation
api-docs/

# Platform-specific
*.local
```

### Excluding Important Files
Use `!` to negate a pattern:

```gitignore
# Ignore all .env files
.env.*

# Except the example
!.env.example

# Ignore all configs
config/*.yml

# Except the template
!config/template.yml
```

---

## Common Mistakes to Avoid

### ❌ Don't Do This
```gitignore
# Too broad - might ignore important files
*

# Unnecessary wildcards
*.py*  # Matches .py, .pyc, .pyi, .pyx - too broad

# OS-specific in shared repo without comments
Desktop.ini  # Only relevant on Windows
```

### ✅ Do This Instead
```gitignore
# Specific patterns with comments
*.pyc  # Python bytecode
*.pyo  # Optimized bytecode

# OS files (all platforms)
.DS_Store    # macOS
Thumbs.db    # Windows
Desktop.ini  # Windows
```

---

## Verification Checklist

Before committing ignore file changes:

- [ ] Patterns are alphabetically sorted within sections
- [ ] Each section has a comment describing its contents
- [ ] No overly broad patterns that might catch important files
- [ ] Environment templates (`.env.example`) are NOT ignored
- [ ] Test that critical files are still tracked: `git status`
- [ ] Verify Docker build context size is reasonable
- [ ] No duplicate patterns between sections
- [ ] Platform-specific patterns are commented
