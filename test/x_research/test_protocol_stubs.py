from x_research.protocol import Page, XClient


def test_protocol_imports() -> None:
    assert XClient is not None
    page = Page[str](items=["a"], source="fixture")
    assert page.is_terminal is True
