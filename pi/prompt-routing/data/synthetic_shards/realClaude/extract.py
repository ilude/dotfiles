"""
extract.py -- Mine real user prompts from Claude Code session history and produce
a labeled prompt-routing training shard (v3 schema).

Usage:
    uv run python data/synthetic_shards/realClaude/extract.py

Output: data/synthetic_shards/realClaude/chunk.jsonl
"""

# /// script
# requires-python = ">=3.11"
# ///

from __future__ import annotations

import glob
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SESSIONS_GLOB = r"C:\Users\mglenn\.claude\projects\*\*.jsonl"
OUTPUT_DIR = Path(__file__).parent
OUTPUT_FILE = OUTPUT_DIR / "chunk.jsonl"
CORPUS_DIR = Path(__file__).parent.parent.parent  # pi/prompt-routing/data

# ---------------------------------------------------------------------------
# Skip patterns for user content
# ---------------------------------------------------------------------------
SKIP_PREFIXES = (
    "<command-",
    "<system-reminder>",
    "<local-command-stdout>",
    "<local-command-caveat>",
    "[Request interrupted",
    "<cmd-",
    "<bash-",
    "<parameter",
    "<result>",
)

MIN_LEN = 20
MAX_LEN = 4000
TARGET_COUNT = 250


# ---------------------------------------------------------------------------
# Sanitization
# ---------------------------------------------------------------------------
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_TOKEN_RE = re.compile(r"[A-Za-z0-9+/=_\-]{31,}")
_SECRET_URL_RE = re.compile(
    r"https?://\S*(?:password|token|api_key|apikey|secret)=\S*",
    re.IGNORECASE,
)
_PATH_USER_RE = re.compile(
    r"(?:[A-Za-z]:)?[/\\](?:Users|home)[/\\]mglenn(?=[/\\]|$)",
    re.IGNORECASE,
)


def _looks_like_secret(token: str) -> bool:
    """True if token looks like base64/hex credential."""
    if len(token) < 32:
        return False
    # Must have some entropy -- at least two character classes
    has_upper = any(c.isupper() for c in token)
    has_lower = any(c.islower() for c in token)
    has_digit = any(c.isdigit() for c in token)
    return sum([has_upper, has_lower, has_digit]) >= 2


def sanitize(text: str) -> str | None:
    """Return sanitized text or None if prompt should be dropped."""
    # Strip secret-bearing URLs first
    if _SECRET_URL_RE.search(text):
        text = _SECRET_URL_RE.sub("<redacted-url>", text)

    # Replace user paths
    text = _PATH_USER_RE.sub("~", text)

    # Replace emails
    text = _EMAIL_RE.sub("user@example.com", text)

    # Replace long tokens that look like secrets
    def _maybe_redact(m: re.Match) -> str:
        token = m.group(0)
        if _looks_like_secret(token):
            return "<redacted-token>"
        return token

    text = _TOKEN_RE.sub(_maybe_redact, text)

    # If after redaction there are still raw credential-like patterns, drop
    credential_indicators = [
        "-----BEGIN",
        "PRIVATE KEY",
        "aws_secret",
        "ghp_",
        "ghs_",
        "sk-",
    ]
    for ind in credential_indicators:
        if ind.lower() in text.lower():
            return None

    return text.strip()


