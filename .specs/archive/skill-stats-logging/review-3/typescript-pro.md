# TypeScript API contract review

## Finding 1 — high

**Evidence:** The plan assumes `before_agent_start` + `event.systemPromptOptions.skills` observes “future explicit skill expansions” and emits one event per loaded skill. The installed API type only says `systemPromptOptions.skills?: Skill[]` are “Pre-loaded skills” used to build the system prompt (`pi/extensions/node_modules/@mariozechner/pi-coding-agent/dist/core/system-prompt.d.ts`). The repo-owned `pi/extensions/skill-loader.ts` explicit skill commands instead call `pi.sendUserMessage(renderSkillBody(...))`; they do not populate `systemPromptOptions.skills`. So explicit `/skill-name` loads may never appear in `before_agent_start.systemPromptOptions.skills`.

**Required fix:** Before T4, prove the event shape with an executable control/smoke, or instrument the actual repo-owned skill command path in `skill-loader.ts` to append the structured event at command execution time. Do not mark forward logging complete solely from the `before_agent_start` type existing.

## Finding 2 — high

**Evidence:** `Skill` includes `filePath` and `baseDir` (`skills.d.ts`), while the plan’s allowed `skill-load` payload forbids raw absolute paths. If implementation serializes `event.systemPromptOptions.skills` directly or spreads a `Skill`, it will persist private paths and fail the redaction contract.

**Required fix:** Require a narrow mapper with an explicit return type, e.g. `{ schemaVersion: 1, skill, source, timestamp, skillPathLabel? }`, and tests asserting `filePath`, `baseDir`, `description`, and raw content/path fields are absent from `appendEntry` payloads.

## Finding 3 — medium

**Evidence:** `pi.appendEntry<T = unknown>(customType: string, data?: T): void` is typed synchronously in the installed extension API, but the plan describes durable persistence as if success can be inferred immediately. There is no typed return value or entry id to assert persistence from the handler.

**Required fix:** The smoke test must verify the resulting JSONL entry on disk, not just that `appendEntry("skill-load", payload)` was called. If disk verification is unavailable, classify forward logging as runtime-unverified/manual-required.

## Finding 4 — medium

**Evidence:** `pi/extensions/README.md` says top-level `pi/extensions/*.ts` files are auto-discovered, and `pi/extensions/tsconfig.json` includes `**/*.ts`. Tests/helpers placed under `pi/extensions/` will typecheck and may import extension-only dependencies, but top-level test files would be auto-loaded as extensions and fail runtime discovery unless they export a default factory.

**Required fix:** Keep tests in `pi/tests` or non-top-level helper modules only. Add a validation grep/find gate that fails on `pi/extensions/*.test.ts`, `pi/extensions/*spec.ts`, or any new top-level helper lacking a default extension factory.

## Finding 5 — medium

**Evidence:** The plan’s Pi validation command is correct (`cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`), but runtime smoke from `pi/tests` imports extension files across package boundaries. Existing tests sometimes mock `@mariozechner/pi-coding-agent`; without matching mocks/dependencies, a new test importing `skill-stats.ts` can pass in `pi/extensions` typecheck but fail Vitest resolution/runtime in `pi/tests`.

**Required fix:** Add an explicit `pi/tests` Vitest smoke that imports the extension exactly as tests do, mocks any TUI/Pi runtime-only modules if needed, and asserts default export registration. Treat extension typecheck alone as insufficient for exported extension shape correctness.
