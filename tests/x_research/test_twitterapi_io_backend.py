import httpx
import pytest

from x_research.backends.twitterapi_io_backend import TwitterApiIoBackend
from x_research.config import LocalConfig, require_twitterapi_io
from x_research.protocol import ProviderAuthError, ProviderRateLimitError


def _client(handler):
    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="https://example.test"
    )


def test_config_redaction() -> None:
    with pytest.raises(ValueError, match="<redacted>"):
        require_twitterapi_io(LocalConfig())


@pytest.mark.asyncio
async def test_mapping() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": {"id": "1", "userName": "A", "name": "Alice"}})

    async with TwitterApiIoBackend(require_twitterapi_io_config(), _client(handler)) as backend:
        user = await backend.user_by_handle("a")
    assert user.handle == "a"


@pytest.mark.asyncio
async def test_pagination() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/twitter/user/followings"
        return httpx.Response(
            200,
            json={"followings": [{"id": "1", "userName": "a"}], "next_cursor": "n"},
        )

    async with TwitterApiIoBackend(require_twitterapi_io_config(), _client(handler)) as backend:
        page = await backend.following("me")
    assert page.next_cursor == "n"
    assert page.complete is False


@pytest.mark.asyncio
async def test_retry() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, json={"error": "rate"})

    async with TwitterApiIoBackend(require_twitterapi_io_config(), _client(handler)) as backend:
        with pytest.raises(ProviderRateLimitError):
            await backend.followers("me")
    assert calls == 2


@pytest.mark.asyncio
async def test_auth_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "secret"})

    async with TwitterApiIoBackend(require_twitterapi_io_config(), _client(handler)) as backend:
        with pytest.raises(ProviderAuthError):
            await backend.user_by_handle("me")


def require_twitterapi_io_config():
    from x_research.config import TwitterApiIoConfig

    return TwitterApiIoConfig(api_key="secret", base_url="https://example.test")
