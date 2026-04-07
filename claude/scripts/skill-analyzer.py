#!/usr/bin/env python3
"""Analyze skill activation patterns from conversation history.

Detects missed skill activations and suggests trigger improvements.
Similar architecture to permission-analyzer.py.

Usage:
    python skill-analyzer.py --json output.json --checkpoint
    python skill-analyzer.py --json output.json --reset  # Re-analyze all
"""

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional


class SkillActivationSignal:
    """Represents a signal that should trigger skill activation."""

    def __init__(self, signal_type: str, value: str, line_num: int = 0):
        self.type = signal_type  # 'file', 'import', 'error', 'command'
        self.value = value
        self.line_num = line_num

    def __repr__(self):
        return f"Signal({self.type}={self.value}, line={self.line_num})"


class IntentSignal(SkillActivationSignal):
    """Signal from user message or bash command."""

    def __init__(
        self, signal_type: str, value: str, confidence: str, skill: str = None, line_num: int = 0
    ):
        super().__init__(signal_type, value, line_num)
        self.confidence = confidence  # 'high', 'medium', 'low'
        self.skill = skill  # Suggested skill to activate


# Bash command to skill mapping
BASH_COMMAND_MAPPING = {
    "git": "git-workflow",
    "git add": "git-workflow",
    "git commit": "git-workflow",
    "git push": "git-workflow",
    "git pull": "git-workflow",
    "git merge": "git-workflow",
    "git checkout": "git-workflow",
    "git branch": "git-workflow",
    "git status": "git-workflow",
    "git log": "git-workflow",
    "docker": "container-projects",
    "docker-compose": "container-projects",
    "docker compose": "container-projects",
    "kubectl": "container-projects",
    "npm": "web-projects",
    "yarn": "web-projects",
    "pnpm": "web-projects",
    "python": "python-workflow",
    "pip": "python-workflow",
    "uv": "python-workflow",
    "pytest": "testing-workflow",
    "make test": "testing-workflow",
}


class Skill:
    """Represents a skill with its activation patterns."""

    def __init__(self, name: str, path: Path, description: str = ""):
        self.name = name
        self.path = path
        self.description = description
        self.activation_patterns = []  # List of regex patterns

    def should_activate(
        self, signals: list[SkillActivationSignal]
    ) -> Optional[SkillActivationSignal]:
        """Check if any signal matches this skill's activation patterns."""
        for signal in signals:
            for pattern in self.activation_patterns:
                if re.search(pattern, signal.value, re.IGNORECASE):
                    return signal
        return None

    def __repr__(self):
        return f"Skill({self.name}, patterns={len(self.activation_patterns)})"


def get_checkpoint_path(claude_dir: Path) -> Path:
    """Get path to checkpoint file."""
    checkpoint_dir = claude_dir / ".checkpoints"
    checkpoint_dir.mkdir(exist_ok=True)
    return checkpoint_dir / "skill-analyzer.json"


def load_checkpoint(claude_dir: Path, reset: bool = False) -> Optional[int]:
    """Load checkpoint timestamp.

    Args:
        claude_dir: Path to .claude directory
        reset: If True, ignore existing checkpoint

    Returns:
        Last analyzed timestamp in milliseconds, or None if no checkpoint or reset
    """
    if reset:
        return None

    checkpoint_path = get_checkpoint_path(claude_dir)
    if not checkpoint_path.exists():
        return None

    try:
        with open(checkpoint_path, encoding="utf-8") as f:
            data = json.load(f)
            return data.get("last_analyzed_timestamp")
    except (json.JSONDecodeError, OSError):
        return None


