# /// script
# requires-python = ">=3.8"
# dependencies = ["pyyaml"]
# ///
"""
Damage Control Pattern Matching Benchmark
==========================================

Benchmarks bash command and path pattern matching performance.
Run with: uv run benchmark.py [--dry-run] [--note "description"]

Output:
  - Prints statistics (count, avg, min, max, p50, p95, p99) in milliseconds
  - Appends results to BENCHMARKS.md unless --dry-run is specified
"""

import argparse
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from statistics import median, quantiles
from typing import Any, Optional

import yaml

# ============================================================================
# PATTERN MATCHING LOGIC (from bash-tool-damage-control.py)
# ============================================================================


def is_glob_pattern(pattern: str) -> bool:
    """Check if pattern contains glob wildcards."""
    return "*" in pattern or "?" in pattern or "[" in pattern


def glob_to_regex(glob_pattern: str) -> str:
    """Convert a glob pattern to a regex pattern for matching in commands."""
    result = ""
    for char in glob_pattern:
        if char == "*":
            result += r"[^\s/]*"
        elif char == "?":
            result += r"[^\s/]"
        elif char in r"\.^$+{}[]|()":
            result += "\\" + char
        else:
            result += char
    return result


# ============================================================================
# COMPILATION AND CACHING (Phase 1 optimizations)
# ============================================================================


