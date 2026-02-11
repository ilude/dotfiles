---
name: python
description: Python development with uv, pytest, Pydantic, type hints, and modern tooling. Activate when working with Python files, pyproject.toml, uv, pip, pytest, or discussing Python code patterns.
---

# Python Projects Workflow

Guidelines for working with Python projects across different package managers, code styles, and architectural patterns using modern tooling (uv, Python 3.9+).

## Philosophy

Explicit over implicit. Type hints everywhere. Modern tooling (uv, Ruff). Test critical paths.

---

## Tooling and Package Management

### UV Package Manager (Preferred)
- **Use `uv` exclusively** for modern Python projects
- **MUST use `uv run`** for all execution (auto-finds venv, cross-platform, no activation needed)
- **MUST NOT reference .venv paths manually** (e.g., `.venv/Scripts/python.exe`)
- **Installation:** `uv add <package>`, `uv add --dev <package>`, `uv add --group <name> <package>`
- **Execution:** `uv run python script.py` or `uv run pytest`
- Run `uv sync` before executing code in new projects

### Alternative: Traditional Tools
- If not using uv, use pip with requirements files
- Maintain `requirements.txt` and `requirements-dev.txt`
- Use virtual environments (`.venv`) and activate before operations

### General Package Management
- Respect the project's chosen package manager (uv, pip, poetry, pipenv)
- Check `pyproject.toml` for project configuration
- MUST NOT mix package managers in the same project

## Python Module CLI Syntax

**Use `-m` flag** when running modules as CLIs (tells Python to run module as script, not file):

```bash
# GOOD: uv run python -m module.cli
# BAD: uv run python module.cli  # fails - treats as file path
```

## Code Style and Formatting

### PEP 8 Compliance
- Follow **PEP 8** style guide
- Line length: **88 characters** (Ruff/Black standard)
- Indentation: **4 spaces** per level

### Automated Formatters
- **Ruff** - Primary tool for linting AND formatting (replaces Black, isort, flake8)
  - Linting: `uv run ruff check . --fix`
  - Formatting: `uv run ruff format .`
- Configure in `pyproject.toml` under `[tool.ruff]`

### Style Guidelines
- Follow project's existing style (check `pyproject.toml`, `.editorconfig`)
- Default to PEP 8 if no project style defined
- Use type hints when writing new Python code
- Prefer f-strings over `.format()` or `%` formatting

## Type Safety and Annotations

### Type Hints
- **Strong type hints** for all parameters and return values
- Use modern generic types: `list[str]`, `dict[str, Any]` (Python 3.9+)
- For older Python: `from typing import List, Dict`
- Use `typing` module for complex types: `Union`, `Optional`, `Literal`, `Protocol`

### Data Validation
- **Use Pydantic** for data validation and serialization
- Use `dataclasses` for simple data containers when Pydantic is overkill
- Use `attrs` for enhanced dataclasses if preferred

### Example Type Usage
```python
from typing import Any, Protocol
from pydantic import BaseModel


class Repository(Protocol):
    """Protocol defining repository interface."""

    def get(self, id: str) -> dict[str, Any] | None:
        ...


class User(BaseModel):
    """User model with validation."""

    username: str
    email: str
    age: int | None = None


def fetch_user(repo: Repository, user_id: str) -> User | None:
    """Fetch user from repository with type safety."""
    data = repo.get(user_id)
    return User(**data) if data else None
```

## Naming Conventions

