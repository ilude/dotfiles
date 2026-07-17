# Pi Runtime Capability Report

## Scope and evidence

**Verified:** this report inspected the installed `@earendil-works/pi-coding-agent` 0.80.7 package, its declarations and bundled implementation, the linked packages under `pi/node_modules`, the safe CLI listing commands, and the repository extensions, agents, skills, prompts, settings, and relevant tests. `pi --list-models` returned the current runtime catalog; its columns were provider, model, context, max-out, thinking, and images.

**Important boundary:** upstream Pi has no native `agents/*.md` persona format or subagent launcher. Those are repository-owned features implemented by `pi/extensions/subagent/`. Therefore, upstream resource discovery can replace duplicated discovery prose, but it cannot by itself replace this repository's agent taxonomy or model-size heuristic.

## 1. Model and provider discovery

### Runtime registry

**Verified.** Extension handlers receive `ctx.modelRegistry` and `ctx.model` (`ExtensionContext` in `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:184-188`). The coding-agent `ModelRegistry` exposes:

- `getAll(): Model<Api>[]` - all known built-in, configured, and extension-registered entries.
- `getAvailable(): Model<Api>[]` - entries with configured authentication.
- `find(provider, modelId)` - exact lookup.
- `getProviderAuthStatus(provider)`, `getProviderDisplayName(provider)`, and `isUsingOAuth(model)`.
- `registerProvider()` and `unregisterProvider()`.

Source: `node_modules/@earendil-works/pi-coding-agent/dist/core/model-registry.d.ts:42-110`.

`pi --list-models` is the supported CLI readout. It demonstrated that this process currently knows models from Amazon Bedrock, OpenAI Codex, OpenCode, and OpenRouter. The command lists catalog entries, not an abstract small/medium/large ranking.

At the lower package layer, `Models` exposes `getProviders()`, `getProvider()`, `getModels(provider?)`, `getModel()`, and `refresh(provider?)`. Dynamic providers may expose `refreshModels()`. Source: `node_modules/@earendil-works/pi-ai/dist/models.d.ts:12-94`.

### Per-model metadata

**Verified.** `Model<TApi>` carries `id`, `name`, `api`, `provider`, `baseUrl`, `reasoning`, `thinkingLevelMap`, `input`, `cost`, `contextWindow`, `maxTokens`, optional `headers`, and API-specific `compat`. Source: `node_modules/@earendil-works/pi-ai/dist/types.d.ts:600-618`.

Consequences:

- Context capacity: `contextWindow`.
- Output capacity: `maxTokens`.
- Thinking support: boolean `reasoning`; supported/clamped levels are expressed by `thinkingLevelMap`, including `null` for unsupported levels.
- Multimodal capability: `input` is `text` and optionally `image`.
- Cost: per-million-token input/output/cache rates plus optional `cost.tiers`, each selected by input-token threshold. Source: `types.d.ts:586-598`.

**Not present:** a standardized semantic `costTier`, quality tier, coding capability, delegation capability, or agent-role field. The existing repository `small`, `medium`, `large`, `core`, and `max` labels are routing policy, not upstream model metadata.

### Extension registration

**Verified.** `pi.registerProvider(name, config)` can add or override providers. Its `models` entries must supply explicit model metadata, including reasoning support, input types, costs, context window, and max output. Calls in an async extension factory complete before startup, so discovered models are visible to `pi --list-models`. Sources: `docs/extensions.md` section "pi.registerProvider"; `dist/core/extensions/types.d.ts:982-1050`; `docs/custom-provider.md` sections "Register New Provider" and "Model Definition Reference".

Repository use already follows this surface: `pi/extensions/refresh-models.ts:20-67` defines a catalog model shape, fetches provider catalogs, and registers refreshed entries; `pi/extensions/model-visibility.ts:5-31` filters the registry-derived catalog.

## 2. Agent definitions and subagent model resolution

### What Pi parses

