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

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

HOOK_DIR = Path(__file__).parent
CONFIG_FILE = HOOK_DIR / "validators.yaml"
SKIP_FILE = Path(os.path.expanduser("~")) / ".claude" / "hooks" / "quality-validation" / "skip-validators.txt"
LOG_DIR = Path(os.path.expanduser("~")) / ".claude" / "logs" / "quality-validation"


def load_config() -> Optional[Dict[str, Any]]:
    """Load validators.yaml config. Returns None on error."""
    if not CONFIG_FILE.exists():
        return None
    try:
        with open(CONFIG_FILE, "r") as f:
            return yaml.safe_load(f)
    except yaml.YAMLError as e:
        log_error(f"Failed to parse validators.yaml: {e}")
        return None


def load_skip_list() -> set:
    """Load skip-validators.txt. Returns set of validator names to skip."""
    if not SKIP_FILE.exists():
        return set()
    try:
        with open(SKIP_FILE, "r") as f:
            return {line.strip() for line in f if line.strip() and not line.startswith("#")}
    except OSError:
        return set()


def normalize_path(file_path: str) -> str:
    """Normalize path: backslash to forward slash, resolve to absolute."""
    file_path = file_path.replace("\\", "/")
    return os.path.abspath(file_path)


def find_project_root(file_dir: str, markers: List[str]) -> Optional[str]:
    """Walk up from file_dir looking for any marker file. Returns directory containing marker, or None."""
    current = Path(file_dir).resolve()
    # Walk up, stopping at filesystem root
    while True:
        for marker in markers:
            if (current / marker).exists():
                return str(current)
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def match_language(file_path: str, config: Dict[str, Any]) -> Optional[Tuple[str, Dict[str, Any]]]:
    """Match file extension to a language config entry.

    Only matches if at least one marker file is found in the ancestor chain.
    Returns (language_name, language_config) or None.
    """
    ext = os.path.splitext(file_path)[1].lower()
    file_dir = os.path.dirname(file_path)

    for lang_name, lang_config in config.items():
        if not isinstance(lang_config, dict):
            continue
        extensions = lang_config.get("extensions", [])
        if ext not in extensions:
            continue
        markers = lang_config.get("markers", [])
        if not markers:
            continue
        project_root = find_project_root(file_dir, markers)
        if project_root is not None:
            return lang_name, lang_config

    return None


def detect_package_manager() -> Optional[str]:
    """Detect available system package manager."""
    if shutil.which("winget"):
        return "winget"
    if shutil.which("brew"):
        return "brew"
    if shutil.which("apt"):
        return "apt"
    return None


def get_install_suggestion(lang_config: Dict[str, Any], validator_name: str) -> Optional[str]:
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


def build_command(cmd_template: List[str], file_path: str) -> List[str]:
    """Replace {file} placeholder in command list safely."""
    return [file_path if arg == "{file}" else arg for arg in cmd_template]


def run_validator(cmd: List[str], timeout: int = 8) -> Tuple[int, str]:
    """Run validator command. Returns (returncode, combined output)."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
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


def main() -> None:
    # Read stdin JSON
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, Exception):
        sys.exit(0)

    # Guard: only trigger on Write/Edit
    tool_name = input_data.get("tool_name", "")
    if tool_name not in ("Write", "Edit"):
        sys.exit(0)

    tool_input = input_data.get("tool_input", {})
    file_path = tool_input.get("file_path", "")
    if not file_path:
        sys.exit(0)

    # Normalize path immediately
    file_path = normalize_path(file_path)

    # Guard: file must exist
    if not os.path.isfile(file_path):
        sys.exit(0)

    # Load config
    config = load_config()
    if not config:
        sys.exit(0)

    # Match language
    match = match_language(file_path, config)
    if not match:
        sys.exit(0)

    lang_name, lang_config = match
    validators = lang_config.get("validators", [])
    if not validators:
        sys.exit(0)

    # Load skip list
    skip_list = load_skip_list()

    # Run validators
    errors = []
    for validator in validators:
        name = validator.get("name", "unknown")

        # Skip if in skip list
        if name in skip_list:
            continue

        check_tool = validator.get("check", "")
        cmd_template = validator.get("command", [])

        if not cmd_template:
            continue

        # Check tool availability - warn but don't block for missing linters
        if check_tool and not shutil.which(check_tool):
            install_suggestion = get_install_suggestion(lang_config, name)
            hint = f"[quality-validation] {check_tool} not found, skipping {name}."
            if install_suggestion:
                hint += f" Install with: {install_suggestion}"
            print(hint, file=sys.stderr)
            continue

        # Build and run command
        cmd = build_command(cmd_template, file_path)
        returncode, output = run_validator(cmd)

        if returncode != 0 and output:
            # Truncate output
            if len(output) > 2000:
                output = output[:2000] + "\n... (truncated)"
            errors.append(f"{name} errors in {os.path.basename(file_path)}:\n{output}")

    # Output results
    if errors:
        reason = "\n\n".join(errors)
        result = {"decision": "block", "reason": reason}
        print(json.dumps(result))

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log_error(f"Unhandled exception: {e}")
        sys.exit(0)
