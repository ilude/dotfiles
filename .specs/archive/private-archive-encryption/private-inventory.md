# Private Archive Inventory

This non-secret taxonomy defines what belongs under `private/` for archive encryption. It lists categories and migration boundaries only; do not add secret values, file contents, tokens, private URLs, or personal records here.

## In scope for `private/`

- **Secrets:** API keys, tokens, SSH/private key backups, recovery material, credentials, and local-only secret configuration.
- **Configs with keys:** generated config files or client settings that embed credentials or account identifiers.
- **PII:** personal profile data, contact details, account exports, identity documents, health/finance snippets, and other personally identifying records.
- **Logs:** local debug logs, transcripts, shell/session logs, tool traces, and incident notes that may contain sensitive paths, prompts, credentials, or personal data.
- **Mined personal data:** scraped/exported social, email, calendar, browser, X/Twitter, Reddit, or research datasets tied to a real person/account.
- **Handoffs:** `/handoff` output files belong in `private/handoffs/` because they can summarize private repo state, prompts, logs, or user context.

## Out of scope / do not archive

- Regenerable caches, dependency directories, virtual environments, build outputs, and package manager caches.
- Public documentation, tests, non-secret fixtures, and source code intended to be reviewed in Git.
- Large third-party datasets that can be redownloaded and do not contain personal annotations or credentials.
- Plaintext temporary archive files such as `private.tar`, `private.tar.gz`, `.private.tar`, `private-merge.tar`, and `private.conflicts/`; these must remain ignored and transient.

## Storage boundary

- `private/` is local plaintext and gitignored.
- `private/handoffs/` is the canonical `/handoff` destination.
- `private.tar.age` is the only default tracked encrypted archive artifact.
