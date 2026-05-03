#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "menos/infra/ansible/playbooks/deploy.yml"
COMPOSE = ROOT / "menos/infra/ansible/files/menos/docker-compose.yml"
CONTRACT = ROOT / ".specs/menos-infisical-runtime/secret-contract.md"
REDACTION = ROOT / ".specs/menos-infisical-runtime/redaction-checklist.md"
REQUIRED = {
    "SURREALDB_PASSWORD",
    "SURREALDB_NAMESPACE",
    "SURREALDB_DATABASE",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_BUCKET",
    "GARAGE_RPC_SECRET",
    "GARAGE_ADMIN_TOKEN",
    "SEARXNG_SECRET",
}


def fail(message: str) -> None:
    print(f"FAIL {message}")
    raise SystemExit(1)


def main() -> int:
    deploy = DEPLOY.read_text(encoding="utf-8")
    compose = COMPOSE.read_text(encoding="utf-8")
    contract = CONTRACT.read_text(encoding="utf-8")

    if "/project/.env" in deploy or "Copy .env file" in deploy:
        fail("deploy playbook still references repo-root env copy")
    for key in REQUIRED:
        if key not in contract:
            fail(f"contract missing {key}")
    for heading in [
        "## Required Keys",
        "## Optional Keys",
        "## Source",
        "## Rotation",
        "## Validation",
        "## Failure",
    ]:
        if heading not in contract:
            fail(f"contract missing {heading}")
    for marker in ["changeme", "REPLACE_ME", "<replace>"]:
        if marker not in contract:
            fail(f"contract missing placeholder policy marker {marker}")
    if re.search(r"changeme|TODO|<replace|REPLACE_ME", compose, re.IGNORECASE):
        fail("compose contains placeholder marker")
    if "env_file:" not in compose:
        fail("compose does not declare env_file")
    preflight = deploy.find("Validate menos runtime secrets from Infisical")
    compose_config = deploy.find("Validate compose interpolation before compose actions")
    pull = deploy.find("Pull container images")
    build = deploy.find("Build API image")
    if min(preflight, compose_config, pull, build) < 0:
        fail("required deploy task names not found")
    if not preflight < compose_config < pull < build:
        fail("preflight tasks do not precede compose actions")
    for phrase in ["no_log: true", "diff: false", "check_mode: false", "tags: [preflight]"]:
        if phrase not in deploy:
            fail(f"deploy missing {phrase}")
    if "{{ menos_infisical_tmp_dir }}" not in deploy or "state: absent" not in deploy:
        fail("deploy does not clean local temp secret directory")
    if not REDACTION.exists() or not REDACTION.read_text(encoding="utf-8").strip():
        fail("redaction checklist is missing or empty")
    print("PASS menos Infisical runtime structural validation")
    return 0


if __name__ == "__main__":
    sys.exit(main())