# ---------------------------------------------------------------------------
# Normalization for dedup
# ---------------------------------------------------------------------------
def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Load existing corpus prompts for dedup
# ---------------------------------------------------------------------------
def load_existing_prompts() -> set[str]:
    seen: set[str] = set()
    for p in glob.glob(str(CORPUS_DIR / "**" / "*.jsonl"), recursive=True):
        if "realClaude" in p:
            continue
        try:
            with open(p, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                        prompt = row.get("prompt", "")
                        if prompt:
                            seen.add(normalize(prompt))
                    except Exception:
                        pass
        except Exception:
            pass
    return seen


# ---------------------------------------------------------------------------
# Extract user messages from a JSONL session file
# ---------------------------------------------------------------------------
def extract_messages(fpath: str) -> list[tuple[str, str]]:
    """
    Returns list of (session_id, text) pairs.
    session_id is derived from the filename.
    """
    session_id = os.path.splitext(os.path.basename(fpath))[0]
    results: list[tuple[str, str]] = []
    try:
        with open(fpath, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue

                # Only process type=user events
                if d.get("type") != "user":
                    continue

                msg = d.get("message", {})
                if not isinstance(msg, dict):
                    continue

                content = msg.get("content", "")

                # Extract text from content
                if isinstance(content, list):
                    parts = []
                    for part in content:
                        if isinstance(part, dict):
                            if part.get("type") == "tool_result":
                                # Skip tool results
                                break
                            t = part.get("text", "")
                            if t:
                                parts.append(t)
                        elif isinstance(part, str):
                            parts.append(part)
                    text = " ".join(parts).strip()
                elif isinstance(content, str):
                    text = content.strip()
                else:
                    continue

                if not text:
                    continue

                # Skip system/command/hook content
                if any(text.startswith(p) for p in SKIP_PREFIXES):
                    continue

                # Skip XML-heavy content
                if text.count("<") > 3 and text.count(">") > 3:
                    continue

                # Skip tool result patterns
                if text.startswith("{") and '"type"' in text and '"content"' in text:
                    continue

                results.append((session_id, text))
    except Exception:
        pass

    return results


# ---------------------------------------------------------------------------
# Labeling heuristics
# ---------------------------------------------------------------------------
DOMAIN_KEYWORDS: list[tuple[str, list[str]]] = [
    ("python", ["python", ".py", "pip", "uv run", "pytest", "pydantic", "fastapi", "django", "flask"]),
    ("typescript", ["typescript", ".ts", "tsx", "pnpm", "bun ", "node", "npm", "jest", "vitest", "eslint", "biome"]),
    ("rust", ["rust", "cargo", ".rs", "clippy", "tokio", "serde"]),
    ("go", ["golang", " go ", "goroutine", ".go", "gofmt"]),
    ("sql", ["sql", "postgres", "mysql", "sqlite", "query", "schema", "migration", "database", "db "]),
    ("devops", ["docker", "kubernetes", "k8s", "ansible", "terraform", "helm", "yaml", "deploy", "pipeline", "ci/cd", "github action", "gitlab ci", "container"]),
    ("security", ["auth", "oauth", "jwt", "token", "secret", "encrypt", "decrypt", "tls", "ssl", "cert", "vulnerabilit", "threat", "pentest", "compliance", "rbac", "permission"]),
    ("infra", ["aws", "azure", "gcp", "cloud", "vpc", "subnet", "dns", "nginx", "load balancer", "networking"]),
    ("testing", ["test", "spec", "mock", "fixture", "coverage", "assert", "flak", "e2e", "playwright", "selenium"]),
    ("frontend", ["react", "vue", "angular", "svelte", "css", "html", "component", "ui ", "ux", "design system", "tailwind"]),
    ("api", ["api", "rest", "graphql", "endpoint", "http", "request", "response", "webhook", "openapi"]),
    ("cli", ["cli", "command line", "shell", "bash", "powershell", "script", "terminal", "zsh", "fish"]),
    ("git", ["git ", "commit", "branch", "merge", "rebase", "diff", "pull request", "pr ", "repo"]),
    ("dotfiles", ["dotfiles", ".claude", ".config", "symlink", "winget", "homebrew", "install.ps1", "hook"]),
    ("docs", ["documentation", "readme", "docstring", "comment", "explain", "describe", "write a doc"]),
    ("architecture", ["architecture", "design pattern", "microservice", "monorepo", "ddd", "cqrs", "event sourcing"]),
]


def detect_domain(text: str) -> str:
    lower = text.lower()
    for domain, keywords in DOMAIN_KEYWORDS:
        if any(kw in lower for kw in keywords):
            return domain
    return "general"


def detect_task_type(text: str) -> str:
    lower = text.lower()
    words = lower.split()
    first = words[0] if words else ""

    if any(kw in lower for kw in ["fix ", "bug", "error", "failing", "broken", "doesn't work",
                                   "not working", "exception", "traceback", "debug", "crash"]):
        return "code_debug"

    if any(kw in lower for kw in ["review", "audit", "check this", "look at this", "what do you think of",
                                   "any issues with"]):
        return "code_review"

    if any(kw in lower for kw in ["rename", "replace", "add comment", "update doc", "update the doc",
                                   "change the name", "move the", "format this"]):
        return "mechanical_edit"

    if any(kw in lower for kw in ["refactor", "implement", "build ", "create ", "write a ", "write the ",
                                   "generate ", "scaffold"]):
        if len(text) > 200:
            return "code_write"
        return "code_write"

    if any(kw in lower for kw in ["design ", "architect", "strategy", "approach", "structure for",
                                   "how should we", "what pattern", "plan for ", "best practice"]):
        return "design"

    if any(kw in lower for kw in ["plan ", "planning", "roadmap", "milestone", "breakdown", "task list"]):
        return "plan"

    if any(kw in lower for kw in ["analyze", "analyse", "profile", "diagnose", "investigate",
                                   "what's causing", "why is ", "compare", "evaluate", "assess"]):
        return "analysis"

    if any(kw in lower for kw in ["rewrite", "rephrase", "convert this", "translate this", "migrate this"]):
        return "rewrite"

    if first in ("what", "how", "why", "when", "where", "which", "is", "are", "does", "do", "can", "will"):
        if len(text) < 200:
            return "factual"
        return "explain"

    if any(kw in lower for kw in ["explain", "describe", "tell me", "what is", "how does", "what does"]):
        return "explain"

    if len(text) < 80:
        return "chat"

    return "explain"


def detect_ambiguity(text: str) -> str:
    lower = text.lower()
    # Hedging language
    if any(kw in lower for kw in ["i think", "maybe", "probably", "not sure", "i'm not sure",
                                   "or something", "kind of", "sort of", "roughly", "approximately"]):
        return "ambiguous"
    # Short with little context
    if len(text) < 60:
        return "borderline"
    return "clear"


def detect_route(text: str, task_type: str, domain: str) -> tuple[dict, str]:
    """Returns (cheapest_acceptable_route, complexity_tier)."""
    lower = text.lower()
    length = len(text)

    # Security/threat/distributed systems -> at least Sonnet/high, possibly Opus
    if domain == "security" or any(kw in lower for kw in
                                   ["threat model", "security design", "compliance", "distributed system",
                                    "reliability at scale", "zero trust", "adversar"]):
        if task_type in ("design", "analysis") or length > 500:
            return {"model_tier": "Opus", "effort": "medium"}, "high"
        return {"model_tier": "Sonnet", "effort": "high"}, "mid"

    # Design/architecture -> Sonnet or Opus
    if task_type in ("design", "plan"):
        if length > 500 or any(kw in lower for kw in ["architecture", "system design", "microservice",
                                                        "distributed", "strategy for", "tradeoff"]):
            return {"model_tier": "Opus", "effort": "medium"}, "high"
        return {"model_tier": "Sonnet", "effort": "high"}, "mid"

    # Factual, short -> Haiku
    if task_type == "factual":
        if length <= 120:
            return {"model_tier": "Haiku", "effort": "none"}, "low"
        return {"model_tier": "Haiku", "effort": "low"}, "low"

    # Mechanical edit -> Haiku/low
    if task_type == "mechanical_edit":
        return {"model_tier": "Haiku", "effort": "low"}, "low"

    # Chat short -> Haiku
    if task_type == "chat" and length < 100:
        return {"model_tier": "Haiku", "effort": "low"}, "low"

    # Explain short -> Haiku/low
    if task_type == "explain" and length < 150:
        return {"model_tier": "Haiku", "effort": "low"}, "low"

    # Code debug
    if task_type == "code_debug":
        if length > 800:
            return {"model_tier": "Sonnet", "effort": "high"}, "high"
        if length > 300:
            return {"model_tier": "Sonnet", "effort": "medium"}, "mid"
        return {"model_tier": "Sonnet", "effort": "low"}, "mid"

    # Code review
    if task_type == "code_review":
        if length > 500:
            return {"model_tier": "Sonnet", "effort": "high"}, "high"
        return {"model_tier": "Sonnet", "effort": "medium"}, "mid"

    # Code write
    if task_type == "code_write":
        if length > 500:
            return {"model_tier": "Sonnet", "effort": "high"}, "high"
        if length > 200:
            return {"model_tier": "Sonnet", "effort": "medium"}, "mid"
        return {"model_tier": "Sonnet", "effort": "low"}, "mid"

    # Analysis
    if task_type == "analysis":
        if length > 400:
            return {"model_tier": "Sonnet", "effort": "high"}, "high"
        return {"model_tier": "Sonnet", "effort": "medium"}, "mid"

    # Rewrite
    if task_type == "rewrite":
        return {"model_tier": "Sonnet", "effort": "medium"}, "mid"

    # Default
    return {"model_tier": "Sonnet", "effort": "medium"}, "mid"


def build_route_judgments(
    route: dict, task_type: str, domain: str, prompt: str
) -> list[dict]:
    """Build 3+ route_judgments with the cheapest acceptable matching route."""
    model_order = ["Haiku", "Sonnet", "Opus"]
    effort_order = ["none", "low", "medium", "high"]

    mt = route["model_tier"]
    ef = route["effort"]
    mi = model_order.index(mt)
    ei = effort_order.index(ef)

    judgments = []

    # One cheaper/insufficient route
    if mi > 0:
        cheaper_model = model_order[mi - 1]
        cheaper_effort = ef
        rationale = (
            f"{cheaper_model} at {cheaper_effort} effort lacks the context-tracking "
            f"to handle the {task_type} nuances in this {domain} prompt: "
            f'"{prompt[:60].rstrip()}..."'
        )
        judgments.append({
            "route": {"model_tier": cheaper_model, "effort": cheaper_effort},
            "verdict": "insufficient",
            "rationale": rationale,
        })
    elif ei > 0:
        lower_effort = effort_order[ei - 1]
        rationale = (
            f"{mt} at {lower_effort} effort skips reasoning steps needed for "
            f'the {task_type} request: "{prompt[:60].rstrip()}..."'
        )
        judgments.append({
            "route": {"model_tier": mt, "effort": lower_effort},
            "verdict": "insufficient",
            "rationale": rationale,
        })
    else:
        # Already Haiku/none -- add a Haiku/none insufficient with a concrete note
        rationale = (
            f"A bare zero-effort call would skip minimal response formatting "
            f'needed for: "{prompt[:60].rstrip()}..."'
        )
        judgments.append({
            "route": {"model_tier": "Haiku", "effort": "none"},
            "verdict": "insufficient",
            "rationale": rationale,
        })

    # The acceptable route
    short_prompt = prompt[:80].rstrip()
    judgments.append({
        "route": route,
        "verdict": "acceptable",
        "rationale": (
            f"{mt}/{ef} provides the reasoning depth appropriate for this "
            f"{task_type} task ({domain}): \"{short_prompt}...\""
        ),
    })

    # One overkill route
    if mi < len(model_order) - 1:
        overkill_model = model_order[mi + 1]
        judgments.append({
            "route": {"model_tier": overkill_model, "effort": ef},
            "verdict": "overkill",
            "rationale": (
                f"{overkill_model} exceeds what's needed; {mt} handles this "
                f"{task_type} without extra capability."
            ),
        })
    elif ei < len(effort_order) - 1:
        higher_effort = effort_order[ei + 1]
        judgments.append({
            "route": {"model_tier": mt, "effort": higher_effort},
            "verdict": "overkill",
            "rationale": (
                f"{mt}/{higher_effort} adds unnecessary chain-of-thought overhead "
                f"for this {task_type} request."
            ),
        })
    else:
        # Already Opus/high -- add a "same model higher effort" note
        judgments.append({
            "route": {"model_tier": "Opus", "effort": "high"},
            "verdict": "overkill",
            "rationale": (
                f"Opus/high adds speculative analysis beyond what this {task_type} "
                f"request requires."
            ),
        })

    return judgments


def family_id_from_prompt(prompt: str) -> str:
    """Derive a stable family_id token from prompt keywords."""
    lower = prompt.lower()
    words = re.findall(r"[a-z]+", lower)

    # Common stop words to skip
    stop = {
        "the", "a", "an", "to", "for", "in", "on", "at", "by", "of", "and",
        "or", "is", "it", "be", "we", "i", "me", "my", "do", "can", "how",
        "what", "why", "this", "that", "with", "from", "all", "into", "are",
        "you", "our", "your", "not", "but", "so", "if", "as", "up", "out",
        "its", "than", "then", "when", "where", "which", "who", "will",
        "was", "were", "had", "has", "have", "been", "get", "got", "let",
        "set", "put", "just", "also", "about", "using", "use", "make",
        "like", "want", "need", "should", "would", "could",
    }
    keywords = [w for w in words if w not in stop and len(w) > 2][:3]
    if not keywords:
        keywords = words[:2]

    slug = "-".join(keywords) if keywords else "general"
    return f"fam-real-claude-{slug}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    print("Loading existing corpus prompts for dedup...", file=sys.stderr)
    existing = load_existing_prompts()
    print(f"  {len(existing)} existing prompts loaded", file=sys.stderr)

    print("Scanning session JSONL files...", file=sys.stderr)
    all_files = glob.glob(SESSIONS_GLOB)
    print(f"  Found {len(all_files)} JSONL files", file=sys.stderr)

    # Collect all messages with metadata
    # Structure: {session_id: [(text, fpath), ...]}
    sessions: dict[str, list[tuple[str, str]]] = defaultdict(list)
    total_raw = 0

    for fpath in all_files:
        msgs = extract_messages(fpath)
        for sid, text in msgs:
            total_raw += 1
            sessions[sid].append((text, fpath))

    print(f"  Total raw user messages: {total_raw}", file=sys.stderr)
    print(f"  Unique sessions: {len(sessions)}", file=sys.stderr)

    # Candidate selection: prefer first message per session, then later unique ones
    candidates: list[tuple[str, str, str]] = []  # (session_id, text, fpath)
    seen_norm: set[str] = set()

    # First pass: first message of each session
    for sid, msgs in sessions.items():
        for text, fpath in msgs[:1]:
            # Length filter
            if len(text) < MIN_LEN or len(text) > MAX_LEN:
                continue
            norm = normalize(text)
            if norm in seen_norm or norm in existing:
                continue
            san = sanitize(text)
            if san is None or len(san) < MIN_LEN:
                continue
            seen_norm.add(norm)
            candidates.append((sid, san, fpath))

    print(f"  After first-message pass: {len(candidates)} candidates", file=sys.stderr)

    # Second pass: later messages from sessions (diversity)
    for sid, msgs in sessions.items():
        for text, fpath in msgs[1:]:
            if len(candidates) >= TARGET_COUNT * 2:
                break
            if len(text) < MIN_LEN or len(text) > MAX_LEN:
                continue
            norm = normalize(text)
            if norm in seen_norm or norm in existing:
                continue
            san = sanitize(text)
            if san is None or len(san) < MIN_LEN:
                continue
            seen_norm.add(norm)
            candidates.append((sid, san, fpath))

    print(f"  After second-message pass: {len(candidates)} candidates", file=sys.stderr)

    # Select up to TARGET_COUNT, spreading across domains
    # Label all candidates first, then select diverse subset
    labeled: list[dict] = []
    domain_counts: dict[str, int] = defaultdict(int)

    for sid, text, fpath in candidates:
        domain = detect_domain(text)
        task_type = detect_task_type(text)
        ambiguity = detect_ambiguity(text)
        route, complexity_tier = detect_route(text, task_type, domain)
        judgments = build_route_judgments(route, task_type, domain, text)
        family = family_id_from_prompt(text)

        # Extract a short session note
        session_short = sid[:8]
        note = f"Mined from session {session_short}; {task_type} in {domain} domain."

        labeled.append({
            "session_id": sid,
            "domain": domain,
            "task_type": task_type,
            "ambiguity": ambiguity,
            "route": route,
            "complexity_tier": complexity_tier,
            "judgments": judgments,
            "family": family,
            "text": text,
            "note": note,
        })

    print(f"  Labeled {len(labeled)} candidates", file=sys.stderr)

    # Domain-balanced selection: spread across domains
    # Sort by domain, take up to 30 per domain, cap total at TARGET_COUNT
    by_domain: dict[str, list[dict]] = defaultdict(list)
    for row in labeled:
        by_domain[row["domain"]].append(row)

    selected: list[dict] = []
    per_domain_cap = max(5, TARGET_COUNT // max(1, len(by_domain)))

    # Round-robin across domains
    domain_iters = {d: iter(rows) for d, rows in by_domain.items()}
    domains_active = list(domain_iters.keys())
    while len(selected) < TARGET_COUNT and domains_active:
        exhausted = []
        for domain in list(domains_active):
            if len(selected) >= TARGET_COUNT:
                break
            try:
                item = next(domain_iters[domain])
                if domain_counts[domain] < per_domain_cap:
                    selected.append(item)
                    domain_counts[domain] += 1
            except StopIteration:
                exhausted.append(domain)
        for d in exhausted:
            domains_active.remove(d)
        if not exhausted and all(
            domain_counts[d] >= per_domain_cap for d in domains_active
        ):
            break

    # If still under target, top up from any domain
    if len(selected) < TARGET_COUNT:
        remaining_pool = [r for r in labeled if r not in selected]
        for item in remaining_pool:
            if len(selected) >= TARGET_COUNT:
                break
            selected.append(item)

    print(f"  Selected {len(selected)} rows for output", file=sys.stderr)

    # Write output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    route_dist: dict[str, int] = defaultdict(int)
    domain_dist: dict[str, int] = defaultdict(int)
    task_dist: dict[str, int] = defaultdict(int)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as fout:
        for idx, item in enumerate(selected, 1):
            prompt_id = f"real-claude-{idx:04d}"
            route_key = f"{item['route']['model_tier']}/{item['route']['effort']}"
            route_dist[route_key] += 1
            domain_dist[item["domain"]] += 1
            task_dist[item["task_type"]] += 1

            row = {
                "prompt_id": prompt_id,
                "family_id": item["family"],
                "prompt": item["text"],
                "source": "history_curated",
                "domain": item["domain"],
                "task_type": item["task_type"],
                "ambiguity": item["ambiguity"],
                "cheapest_acceptable_route": item["route"],
                "complexity_tier": item["complexity_tier"],
                "route_judgments": item["judgments"],
                "notes": item["note"],
            }
            fout.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"\nOutput: {OUTPUT_FILE}", file=sys.stderr)
    print(f"Rows written: {len(selected)}", file=sys.stderr)
    print(f"\nRoute distribution:", file=sys.stderr)
    for k, v in sorted(route_dist.items()):
        print(f"  {k}: {v}", file=sys.stderr)
    print(f"\nDomain distribution:", file=sys.stderr)
    for k, v in sorted(domain_dist.items()):
        print(f"  {k}: {v}", file=sys.stderr)
    print(f"\nTask type distribution:", file=sys.stderr)
    for k, v in sorted(task_dist.items()):
        print(f"  {k}: {v}", file=sys.stderr)

    # Summary stats to stdout
    print(f"\n--- SUMMARY ---")
    print(f"Source dirs scanned: 35 project dirs")
    print(f"JSONL files found: {len(all_files)}")
    print(f"Total raw user messages: {total_raw}")
    print(f"After filtering/dedup: {len(candidates)} candidates")
    print(f"Output: {OUTPUT_FILE}")
    print(f"Rows written: {len(selected)}")


if __name__ == "__main__":
    main()
