"""
extract.py -- Mine real Pi session history and produce a labeled prompt-routing shard.

Output: chunk.jsonl in the same directory as this script.
"""

import glob
import hashlib
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
# parents[0]=synthetic_shards, [1]=data, [2]=prompt-routing, [3]=pi, [4]=.dotfiles
REPO_PI_HISTORY_DIR = SCRIPT_DIR.parents[3] / "history"
LIVE_PI_AGENT_DIR = Path.home() / ".pi" / "agent"
DATA_DIR = SCRIPT_DIR.parents[1]  # pi/prompt-routing/data
OUTPUT_PATH = DATA_DIR / "realpi_extraction_queue.jsonl"

# ---------------------------------------------------------------------------
# Sanitization helpers
# ---------------------------------------------------------------------------
_PATH_RE = re.compile(
    r'[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*mglenn[^\\/:*?"<>|\r\n]*'
)
_PATH_POSIX_RE = re.compile(r'/(?:home|Users)/mglenn(?:/[^\s,\'"]+)*')
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_B64_HEX_RE = re.compile(r"[A-Za-z0-9+/=]{31,}|[0-9a-fA-F]{32,}")
_SECRET_URL_RE = re.compile(
    r'https?://[^\s]*(?:password|token|api_key|secret)=[^\s&"\']+', re.IGNORECASE
)


def sanitize(text: str) -> str | None:
    """Return sanitized text, or None if the prompt contains un-redactable secrets."""
    if _SECRET_URL_RE.search(text):
        return None
    text = _PATH_RE.sub("~", text)
    text = _PATH_POSIX_RE.sub("~", text)
    text = _EMAIL_RE.sub("user@example.com", text)

    # Redact long base64/hex blobs that are not common words
    def _redact_token(m: re.Match) -> str:
        val = m.group(0)
        # Skip if it looks like a normal English word sequence
        if len(val) < 32:
            return val
        return "<redacted-token>"

    text = _B64_HEX_RE.sub(_redact_token, text)
    return text


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


# ---------------------------------------------------------------------------
# Skip-detection helpers
# ---------------------------------------------------------------------------
_SLASH_CMD_RE = re.compile(r"^\s*/[a-z]")
_SYSTEM_REMINDER_PHRASES = (
    "<system-reminder>",
    "<command-message>",
    "<command-name>",
    "as a reminder",
    "you are claude",
    "you are pi",
    "this is an automatic",
    "[hook output]",
    "hook blocked",
    "escape interrupt",
    "[extensions]",
)
_HOOK_OUTPUT_RE = re.compile(r"^\[?(hook|pre-tool|post-tool|damage-control)\b", re.IGNORECASE)


def should_skip(text: str) -> bool:
    stripped = text.strip()
    if len(stripped) < 20 or len(stripped) > 4000:
        return True
    if _SLASH_CMD_RE.match(stripped):
        return True
    lower = stripped.lower()
    if any(p in lower for p in _SYSTEM_REMINDER_PHRASES):
        return True
    if _HOOK_OUTPUT_RE.match(stripped):
        return True
    return False


# ---------------------------------------------------------------------------
# Domain inference from cwd
# ---------------------------------------------------------------------------
def infer_domain(cwd: str) -> str:
    cwd_lower = cwd.lower().replace("\\", "/")
    if "menos" in cwd_lower:
        return "backend"
    if "tacobot" in cwd_lower:
        return "cli"
    if "dotfiles" in cwd_lower:
        return "tooling"
    if "playwright" in cwd_lower or "e2e" in cwd_lower:
        return "testing"
    if "gitlab" in cwd_lower or "terraform" in cwd_lower or "helm" in cwd_lower:
        return "devops"
    if "eisa" in cwd_lower:
        return "devops"
    if "pi" in cwd_lower.split("/")[-2:] if "/" in cwd_lower else []:
        return "tooling"
    return "general"


