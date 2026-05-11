# Product Manager Review

## Finding 1
severity: high

evidence: The stated immediate need is follow-list/research access, but Objective #1 and tasks T1-T7 expand MVP to tweets, profiles, followers, following, home/feed snapshots, search, provider abstraction, browser backend, repository layer, events, encryption scripts, and hooks before the seed workflow appears in T8.

required_fix: Cut MVP to the smallest follow-list workflow: import/sync authenticated user's following list, check candidate handles, and optionally export encrypted results. Defer tweets, home timeline, followers, search, follow events, and browser backend until the follow-check loop proves useful.

## Finding 2
severity: high

evidence: The plan says existing `scripts/x-following-sync` and `scripts/x-following-check` are Birdclaw-oriented experiments, but it supersedes them without evaluating whether they already satisfy the core candidate-following check.

required_fix: Add a reuse spike before T1: run/read the existing scripts and decide whether to wrap, simplify, or replace them. If they can answer followed/not-followed from a local source, make them the MVP baseline instead of creating a new package and schema first.

## Finding 3
severity: medium

evidence: “Provider abstraction is required from day one” drives async protocols, normalized models, stub backends, raw JSON, retries, and two providers. The MVP has already selected `twitterapi.io` for bulk and browser only for occasional pulls, so volatility is being solved before the first user-facing query exists.

required_fix: Start with one concrete `twitterapi.io` client behind a thin function boundary. Introduce a formal protocol only when a second real provider is implemented and proven necessary by a failing use case.

## Finding 4
severity: medium

evidence: Follow-edge schema includes snapshots, current edges, events, `is_active`, `first_seen_at`, and `last_seen_at`. The immediate query commands only need to know whether a handle is in the latest following set and maybe mutual/non-mutual summaries.

required_fix: Replace the event-sourced follow model with a simple `following(handle, fetched_at, raw_json)` table for MVP. Add snapshots/events only if the user explicitly needs history, unfollow detection, or trend analysis.

## Finding 5
severity: medium

evidence: T3 adds encryption/decryption scripts and git hooks before any real data path works. The plan already relies on `private/` being gitignored; encrypted portable snapshots are optional and not required for checking follow status locally.

required_fix: For MVP, enforce only `.gitignore` coverage and a documented “do not stage private data” check in validation. Move age snapshot tooling and custom pre-commit hooks to a follow-up privacy-hardening task after the CLI produces useful data.
