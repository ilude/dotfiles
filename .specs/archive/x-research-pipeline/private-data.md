# Private data guardrails

- Plaintext runtime data belongs under `private/`, which is gitignored.
- Only `*.age` files are allowed under `private-encrypted/`.
- Git Bash dry-run scanner: `scripts/x-private-scan --staged`.
- PowerShell dry-run scanner: `python scripts/x-private-scan --staged`.
- Hook installer dry run: `scripts/install-x-private-hook --dry-run`.
- Encryption helpers fail closed if recipient or identity files are missing; `age` absence is reported as skipped in tests.
