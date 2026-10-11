import runpy
from pathlib import Path

import pytest

DOTFILES = Path(__file__).parent.parent
cleanup = runpy.run_path(str(DOTFILES / "scripts" / "pi-launcher-cleanup.py"))
remove_owned_pp_link = cleanup["remove_owned_pp_link"]


@pytest.mark.parametrize("relative", [False, True])
def test_removes_owned_dangling_pp_link(tmp_path: Path, relative: bool) -> None:
    root = tmp_path / "repo"
    (root / "scripts").mkdir(parents=True)
    home = tmp_path / "home"
    link = home / ".local" / "bin" / "pp"
    link.parent.mkdir(parents=True)
    target = Path("../../../repo/scripts/pp") if relative else root / "scripts" / "pp"
    link.symlink_to(target)

    assert remove_owned_pp_link(root, home)
    assert not link.is_symlink()
    assert not remove_owned_pp_link(root, home)


def test_preserves_unrelated_pp_link(tmp_path: Path) -> None:
    root = tmp_path / "repo"
    home = tmp_path / "home"
    link = home / ".local" / "bin" / "pp"
    link.parent.mkdir(parents=True)
    target = tmp_path / "other-launcher"
    target.write_text("user-owned", encoding="utf-8")
    link.symlink_to(target)

    assert not remove_owned_pp_link(root, home)
    assert link.is_symlink()
    assert target.read_text(encoding="utf-8") == "user-owned"


def test_preserves_regular_pp_file(tmp_path: Path) -> None:
    root = tmp_path / "repo"
    home = tmp_path / "home"
    link = home / ".local" / "bin" / "pp"
    link.parent.mkdir(parents=True)
    link.write_text("user-owned", encoding="utf-8")

    assert not remove_owned_pp_link(root, home)
    assert link.read_text(encoding="utf-8") == "user-owned"