# ---------------------------------------------------------------------------
# Labeling heuristics
# ---------------------------------------------------------------------------
def label(prompt: str) -> dict:
    text = prompt.lower()
    length = len(prompt)
    words = text.split()

    # task_type detection
    task_type = "code_write"  # default

    has_question = text.endswith("?") or any(
        text.startswith(w)
        for w in (
            "what ",
            "how ",
            "why ",
            "when ",
            "where ",
            "which ",
            "who ",
            "is ",
            "are ",
            "does ",
            "do ",
            "can ",
            "could ",
            "would ",
            "will ",
            "should ",
        )
    )

    if any(
        kw in text for kw in ("design ", "architect", "architecture", "strategy", "structure the")
    ):
        task_type = "design"
    elif any(
        kw in text
        for kw in ("plan ", "planning", "roadmap", "migration plan", "removal plan", "draft the")
    ):
        task_type = "plan"
    elif any(kw in text for kw in ("review", "audit", "adversar")):
        task_type = "code_review"
    elif any(
        kw in text
        for kw in (
            "fix",
            "bug",
            "error",
            "failing",
            "fail",
            "broken",
            "crash",
            "not work",
            "debug",
            "traceback",
            "exception",
        )
    ):
        task_type = "code_debug"
    elif any(
        kw in text
        for kw in (
            "rename",
            "replace ",
            "add comment",
            "update doc",
            "move ",
            "change ",
            "delete ",
            "remove ",
        )
    ):
        if length < 200:
            task_type = "mechanical_edit"
    elif any(
        kw in text
        for kw in ("implement", "build ", "refactor", "create ", "write ", "generate", "develop")
    ):
        task_type = "code_write"
    elif any(
        kw in text for kw in ("explain", "describe", "tell me", "what is", "how does", "why does")
    ):
        task_type = "explain"
    elif has_question and length <= 120:
        task_type = "factual"
    elif any(
        kw in text for kw in ("analyze", "analyse", "analysis", "compare", "evaluate", "assess")
    ):
        task_type = "analysis"

    # Security/reliability overrides for route
    is_security = any(
        kw in text
        for kw in (
            "threat",
            "security",
            "compliance",
            "vulnerability",
            "attack",
            "pentest",
            "rbac",
            "iam",
            "secret",
            "encrypt",
            "auth",
            "permission",
        )
    )
    is_distributed = any(
        kw in text
        for kw in (
            "distributed",
            "reliability",
            "sla",
            "slo",
            "redundan",
            "ha ",
            "high availab",
            "failover",
        )
    )

    # Route and complexity
    if task_type in ("design", "plan") or any(
        kw in text for kw in ("adversar", "expert", "sub agent", "multi-agent", "orchestrat")
    ):
        if length > 300 or is_security or is_distributed:
            model_tier = "large"
            effort = "high"
            complexity = "high"
        else:
            model_tier = "large"
            effort = "medium"
            complexity = "high"
    elif task_type == "code_review":
        if is_security:
            model_tier = "large"
            effort = "high"
            complexity = "high"
        else:
            model_tier = "core"
            effort = "medium"
            complexity = "mid"
    elif task_type == "code_debug":
        if length > 500:
            model_tier = "core"
            effort = "high"
            complexity = "mid"
        else:
            model_tier = "core"
            effort = "medium"
            complexity = "mid"
    elif task_type == "code_write":
        if length > 400:
            model_tier = "core"
            effort = "high"
            complexity = "mid"
        elif length > 150:
            model_tier = "core"
            effort = "medium"
            complexity = "mid"
        else:
            model_tier = "mini"
            effort = "low"
            complexity = "low"
    elif task_type == "mechanical_edit":
        model_tier = "mini"
        effort = "low"
        complexity = "low"
    elif task_type in ("factual", "explain"):
        if length <= 80:
            model_tier = "mini"
            effort = "none"
            complexity = "low"
        else:
            model_tier = "mini"
            effort = "low"
            complexity = "low"
    elif task_type == "analysis":
        model_tier = "core"
        effort = "medium"
        complexity = "mid"
    else:
        model_tier = "core"
        effort = "medium"
        complexity = "mid"

    # Security/distributed override
    if is_security or is_distributed:
        if model_tier == "mini":
            model_tier = "core"
            effort = "medium"
            complexity = "mid"
        elif model_tier == "core" and task_type in ("design", "plan", "code_review"):
            model_tier = "large"
            effort = "medium"
            complexity = "high"

    # Ambiguity
    if length < 40 or len(words) < 6:
        ambiguity = "clear"
    elif task_type == "design" and length < 200:
        ambiguity = "borderline"
    else:
        ambiguity = "clear"

    return {
        "task_type": task_type,
        "model_tier": model_tier,
        "effort": effort,
        "complexity": complexity,
        "ambiguity": ambiguity,
    }


