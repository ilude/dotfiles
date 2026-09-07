# Legacy parity matrix

| Contract | Default implementation | Evidence |
| --- | --- | --- |
| `/refresh-models [provider]` parsing and case-insensitive provider resolution | Direct port in `extensions/refresh-models.ts` | `refresh-models.test.ts` |
| Refresh all configured OAuth/API-key providers; skip unsupported providers; isolate failures | Direct port | Ported command tests and source comparison |
| Codex authenticated `/codex/models` request, account claim, fallback client versions, visibility fields, reasoning metadata | Direct port | Ported parser/request tests |
| Anthropic authenticated `/v1/models` request and capability metadata | Direct port | Anthropic request test |
| OpenRouter/OpenCode/OpenCode Go bearer-authenticated model endpoints | Direct port | Generic provider test |
| Never publish an empty refreshed catalog | Direct port guards | Source comparison |
| Preserve known Pi metadata and compose discovered IDs with legacy defaults | Direct port | Versioned and legacy cache tests |
| Persist schema-v2 generated catalogs without credentials | Direct port plus `/model-cache/` ignore | Cache tests and source inspection |
| Rebuild `enabledModels`, preserve unrelated settings, use atomic locked writes | Direct port of settings helper and scope synchronization | Scope/settings tests |
| Progress, per-provider summaries, additions/removals, conditional reload | Direct port | Command tests |
| Bedrock refresh | Compatibility adaptation: both configured Bedrock provider names resolve to the default profile's existing native `bedrock-mantle` authenticated discovery and persistence path. The legacy AWS CLI/settings inventory path is not duplicated. | Native delegation test; existing Bedrock provider tests |
| Visibility provider set and exact/prefix/regex/snapshot/preview policy | Policy copied unchanged | Ported visibility tests and source comparison |
| One registry read, concurrent credential resolution, target registration order, no empty provider registration | Direct port | Visibility startup test |
| Startup lifecycle and notification | Direct `session_start` registration with equivalent prefixed notification | Visibility startup test and real-loader smoke |
| Legacy profile remains unchanged | No edits under `pi/profiles/legacy/` | Final diff/status review |
