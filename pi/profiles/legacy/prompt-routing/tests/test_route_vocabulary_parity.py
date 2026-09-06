from __future__ import annotations

import json
from pathlib import Path

FIXTURE_PATH = Path(__file__).with_name("fixtures") / "canonical_route_vocabulary.json"


def test_canonical_route_vocabulary_fixture_matches_expected_parity():
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    assert data["canonical_routes"] == ["nano", "mini", "core", "large", "max"]
    assert data["legacy_route_map"] == {
        "Haiku": "mini",
        "Sonnet": "core",
        "Opus": "large",
    }
    assert data["route_aliases"] == {
        "small": "mini",
        "medium": "core",
        "large": "large",
    }