def save_checkpoint(claude_dir: Path, last_timestamp: int, messages_analyzed: int):
    """Save checkpoint after successful analysis.

    Args:
        claude_dir: Path to .claude directory
        last_timestamp: Latest message timestamp analyzed (milliseconds)
        messages_analyzed: Number of messages analyzed in this run
    """
    checkpoint_path = get_checkpoint_path(claude_dir)

    data = {
        "last_analyzed_timestamp": last_timestamp,
        "last_run_date": datetime.now().isoformat(),
        "messages_analyzed": messages_analyzed,
    }

    with open(checkpoint_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def find_claude_dir() -> Path:
    """Find the .claude directory."""
    home = Path.home()
    claude_dir = home / ".claude"
    if not claude_dir.exists():
        raise FileNotFoundError(f"Claude directory not found: {claude_dir}")
    return claude_dir


def find_conversation_data(claude_dir: Path) -> tuple[Optional[Path], list[Path]]:
    """Find history.jsonl and debug logs.

    Returns:
        (history_file, debug_files)
    """
    history_file = claude_dir / "history.jsonl"
    if not history_file.exists():
        history_file = None

    debug_dir = claude_dir / "debug"
    debug_files = []
    if debug_dir.exists():
        debug_files = sorted(debug_dir.glob("*.txt"), key=lambda p: p.stat().st_mtime, reverse=True)

    return history_file, debug_files


def parse_history(
    history_file: Path, checkpoint_timestamp: Optional[int] = None
) -> tuple[list[dict], Optional[int]]:
    """Parse history.jsonl file.

    Args:
        history_file: Path to history.jsonl
        checkpoint_timestamp: Only parse entries after this timestamp (ms since epoch)

    Returns:
        Tuple of (messages list, latest timestamp in this batch)
    """
    messages = []
    latest_timestamp = None

    with open(history_file, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
                timestamp = entry.get("timestamp", 0)

                # Skip if before checkpoint
                if checkpoint_timestamp and timestamp <= checkpoint_timestamp:
                    continue

                messages.append(entry)

                # Track latest timestamp
                if latest_timestamp is None or timestamp > latest_timestamp:
                    latest_timestamp = timestamp

            except json.JSONDecodeError:
                continue

    return messages, latest_timestamp


def _extract_skill_names(match_group: str) -> list[str]:
    return [s.strip() for s in match_group.strip().split(",") if s.strip()]


def _append_file_signal(signals: dict, file_path: str) -> None:
    signals["files"].append(SkillActivationSignal("file", file_path, 0))


def _parse_single_debug_file(content: str, signals: dict) -> None:
    """Extract all signals from one debug file's content into signals dict."""
    auto_skill_pattern = r"\[DEBUG\] Skills and commands included in Skill tool: ([^\n]+)"
    for match in re.finditer(auto_skill_pattern, content):
        for name in _extract_skill_names(match.group(1)):
            signals["skills_activated"].append(SkillActivationSignal("skill", name, 0))

    for match in re.finditer(
        r"\[DEBUG\] FileHistory: Tracked file modification for ([^\n]+)", content
    ):
        _append_file_signal(signals, match.group(1).strip())

    for match in re.finditer(r"\[DEBUG\] File ([^\s]+) written atomically", content):
        _append_file_signal(signals, match.group(1).strip())

    for match in re.finditer(r"\[ERROR\].*?expected ([^,]+),", content):
        file_path = match.group(1).strip()
        if "\\" in file_path or "/" in file_path:
            _append_file_signal(signals, file_path)


def parse_debug_logs(debug_files: list[Path]) -> dict[str, list[SkillActivationSignal]]:
    """Parse debug logs for tool invocations and file operations.

    Returns:
        Dict with keys: 'files', 'imports', 'errors', 'commands', 'skills_activated'
    """
    signals = {"files": [], "imports": [], "errors": [], "commands": [], "skills_activated": []}

    for debug_file in debug_files:
        try:
            content = debug_file.read_text(encoding="utf-8", errors="ignore")
            _parse_single_debug_file(content, signals)
        except Exception as e:
            print(f"Error parsing {debug_file}: {e}")

    return signals


_BASH_MEDIUM_CONFIDENCE_CMDS = {"git", "docker", "npm", "yarn", "pnpm", "python", "pip", "uv"}


def _lookup_bash_skill(command: str) -> tuple[Optional[str], str]:
    """Return (skill, confidence) for a bash command string."""
    for cmd_prefix, skill_name in BASH_COMMAND_MAPPING.items():
        if command.startswith(cmd_prefix):
            return skill_name, "high"
    first_word = command.split()[0] if command else ""
    if first_word in _BASH_MEDIUM_CONFIDENCE_CMDS:
        return BASH_COMMAND_MAPPING.get(first_word), "medium"
    return None, "low"


def extract_bash_commands(debug_files: list[Path]) -> list[IntentSignal]:
    """Extract bash commands from permission logs in debug files.

    Looks for patterns like: Bash(git add:*) or Bash(docker compose:*)
    """
    signals = []
    bash_pattern = r"Bash\(([^:)]+)(?::?\*?)\)"

    for debug_file in debug_files:
        try:
            content = debug_file.read_text(encoding="utf-8", errors="ignore")
            for match in re.finditer(bash_pattern, content):
                command = match.group(1).strip()
                skill, confidence = _lookup_bash_skill(command)
                if skill:
                    signals.append(IntentSignal("bash_command", command, confidence, skill))
        except Exception:
            continue

    return signals


_INTENT_PATTERNS = {
    "git-workflow": {
        "high": ["commit my changes", "push to", "create a branch", "merge"],
        "medium": ["git", "commit", "push", "branch", "staging"],
    },
    "adversarial-review": {
        "high": ["what could go wrong", "find flaws", "poke holes", "red team"],
        "medium": ["review this", "critique", "edge cases", "blind spots"],
    },
    "development-philosophy": {
        "high": ["MVP", "over-engineering", "keep it simple"],
        "medium": ["architecture", "design", "planning", "approach"],
    },
    "structured-analysis": {
        "high": ["deep analyze", "analyze this", "validate"],
        "medium": ["analyze", "review", "evaluate", "assess"],
    },
    "container-projects": {
        "high": ["docker compose", "kubernetes", "container"],
        "medium": ["docker", "deploy", "orchestration"],
    },
    "security-first-design": {
        "high": ["authentication", "authorization", "API security"],
        "medium": ["security", "secrets", "encryption", "sensitive data"],
    },
}


def _match_skill_in_message(message: str, skill: str, patterns: dict) -> Optional[IntentSignal]:
    """Return first matching IntentSignal for a skill against a message, or None."""
    for pattern in patterns.get("high", []):
        if pattern.lower() in message:
            return IntentSignal("user_intent", pattern, "high", skill)
    for pattern in patterns.get("medium", []):
        if pattern.lower() in message:
            return IntentSignal("user_intent", pattern, "medium", skill)
    return None


def parse_user_messages(history_file: Path) -> list[IntentSignal]:
    """Parse user messages for skill-triggering intents."""
    signals = []
    try:
        with open(history_file, encoding="utf-8", errors="ignore") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    entry = json.loads(line)
                    if "display" not in entry:
                        continue
                    message = entry.get("display", "").lower()
                    for skill, patterns in _INTENT_PATTERNS.items():
                        signal = _match_skill_in_message(message, skill, patterns)
                        if signal:
                            signals.append(signal)
                except json.JSONDecodeError:
                    continue
    except Exception:
        pass
    return signals


def load_skills(claude_dir: Path) -> dict[str, Skill]:
    """Load all skills from .claude/skills/ directories.

    Looks in:
    - ~/.claude/skills/ (user/personal)
    - ./.claude/skills/ (project, if exists)

    Returns:
        Dict of skill_name -> Skill object
    """
    skills = {}

    # Load from user directory
    user_skills_dir = claude_dir / "skills"
    if user_skills_dir.exists():
        for skill_dir in user_skills_dir.iterdir():
            if not skill_dir.is_dir():
                continue
            skill_file = skill_dir / "SKILL.md"
            if skill_file.exists():
                skill = parse_skill_file(skill_file)
                if skill:
                    skills[skill.name] = skill

    # Load from project directory (if in a project)
    # Note: This script runs from ~/.claude/scripts, so we'd need to find project dir
    # For now, skip project skills (would need project path as arg)

    return skills


_DESC_KEYWORD_PATTERNS = [
    r"working with ([^,\.]+)",
    r"when.*?with ([^,\.]+)",
    r"files? \(([^)]+)\)",
    r"importing from ([^,\.]+)",
    r"directories? like ([^,\.]+)",
]

_DESC_TEXT_TO_PATTERN = [
    (".py", r"\.py$"),
    ("tools/", r"tools[/\\]"),
    ("projects/", r"projects[/\\]"),
    (".services", r"tools\.services"),
]


def _snippet_to_pattern(snippet: str) -> str:
    return snippet.replace(".", r"\.").replace("*", ".*").replace("/", r"[/\\]")


def _extract_desc_patterns(description: str) -> list[str]:
    """Extract activation patterns from a skill description string."""
    patterns: list[str] = []
    desc_lower = description.lower()
    if "when" not in desc_lower and "activate" not in desc_lower:
        return patterns
    for kw_pat in _DESC_KEYWORD_PATTERNS:
        for match in re.finditer(kw_pat, description, re.IGNORECASE):
            text = match.group(1)
            for marker, pat in _DESC_TEXT_TO_PATTERN:
                if marker in text:
                    patterns.append(pat)
    return patterns


def _extract_activation_section_patterns(content: str) -> list[str]:
    """Extract patterns from the Auto-activates section of a SKILL.md."""
    patterns: list[str] = []
    section = re.search(
        r"\*\*Auto-activates? when:?\*\*\s*(.*?)(?:\n\n|---|\n##)",
        content,
        re.DOTALL | re.IGNORECASE,
    )
    if not section:
        return patterns
    activation_text = section.group(1)
    for match in re.finditer(r"[-*]\s+(.+?)(?:\n|$)", activation_text):
        for snippet in re.findall(r"`([^`]+)`", match.group(1).strip()):
            patterns.append(_snippet_to_pattern(snippet))
    for snippet in re.findall(r"`([^`]+)`", activation_text):
        pat = _snippet_to_pattern(snippet)
        if pat not in patterns:
            patterns.append(pat)
    return patterns


def parse_skill_file(skill_file: Path) -> Optional[Skill]:
    """Parse SKILL.md file to extract activation patterns."""
    try:
        content = skill_file.read_text(encoding="utf-8")
    except Exception:
        return None

    description = ""
    desc_match = re.search(r"description:\s*(.+?)(?:\n---|\Z)", content, re.DOTALL)
    if desc_match:
        description = desc_match.group(1).strip()

    skill = Skill(skill_file.parent.name, skill_file, description)
    skill.activation_patterns.extend(_extract_desc_patterns(description))
    skill.activation_patterns.extend(_extract_activation_section_patterns(content))
    return skill


def detect_missed_activations(
    signals: dict[str, list[SkillActivationSignal]], skills: dict[str, Skill]
) -> list[dict]:
    """Compare expected vs actual skill activations.

    Returns:
        List of missed activation suggestions
    """
    activated_skills = {s.value for s in signals["skills_activated"]}
    missed = []

    # Combine all signals except skills_activated
    all_signals = (
        signals["files"]
        + signals["imports"]
        + signals["errors"]
        + signals["commands"]
        + signals.get("bash_commands", [])
        + signals.get("user_intents", [])
    )

    for skill_name, skill in skills.items():
        if skill_name in activated_skills:
            continue  # Already activated correctly

        # Check if this skill should have activated
        matching_signal = skill.should_activate(all_signals)
        if matching_signal:
            missed.append(
                {
                    "skill_name": skill_name,
                    "skill_path": str(skill.path),
                    "description": skill.description,
                    "evidence": matching_signal.value,
                    "evidence_type": matching_signal.type,
                    "line_number": matching_signal.line_num,
                    "current_triggers": skill.activation_patterns,
                    "confidence": "high" if matching_signal.type == "file" else "medium",
                }
            )

    return missed


_WIN_SYSTEM_DIRS = {"Windows", "Program Files", "Program Files (x86)"}
_CLAUDE_FILTER_DIRS = {"tools", "scripts", "debug", "file-history", ".checkpoints"}
_PROJECT_ROOT_MARKERS = {"Projects", "Code", "src", "repos", "git"}
_UNIX_SYSTEM_ROOTS = {"usr", "etc", "var", "tmp", "sys", "proc"}


def _normalize_claude_subpath(parts: tuple, idx: int) -> Optional[str]:
    """Filter or relativize a path that contains .claude/."""
    if idx + 1 >= len(parts):
        return None
    next_dir = parts[idx + 1]
    if next_dir in _CLAUDE_FILTER_DIRS:
        return None
    if next_dir == "skills":
        return str(Path(*parts[idx:]))
    return None


def _normalize_windows_path(parts: tuple) -> Optional[str]:
    """Return normalized path for a Windows absolute path, or None to filter."""
    if parts[1] in _WIN_SYSTEM_DIRS:
        return None
    if parts[1] == "Users" and len(parts) > 2 and ".claude" in parts:
        return _normalize_claude_subpath(parts, parts.index(".claude"))
    for i, part in enumerate(parts):
        if part in _PROJECT_ROOT_MARKERS and i + 1 < len(parts):
            return str(Path(*parts[i + 1 :]))
    return None


def normalize_path(file_path: str) -> Optional[str]:
    """Normalize a file path to project-relative context, or None to filter."""
    path = Path(file_path)
    parts = path.parts
    if not parts:
        return str(path)
    if parts[0] in ("C:\\", "D:\\", "E:\\") and len(parts) > 1:
        return _normalize_windows_path(parts)
    if parts[0] == "/" and len(parts) > 1 and parts[1] in _UNIX_SYSTEM_ROOTS:
        return None
    return str(path)


_SKIP_PARTS = {"agent-spike", "project", "src", "main", "app"}


def _semantic_match_parts(parts: tuple, description_lower: str) -> list:
    """Return path parts anchored to a semantically relevant segment."""
    for i, part in enumerate(parts):
        if part.lower() in description_lower:
            return list(parts[i : min(i + 3, len(parts))])
    return []


def _heuristic_parts(parts: tuple) -> list:
    """Return path parts skipping generic leading segments."""
    start_idx = next((i for i, p in enumerate(parts) if p.lower() not in _SKIP_PARTS), 0)
    return list(parts[start_idx : min(start_idx + 3, len(parts))])


def _parts_to_pattern(meaningful_parts: list) -> Optional[str]:
    """Convert a list of path parts into a trigger pattern string."""
    if not meaningful_parts:
        return None
    if "." in meaningful_parts[-1]:
        if len(meaningful_parts) > 1:
            return "/".join(meaningful_parts[:-1]) + "/"
        if meaningful_parts[0].startswith("test_"):
            return "test_*.py"
        return None
    return "/".join(meaningful_parts) + "/"


def extract_meaningful_pattern(normalized_path: str, skill_description: str) -> Optional[str]:
    """Extract a meaningful trigger pattern from a normalized path."""
    if not normalized_path:
        return None
    parts = Path(normalized_path).parts
    if not parts:
        return None
    description_lower = skill_description.lower()
    meaningful = _semantic_match_parts(parts, description_lower) or _heuristic_parts(parts)
    return _parts_to_pattern(meaningful)


def is_pattern_already_covered(pattern: str, existing_patterns: list[str]) -> bool:
    """Check if a pattern is already covered by existing triggers."""
    if not pattern:
        return True
    for existing in existing_patterns:
        existing_normalized = existing.replace("[/\\\\]", "/").replace(r"\.", ".")
        if pattern in existing_normalized or existing_normalized in pattern:
            return True
    return False


def _suggest_file_trigger(
    evidence: str, skill_description: str, current_triggers: list
) -> Optional[str]:
    """Return a trigger suggestion for a file-type evidence, or None."""
    if any(re.search(p, evidence, re.IGNORECASE) for p in current_triggers):
        return None
    normalized = normalize_path(evidence)
    if not normalized:
        return None
    pattern = extract_meaningful_pattern(normalized, skill_description)
    if pattern and not is_pattern_already_covered(pattern, current_triggers):
        return f"Working with `{pattern}` directory"
    return None


def _suggest_import(evidence: str, current_triggers: list) -> list[str]:
    parts = evidence.split(".")
    if len(parts) >= 2:
        pattern = ".".join(parts[:2]) + ".*"
        if not is_pattern_already_covered(pattern, current_triggers):
            return [f"Importing from `{pattern}`"]
    return []


def _suggest_error(evidence: str) -> list[str]:
    ev_lower = evidence.lower()
    if "proxy" in ev_lower:
        return ["When proxy configuration errors occur"]
    if "rate limit" in ev_lower:
        return ["When rate limiting errors occur"]
    return []


def _suggest_bash(evidence: str, current_triggers: list) -> list[str]:
    first = evidence.split()[0] if evidence else ""
    if first and not is_pattern_already_covered(first, current_triggers):
        return [f"When running `{first}` commands"]
    return []


def _suggest_intent(evidence: str, current_triggers: list) -> list[str]:
    if not is_pattern_already_covered(evidence.lower(), current_triggers):
        return [f"User mentions: `{evidence}`"]
    return []


def _suggest_for_item(item: dict) -> list[str]:
    """Return suggested trigger strings for a single missed-activation item."""
    evidence_type = item["evidence_type"]
    evidence = item["evidence"]
    current_triggers = item.get("current_triggers", [])

    if evidence_type == "file":
        trigger = _suggest_file_trigger(evidence, item.get("description", ""), current_triggers)
        return [trigger] if trigger else []
    if evidence_type == "import":
        return _suggest_import(evidence, current_triggers)
    if evidence_type == "error":
        return _suggest_error(evidence)
    if evidence_type == "bash_command":
        return _suggest_bash(evidence, current_triggers)
    if evidence_type == "user_intent":
        return _suggest_intent(evidence, current_triggers)
    return []


def suggest_trigger_improvements(missed: list[dict], signals: dict) -> list[dict]:
    """Generate suggestions for new activation patterns."""
    suggestions = []
    for item in missed:
        suggested_triggers = _suggest_for_item(item)
        if suggested_triggers:
            suggestion = item.copy()
            suggestion["suggested_triggers"] = suggested_triggers
            suggestions.append(suggestion)
    return suggestions


def export_json(stats: dict, suggestions: list[dict], output_file: Path):
    """Export results to JSON file."""
    output = {"statistics": stats, "suggestions": suggestions}
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)


def _log_checkpoint_status(checkpoint_timestamp: Optional[int], reset: bool, verbose: bool) -> None:
    if not verbose:
        return
    if reset:
        print("Reset mode: Analyzing all messages")
    elif checkpoint_timestamp:
        checkpoint_date = datetime.fromtimestamp(checkpoint_timestamp / 1000).isoformat()
        print(f"Using checkpoint: {checkpoint_date}")
    else:
        print("No checkpoint found: Analyzing all messages")


def _load_messages(
    history_file: Optional[Path], checkpoint_timestamp: Optional[int], verbose: bool
) -> tuple[list, Optional[int]]:
    if not history_file:
        print("Warning: No history.jsonl file found")
        return [], None
    if verbose:
        print(f"Parsing history: {history_file}")
    messages, latest_timestamp = parse_history(history_file, checkpoint_timestamp)
    if verbose:
        print(f"  Found {len(messages)} messages")
        if checkpoint_timestamp:
            print("  (new messages since last run)")
    return messages, latest_timestamp


def _log_signals(signals: dict, verbose: bool) -> None:
    if not verbose:
        return
    print(f"  Files: {len(signals['files'])}")
    print(f"  Imports: {len(signals['imports'])}")
    print(f"  Errors: {len(signals['errors'])}")
    print(f"  Skills activated: {len(signals['skills_activated'])}")
    print(f"  Bash commands: {len(signals['bash_commands'])}")
    print(f"  User intents: {len(signals['user_intents'])}")


def _print_summary(stats: dict, suggestions: list[dict]) -> None:
    print("\nSkill Activation Analysis")
    print("=" * 50)
    print(f"Total skills: {stats['total_skills']}")
    print(f"Skills activated: {stats['skills_activated']}")
    print(f"Missed activations: {stats['missed_activations']}")
    print(f"Messages analyzed: {stats['messages_analyzed']}")
    print(f"Bash commands detected: {stats['bash_commands_detected']}")
    print(f"User intents detected: {stats['user_intents_detected']}")
    if suggestions:
        print("\nMissed Activations:")
        for s in suggestions:
            print(f"\n  {s['skill_name']}")
            print(f"    Evidence: {s['evidence'][:100]}")
            print(f"    Line: {s['line_number']}")
            if s.get("suggested_triggers"):
                print(f"    Suggested: {', '.join(s['suggested_triggers'])}")


def _collect_signals(history_file: Optional[Path], debug_files: list, verbose: bool) -> dict:
    if verbose:
        print("Extracting activation signals from debug logs...")
    signals = parse_debug_logs(debug_files)
    if verbose:
        print("Extracting bash commands from debug logs...")
    signals["bash_commands"] = extract_bash_commands(debug_files[:10])
    if verbose:
        print("Extracting user intents from history...")
    signals["user_intents"] = parse_user_messages(history_file) if history_file else []
    _log_signals(signals, verbose)
    return signals


def _load_and_log_skills(claude_dir: Path, verbose: bool) -> dict:
    if verbose:
        print("Loading skills...")
    skills = load_skills(claude_dir)
    if verbose:
        print(f"  Loaded {len(skills)} skills")
        for name, skill in skills.items():
            print(f"    {name}: {len(skill.activation_patterns)} patterns")
    return skills


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Analyze skill activation patterns from conversation history"
    )
    parser.add_argument("--json", type=Path, help="Output file for JSON results")
    parser.add_argument(
        "--checkpoint",
        action="store_true",
        default=True,
        help="Use checkpoint to only analyze new messages (default: enabled)",
    )
    parser.add_argument(
        "--reset", action="store_true", help="Ignore checkpoint and re-analyze all messages"
    )
    parser.add_argument(
        "--claude-dir", type=Path, help="Path to .claude directory (default: ~/.claude)"
    )
    parser.add_argument("--verbose", action="store_true", help="Print detailed output")
    return parser


