---
name: x-twitter
description: X/Twitter workflow for feed extraction, tweet/profile checks, following lists, twitterapi.io calls, and local X data.
---

# X / Twitter

Routing card for X/Twitter work. Prefer local repeatable data and bounded reads; never perform write actions without a separate explicit plan.

## Source Priority

1. Existing local data under `private/x/` or project-specific X tooling.
2. `twitterapi.io` for approved bulk following/follower syncs.
3. Browser automation only for small authenticated spot checks or validation.

## twitterapi.io Safety

Credentialed calls are metered. Before any live call:

- Read the relevant docs from `https://docs.twitterapi.io/llms.txt`.
- Confirm endpoint, auth header, parameters, pagination, rate limits/pricing, and response shape.
- Run mocked/local checks first.
- Ask for explicit approval naming handle, operation, and max call/credit budget.

Use hard caps for pagination (`--max-pages`, credit budget, repeated cursor/content stops). Never repeat the same failed live request more than twice without a changed condition and renewed rationale.

## Browser Spot Checks

Use `browser-tools` only with explicit authenticated-session approval. Bound scroll/time attempts, dedupe by stable status URL or handle/text signature, and report partial counts honestly. Do not click Follow/Like/Repost/Post/DM/forms or export cookies/tokens.

## Local Data

Plaintext X data stays ignored under `private/x/` or `private/_attachments/x/`; encrypted snapshots go through Dolos at `.dolos/artifacts/private.tar.gz.age`. Cross-reference `private-store` before writing or committing sensitive X data.
