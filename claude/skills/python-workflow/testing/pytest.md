# Python Testing with Pytest

Pytest patterns and best practices. For general Python workflow, see parent `SKILL.md`.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

## CRITICAL: Zero Warnings Tolerance

**Treat all warnings as errors. No exceptions.**

| Status | Output | Action |
|--------|--------|--------|
| PASS | All tests passed, no warnings | Proceed |
| FAIL | Tests passed with DeprecationWarning | Fix immediately |
| FAIL | Any warning present | Block commit |

**Pre-Commit Requirements:**
- All tests pass
- Zero warnings
- No linting errors
- No type errors
- Code formatted

**MUST NOT commit with:**
- Failing tests
- Any warnings
- Linting errors
- Unformatted code

---

## CRITICAL: UV Execution Rules

```bash
# CORRECT
uv run pytest
uv run pytest -v
uv run pytest tests/unit/ -v
uv run pytest --cov=app --cov-report=html

# WRONG - Never add -m flag
# uv run -m pytest
```

---

## Testing Strategy

### Test Pyramid
1. **Unit Tests (70%)** - Fast, isolated, test individual functions/classes
2. **Integration Tests (20%)** - Test component interactions
3. **End-to-End Tests (10%)** - Full system tests

### What to Test
**DO test:**
- Public APIs and interfaces
- Business logic and calculations
- Edge cases (empty inputs, None values, boundaries)
- Error handling and exceptions
- Data validation
- Critical paths through the application

**DON'T test:**
- Private implementation details
- Third-party library internals
- Trivial getters/setters
- Framework magic (unless you suspect bugs)

### Coverage Requirements
- **Minimum:** 80% overall coverage
- **Critical paths:** 100% coverage
- **New code:** Should not decrease overall coverage
- **Focus:** Behavior over line count

---

## Test Structure - Arrange-Act-Assert Pattern

All tests follow the **Arrange-Act-Assert (AAA)** pattern for clarity:

1. **Arrange** - Set up test data and conditions
2. **Act** - Execute the functionality being tested
3. **Assert** - Verify the results

```python
# GOOD - Clear AAA structure
def test_user_registration():
    # Arrange
    user_data = {"email": "test@example.com", "password": "secure"}
    # Act
    result = register_user(user_data)
    # Assert
    assert result.success
    assert result.user.email == "test@example.com"

# BAD - Testing implementation details
def test_internal_method():
    obj = MyClass()
    assert obj._internal_state == expected  # Don't test private state
```

---

## Test Organization

### Directory Structure
```
tests/
├── __init__.py
├── conftest.py              # Session/module level fixtures
├── unit/                    # Fast, isolated tests (70%)
│   ├── __init__.py
│   ├── conftest.py          # Unit-specific fixtures
│   └── test_*.py
├── integration/             # Component interaction tests (20%)
│   ├── __init__.py
│   ├── conftest.py          # Integration-specific fixtures
│   └── test_*.py
└── e2e/                     # End-to-end tests (10%)
    ├── __init__.py
    └── test_*.py
```

### Naming Conventions
- Test files: `test_*.py` or `*_test.py`
- Test classes: `Test*` (e.g., `TestUserService`)
- Test functions: `test_*` (e.g., `test_create_user_success`)
- Fixtures: Descriptive names (e.g., `user_service`, `mock_database`)

**CRITICAL:** MUST NOT name non-test classes with "Test" prefix - framework will try to collect them as tests.

---

## Fixture Scopes

```python
@pytest.fixture(scope="session")
def database_connection():
    """Created once per test session - expensive setup."""
    connection = setup_expensive_database()
    yield connection
    connection.cleanup()

@pytest.fixture(scope="module")
def api_client():
    """Created once per test module."""
    return APIClient(config="test")

@pytest.fixture(scope="function")  # Default
def user():
    """Created for each test function - isolated."""
    return User(email="test@example.com")
```

### Setup and Teardown

```python
@pytest.fixture
def database():
    # Setup
    db = Database(":memory:")
    db.initialize()

    yield db  # Provide to test

    # Teardown
    db.close()
```

### Fixture Dependencies