**Verified.** Upstream Pi treats `AGENTS.md` as instruction context, not as agent definitions. The repository's parser is `pi/extensions/subagent/agents.ts:92-153`.

It requires non-empty string `name` and `description`; otherwise the file is skipped. It reads only:

| Field | Parser behavior |
| --- | --- |
| `name`, `description` | Required strings. |
| `tools` | Only a comma-separated string is accepted. A YAML list is ignored. |
| `model` | Non-empty string. |
| `isolation` | Only `none` or `worktree`; retained but not used by the launcher. |
| `memory` | Only `user`, `project`, or `session`; retained but not used by the launcher. |
| `effort` | Only Pi thinking values `off` through `max`. |
| `skills` | Array of non-empty strings. |
| `roleType` | Only `orchestrator`, `lead`, `worker`, `specialist`, or `tier`. |

All other frontmatter is neither rejected nor passed through. It is discarded when `AgentConfig` is built. This includes current `reportsTo`, `routingUse`, and `leads` fields in `pi/agents/*.md`, for example `pi/agents/orchestrator.md:6-7` and `pi/agents/backend-dev.md:6-7`.

This is a repository parser, not an upstream schema. The current repository test confirms the parsing and local role policy, but does not exercise Pi: `pi/tests/agent-role-semantics.test.ts:30-102`.

### Discovery and override precedence

**Verified.** `discoverAgents()` loads user agents from `<agentDir>/agents`, finds the nearest ancestor `.pi/agents`, and creates a map where project entries overwrite user entries with the same name. Source: `pi/extensions/subagent/agents.ts:174-215`.

`subagent` model selection precedence is:

1. The tool call's exact `model` value.
2. A `modelSize` plus `modelPolicy` resolution against `ctx.modelRegistry.getAvailable()` and the current model.
3. The selected agent's frontmatter `model`.
4. The spawned Pi process's ordinary default selection when the agent has no model.

Sources: `pi/extensions/subagent/index.ts:552-607` and `:664-682`; `pi/lib/model-routing.ts:235-264`; test proof in `pi/tests/subagent.test.ts:397-522`.

The launcher passes the resolved/pinned value as `--model`, agent effort as `--thinking`, tools as `--tools`, disables ordinary skill discovery with `--no-skills`, and passes each resolved agent skill explicitly with `--skill`. Source: `pi/extensions/subagent/index.ts:391-405`.

**Inference, supported by the implementation:** a capability-based router can use the registry's actual metadata, then pass the selected exact model through `subagent.model`. It cannot request a native abstract quality tier from Pi; the current `modelSize` behavior is repository-owned name scoring and hardcoded Codex preferences in `pi/lib/model-routing.ts:25-40` and `:235-264`.

## 3. Skills and prompt templates

### Skills

**Verified.** Pi discovers skills from global and trusted project locations, configured paths, packages, and explicit `--skill` paths. The authoritative locations and trust rule are in `node_modules/@earendil-works/pi-coding-agent/docs/skills.md` sections "Locations" and "How Skills Work".

At startup Pi adds each available skill's name, description, and file location to the system prompt. Full instructions are not automatically inserted; the model is instructed to use `read` for the matching `SKILL.md`. `/skill:<name>` forces expansion and appends invocation arguments as `User: <args>`. Source: `docs/skills.md`; `dist/core/skills.js:248-276` (`formatSkillsForPrompt`).

Pi enforces only a small structure contract:

- Missing/blank `description`: the skill is not loaded.
- Invalid or too-long `name`, and an overlong description: warnings, but the skill still loads when description exists.
- Unknown frontmatter: ignored.
- `disable-model-invocation: true`: omitted from the system prompt but still callable with `/skill:name`.

Sources: `dist/core/skills.js:33-63`, `:208-243`; `docs/skills.md` section "Validation".

Duplicate skill names produce diagnostics and retain the first loaded entry, rather than failing. Source: `dist/core/skills.js:299-384`.

