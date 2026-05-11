"""
gen.py -- Generate synthetic genH shard (250 rows) for prompt-routing training corpus.

Route distribution:
  100 Haiku/none
   50 Haiku/low
   50 Sonnet/low
   30 Sonnet/medium
   20 Sonnet/high

Focus: docs, testing, cli, frontend, logging, refactor, config, api, database
Task types: code_review, mechanical_edit, explain, rewrite, factual
"""

import json
import random
from pathlib import Path

random.seed(42)

PROVENANCE = {
    "generator_model": "claude-sonnet",
    "generator_model_size": "medium",
    "adjudicator_model": "claude-opus",
    "adjudicator_model_size": "large",
    "prompt_version_hash": "sha256:genH-v1",
    "temperature": 0.0,
    "generated_at": "2026-05-11T00:00:00Z",
}

# ---------------------------------------------------------------------------
# Template banks -- each entry is (prompt_text, domain, task_type, ambiguity)
# ---------------------------------------------------------------------------

# Haiku/none: answer-only clarification, trivial recall, no reasoning needed
HAIKU_NONE_BANK = [
    # docs
    ("What does the @deprecated JSDoc tag signal to callers of a function?", "docs", "factual", "clear"),
    ("What is the purpose of a CHANGELOG.md file in a repository?", "docs", "factual", "clear"),
    ("Which Markdown syntax creates a second-level heading?", "docs", "factual", "clear"),
    ("What does the :param: directive do in a Python docstring?", "docs", "factual", "clear"),
    ("What field in an OpenAPI spec marks a path parameter as required?", "docs", "factual", "clear"),
    ("What does the `--no-cache` flag do in a Docker build command?", "docs", "factual", "clear"),
    ("What file extension does reStructuredText use?", "docs", "factual", "clear"),
    ("What does the `example` field in a JSON Schema property definition represent?", "docs", "factual", "clear"),
    ("Which HTTP status code means 'resource created successfully'?", "docs", "factual", "clear"),
    ("What does the `readOnly: true` property in an OpenAPI schema mean for clients?", "docs", "factual", "clear"),
    # testing
    ("What does `pytest.mark.skip` do when applied to a test function?", "testing", "factual", "clear"),
    ("In Jest, what is the difference between `describe` and `it`?", "testing", "factual", "clear"),
    ("What does the `--coverage` flag report when running Jest tests?", "testing", "factual", "clear"),
    ("What does `assert.strictEqual` check that `assert.equal` does not?", "testing", "factual", "clear"),
    ("What is a test fixture in the context of unit testing?", "testing", "factual", "clear"),
    ("What does `pytest -x` do differently from `pytest` without flags?", "testing", "factual", "clear"),
    ("What is the role of a mock object in a unit test?", "testing", "factual", "clear"),
    ("What does `beforeEach` do in a Jest test suite?", "testing", "factual", "clear"),
    ("What is the difference between a stub and a spy in test doubles?", "testing", "factual", "clear"),
    ("What does `pytest --tb=short` control in test output?", "testing", "factual", "clear"),
    # cli
    ("What does the `-v` flag conventionally mean on most Unix command-line tools?", "cli", "factual", "clear"),
    ("What does `argparse.add_argument('--flag', action='store_true')` produce?", "cli", "factual", "clear"),
    ("What is the purpose of a `--dry-run` flag in a CLI tool?", "cli", "factual", "clear"),
    ("What does `click.echo` do differently from Python's built-in `print`?", "cli", "factual", "clear"),
    ("What does exit code 1 conventionally indicate in a shell script?", "cli", "factual", "clear"),
    ("What does the `--help` flag typically print for a CLI command?", "cli", "factual", "clear"),
    ("What is the purpose of the `metavar` parameter in argparse?", "cli", "factual", "clear"),
    ("What does `os.environ.get('KEY', 'default')` return when KEY is unset?", "cli", "factual", "clear"),
    ("What does the `--quiet` flag conventionally suppress in CLI output?", "cli", "factual", "clear"),
    ("What does the POSIX convention `--` signal on a command line?", "cli", "factual", "clear"),
    # frontend
    ("What does `event.preventDefault()` stop in a browser event handler?", "frontend", "factual", "clear"),
    ("What is the difference between `null` and `undefined` in JavaScript?", "frontend", "factual", "clear"),
    ("What does the `key` prop do in a React list rendering?", "frontend", "factual", "clear"),
    ("What does `useEffect` with an empty dependency array do in React?", "frontend", "factual", "clear"),
    ("What does `z-index` control in CSS layout?", "frontend", "factual", "clear"),
    ("What does `box-sizing: border-box` change about how width is calculated?", "frontend", "factual", "clear"),
    ("What does `Object.freeze()` prevent in JavaScript?", "frontend", "factual", "clear"),
    ("What does the `aria-label` attribute communicate to screen readers?", "frontend", "factual", "clear"),
    ("What is the purpose of a `<meta charset='utf-8'>` tag in HTML?", "frontend", "factual", "clear"),
    ("What does `display: flex` do to a container's children?", "frontend", "factual", "clear"),
    # logging
    ("What log level is conventionally used for expected operational events?", "logging", "factual", "clear"),
    ("What is the difference between `logging.warning` and `logging.error` in Python?", "logging", "factual", "clear"),
    ("What does structured logging mean compared to plain text log lines?", "logging", "factual", "clear"),
    ("What does a correlation ID in a log entry help with?", "logging", "factual", "clear"),
    ("What does log rotation accomplish in a long-running service?", "logging", "factual", "clear"),
    # config
    ("What does a `.env` file typically store in a web project?", "config", "factual", "clear"),
    ("What is the difference between a config file and an environment variable?", "config", "factual", "clear"),
    ("What does `JSON.parse` throw when given invalid JSON?", "config", "factual", "clear"),
    ("What does the `required` validator in Joi or Zod do for a schema field?", "config", "factual", "clear"),
    ("What does `dotenv.config()` do when called at the start of a Node.js script?", "config", "factual", "clear"),
    # api
    ("What HTTP verb should be used to partially update a resource?", "api", "factual", "clear"),
    ("What does a 429 HTTP response status code mean?", "api", "factual", "clear"),
    ("What is the purpose of the `Content-Type` request header?", "api", "factual", "clear"),
    ("What does an ETag header enable in HTTP caching?", "api", "factual", "clear"),
    ("What does idempotency mean for an HTTP PUT endpoint?", "api", "factual", "clear"),
    # database
    ("What does a database index trade off to speed up reads?", "database", "factual", "clear"),
    ("What does `ON DELETE CASCADE` do in a foreign key constraint?", "database", "factual", "clear"),
    ("What is the difference between `TRUNCATE` and `DELETE FROM` in SQL?", "database", "factual", "clear"),
    ("What does a NULL value in a database column represent?", "database", "factual", "clear"),
    ("What does the `EXPLAIN` keyword show in a PostgreSQL query?", "database", "factual", "clear"),
    # refactor
    ("What does the term 'dead code' mean in a codebase?", "refactor", "factual", "clear"),
    ("What does extracting a method refactoring accomplish?", "refactor", "factual", "clear"),
    ("What does 'cyclomatic complexity' measure in a function?", "refactor", "factual", "clear"),
    ("What is the difference between renaming a variable and aliasing it?", "refactor", "factual", "clear"),
    ("What does 'inlining a function' mean as a refactoring step?", "refactor", "factual", "clear"),
    # more docs
    ("What is the conventional location for API reference docs in a Python package?", "docs", "factual", "clear"),
    ("What does `.. autofunction::` do in a Sphinx documentation build?", "docs", "factual", "clear"),
    ("What does the `summary` field in an OpenAPI operation object describe?", "docs", "factual", "clear"),
    ("What is the purpose of a `man` page for a command-line tool?", "docs", "factual", "clear"),
    ("What does `doctest` in Python verify when run?", "docs", "factual", "clear"),
    # more testing
    ("What does `pytest.raises` do in a test?", "testing", "factual", "clear"),
    ("What does `unittest.mock.patch` replace during a test?", "testing", "factual", "clear"),
    ("What is property-based testing?", "testing", "factual", "clear"),
    ("What does `--pdb` do when passed to pytest?", "testing", "factual", "clear"),
    ("What does a snapshot test verify in a frontend testing setup?", "testing", "factual", "clear"),
    # more api
    ("What does `Accept: application/json` tell an API server?", "api", "factual", "clear"),
    ("What does versioning an API path (e.g. /v1/users) provide to API consumers?", "api", "factual", "clear"),
    ("What does a 503 response status code indicate about a service?", "api", "factual", "clear"),
    ("What is the purpose of an API gateway in a microservice architecture?", "api", "factual", "borderline"),
    ("What does a webhook deliver that polling an endpoint does not?", "api", "factual", "clear"),
    # more database
    ("What does `VACUUM` do in a PostgreSQL database?", "database", "factual", "clear"),
    ("What is the difference between a primary key and a unique constraint?", "database", "factual", "clear"),
    ("What does connection pooling improve in a database-backed service?", "database", "factual", "clear"),
    ("What does the `DEFAULT` keyword set for a column in a CREATE TABLE statement?", "database", "factual", "clear"),
    ("What does `GROUP BY` do to rows in a SQL SELECT query?", "database", "factual", "clear"),
    # more frontend
    ("What does `localStorage` store in a browser compared to `sessionStorage`?", "frontend", "factual", "clear"),
    ("What does `JSON.stringify` do to a JavaScript object?", "frontend", "factual", "clear"),
    ("What does the `defer` attribute on a `<script>` tag control?", "frontend", "factual", "clear"),
    ("What does `Promise.all` do when one of its promises rejects?", "frontend", "factual", "clear"),
    ("What does the `alt` attribute on an `<img>` tag provide?", "frontend", "factual", "clear"),
    # more config
    ("What does `process.env.NODE_ENV` typically equal in a production build?", "config", "factual", "clear"),
    ("What is the purpose of a `.gitignore` file?", "config", "factual", "clear"),
    ("What does `pyproject.toml` replace compared to `setup.py` in a Python project?", "config", "factual", "clear"),
    ("What does the `engines` field in a `package.json` file specify?", "config", "factual", "clear"),
    ("What does `eslint --fix` do when run against source files?", "config", "factual", "clear"),
    # more logging
    ("What does the `propagate=False` setting do for a Python logger?", "logging", "factual", "clear"),
    ("What is the purpose of a log aggregator like Loki or Elasticsearch?", "logging", "factual", "borderline"),
    ("What does `%exc_info%` in a Python logging format string include?", "logging", "factual", "clear"),
    ("What does sampling in distributed tracing reduce?", "logging", "factual", "clear"),
    ("What is the difference between a log message and a metric?", "logging", "factual", "clear"),
]

