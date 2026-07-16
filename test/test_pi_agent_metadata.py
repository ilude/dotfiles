from pathlib import Path


def test_pi_instructions_are_canonical_source_for_shared_client() -> None:
    pi_instructions = Path("pi/AGENTS.md")
    shared_instructions = Path("claude/CLAUDE.md")

    assert pi_instructions.is_file()
    assert not pi_instructions.is_symlink()
    assert shared_instructions.is_symlink()
    assert shared_instructions.resolve() == pi_instructions.resolve()
