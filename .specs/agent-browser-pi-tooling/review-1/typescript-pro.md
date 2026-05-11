- severity: medium
  evidence: T4 allows a "Pi command/skills agent" to create/update `pi/skills/.../SKILL.md` but does not explicitly forbid `pi/extensions/` changes despite the plan saying no native Pi extension in the first pass.
  required_fix: Add a hard scope constraint: T4 is documentation/skill-only; `pi/extensions/` and TypeScript package changes are out of scope unless a new reviewed task names exact files and validation commands.

- severity: medium
  evidence: T5 may add validation tests, and V3 says run `pi/tests` only "and/or ... as applicable" if Pi TypeScript files changed. This leaves room for adding Vitest/TypeScript tests without the required pnpm validation.
  required_fix: State that any edit under `pi/tests/` requires `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test` or a documented single-file `pnpm test <file>` run with no `--` separator.

- severity: medium
  evidence: The plan mentions Pi TypeScript boundaries only in Project Context and V3, not in T1’s audit deliverable. Implementers could choose `pi/extensions/` during T1 without recording package ownership.
  required_fix: Add T1 acceptance criteria requiring explicit classification of selected Pi surfaces as `pi/skills/docs`, `pi/extensions`, or `pi/tests`; if `pi/extensions` or `pi/tests` is selected, list exact package directory and required pnpm commands before implementation.

- severity: low
  evidence: T2 suggests global Node install via existing convention and macOS fallback `pnpm add -g agent-browser`, while preflight still uses `npx -y agent-browser --version`.
  required_fix: Clarify that `npx` is smoke-test only and must not be used as the repo install mechanism or create npm lockfiles; specify the chosen durable install command before T2 edits.
