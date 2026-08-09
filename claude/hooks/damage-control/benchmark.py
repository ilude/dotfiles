# /// script
# requires-python = ">=3.8"
# dependencies = ["pyyaml", "tree-sitter>=0.23.0", "tree-sitter-bash>=0.23.0"]
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

from __future__ import annotations

import argparse
import importlib.util
import sys
import time
from datetime import datetime
from pathlib import Path
from statistics import median, quantiles
from typing import Any

import yaml

# ============================================================================
# PRODUCTION FIREWALL
# ============================================================================

spec = importlib.util.spec_from_file_location(
    "bash_tool", Path(__file__).parent / "bash-tool-damage-control.py"
)
bash_tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bash_tool)

check_command = bash_tool.check_command
compile_config = bash_tool.compile_config


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

    with open(config_path, encoding="utf-8") as f:
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
    """Time check_command over commands x iterations, return ms list."""
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

# Commands where safe-command fast path applies -- expect ~0ms AST overhead.
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
    # Lazy import -- gracefully skip if tree-sitter not installed.
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
        print(f"  (skipped -- ast_analyzer import failed: {e})", file=sys.stderr)
        return {}

    analyzer = ASTAnalyzer()
    if not analyzer.is_available():
        print("  (skipped -- tree-sitter not installed)", file=sys.stderr)
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