# ---------------------------------------------------------------------------
# Route judgments generator
# ---------------------------------------------------------------------------
def build_route_judgments(task_type: str, model_tier: str, effort: str, prompt: str) -> list[dict]:
    """Build 3 route_judgments with the cheapest_acceptable matching model_tier/effort."""
    _model_order = ["mini", "core", "large"]
    _effort_order = ["none", "low", "medium", "high"]

    cheapest_idx = _model_order.index(model_tier)
    cheapest_effort_idx = _effort_order.index(effort)

    judgments = []

    # Insufficient: one tier below cheapest (or if cheapest is mini, use mini/none)
    if cheapest_idx == 0 and cheapest_effort_idx == 0:
        # cheapest is already minimum; insufficient doesn't exist below, skip or use haiku/none
        pass
    elif cheapest_effort_idx > 0:
        insuff_route = {"model_tier": model_tier, "effort": _effort_order[cheapest_effort_idx - 1]}
        judgments.append(
            {
                "route": insuff_route,
                "verdict": "insufficient",
                "rationale": _insufficient_rationale(
                    task_type, insuff_route, model_tier, effort, prompt
                ),
            }
        )
    else:
        # cheapest_effort is "none", step down model
        insuff_model = _model_order[cheapest_idx - 1]
        insuff_route = {"model_tier": insuff_model, "effort": _effort_order[-1]}
        judgments.append(
            {
                "route": insuff_route,
                "verdict": "insufficient",
                "rationale": _insufficient_rationale(
                    task_type, insuff_route, model_tier, effort, prompt
                ),
            }
        )

    # Acceptable: the cheapest_acceptable_route
    judgments.append(
        {
            "route": {"model_tier": model_tier, "effort": effort},
            "verdict": "acceptable",
            "rationale": _acceptable_rationale(task_type, model_tier, effort, prompt),
        }
    )

    # Overkill: one tier above
    if cheapest_idx < len(_model_order) - 1:
        overkill_model = _model_order[cheapest_idx + 1]
        overkill_route = {"model_tier": overkill_model, "effort": effort}
    else:
        # Already large -- use same model, higher effort
        if cheapest_effort_idx < len(_effort_order) - 1:
            overkill_route = {
                "model_tier": model_tier,
                "effort": _effort_order[cheapest_effort_idx + 1],
            }
        else:
            overkill_route = {"model_tier": model_tier, "effort": effort}
    judgments.append(
        {
            "route": overkill_route,
            "verdict": "overkill",
            "rationale": _overkill_rationale(task_type, overkill_route, model_tier, effort, prompt),
        }
    )

    return judgments


def _task_label(task_type: str) -> str:
    labels = {
        "factual": "factual lookup",
        "explain": "explanation",
        "code_write": "code generation",
        "code_debug": "debugging",
        "code_review": "code review",
        "mechanical_edit": "mechanical edit",
        "design": "design/architecture",
        "plan": "planning",
        "analysis": "analysis",
        "rewrite": "rewrite",
        "chat": "conversational",
    }
    return labels.get(task_type, task_type)


def _insufficient_rationale(
    task_type: str, insuff_route: dict, model_tier: str, effort: str, prompt: str
) -> str:
    tl = _task_label(task_type)
    return (
        f"At ({insuff_route['model_tier']}, {insuff_route['effort']}), the model lacks the "
        f"capacity for this {tl} -- it may miss context, skip edge cases, "
        f"or produce shallow output that requires significant follow-up."
    )


