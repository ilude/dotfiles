from __future__ import annotations

from pathlib import Path

AGENTS_DIR = Path("pi/agents")


def _frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    parts = text.split("---", 2)
    assert len(parts) == 3, f"{path} must have YAML frontmatter"
    data: dict[str, str] = {}
    for line in parts[1].splitlines():
        if not line.strip() or line.startswith(" ") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"')
    return data


def _agent_metadata() -> dict[str, dict[str, str]]:
    return {_frontmatter(path)["name"]: _frontmatter(path) for path in AGENTS_DIR.glob("*.md")}


def test_all_pi_agents_have_routing_metadata() -> None:
    for path in AGENTS_DIR.glob("*.md"):
        metadata = _frontmatter(path)
        assert metadata.get("roleType"), f"{path} missing roleType"
        assert metadata.get("routingUse"), f"{path} missing routingUse"


def test_workers_report_to_expected_leads() -> None:
    agents = _agent_metadata()
    expected = {
        "planning-lead": ["product-manager", "ux-researcher"],
        "engineering-lead": ["frontend-dev", "backend-dev"],
        "validation-lead": ["qa-engineer", "security-reviewer"],
        "ml-research-lead": ["data-engineer", "model-engineer", "eval-engineer"],
    }

    for lead, workers in expected.items():
        assert agents[lead]["roleType"] == "lead"
        for worker in workers:
            assert agents[worker]["reportsTo"] == lead


def test_orchestrator_is_not_a_worker_or_lead() -> None:
    metadata = _agent_metadata()["orchestrator"]
    assert metadata["roleType"] == "orchestrator"
    assert "leads" in metadata


def test_pi_instructions_are_canonical_source_for_claude() -> None:
    pi_instructions = Path("pi/AGENTS.md")
    claude_instructions = Path("claude/CLAUDE.md")

    assert pi_instructions.is_file()
    assert not pi_instructions.is_symlink()
    assert claude_instructions.is_symlink()
    assert claude_instructions.resolve() == pi_instructions.resolve()


def test_review_it_does_not_recommend_leads_as_routine_reviewers() -> None:
    instructions = Path("pi/skills/workflow/review-it.md").read_text(encoding="utf-8")
    start = instructions.index("- Lead/coordinator agents are not reviewers.")
    end = instructions.index("\n- ", start + 2)
    invariant = instructions[start:end]

    assert "Never panel" in invariant
    for agent in (
        "planning-lead",
        "engineering-lead",
        "validation-lead",
        "ml-research-lead",
        "orchestrator",
    ):
        assert f"`{agent}`" in invariant
