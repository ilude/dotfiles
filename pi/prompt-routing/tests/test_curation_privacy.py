"""Privacy redaction tests for curation pipeline."""

from curation_pipeline import SOURCES, normalize_row


def test_normalize_row_redacts_email_from_prompt():
    candidate = normalize_row(
        SOURCES[0],
        {"_row_idx": 1, "prompt": "Contact person@example.com for help."},
        max_prompt_chars=12000,
    )

    assert "person@example.com" not in candidate.prompt
    assert "[EMAIL]" in candidate.prompt
