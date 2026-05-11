---
name: x-twitter
description: "Use when working with X/Twitter: x.com feed extraction, tweet/profile checks, following/follower lists, twitterapi.io, browser-agent pulls, or local encrypted X data handling."
---

# X / Twitter Workflow

**Auto-activate when:** user mentions X, Twitter, x.com, tweets, following feed, followers/following list, `twitterapi.io`, browser-agent extraction, or checking whether the user follows accounts.

## Core Principle

Prefer local, repeatable data over ad-hoc browser scraping. For the current MVP, use `twitterapi.io` for bulk data and browser-agent reads only for bounded occasional pulls, validation, and small spot checks.

## Current Plan

The active execution plan is:

```text
.specs/x-research-pipeline/plan.md
```

Current MVP direction:

- Store local plaintext X data under `private/x/` (gitignored).
- Store optional repo-backed encrypted snapshots under `private-encrypted/x/*.age`.
- Build an installable Python package at `src/x_research/` with CLI entrypoint `x-research`.
- Use `twitterapi.io` for following/followers bulk sync.
- Use browser-agent only for bounded read-only validation or occasional pulls.
- Keep Birdclaw, xurl, twscrape/Webshare, menos, MCP, and service deployment deferred unless explicitly brought back into scope.

## twitterapi.io Live-Call Safety

`twitterapi.io` calls are credentialed and metered. Treat them like spending user budget, not like ordinary tests.

Before any live call:

1. Read the relevant official docs page from `https://docs.twitterapi.io/llms.txt`, preferably the endpoint `.md` file.
2. Confirm endpoint path, auth header, query params, pagination fields, rate limits, pricing, and response shape.
3. Run mocked/local tests first; never discover endpoint variants by trying live requests.
4. Ask for explicit approval naming the handle, operation, and maximum call/credit budget.

During live calls:

- Default to one live page/request unless the user approved more.
- After any successful response, inspect the payload shape and local DB/result counts before another live call.
- Compare returned item count, provider-declared counts, `next_cursor`/`has_next_page`, and existing local rows.
- If data appears complete, stop even if pagination metadata is ambiguous.
- If more calls are needed, estimate remaining calls/credits before continuing.
- One immediate retry is acceptable for transient 429/5xx; a second retry requires a changed condition such as a longer wait, corrected request, docs-confirmed fix, or renewed user approval.
- Never repeat the same live request more than two times with the same params and same failure.
- Every pagination loop must have hard caps such as `--max-pages`, a credit budget, and stop conditions for repeated cursors, repeated page contents, quota errors, or unchanged failures.
- Before another paid call after an error, summarize the last endpoint/params without secrets, status/error, rows already stored, and why another call is expected to produce new data.

## Browser-Agent Fallback for One-Off Reads

Use browser extraction only for small, bounded tasks where the user has approved the authenticated browser session.

Safe pattern:

```bash
cd ~/.pi/agent/skills/pi-skills/browser-tools
node browser-nav.js https://x.com/home
node browser-eval.js 'document.body.innerText.slice(0,1000)'
```

For timeline extraction:

- Select/verify the intended tab, e.g. `Following` with `aria-selected="true"`.
- Use fixed scroll/time budgets.
- Dedupe by stable status URL or `{handle}:{text prefix}`.
- Report partial counts honestly.
- Do not click Follow/Like/Repost/Post/DM/forms.
- Do not export cookies, tokens, or browser credential data.
- Do not kill broad Brave/Chrome processes.

## Checking Whether We Follow a Handle

Preferred MVP path once implemented:

```bash
uv run x-research sync following <my-handle> --source twitterapi-io
uv run x-research check-following @user1 @user2 @user3
```

Temporary small-list fallback before MVP implementation:

1. Navigate to `https://x.com/<handle>`.
2. Read the primary profile button near the header.
3. Interpret:
   - `Following` = already following.
   - `Follow` = not following.
   - `Pending` = requested/private/pending.

Do not infer following status from feed presence alone.

## Local Data and Encryption Pattern

Keep plaintext PII/local caches out of git:

```text
private/x/                       # plaintext local DB/config/exports, gitignored
private-encrypted/x/*.age        # tracked encrypted artifacts only
```

Expected guardrails from the plan:

- `private/` ignored.
- `private-encrypted/` ignores everything except `*.age`.
- `scripts/x-private-scan --staged` rejects plaintext private data.
- `scripts/x-private-encrypt` and `scripts/x-private-decrypt` use `age` with explicit recipients and atomic writes.

## Anti-Patterns

- Do not make Birdclaw or xurl part of the MVP unless the plan is changed.
- Do not use browser-agent for unbounded graph crawling.
- Do not silently switch to a real browser profile without explicit user intent.
- Do not commit plaintext X data, cookies, profile lists, DMs, feed exports, API keys, or SQLite databases.
- Do not add X write actions without a separate security-reviewed plan.
