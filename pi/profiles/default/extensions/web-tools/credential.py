#!/usr/bin/env python3
"""Read one configured BWS secret using the machine access key."""

import json
import os
import sys

from bitwarden_sdk import BitwardenClient, ClientSettings


def main() -> int:
    if len(sys.argv) != 2 or not os.environ.get("BITWARDEN_ACCESS_KEY"):
        return 2
    client = BitwardenClient(
        ClientSettings(
            api_url="https://vault.bitwarden.com/api",
            identity_url="https://vault.bitwarden.com/identity",
        )
    )
    client.auth().login_access_token(os.environ["BITWARDEN_ACCESS_KEY"])
    secret = client.secrets().get(sys.argv[1]).data
    print(json.dumps({"key": secret.key, "value": secret.value}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
