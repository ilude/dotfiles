"""Unit tests for RequestSigner (RFC 9421 signing)."""

import re
from base64 import b64decode

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
)
from signing import RequestSigner


@pytest.fixture
def ed25519_key():
    """Generate a fresh ed25519 private key."""
    return Ed25519PrivateKey.generate()


@pytest.fixture
def ssh_key_bytes(ed25519_key):
    """Serialize ed25519 key to SSH format bytes."""
    return ed25519_key.private_bytes(
        encoding=Encoding.PEM,
        format=PrivateFormat.OpenSSH,
        encryption_algorithm=NoEncryption(),
    )


@pytest.fixture
def signer(ed25519_key):
    """Create a RequestSigner from a generated key."""
    public_bytes = ed25519_key.public_key().public_bytes_raw()
    import hashlib

    key_type = b"ssh-ed25519"
    key_blob = (
        len(key_type).to_bytes(4, "big")
        + key_type
        + len(public_bytes).to_bytes(4, "big")
        + public_bytes
    )
    digest = hashlib.sha256(key_blob).hexdigest()
    key_id = f"SHA256:{digest[:16]}"
    return RequestSigner(ed25519_key, key_id)


class TestFromFile:
    """Tests for RequestSigner.from_file."""

    def test_from_file_loads_ed25519_key(self, tmp_path, ssh_key_bytes):
        key_file = tmp_path / "id_ed25519"
        key_file.write_bytes(ssh_key_bytes)

        result = RequestSigner.from_file(key_file)

        assert isinstance(result, RequestSigner)
        assert result.key_id.startswith("SHA256:")
        assert len(result.key_id) == len("SHA256:") + 16

    def test_from_file_rejects_non_ed25519(self, tmp_path):
        from cryptography.hazmat.primitives.asymmetric import rsa

        rsa_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        rsa_bytes = rsa_key.private_bytes(
            encoding=Encoding.PEM,
            format=PrivateFormat.OpenSSH,
            encryption_algorithm=NoEncryption(),
        )
        key_file = tmp_path / "id_rsa"
        key_file.write_bytes(rsa_bytes)

        with pytest.raises(ValueError, match="Only ed25519 keys are supported"):
            RequestSigner.from_file(key_file)


class TestSignRequest:
    """Tests for RequestSigner.sign_request."""

    def test_sign_request_without_body(self, signer):
        result = signer.sign_request("GET", "/api/v1/health", "localhost:8000")

        assert "signature-input" in result
        assert "signature" in result
        assert "content-digest" not in result

    def test_sign_request_with_body(self, signer):
        body = b'{"key": "value"}'
        result = signer.sign_request("POST", "/api/v1/youtube/ingest", "localhost:8000", body)

        assert "signature-input" in result
        assert "signature" in result
        assert "content-digest" in result
        assert result["content-digest"].startswith("sha-256=:")

    def test_sign_request_signature_format(self, signer):
        result = signer.sign_request("GET", "/api/v1/health", "localhost:8000")

        # Signature must be sig1=:<base64>:
        assert re.match(r"^sig1=:[A-Za-z0-9+/=]+:$", result["signature"])

        # Extract base64 payload and verify it decodes
        b64_part = result["signature"].split(":")[1]
        decoded = b64decode(b64_part)
        # ed25519 signatures are 64 bytes
        assert len(decoded) == 64

    def test_sign_request_includes_method_path_authority(self, signer):
        result = signer.sign_request("GET", "/test", "example.com:8000")

        sig_input = result["signature-input"]
        assert '"@method"' in sig_input
        assert '"@path"' in sig_input
        assert '"@authority"' in sig_input

    def test_sign_request_signature_input_contains_keyid(self, signer):
        result = signer.sign_request("GET", "/test", "example.com")

        sig_input = result["signature-input"]
        assert f'keyid="{signer.key_id}"' in sig_input
        assert 'alg="ed25519"' in sig_input

    def test_sign_request_body_adds_content_digest_to_components(self, signer):
        body = b"test body"
        result = signer.sign_request("POST", "/test", "example.com", body)

        sig_input = result["signature-input"]
        assert '"content-digest"' in sig_input
