---
created: 2026-09-07
status: completed
completed: 2026-09-07
---

# Port deferred local image tools to the default Pi profile

## Goal and scope

- User requirements: Port the legacy profile's `image_inspect` and `image_transform` capability to the default profile and preserve the deferred Option B workflow: image tools are inactive at session start, a matching `tool_search` activates them for that session, and the next session hides them again.
- Preserve: Existing image byte/dimension/pixel/frame limits, path and symlink checks, immutable source reads, destination non-overwrite behavior, per-destination mutation serialization, cancellation cleanup, output reopening/verification, and metadata stripping.
- Non-goals: Screenshot capture, OCR, image generation, semantic subject detection, drawing, annotation, remote images, animation editing, browser changes, migration of legacy runtime state, or deferral of unrelated default-profile tools.
- Authorization: Planning and discussion only. Implementation, installation, commit, and push are not authorized by this request.

## Context for a fresh session

Paths are relative to the dotfiles repository root. Read root `AGENTS.md` and `pi/profiles/default/AGENTS.md` before acting. Preserve unrelated work.

- Legacy sources:
  - `pi/profiles/legacy/extensions/image-tools.ts`
  - `pi/profiles/legacy/extensions/tool-search.ts`
  - `pi/profiles/legacy/extensions/tool-visibility.ts`
  - `pi/profiles/legacy/lib/tool-activation.ts`
  - `pi/profiles/legacy/tests/image-tools.test.ts`
  - `pi/profiles/legacy/tests/tool-search.test.ts`
  - `pi/profiles/legacy/tests/tool-visibility.test.ts`
  - `pi/profiles/legacy/skills/image-editing/SKILL.md`
- Default integration inputs:
  - `pi/profiles/default/package.json`
  - `pi/profiles/default/pnpm-lock.yaml`
  - `pi/profiles/default/tests/helpers/mock-pi.ts`
  - `pi/profiles/default/tsconfig.json`
  - `pi/profiles/default/vitest.config.ts`
  - `pi/README.md`
  - `CHANGELOG.md`
- Verified behavior:
  - Image processing is direct TypeScript using `sharp`; no Python or external image CLI is involved.
  - The default profile does not currently depend on `sharp` and has no `tool_search` or deferred-tool visibility extension.
  - Pi's current extension API provides `getAllTools`, `getActiveTools`, `setActiveTools`, and `withFileMutationQueue`.
  - Legacy `tool_search` includes telemetry and compatibility filtering tied to legacy-only infrastructure. Those unrelated systems are not required to defer the two image tools.
  - The default profile's existing test helper captures registered tools but needs active/all-tool behavior for visibility integration tests.
- Existing work to preserve: Reinspect `git status` before implementation. At planning time the tree was clean after the prior browser-control commit.

### Pi profiles

- Planning profile: `default`, `pi/profiles/default`, verified through `PI_CODING_AGENT_DIR` earlier in this session.
- Intended implementation and validation profile: `default`, launched through bare `pp`.
- Other affected profiles: `legacy` remains unchanged and is the behavioral reference only.

| Date | Actual profile/path | Work or check | Result |
| --- | --- | --- | --- |
| 2026-09-07 | default / `pi/profiles/default` | Planning and source inspection | No implementation or runtime validation |
| 2026-09-07 | default / `pi/profiles/default` | Implementation and validation | 16 focused tests, typecheck, frozen install, registered-tool smoke, and Sharp load check passed |

## Decisions and contracts

| Decision | Source/status | Choice | Affected tasks |
| --- | --- | --- | --- |
| D1 | User-selected Option B | Add `tool_search` and session-reset visibility sufficient to keep image tools deferred. | T2-T4 |
| D2 | Scope boundary | Search may list and activate any registered, non-hidden tool, but only `image_inspect` and `image_transform` are forcibly deactivated at session start. Do not import legacy workflow, subagent, goal, plan, or telemetry ownership. | T2-T4 |
| D3 | Existing legacy contract | A non-empty matching query activates all matching inactive tools by default; `activate: false` searches without activation; an absent/blank query lists without activation; activation preserves every other active tool. | T2 |
| D4 | Existing legacy contract | Both image tools reset inactive on every `session_start`, remain active within the current session after discovery, and stay registered/searchable while inactive. | T2 |
| D5 | Existing legacy contract | `image_transform` never overwrites a source or existing destination and publishes only a reopened, verified, single-frame output with covered metadata stripped. | T1, T3 |
| D6 | Dependency requirement | Add `sharp` through pnpm in the default profile and commit its package/lockfile changes. Do not use another package manager. | T1 |
| D7 | Proposed simplification | Omit legacy metrics, query hashing, toolset fingerprints, hidden historical names that do not exist in default, and custom TUI renderers unless current default APIs require them. Preserve observable discovery and activation behavior, not unrelated legacy infrastructure. | T2 |

## Execution guidance

Before adding work, identify which requirement above needs it. Do not broaden this into a general default-profile tool-governance redesign.

At the T2 checkpoint, verify that only image tools are automatically deferred and that unrelated active tools are preserved. If work has drifted into legacy metrics, workflow tools, subagents, or generalized policy, remove that task-created work and resume the listed scope.

## Tasks

