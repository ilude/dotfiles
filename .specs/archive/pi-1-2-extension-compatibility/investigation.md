# Pi 1.2.0 compatibility investigation

Investigated 2026-10-13 in `C:/Users/mglenn/.dotfiles`, branch `main`, HEAD `eca70a6d` at the baseline check. Active planning profile: `pi/profiles/default/`. No legacy files were read or tested. No implementation changes were made during this planning investigation.

## Provider correction

The earlier explanation that Pi 1.2.0 exposes subscription models only under `openai-codex` was incorrect. Installed source establishes two distinct supported providers:

- `pi/profiles/default/node_modules/@earendil-works/pi-ai/dist/providers/openai.js`: `openai` supports `OPENAI_API_KEY` and native ChatGPT subscription OAuth; chat uses `openai-responses`. Classifiers use `openai-decisions`, and OAuth filters classifiers out because subscription credentials cannot access Decisions.
- `.../dist/providers/openai-codex.js`: `openai-codex` is named `OpenAI Codex (legacy)`, supports its own subscription OAuth flow, and uses `openai-codex-responses` against the ChatGPT backend.
- `.../dist/auth/oauth/openai-chatgpt.js` and `openai-codex.js` expose distinct login and refresh implementations. Credentials must not be copied or relabeled between them.
- The active profile's credential metadata lists `openai-codex: oauth` and `anthropic: oauth`, not `openai`. Only provider names and credential types were inspected, not secret values.

The startup correction already made in this conversation sets `defaultProvider` and Sol's scope entry to `openai-codex`. Earlier checks verified native and wrapped launches on Sol 6.1/low, and a native authenticated minimal request returned `OK`. The native agent junction was repaired to point to default without changing legacy contents. These earlier checks prove the legacy route works, not that native `openai` OAuth was repaired.

Repository guidance still prefers native `openai` OAuth. Restoring native login and adding legacy compatibility are different workflows. This investigation does not authorize choosing a different workflow silently.

## Confirmed extension API change

Installed `pi-coding-agent/CHANGELOG.md`, 1.2.0 section, and `docs/extensions.md` establish:

- `BeforeAgentStartEvent` is discriminated by `messageType`.
- User runs carry `prompt` and `images`; custom runs carry `message`, not `prompt`.
- Custom-message runs triggered by `sendMessage(..., { triggerTurn: true })` now execute these handlers too.
- Startup counts as busy, including `before_agent_start`; `sendUserMessage` while busy needs explicit delivery semantics.

`extensions/herdr-orchestrator-label.ts:121-125` reads `event.prompt` and consumes the first-prompt state without discriminating user/custom. A custom run can therefore consume the naming opportunity before a real user prompt.

Other production handlers inspected in `extensions/subagents.ts`, `extensions/subagent-child.ts`, `lib/subagents/successor-surface.ts`, and `extensions/session-launch.ts` operate on shared system-prompt fields. They should continue applying their existing context to both event kinds, not receive a blanket user-only guard.

Inspected scheduler and plans deliveries already specify `followUp`. Subagent custom outcomes already specify steer/follow-up behavior. The current HEAD includes the separately completed headless parent-response queuing correction. No additional busy-delivery defect was established here.

## Conditional provider work, not confirmed native API failures

These sites intentionally target native OpenAI today. They become compatibility work only if supporting the current legacy login is selected:

- `lib/model-selection.ts`: family resolvers and preference ladder use `openai`. Consumed by shortcuts, subagent model selection, commit review, Damage Control, web/browser screening, and tab naming.
- `extensions/resume-latest-model.ts`: unconditionally maps saved `openai-codex` provider identity to `openai` before family lookup. This assumes native migration; it does not support continued legacy routing.
- `extensions/refresh-models.ts`: refresh supports native `openai` through `modelRegistry.refresh`; curated scope excludes `openai-codex`. Refresh can remove the working legacy Sol scope entry. Supporting legacy requires a deliberate contract for both scope and refresh.
- `extensions/model-visibility.ts`: filters native OpenAI while preserving native auth/API descriptors and non-chat operations. Equivalent legacy support must not replace a provider with a generic OpenAI API-key definition.
- `lib/codex-usage.ts`: quota auth already accepts native OAuth, legacy OAuth, and the existing Codex CLI token fallback; do not rewrite this as missing legacy support. Cache observations currently record only `openai` messages.
- `lib/herdr-tab-naming.ts`: diagnostic/default provider label is native, but actual calls use the shared model selector.
- `lib/damage-control/judge.ts`: diagnostic provider comes from fixed policy settings; compatibility work must report actual selected provider accurately without weakening policy.

Not every `openai` reference is a migration target. `extensions/codex-daybreak-retry.ts` explicitly matches native `openai-responses` errors. `extensions/operator-footer.ts` already displays an unknown provider literally, including `openai-codex`. Neither establishes a defect needing provider replacement. Native classifier routing must remain intact.

The prior startup probes reported 42 unmatched scope warnings, mostly `openai` models lacking this profile's native login. Those warnings do not establish that all those model IDs are stale. Do not delete or rename the whole scope based on that count.

## Baseline checks

Run on 2026-10-13 with the default profile linked to installed Pi 1.2.0:

- `cd pi/profiles/default && pnpm run typecheck`: FAIL, exactly three errors:
  - `extensions/herdr-orchestrator-label.ts:125`: `prompt` absent on custom event.
  - `tests/fixtures/plan-closeout-provider.ts:40`: same unguarded access.
  - `tests/session-launch.test.ts:96`: user event fixture missing `messageType`.
- `cd pi/profiles/default && pnpm test model-selection.test.ts model-shortcuts.test.ts resume-latest-model.test.ts refresh-models.test.ts herdr-orchestrator-label.test.ts --maxWorkers=4`: PASS, 5 files, 69 tests.

Passing suites encode native-provider fixtures; they do not prove operation with only legacy credentials. No full extension audit, full suite, native OAuth login, or live native-provider request was performed during this investigation.

## Preservation

At the end of investigation, Git status showed only `pi/profiles/default/settings.json` modified, holding the earlier working startup repair. Recheck on execution because other Pi instances are working in this checkout. Preserve that repair until native login and selection are actually established or legacy compatibility is chosen.
