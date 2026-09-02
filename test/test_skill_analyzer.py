import importlib.util
import json
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "claude" / "scripts" / "skill-analyzer.py"
_spec = importlib.util.spec_from_file_location("skill_analyzer", MODULE_PATH)
assert _spec and _spec.loader
skill_analyzer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(skill_analyzer)


def test_intent_mapping_uses_the_new_owners(tmp_path):
    messages = [
        {"display": "Build the MVP and keep the implementation simple."},
        {"display": "Review the architecture and structural design."},
        {"display": "Write the implementation planning acceptance criteria."},
    ]

    signals_path = tmp_path / "history.jsonl"
    signals_path.write_text("\n".join(json.dumps(message) for message in messages))
    signals = skill_analyzer.parse_user_messages(signals_path)

    assert {signal.skill for signal in signals} == {
        "analysis-workflow",
        "architecture-design",
        "planning",
    }


def test_removed_intent_mapping_keys_are_absent():
    assert "development-philosophy" not in skill_analyzer._INTENT_PATTERNS
    assert "structured-analysis" not in skill_analyzer._INTENT_PATTERNS
    assert "security-first-design" not in skill_analyzer._INTENT_PATTERNS


def test_analysis_mapping_covers_approach_and_simplicity_terms():
    patterns = skill_analyzer._INTENT_PATTERNS["analysis-workflow"]

    assert "simplicity" in patterns["medium"]
    assert "approach" in patterns["medium"]
    assert "MVP" in patterns["high"]
    assert "over-engineering" in patterns["high"]
