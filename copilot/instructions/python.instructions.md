---
description: "Python coding standards and best practices using modern tooling (uv, Python 3.12+)"
applyTo: "**/*.py"
---

# Python Development Standards

## Tooling and Package Management

### UV Package Manager (Preferred)
- **Use `uv` exclusively** for modern Python projects
- **Installation commands:**
  - Production: `uv add <package>`
  - Development: `uv add --dev <package>`
  - Optional groups: `uv add --group <group-name> <package>` (e.g., notebook, docs)
- **Execution:** `uv run python script.py` or `uv run pytest`
- **Never call python/pytest directly** - always use `uv run`

### Alternative: Traditional Tools
- If not using uv, use pip with requirements files
- Maintain `requirements.txt` and `requirements-dev.txt`
- Use virtual environments (`.venv`) and activate before operations

**CUSTOMIZATION:** Choose uv OR traditional tooling - remove the section you don't use.

---

## Code Style and Formatting

### PEP 8 Compliance
- Follow **PEP 8** style guide
- Line length: **88 characters** (Black standard)
- Indentation: **4 spaces** per level
- Two blank lines before top-level function/class definitions
- One blank line between methods in a class

### Automated Formatters
- **Black** - Primary code formatter (88 char line length)
- **isort** - Import sorting (use Black profile for compatibility)
- **Ruff** - Fast linter and formatter (optional alternative)

### Example Formatting
```python
from typing import Any

import pandas as pd
from pydantic import BaseModel


class DataModel(BaseModel):
    """Example data model with proper spacing."""

    field_one: str
    field_two: int


def process_data(input_data: list[dict[str, Any]]) -> pd.DataFrame:
    """
    Process input data and return DataFrame.

    Args:
        input_data: List of dictionaries containing raw data

    Returns:
        Processed pandas DataFrame
    """
    return pd.DataFrame(input_data)
```

---

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

---

## Naming Conventions

