---
status: research-note
source: menos/
---

# menos

## What it is

menos is a self-hosted content vault with semantic search and PKM features. It stores markdown/frontmatter files, YouTube transcripts, and structured content so multiple machines and agents can query one durable knowledge backend.

## Architecture

Core stack:

- FastAPI REST API
- SurrealDB for metadata, jobs, and HNSW vector search
- MinIO for file/blob storage
- Ollama for local embeddings, currently `mxbai-embed-large`
- RFC 9421 HTTP Message Signatures with ed25519 keys

Important design split: MinIO stores original content, SurrealDB stores metadata/embeddings, and service modules own business logic while routers handle HTTP concerns.

## Capabilities relevant to agent workflows

- Authenticated content upload/list/get/update/delete
- Semantic vector search
- Agentic search: query expansion, multi-query retrieval/RRF, synthesis with citations
- YouTube ingestion and transcript storage
- Tags, frontmatter parsing, wiki-links, backlinks, and graph visualization
- Pipeline jobs with resource-key deduplication
- Unified LLM pipeline for classification, summaries, quality tiers, topics, and entity validation
- Deployment automation under `infra/ansible/`

## API surface

Key endpoint groups:

- `/health`, `/ready`
- `/api/v1/auth/*`
- `/api/v1/content/*`
- `/api/v1/search` and `/api/v1/search/agentic`
- `/api/v1/graph` and graph neighborhoods
- `/api/v1/youtube/*`
- job/pipeline endpoints in the API codebase

## Unified pipeline pattern

The unified pipeline is a useful general agent-workflow pattern:

1. Ingestion submits a `pipeline_job` keyed by a canonical `resource_key`.
2. Active-job lookup prevents duplicate work.
3. A bounded background worker runs the LLM pipeline.
4. The pipeline emits tags, quality tier, score, summary, topics, and validated entities in one response.
5. Content processing status mirrors job status, but the job record is the source of truth.
6. Optional callbacks are signed and retried without blocking the pipeline.

This is a good model for future Pi run ledgers and policy gates: job-first authority, idempotent resource keys, bounded concurrency, explicit states, and auditable result metadata.

## Implementation gotchas

- SurrealDB Python methods are synchronous even when called from async service methods.
- `chunk.content_id` stores plain strings, not RecordID objects; wrong parameter types silently return empty results.
- Test query behavior against real data with `scripts/query.py`; mocks will miss SurrealDB type mismatches.
- Migration errors can be caught while the app keeps running, so deployment validation must inspect logs.
- Do not mask data-pipeline symptoms by removing fields from responses.
- When moving router/query logic, port every `SELECT`, `WHERE`, `ORDER BY`, and `LIMIT` clause.

## Agent-workflow relevance

menos is the natural backend for several notes in this vault:

- [[../workflow-ideas/menos-knowledge-compiler]] — session capture, concepts, digests, and persona-scoped memory
- [[../workflow-ideas/x-research-pipeline]] — harvested users/tweets/edges as content and graph data
- [[../workflow-ideas/code-intelligence]] — possible repository graphs and architecture reports
- [[../workflow-ideas/pipelines-and-policies]] — job-ledger and receipt patterns borrowed from menos pipeline jobs

## KISS recommendation

Treat menos as the durable memory/search backend and keep Pi/Claude as clients. Reuse menos primitives before adding new stores: content items, tags, links/backlinks, jobs, resource keys, vector search, graph endpoints, and the unified pipeline.