```python
@pytest.fixture
def database():
    db = Database(":memory:")
    yield db
    db.close()

@pytest.fixture
def user_service(database):
    return UserService(database)

@pytest.fixture
def authenticated_user(user_service):
    user = user_service.create_user(username="testuser", email="test@example.com")
    yield user
    user_service.delete_user(user.id)
```

---

## conftest.py Patterns

```python
# tests/conftest.py
import pytest

@pytest.fixture(scope="session")
def database_connection():
    db = Database(":memory:")
    db.initialize()
    yield db
    db.close()

@pytest.fixture
def user_service(database_connection):
    return UserService(database_connection)

@pytest.fixture
def sample_user_data():
    return {"username": "testuser", "email": "test@example.com", "password": "secure123"}
```

---

## Parametrized Testing

```python
@pytest.mark.parametrize("input,expected", [
    ("hello", "HELLO"),
    ("world", "WORLD"),
    ("", ""),
])
def test_uppercase(input, expected):
    assert input.upper() == expected

@pytest.mark.parametrize("method,expected_status", [
    ("GET", 200),
    ("POST", 201),
    ("DELETE", 204),
])
def test_http_methods(client, method, expected_status):
    response = client.request(method, "/api/resource")
    assert response.status_code == expected_status
```

---

## Async Testing

```python
@pytest.mark.asyncio
async def test_async_fetch_data():
    result = await fetch_data_async("user123")
    assert result is not None

@pytest.fixture
async def async_client():
    client = AsyncHTTPClient()
    await client.connect()
    yield client
    await client.disconnect()

@pytest.mark.asyncio
async def test_api_call(async_client):
    response = await async_client.get("/api/users")
    assert response.status_code == 200
```

---

## Mocking Patterns

```python
from unittest.mock import Mock, patch

def test_send_email_success():
    mock_smtp = Mock()
    with patch("smtplib.SMTP", return_value=mock_smtp):
        result = send_email("test@example.com", "Subject", "Body")
    mock_smtp.send_message.assert_called_once()
    assert result is True

@pytest.fixture
def mock_database():
    with patch("app.database.Database") as mock_db:
        mock_db.return_value.query.return_value = {"id": 1, "name": "Test"}
        yield mock_db

def test_user_service_with_mock(mock_database):
    service = UserService(mock_database.return_value)
    user = service.get_user(1)
    assert user["name"] == "Test"
```

**When to mock:**
- External services (APIs, databases, network)
- Slow operations
- Non-deterministic behavior (time, random)
- Edge cases difficult to reproduce

---

## Exception Testing

```python
def test_exception_raised():
    with pytest.raises(UserNotFoundError) as exc_info:
        user_service.get_user("nonexistent_id")
    assert "nonexistent_id" in str(exc_info.value)

def test_exception_type_matching():
    with pytest.raises((ValueError, TypeError)):
        process_data(None)

def test_create_user_invalid_email(user_service):
    """Test user creation fails with invalid email."""
    user_data = {
        "username": "testuser",
        "email": "invalid-email",
        "age": 25
    }
    with pytest.raises(ValidationError) as exc_info:
        user_service.create_user(user_data)
    assert "email" in str(exc_info.value)
```

---

## Edge Case Testing

Always test these edge cases:

```python
def test_edge_cases():
    calculator = Calculator()
    assert calculator.sum([]) == 0          # Empty input
    assert calculator.sum([5]) == 5         # Single item
    assert calculator.sum([-1, -2]) == -3   # Negative numbers
    assert calculator.sum([0, 0]) == 0      # Zero

def test_none_handling(service):
    with pytest.raises(ValueError):
        service.process(None)

def test_boundary_values():
    # Test at boundaries
    assert validate_age(0) is True          # Minimum
    assert validate_age(150) is True        # Maximum
    assert validate_age(-1) is False        # Below minimum
    assert validate_age(151) is False       # Above maximum
```

---

## Integration Testing

