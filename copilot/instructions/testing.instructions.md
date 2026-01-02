---
description: "Testing standards, strategies, and execution practices"
applyTo: "**/tests/**/*.py"
---

# Testing Standards

## Execution Commands

### UV-based Projects (Recommended)
```bash
# Run all tests
uv run pytest

# Run with verbose output
uv run pytest -v

# Run specific test file
uv run pytest tests/unit/test_service.py -v

# Run tests matching pattern
uv run pytest -k "test_user" -v

# Run with coverage
uv run pytest --cov=app --cov-report=html

# Run with short traceback
uv run pytest --tb=short
```

**CRITICAL:**
- Use `uv run pytest` (NEVER call `pytest` directly in uv projects)
- Never add `-m` flag: ❌ `uv run -m pytest` ✅ `uv run pytest`

### Traditional Projects
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html tests/
```

### Makefile Integration
```makefile
.PHONY: test test-unit test-integration

test: test-unit test-integration

test-unit:
	uv run pytest tests/unit/ -v

test-integration:
	uv run pytest tests/integration/ -v

test-coverage:
	uv run pytest --cov=app --cov-report=html --cov-report=term
```

---

## Testing Strategy

### Test Pyramid
1. **Unit Tests (70%)** - Fast, isolated, test individual functions/classes
2. **Integration Tests (20%)** - Test component interactions
3. **End-to-End Tests (10%)** - Full system tests

### What to Test
✅ **DO test:**
- Public APIs and interfaces
- Business logic and calculations
- Edge cases (empty inputs, None values, boundaries)
- Error handling and exceptions
- Data validation
- Critical paths through the application

❌ **DON'T test:**
- Private implementation details
- Third-party library internals
- Trivial getters/setters
- Framework magic (unless you suspect bugs)

---

## Test Organization

### Directory Structure
```
tests/
├── __init__.py
├── conftest.py              # Shared fixtures
├── unit/                    # Fast, isolated tests
│   ├── __init__.py
│   ├── test_models.py
│   ├── test_services.py
│   └── test_utils.py
├── integration/             # Component interaction tests
│   ├── __init__.py
│   ├── test_api.py
│   └── test_database.py
└── e2e/                     # End-to-end tests
    ├── __init__.py
    └── test_workflows.py
```

### Naming Conventions
- Test files: `test_*.py` or `*_test.py`
- Test classes: `Test*` (e.g., `TestUserService`)
- Test functions: `test_*` (e.g., `test_create_user_success`)
- Fixtures: Descriptive names (e.g., `user_service`, `mock_database`)

**CRITICAL:** Never name non-test classes with "Test" prefix - pytest will try to collect them as tests.

---

## pytest Best Practices

### Fixtures for Reusable Setup
```python
# conftest.py
import pytest
from app.services import UserService
from app.database import Database


@pytest.fixture
def database():
    """Provide test database instance."""
    db = Database(":memory:")  # SQLite in-memory
    db.initialize()
    yield db
    db.close()


@pytest.fixture
def user_service(database):
    """Provide UserService with test database."""
    return UserService(database)
```

### Fixture Scopes
```python
@pytest.fixture(scope="session")
def database_connection():
    """Created once per test session."""
    pass

@pytest.fixture(scope="module")
def api_client():
    """Created once per test module."""
    pass

@pytest.fixture(scope="function")  # Default
def user():
    """Created for each test function."""
    pass
```

### Parametrized Tests
```python
import pytest


@pytest.mark.parametrize("input,expected", [
    ("hello", "HELLO"),
    ("world", "WORLD"),
    ("", ""),
    ("MiXeD", "MIXED"),
])
def test_uppercase(input, expected):
    """Test uppercase conversion with multiple inputs."""
    assert input.upper() == expected
```

---

## Test Structure (Arrange-Act-Assert)

### Example Test
```python
def test_create_user_success(user_service):
    """Test successful user creation."""
    # Arrange - Set up test data and conditions
    user_data = {
        "username": "testuser",
        "email": "test@example.com",
        "age": 25
    }

    # Act - Execute the functionality being tested
    user = user_service.create_user(user_data)

    # Assert - Verify the results
    assert user is not None
    assert user.username == "testuser"
    assert user.email == "test@example.com"
    assert user.age == 25


def test_create_user_invalid_email(user_service):
    """Test user creation fails with invalid email."""
    # Arrange
    user_data = {
        "username": "testuser",
        "email": "invalid-email",  # Invalid format
        "age": 25
    }

    # Act & Assert - Exception expected
    with pytest.raises(ValidationError) as exc_info:
        user_service.create_user(user_data)

    assert "email" in str(exc_info.value)
```

---

## Testing Patterns

### Testing Exceptions
```python
import pytest
from app.exceptions import UserNotFoundError


def test_get_user_not_found(user_service):
    """Test exception raised when user doesn't exist."""
    with pytest.raises(UserNotFoundError) as exc_info:
        user_service.get_user("nonexistent_id")

    assert "nonexistent_id" in str(exc_info.value)
```

### Mocking External Dependencies
```python
from unittest.mock import Mock, patch
import pytest


def test_send_email_success():
    """Test email sending with mocked SMTP."""
    # Create mock SMTP connection
    mock_smtp = Mock()

    with patch("smtplib.SMTP", return_value=mock_smtp):
        result = send_email("test@example.com", "Subject", "Body")

    # Verify mock was called correctly
    mock_smtp.send_message.assert_called_once()
    assert result is True


@pytest.fixture
def mock_api_client():
    """Provide mocked API client."""
    with patch("app.client.APIClient") as mock:
        mock.return_value.get.return_value = {"status": "ok"}
        yield mock
