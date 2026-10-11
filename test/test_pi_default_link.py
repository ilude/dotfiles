import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent


@pytest.mark.skipif(os.name == "nt", reason="Linux symlink setup")
def test_native_agent_link_selects_default_and_preserves_legacy(tmp_path: Path) -> None:
    bash = shutil.which("bash")
    assert bash
    profiles = tmp_path / ".dotfiles" / "pi" / "profiles"
    default = profiles / "default"
    legacy = profiles / "legacy"
    default.mkdir(parents=True)
    legacy.mkdir()
    marker = legacy / "historic.txt"
    marker.write_text("preserve", encoding="utf-8")
    agent = tmp_path / ".pi" / "agent"
    agent.parent.mkdir()
    agent.symlink_to(legacy, target_is_directory=True)

    for _ in range(2):
        result = subprocess.run(
            [bash, str(ROOT / "scripts" / "pi-link-setup")],
            env={**os.environ, "HOME": str(tmp_path), "WINDIR": ""},
            capture_output=True,
            text=True,
            timeout=10,
        )
        assert result.returncode == 0, result.stderr
        assert agent.resolve() == default
        assert marker.read_text(encoding="utf-8") == "preserve"
