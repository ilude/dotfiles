#!/usr/bin/env python
# /// script
# requires-python = ">=3.9"
# dependencies = ["pyyaml>=6.0"]
# ///
"""
Quality Validation Hook - PostToolUse
Runs linters on files after Write/Edit operations.
Loads validator config from validators.yaml.
"""

import fnmatch
import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Optional

import yaml

# Cap for parallel validator execution. Each validator runs in its own thread
# (subprocess work is I/O-bound), so we don't need many workers.
MAX_PARALLEL_VALIDATORS = 4

HOOK_DIR = Path(__file__).parent
CONFIG_FILE = HOOK_DIR / "validators.yaml"
SKIP_FILE = (
    Path(os.path.expanduser("~"))
    / ".claude"
    / "hooks"
    / "quality-validation"
    / "skip-validators.txt"
)
LOG_DIR = Path(os.path.expanduser("~")) / ".claude" / "logs" / "quality-validation"


def load_config() -> Optional[dict[str, Any]]:
    """Load validators.yaml config. Returns None on error."""
    if not CONFIG_FILE.exists():
        return None
    try:
        with open(CONFIG_FILE) as f:
            return yaml.safe_load(f)
    except yaml.YAMLError as e:
        log_error(f"Failed to parse validators.yaml: {e}")
        return None


def load_skip_list() -> set:
    """Load skip-validators.txt. Returns set of validator names to skip."""
    if not SKIP_FILE.exists():
        return set()
    try:
        with open(SKIP_FILE) as f:
            return {
                line.strip() for line in f if line.strip() and not line.startswith("#")
            }
    except OSError:
        return set()


def normalize_path(file_path: str) -> str:
    """Normalize path: backslash to forward slash, resolve to absolute."""
    file_path = file_path.replace("\\", "/")
    return os.path.abspath(file_path)


def _marker_matches(directory: Path, marker: str) -> bool:
    """Return True if `directory` contains `marker` (literal path or glob)."""
    if "*" in marker or "?" in marker:
        return any(directory.glob(marker))
    return (directory / marker).exists()


def find_project_root(file_dir: str, markers: list[str]) -> Optional[str]:
    """Walk up from file_dir looking for any marker file or matching glob.

    Markers may be literal filenames (e.g. "go.mod") or glob patterns
    (e.g. "*.csproj"). Returns the directory containing the first marker
    match, or None if nothing matches before filesystem root.
    """
    current = Path(file_dir).resolve()
    while True:
        for marker in markers:
            if _marker_matches(current, marker):
                return str(current)
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def match_language(
    file_path: str, config: dict[str, Any]
) -> Optional[tuple[str, dict[str, Any], str]]:
    """Match file extension to a language config entry.

    Only matches if at least one marker file is found in the ancestor chain.
    Returns (language_name, language_config, project_root) or None.
    """
    ext = os.path.splitext(file_path)[1].lower()
    file_dir = os.path.dirname(file_path)

    for lang_name, lang_config in config.items():
        if not isinstance(lang_config, dict):
            continue
        if lang_name.startswith("_"):
            # Convention: underscore-prefixed top-level keys are YAML anchors,
            # not language definitions. Skip them even if they happen to be dicts.
            continue
        extensions = lang_config.get("extensions", [])
        if ext not in extensions:
            continue
        markers = lang_config.get("markers", [])
        if not markers:
            continue
        project_root = find_project_root(file_dir, markers)
        if project_root is not None:
            return lang_name, lang_config, project_root

    return None


def filter_validators_by_detection(
    validators: list[dict], project_root: str
) -> list[dict]:
    """Filter validators using detect fields.

    If any validator has a 'detect' field with config files found in the
    project root, only validators whose config files are detected are used.
    Validators without a 'detect' field are included only if no detection
    matches are found (fallback behavior).
    """
    detected = []
    fallbacks = []

    for validator in validators:
        detect_files = validator.get("detect", [])
        if not detect_files:
            fallbacks.append(validator)
            continue
        for config_file in detect_files:
            if (Path(project_root) / config_file).exists():
                detected.append(validator)
                break

    return detected if detected else fallbacks


def detect_package_manager() -> Optional[str]:
    """Detect available system package manager."""
    if shutil.which("winget"):
        return "winget"
    if shutil.which("brew"):
        return "brew"
    if shutil.which("apt"):
        return "apt"
    return None


def get_install_suggestion(
    lang_config: dict[str, Any], validator_name: str
) -> Optional[str]:
    """Get install command for the current platform."""
    install_config = lang_config.get("install", {})
    if not install_config:
        return None

    pkg_mgr = detect_package_manager()
    if pkg_mgr and install_config.get(pkg_mgr):
        return install_config[pkg_mgr]

    # Check for language-specific installers (pip, npm)
    for key in ("pip", "npm"):
        if install_config.get(key):
            return install_config[key]

    return None


def build_command(
    cmd_template: list[str], file_path: str, project_root: str = ""
) -> list[str]:
    """Replace {file} and {project_root} placeholders in command list safely."""
    result = []
    for arg in cmd_template:
        arg = arg.replace("{file}", file_path)
        arg = arg.replace("{project_root}", project_root)
        result.append(arg)
    return result