- [x] **T1 - Add and prove the Sharp dependency**
  - Depends on: None.
  - Inputs/files: `pi/profiles/default/package.json`, `pi/profiles/default/pnpm-lock.yaml`.
  - Do: Add the legacy-compatible `sharp` version with pnpm from the default profile. Use the repository's frozen/profile dependency workflow where applicable. Confirm its native binary loads on the executing Windows workstation with a minimal in-memory metadata operation.
  - Verify: `cd pi/profiles/default && pnpm install --frozen-lockfile` after the lockfile is updated, followed by a bounded Node/tsx Sharp load check.
  - Done when: Package and lockfile agree, installation is reproducible, and Sharp loads and reads generated image metadata locally.
  - If blocked: Report the native package or install-policy error. Do not replace Sharp or add an external executable without user direction.
  - Evidence: Added Sharp 0.35.4 through pnpm; frozen install passed and an in-memory 2x3 PNG load/metadata check passed on Windows.

- [x] **T2 - Implement bounded tool search and image-only deferred visibility**
  - Depends on: T1.
  - Inputs/files: Legacy tool-search, tool-visibility, tool-activation, and focused tests; create default equivalents under `pi/profiles/default/extensions/` and `pi/profiles/default/lib/`; update `pi/profiles/default/tests/helpers/mock-pi.ts` only as needed.
  - Do: Port the scoring/list/search/activation behavior and a minimal activation helper around Pi's active-tool APIs. Add a visibility extension whose deferred set contains exactly `image_inspect` and `image_transform`. Reset those tools on `session_start`, preserve all other tools and session-local activations, and avoid legacy metrics and unrelated restrictions.
  - Verify: From `pi/profiles/default`, run direct Vitest filters for the new tool-search and tool-visibility test files, without `--`.
  - Done when: Tests prove blank-list non-activation, matching activation, `activate: false`, parameter inclusion, no-match behavior, preservation of active tools, same-session persistence, and new-session reset of exactly both image tools.
  - If blocked: Inspect installed Pi extension types/docs before changing the user-selected deferred contract.
  - Evidence: Added minimal activation helpers, `tool_search`, and image-only session-start deferral. Focused search/visibility tests passed without legacy telemetry or unrelated policy.

- [x] **T3 - Port the guarded image operations and skill**
  - Depends on: T1 and T2.
  - Inputs/files: Legacy image extension, tests, and skill; create `pi/profiles/default/extensions/image-tools.ts`, `pi/profiles/default/tests/image-tools.test.ts`, and `pi/profiles/default/skills/image-editing/SKILL.md`.
  - Do: Port inspect, crop, resize, auto-orient, quarter-turn rotation, JPEG/PNG/WebP conversion, and bounded quality. Preserve strict schemas, 100 MiB input/output, dimension/pixel limits, one-frame handling, canonical source/destination checks, stable reads, destination queueing, exclusive temporary output, hard-link publication, cancellation cleanup, output verification, and metadata stripping. Keep the skill's `tool_search` prerequisite and exclusions.
  - Verify: From `pi/profiles/default`, run `pnpm test image-tools.test.ts`.
  - Done when: Focused generated fixtures prove inspection, all transforms/formats, orientation, bounds and limits, metadata removal, source preservation, destination refusal, symlink handling, cancellation cleanup, and one-winner concurrent publication through the registered tools.
  - If blocked: Preserve safety behavior and report the exact Sharp/platform discrepancy rather than weakening checks.
  - Evidence: Ported both guarded image tools, generated-fixture tests, and the image-editing skill. Tests cover transforms, formats, limits, metadata, aliases, cancellation, and concurrent publication.

- [x] **T4 - Integrate documentation and run bounded profile validation**
  - Depends on: T2 and T3.
  - Inputs/files: `pi/README.md`, `CHANGELOG.md`, all changed default-profile files.
  - Do: Apply the scope checkpoint. Document the deferred discovery command, operations, safety limits, metadata behavior, and exclusions. Merge with concurrent documentation changes rather than replacing them.
  - Verify:
    - `cd pi/profiles/default && pnpm test image-tools.test.ts tool-search.test.ts tool-visibility.test.ts`
    - `cd pi/profiles/default && pnpm run typecheck`
    - A registered-tool smoke using generated local fixtures: initial inactive state, image search activation, inspect, one transform, source hash unchanged, verified output, then fresh-session reset.
    - From repository root: `git diff --check` for scoped changes.
  - Done when: All required checks pass, the tools are deferred and discoverable as specified, documentation matches behavior, and no unrelated default tools or legacy files changed.
  - If blocked: Classify the failure as dependency, Pi activation API, image behavior, or test harness. Do not expand into unrelated tool governance.
  - Evidence: Updated README and changelog. Sixteen focused tests, default-profile typecheck, registered deferred workflow smoke, Sharp load proof, and scoped diff check passed.

## Agreed validation and finish

Completion requires the three focused Vitest files, default-profile typecheck, local generated-fixture smoke, Sharp load proof, and scoped `git diff --check`. Generated fixtures must not contain personal images or persist after testing. Fix demonstrated in-scope failures and rerun affected checks only.

## Current handoff

- Status: Completed.
- Completed work: T1-T4. Sharp-backed image tools and bounded deferred discovery are integrated into the default profile.
- Next: Archive this plan.
- Blockers/open decisions: None.
- Verification limits: Sharp and the workflow were validated on Windows with generated fixtures only; no personal image, Linux, or macOS run was performed.

## Completion and archive

When all tasks and agreed checks finish, set `status: completed` and `completed: YYYY-MM-DD`, record actual profile runs, and move this directory to `.specs/archive/default-image-tools-deferred/` without overwriting an existing archive. Archiving does not authorize committing, pushing, or changing unrelated work.