# Haiku/low: simple factual, syntax clarification, small isolated transformation
HAIKU_LOW_BANK = [
    # docs / mechanical_edit
    ("Fix the typo in this function's docstring: 'Retuns the user ID' should read 'Returns the user ID'.", "docs", "mechanical_edit", "clear"),
    ("Add a missing period to the end of each one-line summary in this module's docstring.", "docs", "mechanical_edit", "clear"),
    ("Update the `version` field in the README badge from `1.2.0` to `1.3.0`.", "docs", "mechanical_edit", "clear"),
    ("Replace every occurrence of 'whitelist' with 'allowlist' in the API reference docs.", "docs", "mechanical_edit", "clear"),
    ("Add the `@since 2.0` tag to this JSDoc block that is missing it.", "docs", "mechanical_edit", "clear"),
    ("Reformat the parameter list in this Python docstring to use the NumPy style.", "docs", "mechanical_edit", "clear"),
    ("Correct the HTTP method listed in the curl example -- it says GET but should be POST.", "docs", "mechanical_edit", "clear"),
    ("Add a `Returns:` section to this function's docstring describing the boolean return value.", "docs", "mechanical_edit", "clear"),
    ("Update the copyright year in the file header from 2023 to 2025.", "docs", "mechanical_edit", "clear"),
    # testing / explain
    ("What does `assert response.status_code == 200` check in a pytest test for a REST endpoint?", "testing", "explain", "clear"),
    ("Explain what `mocker.patch.object(service, 'send_email')` does in a pytest test.", "testing", "explain", "clear"),
    ("What does `factory_boy` provide that raw `Model.objects.create()` calls do not?", "testing", "explain", "clear"),
    # cli / mechanical_edit
    ("Rename the `--output-dir` flag to `--out` throughout this CLI module's argument definitions.", "cli", "mechanical_edit", "clear"),
    ("Add a `--version` flag to this Click command group that prints the package version string.", "cli", "mechanical_edit", "clear"),
    ("Update the default value of `--timeout` from 30 to 60 in this argparse definition.", "cli", "mechanical_edit", "clear"),
    # frontend / code_review
    ("Review this two-line CSS change adding `overflow: hidden` to the nav container. Any obvious layout side effects?", "frontend", "code_review", "clear"),
    ("Is it correct to call `setState` inside a `useEffect` that depends on that same state variable?", "frontend", "explain", "clear"),
    ("What does `e.stopPropagation()` prevent in this button click handler?", "frontend", "explain", "clear"),
    # logging / mechanical_edit
    ("Change the log level for the 'cache miss' message from DEBUG to INFO in the cache module.", "logging", "mechanical_edit", "clear"),
    ("Replace `print(f'Error: {e}')` with `logger.error('cache error', exc_info=True)` in this function.", "logging", "mechanical_edit", "clear"),
    ("Add a `request_id` field to every log statement in this request handler.", "logging", "mechanical_edit", "clear"),
    # config / explain
    ("What does setting `PYTHONDONTWRITEBYTECODE=1` in the environment do?", "config", "explain", "clear"),
    ("Explain what `strictNullChecks: true` does in a TypeScript tsconfig.", "config", "explain", "clear"),
    ("What does `port: 0` mean when configuring a test server in Node.js?", "config", "explain", "clear"),
    # api / code_review
    ("Does this endpoint handler correctly return 201 for creates and 200 for updates? Review the status code logic.", "api", "code_review", "clear"),
    ("Review this three-line change adding an `X-Request-ID` header to API responses.", "api", "code_review", "clear"),
    # database / explain
    ("Why does this query use `IS NULL` instead of `= NULL` for filtering empty rows?", "database", "explain", "clear"),
    ("Explain what `RETURNING id` does in this PostgreSQL INSERT statement.", "database", "explain", "clear"),
    # refactor / mechanical_edit
    ("Rename the variable `data` to `user_payload` throughout this function body.", "refactor", "mechanical_edit", "clear"),
    ("Extract the three repeated `datetime.utcnow()` calls in this file into a single `now()` helper.", "refactor", "mechanical_edit", "clear"),
    ("Remove the unused `import os` from the top of this module.", "refactor", "mechanical_edit", "clear"),
    ("Inline the `_build_url` helper -- it is only called once and is two lines long.", "refactor", "mechanical_edit", "clear"),
    ("Replace the `or` default pattern `val = config.get('key') or 'default'` with `config.get('key', 'default')` throughout this file.", "refactor", "mechanical_edit", "clear"),
    # more docs
    ("Add missing backticks around the function name `parse_config` in this README sentence.", "docs", "mechanical_edit", "clear"),
    ("Translate the inline comment 'verifica il formato' to English.", "docs", "mechanical_edit", "clear"),
    ("Add a `See Also` section to this docstring linking to the `format_output` function.", "docs", "mechanical_edit", "clear"),
    ("Update the example curl command in the docs to use the correct endpoint path `/api/v2/items` instead of `/api/v1/items`.", "docs", "mechanical_edit", "clear"),
    # testing / mechanical_edit
    ("Add `@pytest.mark.slow` to each test that calls the external payment API.", "testing", "mechanical_edit", "clear"),
    ("Rename the test file `test_util.py` to `test_string_utils.py` to match the module it tests.", "testing", "mechanical_edit", "clear"),
    ("Change all `assertEqual` calls in this test class to `assert ==` style to match the rest of the suite.", "testing", "mechanical_edit", "clear"),
    # api / mechanical_edit
    ("Update every route in this router that uses `/user/` to use `/users/` (plural).", "api", "mechanical_edit", "clear"),
    ("Add `deprecated: true` to the `/v1/export` path in the OpenAPI YAML.", "api", "mechanical_edit", "clear"),
    # database / mechanical_edit
    ("Rename the column `usr_id` to `user_id` in this SQLAlchemy model class.", "database", "mechanical_edit", "clear"),
    ("Add `nullable=False` to the `email` column definition in this Alembic migration.", "database", "mechanical_edit", "clear"),
    # config / mechanical_edit
    ("Change the `log_level` default from `'debug'` to `'info'` in the app's config schema.", "config", "mechanical_edit", "clear"),
    ("Remove the duplicate `'cors'` entry from the middleware list in `settings.py`.", "config", "mechanical_edit", "clear"),
    ("Move the hardcoded `MAX_RETRIES = 5` constant from `client.py` into `config.py`.", "config", "mechanical_edit", "borderline"),
    # frontend / mechanical_edit
    ("Replace `color: #fff` with `color: var(--color-white)` throughout the component stylesheet.", "frontend", "mechanical_edit", "clear"),
    ("Add `rel='noopener noreferrer'` to every `<a target='_blank'>` link in this template.", "frontend", "mechanical_edit", "clear"),
    ("Add `aria-required='true'` to each required form input in the registration form template.", "frontend", "mechanical_edit", "clear"),
]

