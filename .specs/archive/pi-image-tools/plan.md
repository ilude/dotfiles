---
created: 2026-09-02
status: ready
---

# On-demand Pi image editing tools

## Objective

Pi can inspect and safely transform local images with Sharp-backed tools that are hidden from ordinary turns, discovered through the existing `tool_search` flow for image work, and guided by a focused image-editing skill.

## Completion Evidence

- Evidence: On the executing workstation, a focused fixture workflow loads Sharp through the Pi pnpm package, inspects exact image properties, crops and resizes to requested dimensions, rotates and converts JPEG/PNG/WebP with bounded quality settings, auto-orients pixels, removes EXIF/XMP/IPTC/ICC metadata by default, preserves the source and every existing destination, rejects invalid bounds and over-limit inputs, writes atomically, and reports the verified output path, dimensions, and format; `image_inspect` and `image_transform` are inactive at session start, become active after a matching `tool_search`, remain active for that session, and reset inactive in a new session.
- Fails when: Sharp cannot load on the executing workstation, an ordinary turn exposes either image tool, search cannot activate them for an image request, a transformation overwrites any existing file, accepts an invalid or out-of-bounds crop, processes an animated/multi-page or over-limit image, leaves covered metadata, writes a partial or unexpected output, or reports success without reopening and verifying the output image.

## Boundaries

- In scope: `pi/package.json`, `pi/pnpm-lock.yaml`, `pi/pnpm-workspace.yaml`, one Pi image-tools extension under `pi/extensions/`, focused tests under `pi/tests/`, one `pi/skills/image-editing/SKILL.md`, `pi/extensions/tool-visibility.ts`, `pi/skills/pi-extension/references/contracts/tool-discovery.md`, and the root `CHANGELOG.md` entry required for this user-facing capability.
- Out of scope: Screenshot capture, OCR, image generation, semantic subject detection, arbitrary drawing or annotation, browser tooling changes, remote images, animation editing, and changes to other clients.
- Preserve: Existing `tool_search` behavior and telemetry, active tools owned by other extensions, every source and existing destination, explicit local absolute-path use, and unrelated dotfiles state.
- Assumptions: Sharp publishes a compatible prebuilt binary for the executing workstation; initial limits are 100 MiB encoded input/output, 64 million decoded/output pixels, 32,768 pixels per input dimension, 16,384 pixels per output dimension, one frame/page, quality 1-100, and rotations of 0/90/180/270 degrees.
- Worktree: Before T1, `/do-it` creates and owns exactly one implementation worktree beneath repository-root `.worktrees/`; all implementation and validation run there, while the primary checkout remains untouched.

## Tasks

- [x] **T1: Prove the Sharp-backed image transformation slice**
  - Files: `pi/package.json`, `pi/pnpm-lock.yaml`, `pi/pnpm-workspace.yaml`, `pi/extensions/image-tools.ts`, `pi/extensions/tool-visibility.ts`, `pi/skills/pi-extension/references/contracts/tool-discovery.md`, `pi/tests/image-tools.test.ts`, `pi/tests/tool-search.test.ts`, `pi/tests/tool-visibility.test.ts`
  - Change: Add Sharp through pnpm under the existing 4,320-minute release-age and strict-build policy, explicitly updating `allowBuilds` only if Sharp requires it, then implement the smallest shared core for exact inspection plus crop, resize, auto-orientation, and default metadata stripping. Resolve relative paths from the active Pi working directory, strip a leading `@`, canonicalize existing inputs and the nearest existing output ancestor, reject NULs/directories/symlink aliases, read the validated source into an immutable buffer, and queue only the destination mutation. Refuse every existing destination. Enforce the stated byte, dimension, pixel, and single-frame limits in both schemas and execution. Encode to an exclusive temporary sibling, reopen and verify it, then atomically rename it; cancellation or failure removes only that temporary file. Register both tools as inactive through the existing visibility mechanism, update the owning discovery contract for this operator-approved deferred binary-backed tool group, and prove matching `tool_search` activation before expanding the operation set. Run the Pi typecheck before that expansion.
  - Done when: A generated fixture containing known metadata is inspected correctly, transformed to exact dimensions without changing the source or another existing file, contains none of the covered metadata, reopens successfully, and malformed, animated, aliased, over-limit, cancellation, and bounds failures leave no destination or temporary artifact; ordinary startup excludes both tools and a matching search activates them without removing other tools.
  - Verify: `cd pi && pnpm run typecheck && pnpm test image-tools.test.ts tool-search.test.ts tool-visibility.test.ts`

- [x] **T2: Complete on-demand discovery and the initial editing contract**
  - Files: `pi/extensions/image-tools.ts`, `pi/tests/image-tools.test.ts`, `pi/tests/tool-search.test.ts`, `pi/tests/tool-visibility.test.ts`, `pi/skills/image-editing/SKILL.md`, `pi/tests/skill-discovery.test.ts`, `CHANGELOG.md`
  - Depends on: T1
  - Change: Add rotate and JPEG/PNG/WebP conversion with the stated quality and output limits to `image_transform`; make descriptions searchable by crop, resize, rotate, convert, compress, metadata, and image terms; verify session-local persistence and reset on a new session. Add a concise skill that routes image work to inspection before pixel-coordinate transforms, requires output verification, and excludes screenshots, OCR, and generation. Record the user-facing capability in the changelog.
  - Done when: Runtime schema validation rejects unknown properties, invalid enum/range values, and incompatible parameter combinations; the full initial operation set passes focused behavior tests; ordinary startup excludes both tool definitions; image search activates both without removing other tools; a later turn in the same session retains them; a new session hides them again; and skill discovery loads the new skill without warnings.
  - Verify: `cd pi && pnpm run typecheck && pnpm test image-tools.test.ts tool-search.test.ts tool-visibility.test.ts skill-discovery.test.ts`

## Execution Strategy

- Parallel work: None
- Smaller-model work: None

## Validation

- [x] A temporary screenshot copy is inspected, cropped, resized, and converted through the registered tool implementation after `tool_search` activation; the source hash is unchanged, the destination did not previously exist, the output dimensions and format match the request, covered metadata is absent, reopening the output succeeds, and a fresh session returns both tools to inactive state.

## Retention

Keep incomplete work at `.specs/pi-image-tools/plan.md`. After completion, `/do-it` archives this directory to `.specs/archive/pi-image-tools/`.

## Execution Status

- State: Complete; implementation and validation passed.
- Blocker: None.
- Validation: Pi typecheck, 45 focused tests, changed-file Biome lint, frozen pnpm install, and the registered deferred-tool smoke passed.
- Next: Archive and close the workflow.
