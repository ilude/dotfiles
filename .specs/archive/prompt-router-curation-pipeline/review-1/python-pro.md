## Finding 1
severity: high
evidence: `pi/prompt-routing/pyproject.toml` has `package = false`, and existing CLIs are file scripts such as `classify.py` that inject the script directory into `sys.path`. The plan allows either `pi/prompt-routing/curation_pipeline.py` or `pi/prompt-routing/curation/`, but all commands invoke a file path. A `curation/` package with relative imports will fail when executed as `python pi/prompt-routing/curation_pipeline.py` unless import bootstrapping is specified.
required_fix: Pick one layout. Prefer a single top-level script plus top-level helper modules, or define `python -m curation.cli` commands and package import rules explicitly.

## Finding 2
severity: high
evidence: T2 says to use sources with "dataset-library access", but `pyproject.toml` dependencies do not include `datasets`, `huggingface_hub`, `requests`, or `httpx`. The plan also requires `uv sync --locked`, so hidden imports or ad hoc installs will fail under the locked uv environment.
required_fix: State the exact network access implementation. Either use only Python stdlib/fixture files, or add reviewed dependencies to `pyproject.toml` and update `uv.lock` as part of the plan with `uv sync --locked` validation.

## Finding 3
severity: medium
evidence: The automation plan uses `uv run ruff check pi/prompt-routing` without `--project`, while all prompt-routing execution is otherwise scoped with `uv run --project pi/prompt-routing`. From repo root, unscoped `uv run ruff` can resolve against the wrong project or fail if root tooling differs.
required_fix: Replace with a deterministic command, e.g. `uv run --project pi/prompt-routing ruff check .` from the project root if ruff is a dependency, or use the repo-owned `make lint-python` only. Do not leave two ambiguous lint paths.

## Finding 4
severity: medium
evidence: The plan writes experiment outputs under `pi/prompt-routing/experiments/curation/`, but `pi/prompt-routing/AGENTS.md` lists ignored local state and does not include `experiments/`; the plan only says "possible `.gitignore` update". Without a mandatory ignore rule, bounded pulls can leave raw prompts and scored JSONL visible as untracked files.
required_fix: Make the ignore policy an explicit T1 acceptance item. Add or update the relevant `.gitignore` before any pull/run task, and test that generated JSONL/raw/cache outputs are ignored while any intentionally tracked docs/config remain visible.

## Finding 5
severity: medium
evidence: CLI acceptance commands use relative output paths such as `pi/prompt-routing/experiments/curation/test-run`. If the script is run from `pi/prompt-routing`, that path becomes nested under `pi/prompt-routing/pi/prompt-routing/...`; if run from repo root it works. The adversarial failure is a command that only works from one CWD.
required_fix: Specify path normalization against repo root or project root and add a test that invokes the CLI from both repo root and `pi/prompt-routing`. Document one canonical invocation using absolute `--project ~/.dotfiles/pi/prompt-routing` paths if cross-CWD support is not required.