The repository also has `pi/lib/skill-discovery.ts`, a separate permissive discovery mechanism for its own subagent/workflow layer. It preserves unknown frontmatter in `metadata` and implements a different last-wins precedence. Source: `pi/lib/skill-discovery.ts:127-165`, `:260-310`; tests: `pi/tests/skill-discovery.test.ts:61-238`. It should not be described as Pi enforcement.

### Prompt templates

**Verified.** Pi loads global and trusted project `prompts/*.md`, packages, settings paths, and repeatable `--prompt-template` paths. Discovery is non-recursive for a prompts directory. A filename becomes `/name`; frontmatter `description` and `argument-hint` are optional. Sources: `docs/prompt-templates.md`; `dist/core/prompt-templates.js:81-217`.

Template expansion supports `$1`, `$2`, `$@`/`$ARGUMENTS`, defaults `${1:-default}`, and slices. Arguments are shell-style parsed; substitutions are non-recursive. Source: `dist/core/prompt-templates.d.ts:14-30` and `docs/prompt-templates.md` section "Arguments".

Dispatch order is extension command, `input` event, skill command expansion, prompt-template expansion, then agent processing. Source: `docs/extensions.md` section "Input Events". Thus an extension command takes precedence over a prompt with the same invocation.

## 4. Context files

### Upstream behavior

**Verified.** `loadProjectContextFiles()` first loads one global instruction file from the agent directory, then walks from the current working directory to filesystem root and prepends each ancestor result. The final order is global, outer ancestor, ..., nearest/current directory. Source: `node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js:30-72`.

For each directory, Pi selects the first existing file in this order:

1. `AGENTS.md`
2. `AGENTS.MD`
3. `CLAUDE.md`
4. `CLAUDE.MD`

It selects at most one per directory. Therefore `AGENTS.md` wins over `CLAUDE.md` in the same directory. There is no upstream per-file byte or aggregate truncation in this loader; it uses `readFileSync(..., "utf-8")` in full. `--no-context-files` disables this resource. Sources: `resource-loader.js:30-72`; `dist/core/resource-loader.d.ts:76-95`.

### Repository extension behavior

**Verified.** `pi/extensions/agents-context.ts` augments and changes this behavior. It recognizes `AGENTS.override.md`, `AGENT.md`, `.pi/AGENTS.md`, and `.claude/CLAUDE.md`, scopes ancestors to a Git root, accepts `@relative-file` imports, and applies caps of 32 files, 24 KiB per file, 96 KiB total, and depth 3. Sources: `pi/extensions/agents-context.ts:11-41`, `:202-230`, `:313-356`.

This extension records native Pi-loaded context through `before_agent_start`, so its extra injection avoids duplicating paths Pi already loaded. Source: `pi/extensions/agents-context.ts:371-402`, `:500-535`.

## 5. Extension API suitable for capability routing

**Verified.** The primary routing hooks are:

- `resources_discover` - add skill, prompt, and theme paths.
- `input` - inspect, transform, or handle raw user input before skills/templates expand.
- `before_agent_start` - inspect loaded tools, skills, and context files and replace/append system prompt.
- `context` - modify the message list before every provider request.
- `model_select` and `thinking_level_select` - observe selection changes.
- `before_provider_headers`, `before_provider_request`, `after_provider_response` - inspect or alter provider transport.
- `tool_call` - mutate input or block execution; `tool_result` - modify results.
- `session_start`, `session_shutdown`, and `agent_settled` - initialize, clean up, and act after automatic retries/compaction settle.

All are declared in `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:839-996`; lifecycle ordering is documented in `docs/extensions.md` sections "Events" and "Input Events".

There is no upstream `before_subagent_spawn` hook because subagents are not an upstream feature. The repository can intercept its own subagent tool with `tool_call`, or replace/extend `pi/extensions/subagent/index.ts`.

Capability inventory APIs already available to extensions:

