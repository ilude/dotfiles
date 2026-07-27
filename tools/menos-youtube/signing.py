"""Shared HTTP request signing for menos API (RFC 9421)."""

import hashlib
import time
from base64 import b64encode
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_ssh_private_key


class RequestSigner:
    """Signs HTTP requests per RFC 9421."""

    def __init__(self, private_key: Ed25519PrivateKey, key_id: str):
        self.private_key = private_key
        self.key_id = key_id

    @classmethod
    def from_file(cls, path: Path, password: bytes | None = None) -> "RequestSigner":
        """Load signer from SSH private key file."""
        key_data = path.read_bytes()
        private_key = load_ssh_private_key(key_data, password=password)

        if not isinstance(private_key, Ed25519PrivateKey):
            raise ValueError("Only ed25519 keys are supported")

        # Compute key_id from public key
        public_key = private_key.public_key()
        public_bytes = public_key.public_bytes_raw()
        key_type = b"ssh-ed25519"
        key_blob = (
            len(key_type).to_bytes(4, "big")
            + key_type
            + len(public_bytes).to_bytes(4, "big")
            + public_bytes
        )
        digest = hashlib.sha256(key_blob).hexdigest()
        key_id = f"SHA256:{digest[:16]}"

        return cls(private_key, key_id)

    def sign_request(
        self,
        method: str,
        path: str,
        host: str,
        body: bytes | None = None,
    ) -> dict[str, str]:
        """Generate signature headers for a request."""
        created = int(time.time())

        # Components to sign
        components = ['"@method"', '"@path"', '"@authority"']
        if body:
            components.append('"content-digest"')

        # Build signature base
        lines = [
            f'"@method": {method}',
            f'"@path": {path}',
            f'"@authority": {host}',
        ]

        content_digest = None
        if body:
            digest = hashlib.sha256(body).digest()
            digest_b64 = b64encode(digest).decode()
            content_digest = f"sha-256=:{digest_b64}:"
            lines.append(f'"content-digest": {content_digest}')

        # Build signature-input value
        components_str = " ".join(components)
        sig_params = f'({components_str});keyid="{self.key_id}";alg="ed25519";created={created}'
        lines.append(f'"@signature-params": {sig_params}')

        signature_base = "\n".join(lines)

        # Sign
        signature_bytes = self.private_key.sign(signature_base.encode())
        signature_b64 = b64encode(signature_bytes).decode()

        result = {
            "signature-input": f"sig1={sig_params}",
            "signature": f"sig1=:{signature_b64}:",
        }

        if content_digest:
            result["content-digest"] = content_digest

        return result
