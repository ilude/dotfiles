# Onyx PRD Follow-up Issues (Codex)

Source reviewed: `.specs/onyx/prd.md`

## Issue 1: Auth hash vs encrypted config key (resolved)

**Problem**
- `gateway.auth.password_hash` implies one-way hash for login, but D7 also says sensitive fields in `onyx.json` are encrypted with a key derived from the gateway password and must decrypt on non-interactive startup.

**Goal**
- Keep password auth best practices while ensuring deterministic startup decryption behavior.

**Options**
1. Keep hashed password for auth + use separate app encryption key for config secrets.
2. Keep hashed password for auth + require startup unlock password (interactive/env) for decrypting config.
3. Remove encrypted-in-file credentials from MVP; use env/secret mounts, keep only password hash in config.

**Recommendation**
- Option 3 with a secret broker/store boundary for provider credentials.

**User decision (2026-02-16)**
- Resolved: keep password hashing strictly for authentication (`password_hash` only).
- Provider credentials are not encrypted/decrypted from `onyx.json` with a password-derived key.
- Provider credentials are stored outside `onyx.json` in a broker/store and referenced by ID.

**References**
- `.specs/onyx/prd.md:647`
- `.specs/onyx/prd.md:831`
- `.specs/onyx/prd.md:1642`

---

## Issue 2: OpenAI extension fields are shown as body fields but described as headers

**Problem**
- Chat request example places `x-onyx-*` in JSON body, while agent routing describes `x-onyx-agent-id` as header-based selection.

**Goal**
- Define one canonical transport for Onyx extensions to avoid incompatible clients.

**Options**
1. Header-only extension fields (preferred for compatibility cleanliness).
2. Body-only extension fields (simpler client SDK wrapping).
3. Support both with explicit precedence rules and validation warnings.

**Recommendation**
- Option 2 for strict API contract and simpler security semantics.

**User decision (2026-02-16)**
- Selected Option 2: header-only `x-onyx-*` extensions.
- Implementation intent: reject body-based `x-onyx-*` fields as invalid input; document custom-header requirement.

**References**
- `.specs/onyx/prd.md:597`
- `.specs/onyx/prd.md:669`

---

## Issue 3: Memory path conventions conflict (`daily/` vs `memory/`)

**Problem**
- D1 MinIO layout uses `{agent_id}/daily/YYYY-MM-DD.md`, but D11 memory write-back says append to `memory/YYYY-MM-DD.md`.

**Goal**
- Define one canonical path convention for daily logs across workspace and object storage.

**Options**
1. Standardize on `daily/` everywhere.
2. Standardize on `memory/` everywhere.
3. Keep both with explicit mapping rules (`workspace/memory/*` -> `minio/daily/*`).

**Recommendation**
- Option 2 to keep memory semantics consistent across runtime and workspace docs.

**User decision (2026-02-16)**
- Selected Option 2: standardize on `memory/` everywhere.
- Implementation intent: update D1 MinIO path examples and any daily-log references to `memory/YYYY-MM-DD.md`.

**References**
- `.specs/onyx/prd.md:86`
- `.specs/onyx/prd.md:1325`
- `.specs/onyx/prd.md:1660`

---

## Issue 4: Tool naming inconsistencies across sections

**Problem**
- D8 lists `memory_get`, `runtime.exec`, and `fs` tools (`read/write/edit`), while D9 examples reference `memory_read` and `shell_exec`.

**Goal**
- Prevent runtime/tool-schema drift and invalid allow/deny rules.

**Options**
1. Define canonical IDs in one source-of-truth table and update all sections.
2. Keep aliases and map old names to canonical names.
3. Namespace all tools (e.g., `memory.search`, `runtime.exec`) and deprecate legacy names.

**Recommendation**
- Option 2 for strict consistency: one canonical tool ID per capability, no aliases.

**User decision (2026-02-16)**
- Selected Option 2: canonical IDs only, no alias compatibility layer.
- Implementation intent: update all legacy/older config and example references to canonical tool names.

**References**
- `.specs/onyx/prd.md:857`
- `.specs/onyx/prd.md:861`
- `.specs/onyx/prd.md:1597`
- `.specs/onyx/prd.md:1598`