- `ctx.modelRegistry.getAll()`, `getAvailable()`, and `find()`.
- `ctx.model` and `pi.setModel(model)`.
- `pi.getAllTools()`, `pi.getActiveTools()`, and `pi.setActiveTools()`.
- `pi.getCommands()` with command source/provenance.
- `pi.registerTool()`, `registerCommand()`, `registerProvider()`, and `unregisterProvider()`.
- `before_agent_start.systemPromptOptions`, which contains loaded context files, skills, selected tools, snippets, and guidelines.

Sources: `dist/core/extensions/types.d.ts:184-213`, `:839-1050`; `docs/extensions.md` sections "ExtensionAPI Methods" and "before_agent_start".

## 6. Validation and enforcement boundaries

### Enforced or diagnosed by Pi

| Surface | Behavior |
| --- | --- |
| `models.json` | TypeBox schema validation; invalid configuration falls back to built-ins and stores an error. Additional provider/model consistency checks reject invalid endpoint/API/context/output combinations. |
| Settings JSON | JSON parsing and migration only. No schema rejects unknown keys or validates the declared `Settings` TypeScript shape at load time. Parse errors are retained as `SettingsError` and settings fall back to `{}` for that scope. |
| Skills | Missing description prevents load; format violations and collisions are diagnostics. |
| Prompt templates | Unreadable files are skipped; frontmatter is permissive; duplicate command names are collision diagnostics at resource-loader level. |
| Extensions | Loaded by jiti; a missing default factory or a thrown factory/import error becomes a `LoadExtensionsResult.errors` entry while other extensions continue. Runtime handler errors are logged; `tool_call` handler errors fail-safe block the tool. |
| Project resources | Project settings/resources/extensions depend on project trust; `--approve` and `--no-approve` are one-run overrides. |

Sources: `dist/core/model-registry.js:376-469`; `dist/core/settings-manager.js:176-244`; `dist/core/skills.js:208-243`; `dist/core/resource-loader.js:701-723`; `dist/core/extensions/loader.js:301-362`; `docs/settings.md` section "Project Trust"; `docs/extensions.md` section "Error Handling".

### Repository checks that are separate from Pi

- `pi/tests/agent-role-semantics.test.ts:30-102` validates the repository's custom agent parser, frontmatter conventions, role tool policy, and tier personas. Pi does not do this.
- `pi/tests/skill-discovery.test.ts:1-238` validates the repository's second discovery system, not Pi's loader.
- `pi/tests/hook-schema.test.ts:8-118` validates a repository hook-config schema with only six selected event names. Pi exposes a substantially larger event union.
- `pi/tests/runtime-smoke.test.ts:30-96` rechecks extension-directory layout and a textual default-export convention. Pi does load top-level `.ts` files, but upstream validates the loaded factory at runtime rather than this exact source-text test.
- `pi/tests/workflow-prompts.test.ts:41-123` checks literal workflow prose. Pi does not validate plan tables, named reviewers, telemetry fields, task IDs, or this repository's routing policy.

## Prose that duplicates runtime capability

The list is intentionally narrow. "Replace" means the prose can name the required capability and use runtime discovery. "Keep" means the upstream runtime does not supply the stated policy, so removing it would change behavior.

