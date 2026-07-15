# Expertise storage and retrieval

Pi expertise is durable runtime data stored in JSONL. The JSONL logs are the source of truth; legacy mental-model snapshots are retired. Agent-facing expertise tools are unavailable, so durable operating instructions belong in `AGENTS.md` or skills rather than expertise records.

## Paths and ownership

The canonical logs are under `pi/multi-team/expertise/` at runtime:

```text
pi/multi-team/expertise/
  {agent}-expertise-log.jsonl
  {repo-id-slug}/
    repo-id.json
    {agent}-expertise-log.jsonl
```

- A log at the expertise root is the global layer for that agent.
- A log below a repo ID slug is project-local to that repository.
- `repo-id.json` records the identity used for a project-local directory. Repo identity derivation and drift handling are implemented in [`pi/lib/repo-id.ts`](../lib/repo-id.ts) and covered by [`pi/tests/repo-id.test.ts`](../tests/repo-id.test.ts).
- JSONL logs are generated local runtime state even though they are the durable source of truth. Do not commit them or replace them with curated instructions.

## Retrieval contract

[`pi/lib/memory-index.ts`](../lib/memory-index.ts) recursively ingests `*-expertise-log.jsonl` files, derives stable rows, and writes the disposable index and fingerprint under `~/.pi/agent/index/`. The index can be rebuilt from JSONL.

[`pi/lib/memory-retrieve.ts`](../lib/memory-retrieve.ts) provides bounded local retrieval:

- Results are scoped to the current repo and requested agent.
- Cross-repo retrieval admits only global records whose kind is `policy`.
- Superseded records are removed before ranking.
- A task query uses local hashed-vector similarity plus lexical overlap; an empty query uses recency.
- Result count and rendered token size are bounded.
- Retrieval is not exposed as an agent tool.

Canonical coverage is in [`pi/tests/memory-retrieve.test.ts`](../tests/memory-retrieve.test.ts).

Run the focused checks with pnpm:

```bash
cd pi && pnpm test memory-retrieve.test.ts
```

## Tool availability and durable guidance

`read_expertise` and `append_expertise` are intentionally unavailable. [`pi/extensions/agents-context.ts`](../extensions/agents-context.ts) removes them from active tools and blocks attempted calls.

Use these supported durable surfaces instead:

- `AGENTS.md` for repository or directory-scoped instructions.
- Pi skills for reusable workflows and domain guidance.
- Tracked source documentation for operator reference.

## Safety

- Never store credentials, private keys, tokens, `.env` contents, or other secrets in expertise JSONL or its derived index.
- Treat JSONL and index files as local runtime state. Do not stage or commit them.
- Treat the index, fingerprint, lock, and temporary files as disposable. JSONL is the only recovery source.
- Malformed JSONL records are skipped by ingestion. Repair the source record rather than editing the derived index.
- Keep retrieval local. The current implementation performs no provider or network calls.

## Snapshot retirement

Historical `*-mental-model.json`, `*-mental-model.state.json`, and YAML mental-model procedures are retired and are not runtime inputs. The retirement and archive policy are summarized in [`pi/extensions/README.md#snapshot-retirement`](../extensions/README.md#snapshot-retirement). Current behavior is defined by the JSONL index/retrieval implementation and the tests linked above.