---

## Issue 5: Bot plugin scope is marked post-MVP but startup examples imply MVP enablement

**Problem**
- D3 says no production bot plugins in MVP, but plugin loading examples show Discord/Telegram enabled and file structure includes plugin implementations.

**Goal**
- Make MVP scope testable: interfaces-only vs runnable bot integrations.

**Options**
1. MVP includes only `PluginProtocol` + test stub plugin; no Discord/Telegram runtime wiring.
2. MVP includes disabled-by-default Discord/Telegram behind feature flags.
3. MVP includes full Discord/Telegram beta support with explicit non-production disclaimer.

**Recommendation**
- Option 1 to preserve scope discipline; move concrete bot configs/examples to Phase 2 section.

**User decision (2026-02-16)**
- Selected Option 1: MVP includes only `PluginProtocol` + test stub.
- Implementation intent: remove/relocate Discord/Telegram enablement examples from MVP sections to Phase 2.

**References**
- `.specs/onyx/prd.md:272`
- `.specs/onyx/prd.md:346`
- `.specs/onyx/prd.md:1935`

---

## Issue 6: menos integration phase boundaries are unclear in tool/system sections

**Problem**
- D2 describes direct Onyx->menos querying, while D8 marks `menos` tools as post-MVP. MVP behavior is unclear (internal integration vs exposed tools).

**Goal**
- Define whether MVP can call menos at all, and through which interfaces.

**Options**
1. No menos calls in MVP (hard Phase 2 boundary).
2. MVP internal server-side menos retrieval only (no user-visible `menos_*` tools).
3. MVP exposes read-only `menos_search`; defer ingest to Phase 2.

**Recommendation**
- Option 2 to validate integration architecture early while keeping `menos_*` tools out of MVP surface.

**User decision (2026-02-16)**
- Selected Option 2: MVP allows internal server-side menos retrieval only.
- Implementation intent: no user-visible `menos_*` tools in MVP; keep exposed menos tooling in Phase 2.

**References**
- `.specs/onyx/prd.md:205`
- `.specs/onyx/prd.md:243`
- `.specs/onyx/prd.md:863`
- `.specs/onyx/prd.md:1937`

---

## Issue 7: Heartbeat MVP says log-only/no gatherers, but notification model assumes channel delivery

**Problem**
- MVP scope says no external gatherers and log-only mode, but heartbeat sections specify notify channel/fallback behavior and priority filtering that depend on integrations/plugins.

**Goal**
- Clarify what heartbeat actually does in MVP and what must be deferred.

**Options**
1. MVP heartbeat runs internal checks only and writes audit logs (no outbound notify path).
2. MVP heartbeat can notify only in web UI session (local notification center), no external channels.
3. MVP heartbeat includes one real channel integration (e.g., web + email) as thin vertical slice.

**Recommendation**
- Option 2 for visible user value without full plugin dependency.

**User decision (2026-02-16)**
- Selected Option 2: MVP heartbeat delivers notifications in the web UI notification center only.
- Implementation intent: keep external channels/integration-based delivery out of MVP; retain log/audit behavior.

**References**
- `.specs/onyx/prd.md:1469`
- `.specs/onyx/prd.md:1504`
- `.specs/onyx/prd.md:1553`

---

## Issue 8: FTS startup behavior is ambiguous (`fail fast` vs `disable BM25 with warning`)

**Problem**
- D1 allows two different startup behaviors when FTS index is missing.

**Goal**
- Make startup behavior deterministic for operations and testing.

**Options**
1. Hard fail startup if FTS missing.
2. Start in degraded mode (vector-only) with explicit health status + warning.
3. Configurable mode (`strict` vs `degraded`) with strict default in production.

**Recommendation**
- Option 1 for deterministic correctness: treat missing FTS/BM25 as a startup bug and fail fast.

**User decision (2026-02-16)**
- Selected Option 1: hard fail startup if FTS/BM25 is unavailable.
- Implementation intent: SurrealDB + required search capabilities are mandatory for MVP; missing index/capability is a fix-forward bug, not a degradable runtime mode.

