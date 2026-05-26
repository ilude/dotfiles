"""Feature extraction tests for curation pipeline."""

from curation_pipeline import SOURCES, extract_features, normalize_row


def test_feature_extraction_is_deterministic():
    candidate = normalize_row(
        SOURCES[0],
        {
            "_row_idx": 1,
            "prompt": "Debug this traceback in app.py and run pytest.\n```python\nprint('x')\n```",
        },
        max_prompt_chars=12000,
    )

    first = extract_features(candidate)
    second = extract_features(candidate)

    assert first == second
    assert first["prompt_chars"] > 0
    assert first["file_touch_count"] == 1
    assert first["command_count"] >= 1
    assert first["has_code_fence"] is True
    assert first["has_debug_intent"] is True


def test_feature_extraction_handles_message_shape():
    candidate = normalize_row(
        SOURCES[2],
        {"_row_idx": 1, "messages": [{"role": "user", "content": "Continue the design."}]},
        max_prompt_chars=12000,
    )
    features = extract_features(candidate)

    assert features["message_count"] == 1
    assert features["has_continuation_intent"] is True
    assert features["has_architecture_intent"] is True