# Sonnet/low: practical repo-aware edits, simple reviews
SONNET_LOW_BANK = [
    # code_review / docs
    ("Review this updated README section explaining pagination. Does it accurately describe the cursor-based API, and are the curl examples correct?", "docs", "code_review", "clear"),
    ("The docstring for `process_payment` says it returns a dict but the code returns a dataclass. Flag the mismatch and suggest a fix.", "docs", "code_review", "clear"),
    ("Review the changelog entry for v2.1.0 -- does it clearly distinguish breaking changes from minor improvements?", "docs", "code_review", "borderline"),
    ("Check whether the OpenAPI spec for the `/orders` endpoint matches the actual request and response shapes in the handler.", "api", "code_review", "clear"),
    ("The API README lists query parameters `page` and `per_page` but the handler only reads `limit` and `offset`. Identify the discrepancy.", "api", "code_review", "clear"),
    # mechanical_edit / refactor
    ("Extract the repeated database session setup block (lines 12-18) that appears in five handler functions into a shared `get_session` context manager.", "database", "mechanical_edit", "clear"),
    ("Consolidate the three separate `logging.getLogger(__name__)` calls across `auth.py`, `payments.py`, and `users.py` into a single `get_logger` utility.", "logging", "mechanical_edit", "clear"),
    ("Replace the six inline `os.path.join` calls in `build_paths.py` with `pathlib.Path` usage.", "refactor", "mechanical_edit", "clear"),
    ("Update all usages of the deprecated `config.get_value()` to the new `config.read()` API across the codebase.", "config", "mechanical_edit", "clear"),
    ("Rename the `UserDto` class to `UserResponse` and update all import sites.", "refactor", "mechanical_edit", "clear"),
    # explain
    ("Explain why this Express middleware chain calls `next()` before sending a response in the error handler.", "api", "explain", "clear"),
    ("Why does this SQLAlchemy query use `.options(selectinload(...))` rather than `.join()`?", "database", "explain", "clear"),
    ("Explain the difference in behavior between `useCallback` and `useMemo` in this component.", "frontend", "explain", "clear"),
    ("Why does this test use `freezegun` to patch `datetime.now` instead of mocking the function directly?", "testing", "explain", "clear"),
    ("Explain what `__all__` in this module's `__init__.py` controls for `from module import *` callers.", "refactor", "explain", "clear"),
    # rewrite
    ("Rewrite this `for` loop that accumulates a list into a list comprehension.", "refactor", "rewrite", "clear"),
    ("Rewrite this repeated error-logging block into a decorator that wraps the three affected functions.", "logging", "rewrite", "clear"),
    ("Rewrite this nested ternary expression into a readable `if/elif/else` block.", "frontend", "rewrite", "clear"),
    ("Rewrite this raw SQL string in `reports.py` using the SQLAlchemy Core expression language.", "database", "rewrite", "clear"),
    ("Rewrite this shell-style string formatting in the test helper to use an f-string.", "testing", "rewrite", "clear"),
    # code_review
    ("Review this new test for the `calculate_discount` function -- does it cover the edge case where discount exceeds 100%?", "testing", "code_review", "clear"),
    ("Review this CLI change that adds a `--format` flag with choices `json` and `table`. Does the argument validation prevent unsupported values?", "cli", "code_review", "clear"),
    ("Check whether this logging change introduces any PII exposure by logging the full request body.", "logging", "code_review", "borderline"),
    ("Review the migration that adds a NOT NULL column `tenant_id` to an existing table -- does it handle existing rows correctly?", "database", "code_review", "clear"),
    ("Review this config loader change -- does it correctly fall back to environment variables when a key is missing from the YAML file?", "config", "code_review", "clear"),
    # more rewrite
    ("Rewrite this `switch` statement handling HTTP status codes as a lookup table.", "api", "rewrite", "clear"),
    ("Rewrite this imperative array-filtering loop into a single `filter().map()` chain.", "frontend", "rewrite", "clear"),
    ("Rewrite the inline retry logic in `send_request` as a reusable `with_retry(max_attempts)` decorator.", "api", "rewrite", "clear"),
    ("Rewrite this multi-line string concatenation into a single template literal.", "frontend", "rewrite", "clear"),
    ("Rewrite this config parsing function to use `dataclasses` instead of a plain dict.", "config", "rewrite", "clear"),
    # more code_review
    ("Review this change to the `render_table` function -- does it handle an empty list without crashing?", "cli", "code_review", "clear"),
    ("Does this new pytest fixture correctly scope the database session to function-level to prevent state leakage between tests?", "testing", "code_review", "clear"),
    ("Review this docstring update for `validate_email` -- is the described behavior consistent with the regex used?", "docs", "code_review", "clear"),
    ("Review this two-function refactor that splits `load_config` into `load_file` and `parse_config`. Are the responsibilities cleanly separated?", "config", "code_review", "borderline"),
    ("Does this frontend form validation show the error message before or after the user leaves the field? Review the event binding.", "frontend", "code_review", "clear"),
    # more explain
    ("Explain why this test imports `TestClient` from `starlette.testclient` rather than using the requests library directly.", "testing", "explain", "clear"),
    ("Why does this migration use `batch_alter_table` instead of a plain `alter_column`?", "database", "explain", "clear"),
    ("Explain why `console.warn` is used instead of `console.error` for the deprecation notice in this utility.", "frontend", "explain", "clear"),
    ("Explain what `PYTHONPATH=.` does when prefixed to the pytest command in this Makefile.", "testing", "explain", "clear"),
    ("Why does this API handler validate the body before the auth token check?", "api", "explain", "borderline"),
    # more mechanical_edit
    ("Add a `@deprecated` comment to each of the three v1 route handlers that now have v2 equivalents.", "api", "mechanical_edit", "clear"),
    ("Update the test fixture file to replace hardcoded port `3000` with `process.env.TEST_PORT`.", "testing", "mechanical_edit", "clear"),
    ("Move the `BASE_URL` constant out of `api_client.py` into the config module.", "config", "mechanical_edit", "clear"),
    ("Add the `--db-url` flag to the CLI migration command to allow overriding the database URL at runtime.", "cli", "mechanical_edit", "clear"),
    ("Replace the magic number `86400` with a named constant `SECONDS_PER_DAY` in the cache module.", "refactor", "mechanical_edit", "clear"),
    ("Add structured log fields `user_id` and `action` to the three audit log calls in `admin.py`.", "logging", "mechanical_edit", "clear"),
    ("Update the CSS class name `btn-primary` to `button--primary` across all five component files.", "frontend", "mechanical_edit", "clear"),
    ("Replace the two bare `except:` clauses in `importer.py` with `except Exception as e:` and log the error.", "refactor", "mechanical_edit", "clear"),
    ("Add a `nullable=True` override to the `phone` column in the user migration to match the model definition.", "database", "mechanical_edit", "clear"),
    ("Remove the `console.log` debug statements left in `CartContext.tsx` before the release.", "frontend", "mechanical_edit", "clear"),
]

