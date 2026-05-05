---
created: 2026-04-07
status: research-note
source: .specs/menos-knowledge-compiler/
---

# menos Knowledge Compiler

## Core idea

Use **menos** as the durable personal-memory backend for captured coding-agent sessions, compiled concepts, digests, and retrieval. Claude Code hooks are the first capture/injection client; Pi should be a first-class follow-on client using the same backend contract rather than creating a separate memory store.

The architecture borrows from Karpathy-style personal LLM knowledge bases and `coleam00/claude-memory-compiler`: raw sessions become summarized `session_log` items, then a background compiler creates wiki-like concepts with backlinks, lint checks, and digests.

## Why menos fits

menos already has many required primitives:

- FastAPI API surface
- SurrealDB storage
- content items and annotations
- semantic search
- agentic/RRF synthesis search
- `[[wiki-links]]` extraction and backlinks
- per-item LLM classification pipeline
- self-hosted runtime with Ollama/MinIO

The plan treats menos as approximately 70% of the desired system, avoiding a second memory database.

## Persona boundaries

Memory must be partitioned before compilation or injection:

- `work` — employer/client context
- `workflow` — reusable AI/coding-agent/process/tooling knowledge
- `hobby` — personal/fun content, isolated by default
- `shared` — small curated profile/preferences layer

Important defaults:

- `hobby` never bleeds into `work` or `workflow` retrieval by default.
- `work` can only become `workflow/shared` after abstraction.
- Legacy `persona_scope=null` content is excluded from persona-scoped injection unless explicitly migrated.
- Every captured item records persona source, confidence, capture client, visibility, and sharing metadata.

## Capture and compile loop

Proposed flow:

1. Capture session end/compact summaries from clients.
2. Redact secrets and blind home paths.
3. Store as `content_type="session_log"` in menos.
4. After enough sessions, compile persona-scoped project and cross-project concepts.
5. Lint concepts for orphans, broken links, stale facts, sparse concepts, and contradictions.
6. Generate weekly digest items.
7. Provide SessionStart preview/injection gated by an explicit live flag.

Cold-start is conservative: silently capture 10-20 sessions, then offer dry-run preview before live injection.

## Operational and safety constraints

- Hooks must fail fast on network issues; no unbounded offline queue.
- Session logs retained for 365 days; concepts/connections retained indefinitely.
- APScheduler runs inside the menos FastAPI process, with `WEB_CONCURRENCY <= 1` to avoid duplicate scheduled jobs.
- Compile windows use server-side `content.created_at` to avoid laptop clock-skew gaps.
- Chunk `session_log` at about 1800/180 for `mxbai-embed-large` to avoid embedding truncation.
- Path blinding replaces home paths with `~/`.
- Generated injection material is untrusted reference material, not instructions.

## Eval lessons

The spec included a pre-capture retrieval snapshot and a future post-capture comparison. The important workflow idea is not the exact metric but the habit:

- capture a deterministic baseline before adding memory machinery
- compare query-level retrieval behavior after compilation
- flag individual query regressions, not just aggregate averages
- prefer metrics the harness actually emits, such as Jaccard@5/Jaccard@10/top-1 delta/Kendall tau

## Review lessons

The review surfaced durable implementation lessons:

- On Windows, Claude hooks may run under WSL Python, not the Windows Python; dependency checks must validate the actual hook interpreter.
- Hook stderr can be invisible; warnings need a persistent user-visible status log or next-session context.
- Compile write paths should reuse a shared content service, not bypass link extraction or pipeline behavior.
- Scheduler timezones must be explicit.
- Compile services need a distinct signing key or content-type authorization boundary.
- Redaction patterns need maintenance and should cover common SaaS/database token formats.
- PreCompact is not the same as session end; mid-session capture must avoid duplicate final-session semantics.

## KISS recommendation

Build the compiler as an opt-in menos feature with strict persona isolation and dry-run injection first. Treat Pi/Claude as clients and keep fewer, stronger backend contracts: capture summary, compile concepts, preview injection, lint memory, and digest changes.