| Repository statement or assertion | Runtime capability | Rationalization |
| --- | --- | --- |
| `pi/README.md:225,234` says extensions are auto-discovered from the agent extensions directory. | Pi auto-discovers global/project extensions and reports failed loads. `docs/extensions.md` "Extension Locations"; `dist/core/extensions/loader.js:301-362`. | **Replace:** do not repeat discovery mechanics in workflow prompts. Require an extension capability or use `pi.getAllTools()` / `pi.getCommands()`. Keep installation documentation if it is user-facing. |
| `pi/README.md:668-679` explains that skills are discovered and must be read to activate. | Pi exposes discovered names/descriptions in the system prompt, supplies locations, supports `/skill:name`, and parameterizes its invocation. `docs/skills.md`; `dist/core/skills.js:248-276`. | **Replace:** prompts should say to use an applicable available skill, not enumerate skill packages or repeat the read protocol. |
| `pi/extensions/pi-instructions.ts:10-14` says global/project `AGENTS.md` context is already present. | Core Pi loads the global instruction file plus ancestor context files, with `AGENTS` precedence over `CLAUDE`. `dist/core/resource-loader.js:30-72`. | **Replace:** do not restate this loading guarantee in additional prompt prose. Retain only Pi-specific instructions that core context loading cannot provide. |
| `pi/extensions/agents-context.ts:11-19` repeats baseline AGENTS/CLAUDE filename selection. | Core Pi already handles `AGENTS.md`, `AGENTS.MD`, `CLAUDE.md`, and `CLAUDE.MD`. `dist/core/resource-loader.js:30-46`. | **Keep selectively:** the extension is still needed for `AGENTS.override.md`, `AGENT.md`, `.pi/AGENTS.md`, imports, Git-root scoping, and caps. Remove or avoid describing the four baseline names as an extension-only capability. |
| `pi/tests/runtime-smoke.test.ts:5-8,73-96` asserts top-level extension auto-discovery and a default factory. | Pi's loader discovers paths and rejects a non-function default export while collecting the error. `dist/core/extensions/loader.js:301-362`. | **Keep only as repository layout regression protection:** it is not independent harness validation. Do not treat it as proof that extensions loaded successfully; a focused runtime load is the actual contract check. |
| `pi/tests/hook-schema.test.ts:10-20` asserts only six "documented runtime events." | `ExtensionAPI` declares lifecycle, resource, model, provider, tool, message, input, and session events. `dist/core/extensions/types.d.ts:839-996`. | **Replace:** derive or centrally mirror the upstream event union when a repository schema needs it. The current six-name list duplicates an incomplete runtime catalog. |
| `pi/skills/workflow/review-it.md:30-43` requires discovery of tools, commands, models, and routing before composition. | `ctx.modelRegistry`, `pi.getAllTools()`, `pi.getCommands()`, `before_agent_start.systemPromptOptions`, and model/tool registration APIs expose these inputs. `dist/core/extensions/types.d.ts:184-213,919-1050`. | **Keep the outcome, simplify the prose:** say the review launcher must inspect those runtime inventories. Do not prescribe a provider/model ladder. This workflow already correctly avoids fixed names. |
| `pi/skills/workflow/plan-it.md:43-52` requires every task to name a Model and Agent and maps scope to small/medium/large. | Pi can enumerate actual models and their context, thinking, input, and cost metadata, but it has no native task model tier or agent roster. `Model` in `pi-ai/dist/types.d.ts:600-618`; upstream has no agent definition feature. | **Keep policy, change representation:** require a capability profile and optional resolved model/worker at execution. Do not claim `small`/`medium`/`large` is a Pi capability or require a fixed agent name in a plan. |
| `pi/skills/workflow/do-it.md:28-37,58` hardcodes specialist names and tells execution to use the plan's assignments. | The repository subagent tool can discover its current user/project agents and resolve a requested model against the available registry. `pi/extensions/subagent/agents.ts:174-215`; `subagent/index.ts:552-607`. | **Replace fixed names:** state required domain, tool permissions, and write/review constraints; resolve a matching current agent only where this repository's extension is available. This remains repository functionality, not upstream Pi. |
| `pi/PI-INSTRUCTIONS.md:9` and `pi/README.md:622-624` hardcode particular model identities and effort levels as delegation gates. | Pi exposes available models and thinking support, and extensions can select models, but it does not provide a trustworthy "delegation-quality" capability or a named-tier ladder. `ModelRegistry.getAvailable()` and `Model.thinkingLevelMap`. | **Keep a policy but remove identities:** require a currently available model with the needed context/thinking/tool capability. The exact named-model rules are configuration policy, not runtime enforcement. |
| `pi/skills/workflow/do-it.md:125` names hidden review personas. | Pi has no native reviewer-persona registry. The only discoverable roster here is the repository's custom subagent directory. | **Keep or redesign:** this is not duplicated by Pi. To make it portable, specify independent review capabilities and use repository discovery when present. |