# Sonnet/medium: multi-step, requires understanding context and tradeoffs
SONNET_MEDIUM_BANK = [
    # code_review
    ("Review the authentication middleware refactor that moves JWT verification from route-level decorators to a centralized guard. Assess whether all protected routes are still covered and whether error responses are consistent.", "api", "code_review", "clear"),
    ("Review this database access layer change that introduces a repository pattern over raw SQLAlchemy session calls. Check that session lifecycle is managed correctly and that transactions are not prematurely committed.", "database", "code_review", "clear"),
    ("Review this 80-line refactor that consolidates four separate logging configurations into a single `configure_logging` function called at startup. Identify any cases where module-level loggers would be initialized before the configuration runs.", "logging", "code_review", "borderline"),
    ("Review the test suite additions for the billing module -- do the mocks correctly isolate the payment provider, and do the tests cover the refund partial-amount edge case?", "testing", "code_review", "clear"),
    ("Review this CLI argument parsing refactor from argparse to Click. Does the new interface preserve backward compatibility with existing shell scripts that call the tool?", "cli", "code_review", "clear"),
    # rewrite
    ("Rewrite the `UserTable` component which currently fetches data in a `useEffect` and stores it in local state -- convert it to use React Query with proper loading and error states.", "frontend", "rewrite", "clear"),
    ("Rewrite the `run_migrations` CLI command to support a `--target` flag specifying a migration version, with validation that the target exists before running anything.", "cli", "rewrite", "clear"),
    ("Rewrite the logging setup in this Flask app so that each request gets a unique `trace_id` added to every log line within that request's context.", "logging", "rewrite", "clear"),
    ("Rewrite the `generate_report` function to stream its CSV output to a file rather than building the entire string in memory, keeping the function signature backward-compatible.", "api", "rewrite", "clear"),
    ("Rewrite the config loader to validate all required keys at startup and fail fast with a descriptive error listing every missing key, rather than throwing a KeyError at first use.", "config", "rewrite", "clear"),
    # explain
    ("Explain why this database query performs a sequential scan despite the index on `created_at`. Walk through the query plan output and identify the cause.", "database", "explain", "clear"),
    ("Explain the sequence of middleware calls in this Express app for a request that fails authentication -- which handlers run, in what order, and why.", "api", "explain", "clear"),
    ("Explain the memory retention issue this React component has -- the event listener added in `useEffect` is not cleaned up. Walk through what happens across remounts.", "frontend", "explain", "clear"),
    ("Explain why the test for `export_data` intermittently fails when two tests run in parallel -- trace the shared state that causes the race.", "testing", "explain", "clear"),
    ("Explain the config precedence order in this application: which wins when an environment variable and a YAML key both specify the same setting?", "config", "explain", "borderline"),
    # mechanical_edit (multi-step)
    ("Update the OpenAPI spec, the request handler, and the integration test to rename the `filter_by` query parameter to `filter` across all three files.", "api", "mechanical_edit", "clear"),
    ("Add request-level trace IDs to the logging middleware and propagate the trace ID to all downstream log calls within the same request context.", "logging", "mechanical_edit", "clear"),
    ("Add a `--output-format` flag to the CLI with choices `json`, `csv`, and `table`, update the output formatting logic, and add a test for each format.", "cli", "mechanical_edit", "clear"),
    ("Rename the `Account` model to `Organization` across the model file, migration, serializer, and all related tests.", "database", "mechanical_edit", "clear"),
    ("Add a `created_by` audit column to the `invoices` table: write the migration, update the model, add it to the API response schema, and update the fixture.", "database", "mechanical_edit", "clear"),
    # more code_review
    ("Review this frontend change that adds client-side pagination to a table component currently doing server-side pagination. Identify any data consistency issues when the user filters while on page 3.", "frontend", "code_review", "clear"),
    ("Review the config schema validation added to the startup sequence -- does it correctly reject configs where `max_connections` exceeds `pool_size`?", "config", "code_review", "clear"),
    ("Review this test helper that wraps database transactions in a savepoint for each test -- does the rollback guarantee isolation even for tests that commit explicitly?", "testing", "code_review", "borderline"),
    ("Review this refactor that changes the logger from module-level instantiation to dependency injection. Will existing code that imports the logger directly continue to work?", "logging", "code_review", "clear"),
    ("Review the CLI output change from plain text to JSON -- does the structured output correctly serialize all fields, including timestamps and nested objects?", "cli", "code_review", "clear"),
    # more rewrite / explain
    ("Rewrite the `Sidebar` component to replace prop-drilling of `isCollapsed` through four layers with a React context.", "frontend", "rewrite", "clear"),
    ("Explain why this alembic migration fails when run on a table with existing rows -- the new column has no default and is NOT NULL.", "database", "explain", "clear"),
    ("Rewrite the test setup that creates users with raw SQL into a factory function that uses the ORM, keeping test isolation intact.", "testing", "rewrite", "clear"),
    ("Explain why `Promise.allSettled` is used here instead of `Promise.all` when fetching data from three independent services.", "frontend", "explain", "clear"),
    ("Rewrite the `config_override` decorator so it restores the original config values even if the decorated function raises an exception.", "config", "rewrite", "clear"),
]