### Standard Conventions
- **Class names:** PascalCase (`UserService`, `DatabaseConnection`)
- **Function/variable names:** snake_case (`get_user_data`, `connection_pool`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_RETRIES`, `DEFAULT_TIMEOUT`)
- **Private methods/variables:** Leading underscore (`_internal_method`, `_cache`)

### Critical: Avoid Test Name Conflicts
- **MUST NOT name classes with "Test" prefix** unless they are actual pytest test classes
- Use descriptive names: `MockComponent`, `HelperClass`, `UtilityFunction` instead of `TestComponent`

### File Naming
- Python files SHOULD be snake_case version of the primary class
- Examples: `DNSRecordHandler` -> `dns_record_handler.py`

## Documentation and Comments

### Docstrings (PEP 257)
- Provide docstrings for all public modules, classes, and functions
- Use triple quotes: `"""Docstring text."""`
- First line: brief summary (ends with period)
- Document parameters, return values, and exceptions

### Comment Philosophy
- Comment to explain **WHY**, not **WHAT**
- Prefer clear names and structure over comments
- Use comments for complex business logic, algorithms, and non-obvious decisions

## Error Handling

### Exception Best Practices
- Use **specific exception types** (ValueError, KeyError) over generic Exception
- Provide **meaningful error messages** that help debugging
- Use Python's `logging` module with structured logging
- Handle edge cases explicitly (empty inputs, None values, invalid types)
- **CRITICAL:** MUST NOT remove public methods for lint fixes - preserve API stability

## Project Structure

### Recommended Directory Structure
```
project/
├── src/
│   └── app/
│       ├── __init__.py          # Export main app components
│       ├── core/                # Core business logic
│       │   ├── commands.py      # Command DTOs
│       │   └── queries.py       # Query DTOs
│       ├── services/            # Business services
│       ├── repositories/        # Data access
│       ├── models/              # Data models
│       └── handlers/            # Request handlers
├── tests/
│   ├── __init__.py
│   ├── unit/
│   └── integration/
├── pyproject.toml
└── README.md
```

### Import Patterns
- Use **relative imports** within packages: `from .models import User`
- Use **absolute imports** from other packages: `from app.services import UserService`
- Avoid circular imports through careful module organization

## Configuration Management

### Environment Variables
- Use **python-dotenv** for development: load from `.env` files
- Use `os.getenv()` with sensible defaults
- Validate configuration at startup
- MUST NOT commit `.env` files to version control

### Configuration Classes
```python
from pydantic import BaseModel, Field
import os


class AppConfig(BaseModel):
    """Application configuration with validation."""

    debug: bool = Field(default=False)
    database_url: str = Field(...)
    max_connections: int = Field(default=10, ge=1, le=100)

    @classmethod
    def from_env(cls) -> "AppConfig":
        """Load configuration from environment variables."""
        return cls(
            debug=os.getenv("DEBUG", "false").lower() == "true",
            database_url=os.getenv("DATABASE_URL", ""),
            max_connections=int(os.getenv("MAX_CONNECTIONS", "10"))
        )
```

## File Management

### Working with File Paths
- Use `pathlib.Path` for cross-platform path handling
- Avoid hardcoded paths; use `os.path.expanduser('~/')` for home directories
- MUST handle file encoding explicitly (UTF-8 default)
- Properly close files or use context managers (`with` statement)

## Testing

Testing rules are automatically loaded when working with test files. For comprehensive pytest patterns see testing.md

### Quick Reference
```bash
uv run pytest                    # Run all tests
uv run pytest tests/unit/ -v     # Run unit tests
uv run pytest --cov=app          # With coverage
uv run pytest -m "not slow"      # Skip slow tests
```

## Framework-Specific Patterns

For web framework patterns, load the appropriate framework rules:
- Django projects: django.md
- FastAPI projects: fastapi.md
- Flask projects: flask.md

## Special Patterns

### Command/Query Patterns (CQRS)
- Separate Commands (write operations) and Queries (read operations)
- Use command/query buses for dispatch
- Define DTOs as dataclasses or Pydantic models
- Implement handlers separately from business logic
- Example structure:
  - `core/commands.py` - Command DTOs
  - `core/queries.py` - Query DTOs
  - `handlers/command_handler.py` - Command processing

## Quick Reference: Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Lint | Ruff | `uv run ruff check . --fix` |
| Format | Ruff | `uv run ruff format .` |
| Type check | Mypy | `uv run mypy src/` |
| Type check | Pyright | `uv run pyright` |
| Security | Bandit | `uv run bandit -r src/` |
| Dead code | Vulture | `uv run vulture src/` |
| Coverage | pytest-cov | `uv run pytest --cov=src` |

## Quick Reference

**Package managers:**
- UV: `uv run`, `uv sync`, `uv add`, `uv add --dev`
- Poetry: `poetry run`, `poetry install`, `poetry add`
- Pip: `pip install`, `python -m pip`

**Key rules:**
- MUST use `uv run python` (MUST NOT use manual .venv paths)
- MUST use `-m` flag for module CLIs
- MUST check `pyproject.toml` for config
- MUST use strong type hints for all parameters/returns
- MUST separate concerns: models, services, repositories
- SHOULD use Pydantic for validation
- SHOULD use pytest with fixtures
- MUST NOT mix package managers
- MUST NOT remove public methods for lint fixes
- MUST NOT name helper classes with "Test" prefix
