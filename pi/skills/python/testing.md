# Python Testing with Pytest

Read the shared [testing skill](../testing/SKILL.md) for test selection, fixture isolation, teardown, mocking boundaries, and residue checks. This reference owns pytest and Python-specific patterns.

## Execution

Use the repository-owned `uv` or Make targets.

```bash
uv run pytest
uv run pytest tests/unit/test_file.py
uv run pytest tests/unit/test_file.py::test_name
uv run pytest -k "name"
uv run pytest -x --tb=short
```

Do not use `uv run -m pytest`. Run full suites, warnings-as-errors, and coverage only when repository policy or the changed contract requires them.

## Filesystem and environment fixtures

Prefer `tmp_path` or `tmp_path_factory` for isolated data. Use `monkeypatch.setenv` so pytest restores environment variables.

```python
from pathlib import Path

import pytest


@pytest.fixture
def isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    return home
```

Apply path changes before importing modules that cache their locations. Use `monkeypatch.syspath_prepend`, `importlib.reload`, or a delayed import only when the module contract requires it.

Do not use bare `tempfile.mkdtemp()` without registered cleanup. Use `tempfile.TemporaryDirectory` or a yielding fixture when explicit removal is required. Pytest may retain managed `tmp_path` roots for debugging; that is runner-managed retention, not permission to write into live state.

## Yielding fixtures and resource cleanup

Put cleanup after `yield` or in `finally`.

```python
import subprocess

import pytest


@pytest.fixture
def worker():
    process = subprocess.Popen(["worker", "--test-mode"])
    try:
        yield process
    finally:
        process.terminate()
        process.wait(timeout=5)
```

Choose fixture scope by ownership:

- `function` for mutable or isolated state.
- `module` for read-only state shared within one module.
- `session` only for expensive state that is safe across the entire run and has session teardown.

## Parametrization

```python
import pytest


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("hello", "HELLO"),
        ("", ""),
    ],
)
def test_uppercase(value: str, expected: str):
    assert value.upper() == expected
```

Use descriptive parameter IDs when raw values do not explain a failure.

## Async tests

Use the async plugin and fixture conventions already configured by the repository.

```python
import pytest


@pytest.mark.asyncio
async def test_fetches_user(async_client):
    response = await async_client.get("/users/user-1")
    assert response.status_code == 200
```

Ensure async clients, tasks, and event-loop resources are closed by their owning fixtures.

## Mocking

Use `unittest.mock` or the repository's configured plugin. Patch the name used by the module under test, not the symbol's original definition.

```python
from unittest.mock import patch


def test_sends_message():
    with patch("app.notifications.send") as send:
        notify_user("user-1")
    send.assert_called_once_with("user-1")
```

Use `monkeypatch` for environment variables, attributes, and simple boundary replacement. Avoid mocking internal methods when the public behavior can be exercised directly.

## Exceptions

```python
import pytest


def test_missing_user_reports_identifier():
    with pytest.raises(UserNotFoundError, match="user-1"):
        load_user("user-1")
```

Assert the exception type and stable public details. Do not couple tests to incidental traceback formatting.

## Markers and collection

Declare custom markers in `pyproject.toml` and run them through the repository workflow.

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = ["--strict-markers", "--tb=short"]
markers = [
    "integration: requires integration dependencies",
    "slow: exercises a slow contract",
]
```

Do not name non-test classes with a `Test` prefix because pytest may collect them.

## Useful diagnostics

```bash
uv run pytest --lf
uv run pytest -l
uv run pytest --pdb
uv run pytest -W error
uv run pytest --collect-only
```

Use `--lf` only after inspecting the current failure set. Do not substitute repeated retries for diagnosing a flaky test.

## Import layout

Follow the repository's package layout and import mode. Add `__init__.py` or pytest `pythonpath` configuration only when that matches the package's intended import contract; do not patch `sys.path` ad hoc in individual tests.