def _acceptable_rationale(task_type: str, model_tier: str, effort: str, prompt: str) -> str:
    tl = _task_label(task_type)
    short = prompt[:80].strip().replace("\n", " ")
    return (
        f"({model_tier}, {effort}) is sufficient for this {tl}: "
        f"'{short}...' -- the task fits within the model's capability at this effort level "
        f"without requiring heavier reasoning or broader context."
    )


def _overkill_rationale(
    task_type: str, overkill_route: dict, model_tier: str, effort: str, prompt: str
) -> str:
    tl = _task_label(task_type)
    return (
        f"({overkill_route['model_tier']}, {overkill_route['effort']}) adds capability beyond what "
        f"this {tl} needs -- the cheaper ({model_tier}, {effort}) route handles it correctly, "
        f"making the upgrade wasteful."
    )


# ---------------------------------------------------------------------------
# Family ID generation
# ---------------------------------------------------------------------------
def make_family_id(task_type: str, prompt: str) -> str:
    """Generate a stable family token from the first few significant words."""
    stop = {
        "a",
        "an",
        "the",
        "is",
        "are",
        "can",
        "do",
        "does",
        "to",
        "in",
        "of",
        "for",
        "it",
        "i",
        "me",
        "we",
        "our",
        "my",
        "you",
        "that",
        "this",
        "with",
        "and",
        "or",
    }
    words = [w for w in re.sub(r"[^a-z0-9 ]", " ", prompt.lower()).split() if w not in stop]
    key = task_type + " " + " ".join(words[:4])
    h = hashlib.md5(key.encode()).hexdigest()[:10]
    prefix = task_type[:6]
    return f"fam-{prefix}-{h}"