```

### Testing Async Code
```python
import pytest


@pytest.mark.asyncio
async def test_async_fetch_data():
    """Test async data fetching."""
    result = await fetch_data_async("user123")
    assert result is not None
    assert result["id"] == "user123"
```

---

## Coverage Requirements

### Running Coverage
```bash
# Generate coverage report
uv run pytest --cov=app --cov-report=html --cov-report=term

# View HTML report
open htmlcov/index.html
```

### Coverage Configuration (pyproject.toml)
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = [
    "-v",
    "--strict-markers",
    "--tb=short",
]

[tool.coverage.run]
source = ["app"]
omit = [
    "*/tests/*",
    "*/migrations/*",
    "*/__init__.py",
]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise AssertionError",
    "raise NotImplementedError",
    "if __name__ == .__main__.:",
    "if TYPE_CHECKING:",
]
```

### Coverage Goals
- **Minimum:** 80% overall coverage
- **Critical paths:** 100% coverage
- **New code:** Should not decrease overall coverage

---

## Testing Edge Cases

### Common Edge Cases
```python
def test_edge_cases(calculator):
    """Test edge cases for calculator."""
    # Empty input
    assert calculator.sum([]) == 0

    # Single item
    assert calculator.sum([5]) == 5

    # Negative numbers
    assert calculator.sum([-1, -2, -3]) == -6

    # Mixed positive and negative
    assert calculator.sum([10, -5, 3]) == 8

    # Large numbers
    assert calculator.sum([10**10, 10**10]) == 2 * 10**10

    # Zero
    assert calculator.sum([0, 0, 0]) == 0
```

### Testing None Values
```python
def test_none_handling(service):
    """Test handling of None values."""
    # None input
    with pytest.raises(ValueError):
        service.process(None)

    # None in list
    result = service.process_list([1, None, 3])
    assert result == [1, 3]  # None filtered out
```

---

## Performance Testing

### Timing Tests
```python
import time
import pytest


def test_performance_within_limit(data_processor):
    """Test processing completes within time limit."""
    large_dataset = generate_test_data(10000)

    start = time.time()
    result = data_processor.process(large_dataset)
    duration = time.time() - start

    assert duration < 1.0  # Should complete in under 1 second
    assert len(result) == 10000
```

### Using pytest-benchmark
```python
def test_sorting_performance(benchmark):
    """Benchmark sorting algorithm."""
    data = list(range(1000, 0, -1))  # Worst case for some algorithms

    result = benchmark(sort_function, data)

    assert result == list(range(1, 1001))
```

---

## Integration Testing

### Database Integration
```python
import pytest
from app.database import Database


@pytest.fixture(scope="module")
def test_database():
    """Provide test database for integration tests."""
    db = Database("test.db")
    db.migrate()
    yield db
    db.close()
    os.remove("test.db")


def test_user_repository_integration(test_database):
    """Test user repository with real database."""
    repo = UserRepository(test_database)

    # Create user
    user = repo.create(username="testuser", email="test@example.com")
    assert user.id is not None

    # Retrieve user
    retrieved = repo.get(user.id)
    assert retrieved.username == "testuser"

    # Update user
    retrieved.email = "updated@example.com"
    repo.update(retrieved)

    # Verify update
    updated = repo.get(user.id)
    assert updated.email == "updated@example.com"
```

### API Integration
```python
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """Provide test client for API testing."""
    return TestClient(app)


def test_create_user_endpoint(client):
    """Test user creation via API."""
    response = client.post("/users", json={
        "username": "testuser",
        "email": "test@example.com"
    })

    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "testuser"
    assert "id" in data
```

---

## Test Markers

### Custom Markers
```python
# pyproject.toml
[tool.pytest.ini_options]
markers = [
    "slow: marks tests as slow (deselect with '-m \"not slow\"')",
    "integration: marks tests as integration tests",
    "unit: marks tests as unit tests",
]
```

### Using Markers
```python
import pytest


@pytest.mark.slow
def test_expensive_operation():
    """Test that takes a long time."""
    pass


@pytest.mark.integration
def test_database_integration():
    """Integration test with database."""
    pass


# Run only fast tests
# uv run pytest -m "not slow"

# Run only integration tests
# uv run pytest -m integration
```

---

## Development Dependencies

### Installing Test Dependencies (UV)
```bash
# Add pytest and plugins
uv add --dev pytest pytest-cov pytest-asyncio pytest-mock

# For coverage
uv add --dev coverage[toml]

# For performance testing
uv add --dev pytest-benchmark
```

### Common Test Packages
- `pytest` - Core testing framework
- `pytest-cov` - Coverage plugin
- `pytest-asyncio` - Async test support
- `pytest-mock` - Mocking utilities
- `pytest-benchmark` - Performance testing
- `faker` - Test data generation
- `factory-boy` - Test fixture factories
- `responses` - Mock HTTP requests

---

## Common Issues and Solutions

### Issue: Import Errors
```python
# If tests can't import app modules, ensure __init__.py exists
# Or add to conftest.py:
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
```

### Issue: Deleted Files Breaking Tests
```python
# Move skip() BEFORE imports to prevent collection errors
import pytest
pytest.skip("Module removed", allow_module_level=True)

from deleted_module import Something  # Won't be evaluated
```

### Issue: Warnings Treated as Errors
```bash
# Treat warnings as errors to ensure clean test runs
uv run pytest -W error

# Or in pyproject.toml
[tool.pytest.ini_options]
filterwarnings = ["error"]
```