**References**
- `.specs/onyx/prd.md:148`

---

## Issue 9: External-service credentials must be inaccessible to models

**Problem**
- Current PRD discusses encrypted config and provider setup, but does not define a hard boundary that models never receive raw credentials (directly or through tool output/logs/errors).

**Goal**
- Ensure credentials for external services are usable by runtime/tool executors while remaining inaccessible to LLM context, tool transcripts, and UI surfaces.

**Options**
1. **Secret broker boundary (recommended)**
   - Store secrets outside model context in a dedicated secret manager or mounted secret files.
   - Tool runtime receives only opaque handles/capabilities; broker injects credentials server-side at execution time.
   - Tool results are redacted before persistence/streaming.
2. **Encrypted config + runtime decrypt**
   - Keep encrypted credentials in `onyx.json`; decrypt only in provider/tool process memory.
   - Strong output redaction + strict no-echo rules required.
3. **Env-only credentials**
   - Keep secrets in environment/compose secrets; never expose in tool schemas/results.
   - Simpler, but weaker lifecycle/rotation/auditing unless supplemented.

**Recommendation**
- Option 1 for strongest model-isolation guarantee and clearer audit boundaries.

**User decision (2026-02-16)**
- Selected Option 1: secret broker boundary for credential isolation.
- Implementation intent: model-facing runtime does not receive raw secrets; broker injects credentials only at execution boundary; outputs/logs/transcripts must be redacted.

**Research notes**
- Centralize secret management and avoid plaintext in code/config; apply least privilege object-level controls.
  - `C:\Users\Mike\.local\share\opencode\tool-output\tool_c69659cdc001VbKS7rbYvPVQgt:387`
  - `C:\Users\Mike\.local\share\opencode\tool-output\tool_c69659cdc001VbKS7rbYvPVQgt:414`
- Use short-lived, scoped credentials and prevent leakage in CI/CD logs/output.
  - `C:\Users\Mike\.local\share\opencode\tool-output\tool_c69659cdc001VbKS7rbYvPVQgt:611`
  - `C:\Users\Mike\.local\share\opencode\tool-output\tool_c69659cdc001VbKS7rbYvPVQgt:643`
- Prefer secret injection patterns (sidecar/shared in-memory volume) over app-embedded creds.
  - `C:\Users\Mike\.local\share\opencode\tool-output\tool_c69659cdc001VbKS7rbYvPVQgt:439`
- Kubernetes guidance: enable encryption at rest, RBAC least privilege, restrict access by container, consider external secret stores; base64 is not protection.
  - `C:\Users\Mike\.local\share\opencode\tool-output\tool_c69659c7d001nss5asBTPkjl0Q:870`
  - `C:\Users\Mike\.local\share\opencode\tool-output\tool_c69659c7d001nss5asBTPkjl0Q:1118`

---

## Issue 10: Ansible piggyback model needs explicit near-term vs long-term topology

**Problem**
- PRD now states Onyx piggybacks on `menos/infra/ansible`, but deployment coupling level is still ambiguous for MVP vs long-term platform convergence.

**Goal**
- Keep MVP deployment low-risk and independently operable while preserving a clear path to absorb menos into Onyx later.

**Options**
1. **Two compose projects now, planned convergence later**
   - Run Onyx as separate compose project/container set on same host/shared infra.
   - Define phased migration to unify stacks later.
2. **Immediate merge into one compose project**
   - Add Onyx directly into current menos compose/deploy as one project now.
3. **Permanent split**
   - Keep Onyx and menos permanently separate projects.

**Recommendation**
- Option 1 for safe MVP rollout with explicit future absorption path.

**User decision (2026-02-16)**
- Selected Option 1: separate Onyx compose project in MVP, with planned phased absorption of menos into Onyx.
- Implementation intent: shared host/infra is allowed; deployment lifecycle remains independent in MVP.

**References**
- `.specs/onyx/prd.md:919`
- `.specs/onyx/prd.md:956`
- `menos/infra/ansible/inventory/hosts.yml:8`
- `menos/infra/ansible/playbooks/deploy.yml:133`
- `menos/infra/ansible/playbooks/deploy.yml:174`