# Sonnet/high: complex but bounded -- deep analysis, larger-scope reviews
SONNET_HIGH_BANK = [
    # code_review (larger scope)
    ("Review this 200-line pull request that migrates the user service from synchronous SQLAlchemy sessions to async sessions with asyncpg. Check for unawaited coroutines, missing `async with` session contexts, and whether background tasks correctly acquire their own sessions.", "database", "code_review", "clear"),
    ("Review this frontend state management refactor that replaces Redux with Zustand across five feature modules. Identify any selectors that were silently dropped and any subscription patterns that could cause stale closures.", "frontend", "code_review", "clear"),
    ("Review the logging overhaul that introduces structured JSON logs, a correlation ID middleware, and a log-sampling configuration. Verify that PII fields are redacted, that the sampler does not drop error-level events, and that the correlation ID propagates across async task boundaries.", "logging", "code_review", "clear"),
    ("Review this CLI refactor that converts a monolithic `main()` function into a plugin architecture where each subcommand is a separate module. Assess whether error handling, exit codes, and help text are consistent across all plugins.", "cli", "code_review", "borderline"),
    # rewrite
    ("Rewrite the test suite for the `InvoiceService` class. The current tests hit the real database; replace them with unit tests using a mocked repository, covering creation, update, cancellation, and the late-payment penalty calculation.", "testing", "rewrite", "clear"),
    ("Rewrite the API client module that currently uses `requests` to use `httpx` with an async interface, maintaining the same public method signatures and adding connection-pool configuration.", "api", "rewrite", "clear"),
    # explain (deep)
    ("Explain why the background job queue loses tasks when the worker process restarts mid-job, tracing the lifecycle of a task through the queue, the worker's signal handler, and the database transaction commit.", "database", "explain", "clear"),
    ("Explain why this React component tree re-renders on every keystroke in the search input even though the results list is memoized -- trace the identity of each prop passed to the memoized child.", "frontend", "explain", "clear"),
    ("Explain how this multi-tenant config loader determines which tenant's settings to apply for a given request, and identify what happens if the tenant header is missing or malformed.", "config", "explain", "borderline"),
    ("Explain the cascading failure mode in this service: when the database pool is exhausted, how does the error propagate through the request handler, the retry middleware, and the circuit breaker, and what state does each layer leave behind?", "api", "explain", "clear"),
    # code_review (medium-large)
    ("Review the new end-to-end tests for the checkout flow. Do they correctly seed and tear down test data, and do they cover the case where a coupon is applied after a product is removed from the cart?", "testing", "code_review", "clear"),
    ("Review this database sharding implementation that routes writes to one of three shard connections based on `user_id % 3`. Identify any query patterns that would require cross-shard joins and assess how migrations are coordinated across shards.", "database", "code_review", "clear"),
    ("Review this refactored logging pipeline that buffers log records and flushes them in batches. Verify that the buffer drains on graceful shutdown and that a crash does not silently discard buffered records.", "logging", "code_review", "clear"),
    ("Review the API gateway configuration change that adds rate limiting per API key. Does the limit apply per key correctly when multiple workers share an in-memory counter, and what happens when the counter resets mid-request-burst?", "api", "code_review", "clear"),
    # rewrite (complex)
    ("Rewrite the CLI's `deploy` command which currently shells out to a series of scripts. Replace the shell calls with direct API calls to the deployment service, add progress reporting, and preserve the existing exit code contract.", "cli", "rewrite", "clear"),
    ("Rewrite the frontend data-fetch layer to consolidate three separate `useEffect`/`fetch` patterns into a single custom hook that handles caching, deduplication, and error boundaries.", "frontend", "rewrite", "clear"),
    ("Rewrite the config hot-reload mechanism so that file-system changes trigger a graceful config update without dropping in-flight requests or restarting the process.", "config", "rewrite", "clear"),
    ("Rewrite the integration test suite for the notification service to use contract tests against a recorded fixture rather than spinning up a live SMTP server.", "testing", "rewrite", "clear"),
    ("Rewrite the database migration runner to support dry-run mode that reports which migrations would be applied and their estimated row counts without making any schema changes.", "database", "rewrite", "clear"),
    ("Rewrite the refactor module's `symbol_rename` function to use the language server protocol's workspace-wide rename instead of regex substitution, handling import aliases and re-exports correctly.", "refactor", "rewrite", "clear"),
]