# ---------------------------------------------------------------------------
# Load existing prompts for dedup
# ---------------------------------------------------------------------------
def load_existing_prompts() -> set[str]:
    seen: set[str] = set()
    pattern = str(DATA_DIR / "**" / "*.jsonl")
    for p in glob.glob(pattern, recursive=True):
        if "realPi" in p:
            continue
        try:
            with open(p, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                        if isinstance(row, dict) and "prompt" in row:
                            seen.add(normalize(row["prompt"]))
                    except json.JSONDecodeError:
                        pass
        except OSError:
            pass
    return seen


# ---------------------------------------------------------------------------
# Main extraction loop
# ---------------------------------------------------------------------------
def _session_files() -> list[Path]:
    roots = [
        REPO_PI_HISTORY_DIR,
        LIVE_PI_AGENT_DIR / "history",
        LIVE_PI_AGENT_DIR / "sessions",
    ]
    files: dict[str, Path] = {}
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*.jsonl"):
            files[str(path.resolve())] = path
    return sorted(files.values())


def extract_sessions() -> list[dict]:
    history_files = _session_files()
    print(f"Found {len(history_files)} session files", file=sys.stderr)

    # Track stats
    total_sessions = 0
    total_raw = 0
    candidates = []

    for fpath in history_files:
        total_sessions += 1
        cwd = ""
        first_user_msg = None
        seen_in_session: set[str] = set()

        try:
            with open(fpath, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    etype = event.get("type", "")

                    if etype == "session":
                        cwd = event.get("cwd", "")
                        continue

                    if etype != "message":
                        continue

                    msg = event.get("message", {})
                    if msg.get("role") != "user":
                        continue

                    content = msg.get("content", [])
                    if isinstance(content, str):
                        raw_text = content
                    elif isinstance(content, list):
                        parts = []
                        for c in content:
                            if isinstance(c, dict) and c.get("type") == "text":
                                parts.append(c.get("text", ""))
                        raw_text = "\n".join(parts)
                    else:
                        continue

                    raw_text = raw_text.strip()
                    if not raw_text:
                        continue

                    total_raw += 1

                    if should_skip(raw_text):
                        continue

                    clean = sanitize(raw_text)
                    if clean is None:
                        continue

                    norm = normalize(clean)
                    if norm in seen_in_session:
                        continue
                    seen_in_session.add(norm)

                    session_id = fpath.stem  # date-uuid
                    entry = {
                        "text": clean,
                        "norm": norm,
                        "cwd": cwd,
                        "session_id": session_id,
                        "is_first": first_user_msg is None,
                    }
                    if first_user_msg is None:
                        first_user_msg = entry
                        candidates.append(entry)
                    else:
                        # Include later messages only if substantially different
                        if len(norm) > 60:
                            candidates.append(entry)

        except OSError as e:
            print(f"  skip {fpath.name}: {e}", file=sys.stderr)

    print(f"Sessions scanned: {total_sessions}", file=sys.stderr)
    print(f"Raw user messages found: {total_raw}", file=sys.stderr)
    print(f"Candidates before global dedup: {len(candidates)}", file=sys.stderr)
    return candidates


def build_queue_rows(candidates: list[dict], existing: set[str]) -> list[dict]:
    seen_norms: set[str] = set(existing)
    rows = []
    counter = 1

    # Prefer first-message entries, then others
    ordered = sorted(candidates, key=lambda e: (0 if e["is_first"] else 1, e["session_id"]))

    for entry in ordered:
        if len(rows) >= 300:
            break

        norm = entry["norm"]
        if norm in seen_norms:
            continue
        seen_norms.add(norm)

        text = entry["text"]
        cwd = entry["cwd"]
        session_id = entry["session_id"]

        lbl = label(text)
        domain = infer_domain(cwd)

        prompt_id = f"real-pi-{counter:04d}"
        counter += 1

        family_id = make_family_id(lbl["task_type"], text)

        cheapest = {"model_tier": lbl["model_tier"], "effort": lbl["effort"]}

        judgments = build_route_judgments(lbl["task_type"], lbl["model_tier"], lbl["effort"], text)

        # Validate invariant: cheapest acceptable in judgments must match cheapest
        acceptable_routes = [j["route"] for j in judgments if j["verdict"] == "acceptable"]
        if acceptable_routes:
            acc = acceptable_routes[0]
            if acc["model_tier"] != cheapest["model_tier"] or acc["effort"] != cheapest["effort"]:
                # Fix: force the acceptable judgment to match
                for j in judgments:
                    if j["verdict"] == "acceptable":
                        j["route"] = cheapest

        clean_cwd = sanitize(cwd) if cwd else ""
        cwd_hint = f"cwd={clean_cwd}" if clean_cwd else "cwd=unknown"
        notes = f"session {session_id[:18]}; {cwd_hint}"

        row = {
            "prompt_id": prompt_id,
            "family_id": family_id,
            "prompt": text,
            "source": "history_heuristic",
            "status": "needs_adjudication",
            "domain": domain,
            "heuristic_task_type": lbl["task_type"],
            "heuristic_ambiguity": lbl["ambiguity"],
            "heuristic_route": cheapest,
            "heuristic_complexity_tier": lbl["complexity"],
            "heuristic_route_judgments": judgments,
            "extraction_source": "realPi",
            "session_id": session_id,
            "cwd_hint": clean_cwd or "unknown",
            "label_method": "heuristic",
            "notes": notes,
        }
        rows.append(row)

    return rows


def main() -> None:
    print("Loading existing prompts for dedup...", file=sys.stderr)
    existing = load_existing_prompts()
    print(f"Existing prompts in corpus: {len(existing)}", file=sys.stderr)

    candidates = extract_sessions()

    rows = build_queue_rows(candidates, existing)
    print(f"Rows after dedup and filtering: {len(rows)}", file=sys.stderr)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"Written {len(rows)} rows to {OUTPUT_PATH}", file=sys.stderr)

    # Distribution summary
    from collections import Counter

    routes = Counter(
        f"{r['heuristic_route']['model_tier']}/{r['heuristic_route']['effort']}" for r in rows
    )
    domains = Counter(r["domain"] for r in rows)
    tasks = Counter(r["heuristic_task_type"] for r in rows)
    print("Route distribution:", dict(routes.most_common()), file=sys.stderr)
    print("Domain distribution:", dict(domains.most_common()), file=sys.stderr)
    print("Task type distribution:", dict(tasks.most_common()), file=sys.stderr)


if __name__ == "__main__":
    main()