```python
@pytest.fixture(scope="module")
def test_database():
    """Provide test database for integration tests."""
    db = create_test_database()
    run_migrations(db)
    yield db
    cleanup_database(db)

@pytest.mark.integration
def test_user_operations(test_database):
    """Test user repository with real database."""
    user = create_user(test_database, email="test@example.com")
    assert user.id is not None

    retrieved = get_user(test_database, user.id)
    assert retrieved.email == "test@example.com"
```

---

## Test Markers

```python
@pytest.mark.slow
def test_expensive_operation():
    result = process_large_dataset()
    assert result.success

@pytest.mark.integration
def test_database_integration():
    result = query_database()
    assert result is not None

# Run commands:
# uv run pytest -m "not slow"
# uv run pytest -m integration
# uv run pytest -m "unit and not slow"
```

---

## pyproject.toml Configuration

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = ["-v", "--strict-markers", "--tb=short", "--cov=app", "--cov-report=term-missing"]
markers = [
    "slow: marks tests as slow (deselect with '-m \"not slow\"')",
    "integration: marks tests as integration tests",
    "asyncio: marks tests as async tests",
]
filterwarnings = ["error"]

[tool.coverage.run]
source = ["app"]
omit = ["*/tests/*", "*/migrations/*", "*/__init__.py"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
]
min_coverage = 80
```

---

## Makefile Integration

```makefile
.PHONY: test test-unit test-integration test-coverage

test:
	uv run pytest

test-unit:
	uv run pytest tests/unit/ -v

test-integration:
	uv run pytest tests/integration/ -v

test-coverage:
	uv run pytest --cov=app --cov-report=html
```

---

## Essential Commands

```bash
# Development - Targeted
uv run pytest tests/unit/test_file.py -v           # Specific file
uv run pytest -k "test_name" -v                    # Pattern match
uv run pytest tests/unit/test_file.py::test_func   # Exact test
uv run pytest -v --tb=short                        # Cleaner errors

# Debugging
uv run pytest -l                                   # Show locals
uv run pytest --pdb                                # Debug on failure
uv run pytest -x                                   # Stop on first failure
uv run pytest --lf                                 # Rerun last failed

# Warnings as errors
uv run pytest -W error

# Coverage
uv run pytest --cov=app --cov-report=html          # HTML report
uv run pytest --cov=app --cov-report=term-missing  # Terminal report

# Verification
make check                                         # Full suite + quality
uv run black --check app/ tests/                   # Format check
uv run isort --check app/ tests/                   # Import order
uv run flake8 app/ tests/                          # Linting
uv run mypy app/ tests/                            # Type check
```

---

## Import Error Solutions

**Ensure __init__.py exists:**
```
tests/
├── __init__.py  # Important!
├── conftest.py
└── unit/
    ├── __init__.py
    └── test_*.py
```

**Add to pyproject.toml:**
```toml
[tool.pytest.ini_options]
pythonpath = ["src"]
```

---

## Development Workflow

**During Development:**
1. Write/modify code
2. Run targeted tests for fast iteration
3. Fix issues immediately

**Before Commit:**
1. Run full suite (`uv run pytest` or `make check`)
2. Fix all warnings/errors
3. Verify coverage hasn't decreased
4. Commit when zero warnings

**MUST:**
- Test after every change
- Fix warnings immediately
- Add tests for new features

**MUST NOT:**
- Commit with failures/warnings
- Skip tests after changes
- Ignore failures as "known issues"

---

## Test Quality Checklist

- Run in isolation (no shared state)
- Deterministic (same result every time)
- Fast (mock slow operations)
- Clear names document behavior
- Test edge cases and errors
- Zero warnings in output
- >80% coverage on critical paths

---

## Advanced Testing Patterns

| Pattern | Description |
|---------|-------------|
| **Local-first** | All tests MUST run locally without external dependencies |
| **Testcontainers** | Use testcontainers for integration tests |
| **Flaky policy** | 48-hour remediation, then quarantine or delete |
| **Idempotence** | Verify operations are safely re-runnable |
| **Factories > Fixtures** | Prefer factories for flexible test data |

---

**TL;DR: Zero warnings policy. Follow test pyramid (70/20/10). Arrange-Act-Assert pattern. Mock external dependencies. Test behavior not implementation. >80% coverage on critical paths. Run targeted tests during development, full suite before commit.**