def make_judgment_haiku_none(domain, task_type):
    return [
        {
            "route": {"model_tier": "Haiku", "effort": "none"},
            "verdict": "acceptable",
            "rationale": f"Prompt requires only direct recall or a one-line factual answer; no reasoning chain needed for this {domain} {task_type}.",
        },
        {
            "route": {"model_tier": "Haiku", "effort": "low"},
            "verdict": "overkill",
            "rationale": f"Allocating thinking budget for this {domain} {task_type} adds latency without improving the answer quality.",
        },
        {
            "route": {"model_tier": "Sonnet", "effort": "low"},
            "verdict": "overkill",
            "rationale": f"A larger model is unnecessary; the answer is a single well-known fact about {domain}.",
        },
    ]


def make_judgment_haiku_low(prompt_text, domain, task_type):
    return [
        {
            "route": {"model_tier": "Haiku", "effort": "none"},
            "verdict": "insufficient",
            "rationale": f"Zero-effort mode skips the brief scan needed to locate and apply this small {domain} {task_type} correctly.",
        },
        {
            "route": {"model_tier": "Haiku", "effort": "low"},
            "verdict": "acceptable",
            "rationale": f"A small model with minimal thinking budget is enough to complete this isolated {domain} {task_type} without broader context.",
        },
        {
            "route": {"model_tier": "Sonnet", "effort": "low"},
            "verdict": "overkill",
            "rationale": f"A mid-tier model provides no correctness benefit over Haiku for this straightforward {domain} {task_type}.",
        },
    ]


