"""Tests for the shared authenticated Onclave HTTP client."""

from unittest.mock import MagicMock, patch

import pytest
from onclave_client import OnclaveClient


def test_post_json_serializes_once_and_signs_transmitted_bytes():
    http_client = MagicMock()
    signer = MagicMock()
    signer.sign_request.return_value = {"signature": "sig1=test"}
    payload = {"url": "https://youtube.com/watch?v=dQw4w9WgXcQ"}
    with (
        patch("onclave_client.get_api_base", return_value="https://onclave.example/api/v1"),
        patch("onclave_client.Path.home") as home,
        patch("onclave_client.RequestSigner.from_file", return_value=signer),
        patch("onclave_client.httpx.Client", return_value=http_client),
        patch("onclave_client.json.dumps", return_value='{"url":"test"}') as dumps,
    ):
        key_path = MagicMock()
        key_path.exists.return_value = True
        home.return_value.__truediv__.return_value.__truediv__.return_value = key_path

        client = OnclaveClient()
        client.post_json("/ingest?tags=test", payload)

    content = b'{"url":"test"}'
    dumps.assert_called_once_with(payload)
    signer.sign_request.assert_called_once_with(
        "POST", "/api/v1/ingest?tags=test", "onclave.example", content
    )
    http_client.request.assert_called_once()
    _, url = http_client.request.call_args.args
    assert url == "https://onclave.example/api/v1/ingest?tags=test"
    assert http_client.request.call_args.kwargs["content"] == content
    assert http_client.request.call_args.kwargs["headers"]["Content-Type"] == "application/json"


def test_missing_signing_key_fails_clearly():
    with (
        patch("onclave_client.get_api_base", return_value="https://onclave.example/api/v1"),
        patch("onclave_client.Path.home") as home,
        pytest.raises(RuntimeError, match="SSH key not found"),
    ):
        key_path = MagicMock()
        key_path.exists.return_value = False
        home.return_value.__truediv__.return_value.__truediv__.return_value = key_path
        OnclaveClient()


def test_invalid_signing_key_fails_clearly():
    with (
        patch("onclave_client.get_api_base", return_value="https://onclave.example/api/v1"),
        patch("onclave_client.Path.home") as home,
        patch(
            "onclave_client.RequestSigner.from_file",
            side_effect=ValueError("unsupported key"),
        ),
        pytest.raises(RuntimeError, match="Unable to load SSH signing key"),
    ):
        key_path = MagicMock()
        key_path.exists.return_value = True
        home.return_value.__truediv__.return_value.__truediv__.return_value = key_path
        OnclaveClient()


def test_rejects_non_api_relative_path():
    client = OnclaveClient.__new__(OnclaveClient)
    with pytest.raises(ValueError, match="must start"):
        client.request("GET", "content/abc")