def run_validator(
    cmd: list[str], timeout: int = 8, env: Optional[dict[str, str]] = None
) -> tuple[int, str]:
    """Run validator command. Returns (returncode, combined output)."""
    try:
        run_env = None
        if env:
            run_env = {**os.environ, **env}
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=run_env,
        )
        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += result.stderr
        return result.returncode, output.strip()
    except subprocess.TimeoutExpired:
        return 1, f"Validator timed out after {timeout}s"
    except FileNotFoundError:
        return -1, f"Command not found: {cmd[0]}"
    except OSError as e:
        return -1, f"Failed to run validator: {e}"


def log_error(message: str) -> None:
    """Log error to error log file."""
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_file = LOG_DIR / "errors.log"
        with open(log_file, "a") as f:
            f.write(f"{message}\n")
    except OSError:
        pass  # Never crash on log failure


def parse_hook_input(input_data: dict[str, Any]) -> Optional[str]:
    """Extract and validate the target file path from the hook payload.

    Returns a normalized, existing file path, or None if the hook should no-op.
    """
    tool_name = input_data.get("tool_name", "")
    if tool_name not in ("Write", "Edit"):
        return None

    file_path = input_data.get("tool_input", {}).get("file_path", "")
    if not file_path:
        return None

    file_path = normalize_path(file_path)
    if not os.path.isfile(file_path):
        return None

    return file_path


def is_path_excluded(validator: dict, file_path: str) -> bool:
    """Return True if file_path matches any of the validator's exclude_paths globs."""
    patterns = validator.get("exclude_paths", [])
    if not patterns:
        return False
    normalized = file_path.replace("\\", "/")
    for pattern in patterns:
        if fnmatch.fnmatch(normalized, pattern):
            return True
    return False


def check_validator_available(validator: dict, lang_config: dict[str, Any]) -> bool:
    """Return True if the validator's tool is installed (or no check is required).

    On missing tools, prints an install hint to stderr and returns False.
    """
    check_tool = validator.get("check", "")
    if not check_tool:
        return True
    if shutil.which(check_tool):
        return True

    name = validator.get("name", "unknown")
    hint = f"[quality-validation] {check_tool} not found, skipping {name}."
    install_suggestion = get_install_suggestion(lang_config, name)
    if install_suggestion:
        hint += f" Install with: {install_suggestion}"
    print(hint, file=sys.stderr)
    return False


def format_validator_error(name: str, file_path: str, output: str) -> str:
    """Format a validator failure message, truncating long output."""
    if len(output) > 2000:
        output = output[:2000] + "\n... (truncated)"
    return f"{name} errors in {os.path.basename(file_path)}:\n{output}"


def _filter_runnable_validators(
    validators: list[dict],
    file_path: str,
    lang_config: dict[str, Any],
    skip_list: set,
) -> list[dict]:
    """Return the subset of validators that should actually run on this file."""
    runnable = []
    for validator in validators:
        name = validator.get("name", "unknown")
        if name in skip_list:
            continue
        if not validator.get("command"):
            continue
        if is_path_excluded(validator, file_path):
            continue
        if not check_validator_available(validator, lang_config):
            continue
        runnable.append(validator)
    return runnable


def _run_one_validator(
    validator: dict, file_path: str, project_root: str
) -> Optional[str]:
    """Run a single validator and return its formatted error (or None on success)."""
    cmd = build_command(validator.get("command", []), file_path, project_root)
    timeout = validator.get("timeout", 8)
    returncode, output = run_validator(cmd, timeout=timeout, env=validator.get("env"))
    if returncode != 0 and output:
        return format_validator_error(
            validator.get("name", "unknown"), file_path, output
        )
    return None


def _run_validators_parallel(
    runnable: list[dict], file_path: str, project_root: str
) -> list[str]:
    """Run multiple validators concurrently; preserve submission order in results."""
    results: list[Optional[str]] = [None] * len(runnable)
    max_workers = min(len(runnable), MAX_PARALLEL_VALIDATORS)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_index = {
            executor.submit(_run_one_validator, v, file_path, project_root): i
            for i, v in enumerate(runnable)
        }
        for future in as_completed(future_to_index):
            results[future_to_index[future]] = future.result()
    return [r for r in results if r is not None]


def run_validator_suite(
    validators: list[dict],
    file_path: str,
    project_root: str,
    lang_config: dict[str, Any],
    skip_list: set,
) -> list[str]:
    """Filter and run all applicable validators (parallel when more than one)."""
    runnable = _filter_runnable_validators(
        validators, file_path, lang_config, skip_list
    )
    if not runnable:
        return []
    if len(runnable) == 1:
        err = _run_one_validator(runnable[0], file_path, project_root)
        return [err] if err else []
    return _run_validators_parallel(runnable, file_path, project_root)


def main() -> None:
    try:
        input_data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    file_path = parse_hook_input(input_data)
    if file_path is None:
        sys.exit(0)

    config = load_config()
    if not config:
        sys.exit(0)

    match = match_language(file_path, config)
    if not match:
        sys.exit(0)

    _, lang_config, project_root = match
    validators = filter_validators_by_detection(
        lang_config.get("validators", []), project_root
    )
    errors = run_validator_suite(
        validators, file_path, project_root, lang_config, load_skip_list()
    )

    if errors:
        print(json.dumps({"decision": "block", "reason": "\n\n".join(errors)}))

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log_error(f"Unhandled exception: {e}")
        sys.exit(0)