def make_judgment_sonnet_low(prompt_text, domain, task_type):
    return [
        {
            "route": {"model_tier": "Haiku", "effort": "low"},
            "verdict": "insufficient",
            "rationale": f"Haiku lacks the code-reading depth to confidently handle this {domain} {task_type} without missing context-dependent details.",
        },
        {
            "route": {"model_tier": "Sonnet", "effort": "low"},
            "verdict": "acceptable",
            "rationale": f"Sonnet with low effort can parse the relevant code context and produce a correct {domain} {task_type} result.",
        },
        {
            "route": {"model_tier": "Sonnet", "effort": "medium"},
            "verdict": "overkill",
            "rationale": f"Extended thinking is not required; this {domain} {task_type} is straightforward once the relevant file is in context.",
        },
    ]


def make_judgment_sonnet_medium(prompt_text, domain, task_type):
    return [
        {
            "route": {"model_tier": "Sonnet", "effort": "low"},
            "verdict": "insufficient",
            "rationale": f"Low effort misses the multi-step reasoning needed to fully address this {domain} {task_type} and its edge cases.",
        },
        {
            "route": {"model_tier": "Sonnet", "effort": "medium"},
            "verdict": "acceptable",
            "rationale": f"Medium effort gives Sonnet enough reasoning budget to work through the cross-cutting concerns of this {domain} {task_type}.",
        },
        {
            "route": {"model_tier": "Sonnet", "effort": "high"},
            "verdict": "overkill",
            "rationale": f"High-effort extended thinking adds cost without correctness gain for this bounded {domain} {task_type}.",
        },
    ]


def make_judgment_sonnet_high(prompt_text, domain, task_type):
    return [
        {
            "route": {"model_tier": "Sonnet", "effort": "medium"},
            "verdict": "insufficient",
            "rationale": f"Medium effort does not provide enough reasoning depth for this complex {domain} {task_type} spanning multiple components.",
        },
        {
            "route": {"model_tier": "Sonnet", "effort": "high"},
            "verdict": "acceptable",
            "rationale": f"High-effort Sonnet can sustain the extended analysis required for this large-scope {domain} {task_type}.",
        },
        {
            "route": {"model_tier": "Opus", "effort": "medium"},
            "verdict": "overkill",
            "rationale": f"Top-tier architectural reasoning is not required; the complexity of this {domain} {task_type} is bounded and well-specified.",
        },
    ]


