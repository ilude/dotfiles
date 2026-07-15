import os
import shutil
import subprocess
from pathlib import Path

import pytest

DOTFILES = Path(__file__).parent.parent
BASH = shutil.which("bash")


@pytest.mark.skipif(BASH is None, reason="bash not found")
def test_pi_new_omits_retired_agent_chain_recipes(tmp_path: Path) -> None:
    home = tmp_path / "home"
    home.mkdir()

    result = subprocess.run(
        [BASH, str(DOTFILES / "pi" / "scripts" / "pi-new"), "project"],
        cwd=tmp_path,
        env={**os.environ, "HOME": str(home)},
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    justfile = (tmp_path / "project" / "justfile").read_text(encoding="utf-8")
    assert "agent-chain.ts" not in justfile
    assert "\nchain:" not in justfile
