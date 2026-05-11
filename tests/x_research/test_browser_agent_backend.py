from x_research.backends.browser_agent_backend import BrowserBudget, parse_snapshot


def test_parser_returns_partial_tweets() -> None:
    page = parse_snapshot("@a: hello\n@b: world\n")
    assert [tweet.author_id for tweet in page.items] == ["a", "b"]
    assert page.source == "browser-agent"


def test_budget() -> None:
    page = parse_snapshot("@a: one\n@b: two\n", budget=BrowserBudget(max_items=1))
    assert len(page.items) == 1
    assert page.complete is False