def build_rows():
    rows = []
    counter = 1

    def make_id(n):
        return f"synth-genH-{n:04d}"

    def make_family(label):
        return f"fam-genH-{label}"

    # -- Haiku/none (100 rows) --
    bank = list(HAIKU_NONE_BANK)
    for i, (prompt, domain, task_type, ambiguity) in enumerate(bank[:100]):
        fam_slug = prompt.split()[2:5]
        fam_slug = "-".join(w.lower().rstrip("?.,") for w in fam_slug)[:30]
        rows.append({
            "prompt_id": make_id(counter),
            "family_id": make_family(f"hn-{i:03d}-{fam_slug}"),
            "prompt": prompt,
            "source": "synthetic_large",
            "domain": domain,
            "task_type": task_type,
            "ambiguity": ambiguity,
            "cheapest_acceptable_route": {"model_tier": "Haiku", "effort": "none"},
            "complexity_tier": "low",
            "route_judgments": make_judgment_haiku_none(domain, task_type),
            "provenance": PROVENANCE,
            "notes": "Direct factual recall with a one-word or one-sentence answer; no code context needed.",
        })
        counter += 1

    # -- Haiku/low (50 rows) --
    bank = list(HAIKU_LOW_BANK)
    for i, (prompt, domain, task_type, ambiguity) in enumerate(bank[:50]):
        fam_slug = prompt.split()[1:4]
        fam_slug = "-".join(w.lower().rstrip("?.,':") for w in fam_slug)[:30]
        rows.append({
            "prompt_id": make_id(counter),
            "family_id": make_family(f"hl-{i:03d}-{fam_slug}"),
            "prompt": prompt,
            "source": "synthetic_large",
            "domain": domain,
            "task_type": task_type,
            "ambiguity": ambiguity,
            "cheapest_acceptable_route": {"model_tier": "Haiku", "effort": "low"},
            "complexity_tier": "low",
            "route_judgments": make_judgment_haiku_low(prompt, domain, task_type),
            "provenance": PROVENANCE,
            "notes": "Isolated small edit or explanation; a small model with minimal thinking budget is sufficient.",
        })
        counter += 1

    # -- Sonnet/low (50 rows) --
    bank = list(SONNET_LOW_BANK)
    for i, (prompt, domain, task_type, ambiguity) in enumerate(bank[:50]):
        fam_slug = prompt.split()[1:4]
        fam_slug = "-".join(w.lower().rstrip("?.,':") for w in fam_slug)[:30]
        rows.append({
            "prompt_id": make_id(counter),
            "family_id": make_family(f"sl-{i:03d}-{fam_slug}"),
            "prompt": prompt,
            "source": "synthetic_large",
            "domain": domain,
            "task_type": task_type,
            "ambiguity": ambiguity,
            "cheapest_acceptable_route": {"model_tier": "Sonnet", "effort": "low"},
            "complexity_tier": "low",
            "route_judgments": make_judgment_sonnet_low(prompt, domain, task_type),
            "provenance": PROVENANCE,
            "notes": "Requires reading code context and applying repo-aware judgment; Sonnet/low is the minimum effective route.",
        })
        counter += 1

    # -- Sonnet/medium (30 rows) --
    bank = list(SONNET_MEDIUM_BANK)
    for i, (prompt, domain, task_type, ambiguity) in enumerate(bank[:30]):
        fam_slug = prompt.split()[1:4]
        fam_slug = "-".join(w.lower().rstrip("?.,':") for w in fam_slug)[:30]
        rows.append({
            "prompt_id": make_id(counter),
            "family_id": make_family(f"sm-{i:03d}-{fam_slug}"),
            "prompt": prompt,
            "source": "synthetic_large",
            "domain": domain,
            "task_type": task_type,
            "ambiguity": ambiguity,
            "cheapest_acceptable_route": {"model_tier": "Sonnet", "effort": "medium"},
            "complexity_tier": "mid",
            "route_judgments": make_judgment_sonnet_medium(prompt, domain, task_type),
            "provenance": PROVENANCE,
            "notes": "Multi-step task spanning cross-cutting concerns; needs medium reasoning budget to handle edge cases.",
        })
        counter += 1

    # -- Sonnet/high (20 rows) --
    bank = list(SONNET_HIGH_BANK)
    for i, (prompt, domain, task_type, ambiguity) in enumerate(bank[:20]):
        fam_slug = prompt.split()[1:4]
        fam_slug = "-".join(w.lower().rstrip("?.,':") for w in fam_slug)[:30]
        rows.append({
            "prompt_id": make_id(counter),
            "family_id": make_family(f"sh-{i:03d}-{fam_slug}"),
            "prompt": prompt,
            "source": "synthetic_large",
            "domain": domain,
            "task_type": task_type,
            "ambiguity": ambiguity,
            "cheapest_acceptable_route": {"model_tier": "Sonnet", "effort": "high"},
            "complexity_tier": "mid",
            "route_judgments": make_judgment_sonnet_high(prompt, domain, task_type),
            "provenance": PROVENANCE,
            "notes": "Large-scope bounded task requiring sustained analysis; Sonnet/high is sufficient without top-tier strategic reasoning.",
        })
        counter += 1

    return rows


def main():
    out_dir = Path(__file__).parent
    out_path = out_dir / "chunk.jsonl"

    rows = build_rows()
    assert len(rows) == 250, f"Expected 250 rows, got {len(rows)}"

    with open(out_path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"Wrote {len(rows)} rows to {out_path}")

    # Distribution summary
    from collections import Counter
    route_dist = Counter(
        (r["cheapest_acceptable_route"]["model_tier"], r["cheapest_acceptable_route"]["effort"])
        for r in rows
    )
    domain_dist = Counter(r["domain"] for r in rows)
    task_dist = Counter(r["task_type"] for r in rows)
    ambig_dist = Counter(r["ambiguity"] for r in rows)

    print("\nRoute distribution:")
    for k, v in sorted(route_dist.items()):
        print(f"  {k[0]}/{k[1]}: {v}")

    print("\nDomain distribution:")
    for k, v in sorted(domain_dist.items()):
        print(f"  {k}: {v}")

    print("\nTask type distribution:")
    for k, v in sorted(task_dist.items()):
        print(f"  {k}: {v}")

    print(f"\nAmbiguity: {dict(ambig_dist)}")
    ambig_count = ambig_dist.get("ambiguous", 0)
    print(f"Ambiguous rows: {ambig_count} ({ambig_count/len(rows)*100:.1f}%) -- limit is 15% ({int(0.15*len(rows))})")


if __name__ == "__main__":
    main()
