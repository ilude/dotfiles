"""Shared authenticated HTTP client for the Onclave API."""

import json
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx
from api_config import get_api_base
from signing import RequestSigner


class OnclaveClient:
    """Signed HTTP client for Onclave API requests."""

    def __init__(self, *, timeout: float = 30.0) -> None:
        self.api_base = get_api_base().rstrip("/")
        parsed_base = urlparse(self.api_base)
        self.host = parsed_base.netloc
        self.api_path = parsed_base.path.rstrip("/")
        if not self.host:
            raise RuntimeError(f"Invalid ONCLAVE_API_BASE: {self.api_base}")

        key_path = Path.home() / ".ssh" / "id_ed25519"
        if not key_path.exists():
            raise RuntimeError(f"SSH key not found at {key_path}")
        try:
            self.signer = RequestSigner.from_file(key_path)
        except (OSError, TypeError, ValueError) as error:
            raise RuntimeError(f"Unable to load SSH signing key at {key_path}: {error}") from error
        self.client = httpx.Client(timeout=timeout)

    def __enter__(self) -> "OnclaveClient":
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self.client.close()

    def request(
        self,
        method: str,
        path: str,
        *,
        content: Optional[bytes] = None,
    ) -> httpx.Response:
        """Send one signed request to an API-relative path."""
        if not path.startswith("/"):
            raise ValueError("API path must start with '/'")

        signed_path = f"{self.api_path}{path}"
        headers = self.signer.sign_request(method, signed_path, self.host, content)
        if content is not None:
            headers = {"Content-Type": "application/json", **headers}
        return self.client.request(
            method,
            f"{self.api_base}{path}",
            content=content,
            headers=headers,
        )

    def get(self, path: str) -> httpx.Response:
        """Send a signed GET request."""
        return self.request("GET", path)

    def post(self, path: str, *, content: Optional[bytes] = None) -> httpx.Response:
        """Send a signed POST request."""
        return self.request("POST", path, content=content)

    def post_json(self, path: str, payload: object) -> httpx.Response:
        """Serialize, sign, and send one JSON POST request."""
        content = json.dumps(payload).encode()
        return self.post(path, content=content)