### Standard Conventions
- **Class names:** PascalCase (`UserService`, `DatabaseConnection`)
- **Function/variable names:** snake_case (`get_user_data`, `connection_pool`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_RETRIES`, `DEFAULT_TIMEOUT`)
- **Private methods/variables:** Leading underscore (`_internal_method`, `_cache`)

### Critical: Avoid Test Name Conflicts
- **NEVER name classes with "Test" prefix** unless they are actual pytest test classes
- Use descriptive names: `MockComponent`, `HelperClass`, `UtilityFunction` instead of `TestComponent`
- Pytest collects classes starting with "Test" as test classes, causing confusion

### File Naming
- Python files should be snake_case version of the primary class
- Examples:
  - `DNSRecordHandler` → `dns_record_handler.py`
  - `ComponentFactory` → `component_factory.py`
- For modules with multiple classes or functional code, name for the module's purpose

---

## Documentation and Comments

### Docstrings (PEP 257)
- Provide docstrings for all public modules, classes, and functions
- Use triple quotes: `"""Docstring text."""`
- First line: brief summary (ends with period)
- Detailed description after blank line if needed
- Document parameters, return values, and exceptions

### Comment Philosophy
**See `self-explanatory-code-commenting.instructions.md` for detailed guidance.**

Key principles:
- Comment to explain **WHY**, not **WHAT**
- Prefer clear names and structure over comments
- Use comments for complex business logic, algorithms, and non-obvious decisions
- Avoid obvious, redundant, or outdated comments

### Example Documentation
```python
def calculate_compound_interest(
    principal: float,
    rate: float,
    time: int,
    compound_frequency: int = 1
) -> float:
    """
    Calculate compound interest using the standard formula.

    Args:
        principal: Initial amount invested
        rate: Annual interest rate as decimal (e.g., 0.05 for 5%)
        time: Time period in years
        compound_frequency: Times per year interest compounds (default: 1)

    Returns:
        Final amount after compound interest

    Raises:
        ValueError: If principal, rate, or time is negative
    """
    if principal < 0 or rate < 0 or time < 0:
        raise ValueError("Values must be non-negative")

    # Using compound interest formula: A = P(1 + r/n)^(nt)
    return principal * (1 + rate / compound_frequency) ** (compound_frequency * time)
```

---

## Error Handling

### Exception Best Practices
- Use **specific exception types** (ValueError, KeyError) over generic Exception
- Provide **meaningful error messages** that help debugging
- Use Python's `logging` module with structured logging
- Handle edge cases explicitly (empty inputs, None values, invalid types)

### Example Error Handling
```python
import logging

logger = logging.getLogger(__name__)


def process_user_data(user_id: str) -> dict[str, Any]:
    """
    Process user data with proper error handling.

    Args:
        user_id: Unique user identifier

    Returns:
        Processed user data dictionary

    Raises:
        ValueError: If user_id is empty or invalid format
        UserNotFoundError: If user doesn't exist
    """
    if not user_id or not user_id.strip():
        raise ValueError("user_id cannot be empty")

    try:
        user = fetch_user(user_id)
        if user is None:
            raise UserNotFoundError(f"User {user_id} not found")
        return process(user)
    except DatabaseError as e:
        logger.error(f"Database error processing user {user_id}: {e}")
        raise
```

---

## Project Structure

### Package Organization
- Include `__init__.py` in all packages
- Use `__init__.py` to control package exports
- Structure DTOs and handlers logically
- Separate concerns: models, services, repositories, controllers

### Recommended Structure
```
project/
├── src/
│   └── app/
│       ├── __init__.py          # Export main app components
│       ├── core/                # Core business logic
│       │   ├── __init__.py
│       │   ├── commands.py      # Command DTOs
│       │   └── queries.py       # Query DTOs
│       ├── services/            # Business services
│       │   ├── __init__.py
│       │   └── user_service.py
│       ├── repositories/        # Data access
│       │   ├── __init__.py
│       │   └── user_repository.py
│       └── models/              # Data models
│           ├── __init__.py
│           └── user.py
├── tests/                       # Test files
│   ├── __init__.py
│   ├── unit/
│   └── integration/
├── pyproject.toml               # Project configuration
└── README.md
```

### Import Patterns
- Use **relative imports** within packages: `from .models import User`
- Use **absolute imports** from other packages: `from app.services import UserService`
- Avoid circular imports through careful module organization

---

## Configuration Management

### Environment Variables
- Use **python-dotenv** for development: load from `.env` files
- Use `os.getenv()` with sensible defaults
- Validate configuration at startup
- Never commit `.env` files to version control

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

---

## Testing and Quality

### Testing Strategy
- Write tests for critical paths and public APIs
- Use **pytest** as the primary test framework
- Organize tests: `tests/unit/`, `tests/integration/`
- Test edge cases: empty inputs, None values, large datasets
- Use fixtures for reusable test setup
- Use `pytest.mark` for test categorization

### Quality Tools
- **pytest** - Test framework
- **coverage** - Code coverage measurement
- **mypy** - Static type checking
- **bandit** - Security scanning
- **Black/Ruff** - Code formatting
- **isort** - Import sorting

### Example Test
```python
import pytest
from app.services import UserService


@pytest.fixture
def user_service():
    """Provide UserService instance for tests."""
    return UserService()


def test_get_user_success(user_service):
    """Test successful user retrieval."""
    user = user_service.get_user("user123")
    assert user is not None
    assert user.id == "user123"


def test_get_user_not_found(user_service):
    """Test user not found raises appropriate exception."""
    with pytest.raises(UserNotFoundError):
        user_service.get_user("nonexistent")
```

---

## Special Patterns

### Flask/FastAPI Applications
- Structure with `app/` package using `__init__.py` exports
- Use blueprints/routers for route organization
- Implement health check endpoints (`/health`, `/status`)
- Use Pydantic for request/response models
- Disable debug mode in production

### Command/Query Patterns (CQRS)
- Separate Commands (write operations) and Queries (read operations)
- Use command/query buses for dispatch
- Define DTOs as dataclasses
- Implement handlers separately from business logic

### Async/Await
- Use `async def` for I/O-bound operations
- Use `await` for async calls
- Use `asyncio` for concurrent operations
- Be aware of event loop management
