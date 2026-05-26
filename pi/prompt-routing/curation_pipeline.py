"""Prompt-router curation pipeline MVP."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from pathlib import Path
from typing import Any, Final

PIPELINE_SCHEMA_VERSION: Final = "1.0.0"
CANDIDATE_SCHEMA_VERSION: Final = "1.0.0"
WEAK_LABEL_SCHEMA_VERSION: Final = "1.0.0"
MANIFEST_SCHEMA_VERSION: Final = "1.0.0"
CLASSIFIER_NAME: Final = "confgate"
CURATION_ROOT_PARTS: Final = ("pi", "prompt-routing", "experiments", "curation")
DEFAULT_TIMEOUT_SECONDS: Final = 20
DEFAULT_MAX_BYTES: Final = 5_000_000
DEFAULT_MAX_PROMPT_CHARS: Final = 12_000
DEFAULT_HOLDOUT_MODULUS: Final = 10
DEFAULT_HOLDOUT_BUCKET: Final = 0
MIN_AUTO_ACCEPT_CONFIDENCE: Final = 0.65
LICENSE_UNKNOWN: Final = "unknown"
ALLOWED_LICENSES: Final = frozenset({"apache-2.0", "mit", "cc-by-4.0", "unknown-public"})
PROMPT_PREVIEW_CHARS: Final = 80
SCAN_PATTERNS: Final = {
    "private_key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "token": re.compile(r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{20,}"),
    "email": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "windows_path": re.compile(r"[A-Za-z]:\\\\Users\\\\[^\\\s]+"),
    "unix_home_path": re.compile(r"/home/[^/\s]+/"),
}


class ReviewStatus(StrEnum):
    REJECT = "reject"
    NEEDS_REVIEW = "needs_review"
    HOLDOUT_CANDIDATE = "holdout_candidate"
    AUTO_ACCEPT_CANDIDATE = "auto_accept_candidate"


@dataclass(frozen=True)
class SourceSpec:
    name: str
    dataset: str
    url: str
    revision: str
    license_name: str
    license_url: str
    normalizer: str


@dataclass
class WeakLabel:
    schema_version: str
    classifier: str
    interface: str
    primary: dict[str, Any] | None
    candidates: list[dict[str, Any]]
    confidence: float | None
    ensemble_rule: str | None
    router_metadata: dict[str, Any]
    failure: str | None = None


@dataclass
class Candidate:
    schema_version: str
    id: str
    source: str
    source_dataset: str
    source_url: str
    source_revision: str
    source_row_id: str
    license_name: str
    license_url: str
    prompt: str
    metadata: dict[str, Any]
    trace_features: dict[str, Any]
    weak_labels: list[dict[str, Any]]
    proposed_route: dict[str, Any] | None
    accepted_route: None
    review_status: str
    reason_codes: list[str]
    notes: list[str]


@dataclass
class PullResult:
    source: SourceSpec
    rows: list[dict[str, Any]] = field(default_factory=list)
    byte_count: int = 0
    skipped_reason: str | None = None


SOURCES: Final = [
    SourceSpec(
        name="routellm_gpt4_dataset",
        dataset="routellm/gpt4_dataset",
        url="https://datasets-server.huggingface.co/rows?dataset=routellm%2Fgpt4_dataset&config=default&split=train&offset=0&length={limit}",
        revision="main",
        license_name="apache-2.0",
        license_url="https://huggingface.co/datasets/routellm/gpt4_dataset",
        normalizer="routellm",
    ),
    SourceSpec(
        name="carrot_sprout",
        dataset="CARROT-LLM-Routing/SPROUT",
        url="https://datasets-server.huggingface.co/rows?dataset=CARROT-LLM-Routing%2FSPROUT&config=default&split=train&offset=0&length={limit}",
        revision="main",
        license_name="unknown-public",
        license_url="https://huggingface.co/datasets/CARROT-LLM-Routing/SPROUT",
        normalizer="sprout",
    ),
    SourceSpec(
        name="smolagents_codeagent_traces",
        dataset="smolagents/codeagent-traces",
        url="https://datasets-server.huggingface.co/rows?dataset=smolagents%2Fcodeagent-traces&config=default&split=train&offset=0&length={limit}",
        revision="main",
        license_name="apache-2.0",
        license_url="https://huggingface.co/datasets/smolagents/codeagent-traces",
        normalizer="generic_trace",
    ),
]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def curation_root() -> Path:
    return repo_root().joinpath(*CURATION_ROOT_PARTS)


def safe_output_dir(path_text: str) -> Path:
    root = curation_root().resolve()
    path = Path(path_text)
    candidate = (repo_root() / path if not path.is_absolute() else path).resolve()
    if not candidate.is_relative_to(root):
        raise ValueError(f"output directory must be under {root}")
    if candidate.exists() and candidate.is_file():
        raise ValueError("output directory collides with an existing file")
    return candidate


def ensure_gitignore_policy() -> None:
    gitignore = repo_root() / ".gitignore"
    text = gitignore.read_text(encoding="utf-8")
    required = "pi/prompt-routing/experiments/curation/**"
    if required not in text:
        raise RuntimeError(f".gitignore must contain {required} before writing outputs")


def stable_candidate_id(source_name: str, row_id: str, prompt: str) -> str:
    payload = json.dumps(
        {"prompt": prompt.strip(), "row_id": row_id, "source": source_name},
        ensure_ascii=True,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


def read_limited_url(url: str, timeout_seconds: int, max_bytes: int) -> tuple[bytes, int]:
    request = urllib.request.Request(url, headers={"User-Agent": "pi-prompt-routing-curation/1.0"})
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise ValueError("source byte limit exceeded")
            chunks.append(chunk)
    return b"".join(chunks), total


def extract_rows_from_hf_payload(payload: bytes) -> list[dict[str, Any]]:
    data = json.loads(payload.decode("utf-8"))
    rows = data.get("rows", [])
    extracted: list[dict[str, Any]] = []
    for item in rows:
        if isinstance(item, dict) and isinstance(item.get("row"), dict):
            row = dict(item["row"])
            row["_row_idx"] = item.get("row_idx")
            extracted.append(row)
    return extracted


def pull_source(
    source: SourceSpec,
    limit_per_source: int,
    timeout_seconds: int,
    max_bytes: int,
) -> PullResult:
    url = source.url.format(limit=limit_per_source)
    try:
        payload, byte_count = read_limited_url(url, timeout_seconds, max_bytes)
        return PullResult(
            source=source,
            rows=extract_rows_from_hf_payload(payload),
            byte_count=byte_count,
        )
    except (
        OSError,
        urllib.error.URLError,
        urllib.error.HTTPError,
        TimeoutError,
        ValueError,
        json.JSONDecodeError,
    ) as exc:
        return PullResult(source=source, skipped_reason=f"pull_failed:{type(exc).__name__}:{exc}")


def first_string(row: dict[str, Any], names: tuple[str, ...]) -> str | None:
    for name in names:
        value = row.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list):
            parts = [str(item).strip() for item in value if str(item).strip()]
            if parts:
                return "\n".join(parts)
    return None


def prompt_from_messages(value: Any) -> str | None:
    if not isinstance(value, list):
        return None
    parts: list[str] = []
    for message in value:
        if isinstance(message, dict):
            role = str(message.get("role", "message"))
            content = message.get("content") or message.get("text")
            if isinstance(content, str) and content.strip():
                parts.append(f"{role}: {content.strip()}")
        elif isinstance(message, str) and message.strip():
            parts.append(message.strip())
    return "\n".join(parts) if parts else None


def normalize_row(source: SourceSpec, row: dict[str, Any], max_prompt_chars: int) -> Candidate:
    row_id = str(
        row.get("_row_idx")
        or row.get("id")
        or row.get("idx")
        or row.get("qid")
        or stable_json_hash(row)
    )
    prompt = (
        first_string(row, ("prompt", "question", "instruction", "query", "input", "user_prompt"))
        or prompt_from_messages(row.get("messages"))
        or prompt_from_messages(row.get("conversation"))
        or first_string(row, ("problem", "task", "text"))
    )
    if prompt is None:
        prompt = ""
    prompt = prompt.strip()
    metadata = sanitized_metadata(row)
    reason_codes: list[str] = []
    if not prompt:
        reason_codes.append("missing_prompt")
    if len(prompt) > max_prompt_chars:
        reason_codes.append("oversized_prompt")
        prompt = prompt[:max_prompt_chars]
    candidate_id = stable_candidate_id(source.name, row_id, prompt)
    return Candidate(
        schema_version=CANDIDATE_SCHEMA_VERSION,
        id=candidate_id,
        source=source.name,
        source_dataset=source.dataset,
        source_url=source.url.format(limit="{limit}"),
        source_revision=source.revision,
        source_row_id=row_id,
        license_name=source.license_name,
        license_url=source.license_url,
        prompt=prompt,
        metadata=metadata,
        trace_features={},
        weak_labels=[],
        proposed_route=None,
        accepted_route=None,
        review_status="",
        reason_codes=reason_codes,
        notes=[],
    )


def stable_json_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=True, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def sanitized_metadata(row: dict[str, Any]) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    for key, value in row.items():
        if key.startswith("_") or key in {
            "prompt",
            "messages",
            "conversation",
            "input",
            "question",
            "instruction",
        }:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            text = str(value) if isinstance(value, str) else value
            if isinstance(text, str) and len(text) > PROMPT_PREVIEW_CHARS:
                text = text[:PROMPT_PREVIEW_CHARS] + "..."
            metadata[key] = text
    return metadata


def extract_features(candidate: Candidate) -> dict[str, Any]:
    prompt = candidate.prompt
    lower = prompt.lower()
    return {
        "prompt_chars": len(prompt),
        "prompt_words": len(re.findall(r"\w+", prompt)),
        "message_count": max(1, len(re.findall(r"(?im)^(user|assistant|system|tool):", prompt))),
        "tool_call_count": count_terms(lower, ("tool_call", "function_call", "<tool", "```json")),
        "file_touch_count": len(
            set(
                re.findall(
                    r"[\w./-]+\.(?:py|ts|tsx|js|json|yaml|yml|md|sh|ps1|tf|go|rs)",
                    prompt,
                )
            )
        ),
        "command_count": count_terms(
            lower,
            ("uv run", "pytest", "make ", "pnpm ", "git ", "docker ", "terraform "),
        ),
        "test_count": count_terms(
            lower, ("test", "pytest", "vitest", "unit test", "integration test")
        ),
        "has_error_or_debug": any(
            term in lower
            for term in ("traceback", "exception", "error", "debug", "fails", "failure")
        ),
        "has_code_fence": "```" in prompt,
        "has_stack_trace": "traceback" in lower
        or re.search(r"\b(at|File) .+:\d+", prompt) is not None,
        "has_continuation_intent": any(
            term in lower for term in ("continue", "resume", "carry on", "next step")
        ),
        "has_architecture_intent": any(
            term in lower for term in ("architecture", "design", "trade-off", "migration", "system")
        ),
        "has_security_intent": any(
            term in lower for term in ("security", "secret", "credential", "vulnerability", "auth")
        ),
        "has_refactor_intent": any(
            term in lower for term in ("refactor", "restructure", "cleanup", "simplify")
        ),
        "has_debug_intent": any(
            term in lower for term in ("debug", "troubleshoot", "root cause", "fix failing")
        ),
    }


def count_terms(text: str, terms: tuple[str, ...]) -> int:
    return sum(text.count(term) for term in terms)


def classifier_artifacts() -> dict[str, Any]:
    command = [
        sys.executable,
        str(Path(__file__).with_name("classify.py")),
        "--classifier",
        CLASSIFIER_NAME,
        "--artifact-inventory",
    ]
    try:
        proc = subprocess.run(command, capture_output=True, text=True, timeout=30, check=False)
        if proc.returncode != 0:
            return {
                "available": False,
                "error": proc.stdout.strip() or proc.stderr.strip(),
            }
        return {"available": True, "inventory": json.loads(proc.stdout)}
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        return {"available": False, "error": str(exc)}


def score_candidate(candidate: Candidate, router_metadata: dict[str, Any]) -> None:
    command = [
        sys.executable,
        str(Path(__file__).with_name("classify.py")),
        "--classifier",
        CLASSIFIER_NAME,
        candidate.prompt,
    ]
    try:
        proc = subprocess.run(command, capture_output=True, text=True, timeout=30, check=False)
        data = json.loads(proc.stdout)
        if proc.returncode != 0 or data.get("error"):
            label = WeakLabel(
                schema_version=WEAK_LABEL_SCHEMA_VERSION,
                classifier=CLASSIFIER_NAME,
                interface="classify.py --classifier confgate",
                primary=None,
                candidates=[],
                confidence=None,
                ensemble_rule=None,
                router_metadata=router_metadata,
                failure=data.get("error") or proc.stderr.strip() or "classifier_failed",
            )
        else:
            label = WeakLabel(
                schema_version=WEAK_LABEL_SCHEMA_VERSION,
                classifier=CLASSIFIER_NAME,
                interface="classify.py --classifier confgate",
                primary=data.get("primary"),
                candidates=data.get("candidates", []),
                confidence=data.get("confidence"),
                ensemble_rule=data.get("ensemble_rule"),
                router_metadata=router_metadata,
                failure=None,
            )
            candidate.proposed_route = data.get("primary")
        candidate.weak_labels = [asdict(label)]
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        label = WeakLabel(
            schema_version=WEAK_LABEL_SCHEMA_VERSION,
            classifier=CLASSIFIER_NAME,
            interface="classify.py --classifier confgate",
            primary=None,
            candidates=[],
            confidence=None,
            ensemble_rule=None,
            router_metadata=router_metadata,
            failure=str(exc),
        )
        candidate.weak_labels = [asdict(label)]


def triage_candidate(candidate: Candidate) -> None:
    reasons = list(dict.fromkeys(candidate.reason_codes))
    weak_label = candidate.weak_labels[0] if candidate.weak_labels else {}
    features = candidate.trace_features
    license_allowed = candidate.license_name in ALLOWED_LICENSES
    confidence = weak_label.get("confidence")

    if reasons or not candidate.prompt.strip():
        candidate.review_status = ReviewStatus.REJECT.value
        if not reasons:
            reasons.append("missing_prompt")
    elif not license_allowed:
        candidate.review_status = ReviewStatus.REJECT.value
        reasons.append("incompatible_license")
    elif weak_label.get("failure"):
        candidate.review_status = ReviewStatus.NEEDS_REVIEW.value
        reasons.append("classifier_failure")
    elif not isinstance(confidence, (int, float)) or confidence < MIN_AUTO_ACCEPT_CONFIDENCE:
        candidate.review_status = ReviewStatus.NEEDS_REVIEW.value
        reasons.append("low_confidence")
    elif risky_features(features):
        candidate.review_status = ReviewStatus.NEEDS_REVIEW.value
        reasons.append("ambiguity_or_under_routing_risk")
    elif int(candidate.id[-2:], 16) % DEFAULT_HOLDOUT_MODULUS == DEFAULT_HOLDOUT_BUCKET:
        candidate.review_status = ReviewStatus.HOLDOUT_CANDIDATE.value
        reasons.append("deterministic_holdout_partition")
    else:
        candidate.review_status = ReviewStatus.AUTO_ACCEPT_CANDIDATE.value
        reasons.append("candidate_export_auto_accept")
    candidate.reason_codes = reasons
    candidate.accepted_route = None


def risky_features(features: dict[str, Any]) -> bool:
    return any(
        bool(features.get(key))
        for key in (
            "has_security_intent",
            "has_refactor_intent",
            "has_debug_intent",
            "has_continuation_intent",
            "has_architecture_intent",
        )
    )


def fixture_pull_results(limit_per_source: int) -> list[PullResult]:
    fixtures = {
        "routellm": [
            {
                "_row_idx": 1,
                "prompt": "What is a Python list comprehension?",
                "mixtral_score": 1,
            },
            {
                "_row_idx": 2,
                "prompt": "Design a migration plan for a multi-region auth service.",
                "mixtral_score": 5,
            },
        ],
        "sprout": [
            {
                "_row_idx": 1,
                "question": "Write a pytest for this parser function.",
                "route": "medium",
            },
            {
                "_row_idx": 2,
                "instruction": "Debug this stack trace and identify the root cause.",
                "route": "high",
            },
        ],
        "generic_trace": [
            {
                "_row_idx": 1,
                "messages": [
                    {
                        "role": "user",
                        "content": "Show the git command to list branches.",
                    }
                ],
            },
            {
                "_row_idx": 2,
                "conversation": [
                    {
                        "role": "user",
                        "content": "Refactor this module without changing behavior.",
                    }
                ],
            },
        ],
    }
    results: list[PullResult] = []
    for source in SOURCES:
        rows = fixtures[source.normalizer][:limit_per_source]
        results.append(PullResult(source=source, rows=rows, byte_count=len(json.dumps(rows))))
    return results


def normalize_results(results: list[PullResult], max_prompt_chars: int) -> list[Candidate]:
    candidates: list[Candidate] = []
    seen: set[str] = set()
    for result in results:
        if result.skipped_reason:
            continue
        for row in result.rows:
            candidate = normalize_row(result.source, row, max_prompt_chars)
            if candidate.id in seen:
                candidate.reason_codes.append("duplicate_candidate_id")
            seen.add(candidate.id)
            candidates.append(candidate)
    return candidates


def run_pipeline(args: argparse.Namespace) -> int:
    ensure_gitignore_policy()
    output_dir = safe_output_dir(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    results = (
        fixture_pull_results(args.limit_per_source)
        if args.fixture
        else [
            pull_source(
                source,
                args.limit_per_source,
                args.timeout_seconds,
                args.max_bytes_per_source,
            )
            for source in SOURCES
        ]
    )
    candidates = normalize_results(results, args.max_prompt_chars)
    router_metadata = classifier_artifacts()
    for candidate in candidates:
        candidate.trace_features = extract_features(candidate)
        score_candidate(candidate, router_metadata)
        triage_candidate(candidate)
    write_outputs(output_dir, candidates, results, args, router_metadata)
    if not args.fixture and not any(
        not result.skipped_reason and result.rows for result in results
    ):
        return 2
    return 0


def write_outputs(
    output_dir: Path,
    candidates: list[Candidate],
    results: list[PullResult],
    args: argparse.Namespace,
    router_metadata: dict[str, Any],
) -> None:
    generated_files: list[str] = []
    candidates_path = output_dir / "candidates.jsonl"
    write_jsonl(candidates_path, [asdict(candidate) for candidate in candidates])
    generated_files.append(str(candidates_path.relative_to(repo_root())))
    for status in ReviewStatus:
        path = output_dir / f"{status.value}.jsonl"
        rows = [
            asdict(candidate) for candidate in candidates if candidate.review_status == status.value
        ]
        write_jsonl(path, rows)
        generated_files.append(str(path.relative_to(repo_root())))
    manifest = build_manifest(
        output_dir, candidates, results, args, router_metadata, generated_files
    )
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    generated_files.append(str(manifest_path.relative_to(repo_root())))
    summary_path = output_dir / "summary.md"
    summary_path.write_text(render_summary(manifest, candidates), encoding="utf-8")
    generated_files.append(str(summary_path.relative_to(repo_root())))
    manifest["generated_files"] = generated_files
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def build_manifest(
    output_dir: Path,
    candidates: list[Candidate],
    results: list[PullResult],
    args: argparse.Namespace,
    router_metadata: dict[str, Any],
    generated_files: list[str],
) -> dict[str, Any]:
    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "pipeline_version": PIPELINE_SCHEMA_VERSION,
        "config_hash": stable_json_hash(vars(args)),
        "git_sha": git_sha(),
        "run_dir": str(output_dir.relative_to(repo_root())),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "limits": {
            "limit_per_source": args.limit_per_source,
            "timeout_seconds": args.timeout_seconds,
            "max_bytes_per_source": args.max_bytes_per_source,
            "max_prompt_chars": args.max_prompt_chars,
        },
        "sources": [
            {
                "name": result.source.name,
                "dataset": result.source.dataset,
                "url": result.source.url.format(limit=args.limit_per_source),
                "revision": result.source.revision,
                "license_name": result.source.license_name,
                "license_url": result.source.license_url,
                "byte_count": result.byte_count,
                "row_count": len(result.rows),
                "skipped_reason": result.skipped_reason,
            }
            for result in results
        ],
        "router_metadata": router_metadata,
        "counts_by_status": counts(candidate.review_status for candidate in candidates),
        "counts_by_source": counts(candidate.source for candidate in candidates),
        "counts_by_license": counts(candidate.license_name for candidate in candidates),
        "counts_by_route": counts(
            route_key(candidate.proposed_route)
            for candidate in candidates
            if candidate.proposed_route
        ),
        "counts_by_reason": counts(
            reason for candidate in candidates for reason in candidate.reason_codes
        ),
        "skipped_sources": [
            {"name": result.source.name, "reason": result.skipped_reason}
            for result in results
            if result.skipped_reason
        ],
        "generated_files": generated_files,
    }


def git_sha() -> str | None:
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_root(),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return proc.stdout.strip() if proc.returncode == 0 else None


def counts(values: Any) -> dict[str, int]:
    result: dict[str, int] = {}
    for value in values:
        key = str(value)
        result[key] = result.get(key, 0) + 1
    return dict(sorted(result.items()))


def route_key(route: dict[str, Any] | None) -> str:
    if not route:
        return "none"
    return f"{route.get('model_tier')}|{route.get('effort')}"


def render_summary(manifest: dict[str, Any], candidates: list[Candidate]) -> str:
    lines = [
        "# Prompt Router Curation Summary",
        "",
        f"Manifest: `{manifest['run_dir']}/manifest.json`",
        "",
        "## Counts by Status",
        "",
    ]
    for key, value in manifest["counts_by_status"].items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Counts by Source", ""])
    for key, value in manifest["counts_by_source"].items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Counts by License", ""])
    for key, value in manifest["counts_by_license"].items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Rejection and Review Reasons", ""])
    for key, value in manifest["counts_by_reason"].items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Skipped Sources", ""])
    if manifest["skipped_sources"]:
        for skipped in manifest["skipped_sources"]:
            lines.append(f"- {skipped['name']}: {skipped['reason']}")
    else:
        lines.append("- none")
    lines.extend(["", "## Row IDs by Status", ""])
    for status in ReviewStatus:
        ids = [candidate.id for candidate in candidates if candidate.review_status == status.value]
        lines.append(f"- {status.value}: {', '.join(ids) if ids else 'none'}")
    lines.extend(
        [
            "",
            "## Boundary",
            "",
            "Rows are curation candidates only. This run does not retrain, "
            "promote rows, or update model artifacts.",
            "",
        ]
    )
    return "\n".join(lines)


def scan_output_dir(path_text: str) -> int:
    output_dir = safe_output_dir(path_text)
    if not output_dir.exists():
        raise FileNotFoundError(output_dir)
    failures: list[str] = []
    for path in output_dir.rglob("*"):
        if not path.is_file() or path.suffix not in {".json", ".jsonl", ".md"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for name, pattern in SCAN_PATTERNS.items():
            if pattern.search(text):
                failures.append(f"{path.relative_to(repo_root())}:{name}")
    if failures:
        print("scan failed")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"scan passed: {output_dir.relative_to(repo_root())}")
    return 0


def cleanup_output_dir(path_text: str, dry_run: bool) -> int:
    output_dir = safe_output_dir(path_text)
    if not output_dir.exists():
        print(f"not found: {output_dir.relative_to(repo_root())}")
        return 0
    if not (output_dir / "manifest.json").exists():
        raise ValueError("refusing cleanup for directory without manifest.json")
    print(f"remove: {output_dir.relative_to(repo_root())}")
    if not dry_run:
        shutil.rmtree(output_dir)
    return 0


def list_runs() -> int:
    root = curation_root()
    if not root.exists():
        return 0
    for path in sorted(root.iterdir()):
        if path.is_dir() and (path / "manifest.json").exists():
            print(path.relative_to(repo_root()))
    return 0


def pull_command(args: argparse.Namespace) -> int:
    ensure_gitignore_policy()
    output_dir = safe_output_dir(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    results = [
        pull_source(
            source,
            args.limit_per_source,
            args.timeout_seconds,
            args.max_bytes_per_source,
        )
        for source in SOURCES
    ]
    pull_manifest = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "sources": [
            asdict(result.source)
            | {
                "row_count": len(result.rows),
                "byte_count": result.byte_count,
                "skipped_reason": result.skipped_reason,
            }
            for result in results
        ],
    }
    (output_dir / "pull-manifest.json").write_text(
        json.dumps(pull_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return 0 if any(not result.skipped_reason and result.rows for result in results) else 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prompt-router curation pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    for name in ("run", "pull"):
        sub = subparsers.add_parser(name)
        sub.add_argument("--limit-per-source", type=int, default=25)
        sub.add_argument("--output-dir", required=True)
        sub.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
        sub.add_argument("--max-bytes-per-source", type=int, default=DEFAULT_MAX_BYTES)
        sub.add_argument("--max-prompt-chars", type=int, default=DEFAULT_MAX_PROMPT_CHARS)
        sub.add_argument("--fixture", action="store_true")
    scan = subparsers.add_parser("scan")
    scan.add_argument("--output-dir", required=True)
    cleanup = subparsers.add_parser("cleanup")
    cleanup.add_argument("--output-dir", required=True)
    cleanup.add_argument("--dry-run", action="store_true")
    subparsers.add_parser("list")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "run":
        return run_pipeline(args)
    if args.command == "pull":
        return pull_command(args)
    if args.command == "scan":
        return scan_output_dir(args.output_dir)
    if args.command == "cleanup":
        return cleanup_output_dir(args.output_dir, args.dry_run)
    if args.command == "list":
        return list_runs()
    raise ValueError(args.command)


if __name__ == "__main__":
    raise SystemExit(main())