def _detect_and_suggest(signals: dict, skills: dict, verbose: bool) -> tuple[list, list]:
    if verbose:
        print("Detecting missed activations...")
    missed = detect_missed_activations(signals, skills)
    if verbose:
        print(f"  Found {len(missed)} missed activations")
    return missed, suggest_trigger_improvements(missed, signals)


def _output_results(
    args: argparse.Namespace,
    stats: dict,
    suggestions: list,
    messages: list,
    latest_timestamp: Optional[int],
) -> None:
    if args.json:
        export_json(stats, suggestions, args.json)
        if args.verbose:
            print(f"Results written to: {args.json}")
    else:
        _print_summary(stats, suggestions)
    if latest_timestamp and not args.reset:
        save_checkpoint(args._claude_dir, latest_timestamp, len(messages))
        if args.verbose:
            ts = datetime.fromtimestamp(latest_timestamp / 1000).isoformat()
            print(f"\nCheckpoint saved: {ts}")


def main():
    args = _build_parser().parse_args()

    claude_dir = args.claude_dir or find_claude_dir()
    args._claude_dir = claude_dir
    if args.verbose:
        print(f"Using Claude directory: {claude_dir}")

    checkpoint_timestamp = load_checkpoint(claude_dir, reset=args.reset)
    _log_checkpoint_status(checkpoint_timestamp, args.reset, args.verbose)

    history_file, debug_files = find_conversation_data(claude_dir)
    messages, latest_timestamp = _load_messages(history_file, checkpoint_timestamp, args.verbose)
    signals = _collect_signals(history_file, debug_files, args.verbose)
    skills = _load_and_log_skills(claude_dir, args.verbose)
    missed, suggestions = _detect_and_suggest(signals, skills, args.verbose)

    stats = {
        "total_skills": len(skills),
        "skills_activated": len(signals["skills_activated"]),
        "missed_activations": len(missed),
        "messages_analyzed": len(messages),
        "files_touched": len(signals["files"]),
        "bash_commands_detected": len(signals.get("bash_commands", [])),
        "user_intents_detected": len(signals.get("user_intents", [])),
    }
    _output_results(args, stats, suggestions, messages, latest_timestamp)


if __name__ == "__main__":
    main()