def compile_regex_patterns(patterns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pre-compile regex patterns from bashToolPatterns config."""
    compiled = []
    for idx, item in enumerate(patterns):
        pattern = item.get("pattern", "")
        if not pattern:
            continue

        try:
            compiled_regex = re.compile(pattern, re.IGNORECASE)
            compiled_item = item.copy()
            compiled_item["compiled"] = compiled_regex
            compiled.append(compiled_item)
        except re.error:
            continue

    return compiled


def preprocess_path_list(paths: list[str]) -> list[dict[str, Any]]:
    """Pre-process path list for fast matching."""
    processed = []
    for path in paths:
        if not path:
            continue

        path_obj = {
            "original": path,
            "is_glob": is_glob_pattern(path),
        }

        if path_obj["is_glob"]:
            try:
                glob_regex_str = glob_to_regex(path)
                path_obj["glob_regex"] = re.compile(glob_regex_str, re.IGNORECASE)
            except re.error:
                continue
        else:
            try:
                expanded = os.path.expanduser(path)
                path_obj["expanded"] = expanded
                path_obj["escaped_expanded"] = re.escape(expanded)
                path_obj["escaped_original"] = re.escape(path)
            except Exception:
                continue

        processed.append(path_obj)

    return processed


def compile_config(config: dict[str, Any]) -> dict[str, Any]:
    """Compile configuration for fast pattern matching."""
    compiled = config.copy()

    patterns = config.get("bashToolPatterns", [])
    compiled["bashToolPatterns_compiled"] = compile_regex_patterns(patterns)

    zero_access = config.get("zeroAccessPaths", [])
    compiled["zeroAccessPaths_compiled"] = preprocess_path_list(zero_access)

    read_only = config.get("readOnlyPaths", [])
    compiled["readOnlyPaths_compiled"] = preprocess_path_list(read_only)

    no_delete = config.get("noDeletePaths", [])
    compiled["noDeletePaths_compiled"] = preprocess_path_list(no_delete)

    return compiled


WRITE_PATTERNS = [
    (r">\s*{path}", "write"),
    (r"\btee\s+(?!.*-a).*{path}", "write"),
]

APPEND_PATTERNS = [
    (r">>\s*{path}", "append"),
    (r"\btee\s+-a\s+.*{path}", "append"),
    (r"\btee\s+.*-a.*{path}", "append"),
]

EDIT_PATTERNS = [
    (r"\bsed\s+-i.*{path}", "edit"),
    (r"\bperl\s+-[^\s]*i.*{path}", "edit"),
    (r"\bawk\s+-i\s+inplace.*{path}", "edit"),
]

MOVE_COPY_PATTERNS = [
    (r"\bmv\s+.*\s+{path}", "move"),
    (r"\bcp\s+.*\s+{path}", "copy"),
]

DELETE_PATTERNS = [
    (r"\brm\s+.*{path}", "delete"),
    (r"\bunlink\s+.*{path}", "delete"),
    (r"\brmdir\s+.*{path}", "delete"),
    (r"\bshred\s+.*{path}", "delete"),
]

PERMISSION_PATTERNS = [
    (r"\bchmod\s+.*{path}", "chmod"),
    (r"\bchown\s+.*{path}", "chown"),
    (r"\bchgrp\s+.*{path}", "chgrp"),
]

TRUNCATE_PATTERNS = [
    (r"\btruncate\s+.*{path}", "truncate"),
    (r":\s*>\s*{path}", "truncate"),
]

READ_ONLY_BLOCKED = (
    WRITE_PATTERNS
    + APPEND_PATTERNS
    + EDIT_PATTERNS
    + MOVE_COPY_PATTERNS
    + DELETE_PATTERNS
    + PERMISSION_PATTERNS
    + TRUNCATE_PATTERNS
)

NO_DELETE_BLOCKED = DELETE_PATTERNS


def _check_glob_path_patterns(
    command: str, path_obj: dict, patterns: list, path_str: str, path_type: str
) -> tuple[bool, str]:
    """Check glob-style path against command patterns."""
    glob_regex_compiled = path_obj.get("glob_regex")
    if not glob_regex_compiled:
        return False, ""
    glob_regex_str = glob_regex_compiled.pattern
    for pattern_template, operation in patterns:
        try:
            cmd_prefix = pattern_template.replace("{path}", "")
            if cmd_prefix and re.search(cmd_prefix + glob_regex_str, command, re.IGNORECASE):
                return True, f"Blocked: {operation} operation on {path_type} {path_str}"
        except re.error:
            continue
    return False, ""


def _check_exact_path_patterns(
    command: str, path_obj: dict, patterns: list, path_str: str, path_type: str
) -> tuple[bool, str]:
    """Check literal path against command patterns."""
    escaped_expanded = path_obj.get("escaped_expanded", "")
    escaped_original = path_obj.get("escaped_original", "")
    if not escaped_expanded or not escaped_original:
        return False, ""
    for pattern_template, operation in patterns:
        pat_exp = pattern_template.replace("{path}", escaped_expanded)
        pat_orig = pattern_template.replace("{path}", escaped_original)
        try:
            if re.search(pat_exp, command) or re.search(pat_orig, command):
                return True, f"Blocked: {operation} operation on {path_type} {path_str}"
        except re.error:
            continue
    return False, ""


def check_path_patterns(
    command: str,
    path_obj: dict[str, Any],
    patterns: list[tuple[str, str]],
    path_type: str,
) -> tuple[bool, str]:
    """Check command against a list of patterns for a specific path (optimized version)."""
    path_str = path_obj["original"]
    if path_obj["is_glob"]:
        return _check_glob_path_patterns(command, path_obj, patterns, path_str, path_type)
    return _check_exact_path_patterns(command, path_obj, patterns, path_str, path_type)


def _resolve_compiled_config(config: dict[str, Any]) -> tuple:
    """Return (patterns, zero_access, read_only, no_delete) compiled lists."""
    if "bashToolPatterns_compiled" in config:
        return (
            config.get("bashToolPatterns_compiled", []),
            config.get("zeroAccessPaths_compiled", []),
            config.get("readOnlyPaths_compiled", []),
            config.get("noDeletePaths_compiled", []),
        )
    return (
        compile_regex_patterns(config.get("bashToolPatterns", [])),
        preprocess_path_list(config.get("zeroAccessPaths", [])),
        preprocess_path_list(config.get("readOnlyPaths", [])),
        preprocess_path_list(config.get("noDeletePaths", [])),
    )


def _zero_access_glob_hit(command: str, path_obj: dict) -> bool:
    """Return True if command matches a glob zero-access path."""
    glob_regex = path_obj.get("glob_regex")
    if not glob_regex:
        return False
    try:
        return bool(glob_regex.search(command))
    except re.error:
        return False


def _zero_access_literal_hit(command: str, path_obj: dict) -> bool:
    """Return True if command references a literal zero-access path."""
    exp = path_obj.get("escaped_expanded", "")
    orig = path_obj.get("escaped_original", "")
    return (bool(exp) and bool(re.search(exp, command))) or (
        bool(orig) and bool(re.search(orig, command))
    )


def _check_zero_access_paths(command: str, compiled_zero_access: list) -> tuple[bool, bool, str]:
    """Check command against zero-access path list. Returns (blocked, ask, reason)."""
    for path_obj in compiled_zero_access:
        if path_obj["is_glob"]:
            if _zero_access_glob_hit(command, path_obj):
                return True, False, f"Blocked: zero-access pattern {path_obj['original']}"
        elif _zero_access_literal_hit(command, path_obj):
            return True, False, f"Blocked: zero-access path {path_obj['original']}"
    return False, False, ""


def check_command(command: str, config: dict[str, Any]) -> tuple[bool, bool, str]:
    """Check if command should be blocked or requires confirmation (optimized version).

    Returns: (blocked, ask, reason)
    """
    compiled_patterns, compiled_zero_access, compiled_read_only, compiled_no_delete = (
        _resolve_compiled_config(config)
    )

    result = _check_bash_tool_patterns(command, compiled_patterns)
    if result:
        return result

    blocked, ask, reason = _check_zero_access_paths(command, compiled_zero_access)
    if blocked:
        return blocked, ask, reason

    for path_obj in compiled_read_only:
        blocked, reason = check_path_patterns(
            command, path_obj, READ_ONLY_BLOCKED, "read-only path"
        )
        if blocked:
            return True, False, reason

    for path_obj in compiled_no_delete:
        blocked, reason = check_path_patterns(
            command, path_obj, NO_DELETE_BLOCKED, "no-delete path"
        )
        if blocked:
            return True, False, reason

    return False, False, ""


def _check_bash_tool_patterns(
    command: str, compiled_patterns: list
) -> Optional[tuple[bool, bool, str]]:
    """Check command against compiled bash tool patterns. Returns result tuple or None."""
    for item in compiled_patterns:
        compiled_regex = item.get("compiled")
        if not compiled_regex:
            continue
        try:
            if compiled_regex.search(command):
                reason = item.get("reason", "Blocked by pattern")
                if item.get("ask", False):
                    return False, True, reason
                return True, False, f"Blocked: {reason}"
        except re.error:
            continue
    return None


# ============================================================================
# TEST CORPUS
# ============================================================================

BASH_COMMANDS = [
    # Safe commands
    "git status",
    "git diff",
    "git log",
    "npm install",
    "npm run build",
    "npm test",
    "python -m pytest",
    "python script.py",
    "docker ps",
    "docker logs container",
    "kubectl get pods",
    "kubectl describe pod mypod",
    "ls -la",
    "cat README.md",
    "grep -r pattern .",
    "find . -name '*.py'",
    "echo 'hello world'",
    "mkdir -p src/components",
    "touch newfile.txt",
    "cp file.txt backup.txt",
    "mv oldname.txt newname.txt",
    "tar -czf archive.tar.gz files/",
    "unzip archive.zip",
    "curl https://api.example.com",
    "wget https://example.com/file.zip",
    "ssh user@host",
    "scp file.txt user@host:/path",
    "rsync -av src/ dest/",
    "make test",
    "make build",
    "cargo build",
    "cargo test",
    "go build",
    "go test ./...",
    "npm run lint",
    "npm run format",
    "pytest tests/",
    "pytest --cov",
    "black .",
    "mypy src/",
    "ruff check .",
    "eslint src/",
    "prettier --write .",
    "git add .",
    "git commit -m 'feat: add feature'",
    "git push",
    "git pull",
    "git checkout -b feature-branch",
    "git merge main",
    "git rebase main",
    # Dangerous commands (should be blocked/asked)
    "rm -rf /",
    "rm -rf ~",
    "rm -rf $HOME",
    "rm -rf /mnt/c/Users",
    "rm -f important.txt",
    "git rm file.txt",
    "chmod 777 script.sh",
    "git reset --hard",
    "git push --force",
    "terraform destroy",
    "docker system prune -a",
    "kubectl delete namespace prod",
    "aws s3 rm s3://bucket --recursive",
    "DROP DATABASE production;",
    "DELETE FROM users;",
    "TRUNCATE TABLE orders;",
    "redis-cli FLUSHALL",
    "heroku apps:destroy",
    "rm -rf node_modules",
    "git stash drop",
    "git branch -D feature",
]

FILE_PATHS = [
    # Safe paths
    "src/index.ts",
    "src/components/Button.tsx",
    "tests/unit/test_api.py",
    "README.md",
    "package.json",
    "tsconfig.json",
    "docker-compose.yml",
    "Makefile",
    ".gitignore",
    "docs/api.md",
    "scripts/build.sh",
    "config/settings.yaml",
    "lib/utils.js",
    "app/main.py",
    # Would-be-blocked paths (zero-access)
    ".env",
    ".env.local",
    ".env.production",
    "~/.ssh/id_rsa",
    "~/.ssh/config",
    "~/.aws/credentials",
    "~/.kube/config",
    "production.env",
    "credentials.json",
    "serviceAccount.json",
    "private-key.pem",
    "cert.key",
    "terraform.tfstate",
    "firebase-adminsdk.json",
    # Read-only paths
    "package-lock.json",
    "yarn.lock",
    "poetry.lock",
    "Cargo.lock",
    "go.sum",
    "uv.lock",
    "~/.bashrc",
    "~/.zshrc",
    "~/.bash_history",
    "/etc/hosts",
    "/etc/passwd",
    "dist/bundle.min.js",
    "build/app.bundle.js",
    "node_modules/package/index.js",
    # No-delete paths
    "LICENSE",
    "LICENSE.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "Dockerfile",
    ".github/workflows/ci.yml",
]


# ============================================================================
# BENCHMARKING
# ============================================================================


def load_patterns() -> dict[str, Any]:
    """Load patterns.yaml from the same directory."""
    script_dir = Path(__file__).parent
    config_path = script_dir / "patterns.yaml"

    if not config_path.exists():
        print(f"Error: patterns.yaml not found at {config_path}", file=sys.stderr)
        sys.exit(1)

    with open(config_path) as f:
        return yaml.safe_load(f) or {}


def calc_stats(times: list[float]) -> dict[str, float]:
    """Compute timing statistics over a list of millisecond values."""
    times.sort()
    return {
        "count": len(times),
        "avg": sum(times) / len(times),
        "min": min(times),
        "max": max(times),
        "p50": median(times),
        "p95": quantiles(times, n=20)[18],
        "p99": quantiles(times, n=100)[98],
    }


def _time_commands(commands: list[str], config: dict[str, Any], iterations: int) -> list[float]:
    """Time check_command over commands × iterations, return ms list."""
    times = []
    for _ in range(iterations):
        for command in commands:
            start = time.perf_counter()
            check_command(command, config)
            times.append((time.perf_counter() - start) * 1000)
    return times


def _time_path_commands(config: dict[str, Any], iterations: int) -> list[float]:
    """Time check_command over path-prefixed commands, return ms list."""
    test_commands = (
        [f"cat {path}" for path in FILE_PATHS]
        + [f"rm {path}" for path in FILE_PATHS]
        + [f"vim {path}" for path in FILE_PATHS]
    )
    times = []
    reps = max(1, iterations // len(test_commands))
    for _ in range(reps):
        for command in test_commands:
            start = time.perf_counter()
            check_command(command, config)
            times.append((time.perf_counter() - start) * 1000)
    return times


def run_benchmark(
    config: dict[str, Any], iterations: int = 1000, use_compiled: bool = False
) -> dict[str, Any]:
    """Run benchmark on bash commands and path patterns."""
    if use_compiled:
        config = compile_config(config)
    bash_times = _time_commands(BASH_COMMANDS, config, iterations)
    path_times = _time_path_commands(config, iterations)
    return {"bash": calc_stats(bash_times), "path": calc_stats(path_times)}


def format_stats(stats: dict[str, float]) -> str:
    """Format statistics for display."""
    return (
        f"  Count: {stats['count']}\n"
        f"  Avg:   {stats['avg']:.4f} ms\n"
        f"  Min:   {stats['min']:.4f} ms\n"
        f"  Max:   {stats['max']:.4f} ms\n"
        f"  P50:   {stats['p50']:.4f} ms\n"
        f"  P95:   {stats['p95']:.4f} ms\n"
        f"  P99:   {stats['p99']:.4f} ms"
    )


def append_to_benchmarks(config: dict[str, Any], stats: dict[str, Any], note: str = "") -> None:
    """Append benchmark results to BENCHMARKS.md."""
    script_dir = Path(__file__).parent
    benchmarks_path = script_dir / "BENCHMARKS.md"

    # Ensure file exists with header
    if not benchmarks_path.exists():
        with open(benchmarks_path, "w") as f:
            f.write("# Damage Control Benchmark History\n\n")
            f.write(
                "Track pattern matching performance over time. "
                "Run `uv run benchmark.py` to add entries.\n\n"
            )
            f.write(
                "| Date | Bash Patterns | Path Patterns | Iterations"
                " | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Notes |\n"
            )
            f.write(
                "|------|---------------|---------------|------------|----------|----------|----------|----------|-------|\n"
            )

    # Append new row
    date = datetime.now().strftime("%Y-%m-%d %H:%M")
    bash_count = len(config.get("bashToolPatterns", []))
    path_count = (
        len(config.get("zeroAccessPaths", []))
        + len(config.get("readOnlyPaths", []))
        + len(config.get("noDeletePaths", []))
    )

    # Combined average across bash and path checks
    total_checks = stats["bash"]["count"] + stats["path"]["count"]
    combined_avg = (
        stats["bash"]["avg"] * stats["bash"]["count"]
        + stats["path"]["avg"] * stats["path"]["count"]
    ) / total_checks
    combined_p50 = (stats["bash"]["p50"] + stats["path"]["p50"]) / 2
    combined_p95 = (stats["bash"]["p95"] + stats["path"]["p95"]) / 2
    combined_p99 = (stats["bash"]["p99"] + stats["path"]["p99"]) / 2

    row = (
        f"| {date} | "
        f"{bash_count} | "
        f"{path_count} | "
        f"{total_checks:,} | "
        f"{combined_avg:.4f} | "
        f"{combined_p50:.4f} | "
        f"{combined_p95:.4f} | "
        f"{combined_p99:.4f} | "
        f"{note} |\n"
    )

    with open(benchmarks_path, "a") as f:
        f.write(row)

    print(f"\nResults appended to {benchmarks_path}")


# ============================================================================
# AST BENCHMARK CORPUS
# ============================================================================

# Commands where safe-command fast path applies — expect ~0ms AST overhead.
AST_SAFE_COMMANDS = [
    "ls -la",
    "echo hello",
    "cat README.md",
    "grep -r pattern .",
    "pwd",
]

# Commands that require full AST analysis.
AST_ANALYSIS_COMMANDS = [
    "bash -c 'rm -rf /'",
    "(rm -rf /tmp/data)",
    "echo hello | rm -rf /tmp",
    "eval 'echo safe'",
    "eval '$DYNAMIC'",
    "git status && rm -rf /",
]


def run_ast_benchmark(config: dict[str, Any], iterations: int = 100) -> dict[str, Any]:
    """Benchmark AST analysis: regex-only vs regex+AST per command.

    Returns per-category timing dicts with avg ms for safe commands
    (fast-path) and analysis commands (full AST pass).
    """
    # Lazy import — gracefully skip if tree-sitter not installed.
    try:
        import importlib.util
        import sys as _sys

        hook_dir = str(Path(__file__).parent)
        if hook_dir not in _sys.path:
            _sys.path.insert(0, hook_dir)

        spec = importlib.util.spec_from_file_location(
            "ast_analyzer", Path(__file__).parent / "ast_analyzer.py"
        )
        ast_mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(ast_mod)  # type: ignore[union-attr]
        ASTAnalyzer = ast_mod.ASTAnalyzer
    except Exception as e:
        print(f"  (skipped — ast_analyzer import failed: {e})", file=sys.stderr)
        return {}

    analyzer = ASTAnalyzer()
    if not analyzer.is_available():
        print("  (skipped — tree-sitter not installed)", file=sys.stderr)
        return {}

    ast_config = {
        **config,
        "astAnalysis": {
            "enabled": True,
            "safeCommands": ["ls", "echo", "cat", "grep", "pwd"],
            "dangerousCommands": ["rm", "eval"],
        },
    }

    def time_commands(commands: list[str], n: int) -> dict[str, float]:
        times = []
        for _ in range(n):
            for cmd in commands:
                t0 = time.perf_counter()
                analyzer.analyze_command_ast(cmd, ast_config)
                times.append((time.perf_counter() - t0) * 1000)
        times.sort()
        return {
            "count": len(times),
            "avg": sum(times) / len(times),
            "min": min(times),
            "max": max(times),
        }

    return {
        "safe": time_commands(AST_SAFE_COMMANDS, iterations),
        "analysis": time_commands(AST_ANALYSIS_COMMANDS, iterations),
    }


def format_ast_stats(label: str, stats: dict[str, float]) -> str:
    return (
        f"  {label}: count={stats['count']}, "
        f"avg={stats['avg']:.4f}ms, "
        f"min={stats['min']:.4f}ms, "
        f"max={stats['max']:.4f}ms"
    )


# ============================================================================
# MAIN
# ============================================================================


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark damage-control pattern matching")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print results without appending to BENCHMARKS.md",
    )
    parser.add_argument(
        "--note",
        type=str,
        default="",
        help="Optional note to include in benchmark table",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=1000,
        help="Number of iterations (default: 1000)",
    )
    parser.add_argument(
        "--compiled",
        action="store_true",
        help="Use compiled patterns (Phase 1 optimizations)",
    )
    args = parser.parse_args()

    print("Loading patterns...")
    config = load_patterns()

    bash_count = len(config.get("bashToolPatterns", []))
    path_count = (
        len(config.get("zeroAccessPaths", []))
        + len(config.get("readOnlyPaths", []))
        + len(config.get("noDeletePaths", []))
    )

    mode = "compiled" if args.compiled else "raw"
    print(f"Patterns loaded: {bash_count} bash patterns, {path_count} path patterns")
    print(f"Mode: {mode}")
    print(f"Test corpus: {len(BASH_COMMANDS)} bash commands, {len(FILE_PATHS)} file paths")
    print(f"Running {args.iterations} iterations...\n")

    stats = run_benchmark(config, args.iterations, use_compiled=args.compiled)

    print("Bash Command Pattern Matching:")
    print(format_stats(stats["bash"]))
    print()
    print("Path Pattern Matching:")
    print(format_stats(stats["path"]))

    # AST benchmark: regex-only vs regex+AST comparison.
    ast_iters = max(10, args.iterations // 10)
    print(f"\nAST Analysis Benchmark ({ast_iters} iterations):")
    ast_stats = run_ast_benchmark(config, ast_iters)
    if ast_stats:
        print(format_ast_stats("Safe cmds (fast-path)", ast_stats["safe"]))
        print(format_ast_stats("Analysis cmds (full AST)", ast_stats["analysis"]))
        safe_avg = ast_stats["safe"]["avg"]
        analysis_avg = ast_stats["analysis"]["avg"]
        print(f"  AST overhead ratio: {analysis_avg / safe_avg:.1f}x" if safe_avg > 0 else "")

    if not args.dry_run:
        append_to_benchmarks(config, stats, args.note)
    else:
        print("\n(dry-run mode: results not appended to BENCHMARKS.md)")


if __name__ == "__main__":
    main()
