# typescript-pro review

## Finding 1

category: substantive defect
severity: high
severity_rationale: The Wave 1 gate can pass while the new core module is not typechecked at all, so later waves can inherit broken public helper signatures or invalid imports.
evidence: `.specs/skill-review-system/plan.md:216` puts the core in `pi/lib/skill-review.ts`; `.specs/skill-review-system/plan.md:231` accepts `cd pi && pnpm run typecheck` as proof. But `pi/package.json:6` defines that script as `tsc --noEmit -p extensions`, and `pi/extensions/tsconfig.json:18` includes only `**/*.ts` relative to `pi/extensions`. A new `pi/lib/skill-review.ts` is outside that include set until some extension imports it. T4 is not until Wave 3, so V1/V2 can report type safety for code the compiler did not load.
required_fix: Add an early test or compile target that imports `../lib/skill-review.ts` before V1, or change the validation contract so Wave 1 uses the Vitest fixture test/import as the compile gate. Do not rely on `pnpm run typecheck` alone for an unreferenced `pi/lib` module.
confidence: high

## Finding 2

category: substantive defect
severity: high
severity_rationale: Importing an extension module from a pure helper module crosses the runtime boundary and can make the supposedly pure library depend on extension-runtime types and registration code.
evidence: `.specs/skill-review-system/plan.md:216` allows `pi/lib/skill-review.ts` to import from `pi/extensions/skill-stats.ts`. That target imports Pi runtime types at `pi/extensions/skill-stats.ts:15` and exports an extension factory at `pi/extensions/skill-stats.ts:519`. The extension README says top-level extension files are loaded as extension modules (`pi/extensions/README.md:6`) and shows shared helper imports going from extensions to `pi/lib`, not the reverse (`pi/extensions/README.md:109`). This undermines the plan's pure-helper boundary in T1.
required_fix: Move reusable session-log usage collection into `pi/lib` and have both `skill-stats.ts` and `skill-review.ts` import that library. The plan should explicitly forbid `pi/lib/*` importing `pi/extensions/*`.
confidence: high

## Finding 3

category: process defect
severity: medium
severity_rationale: A documented validation command is likely to be wrong for this repo's Vitest wrapper, causing wasted execution or false confidence before the real tests exist.
evidence: `.specs/skill-review-system/plan.md:286` specifies `cd pi && pnpm test skill-review.test.ts -- --runInBand`. Repo guidance says the single-file Pi Vitest filter must be passed directly to the pnpm script and not preceded by `--`; the script is `vitest run --config tests/vitest.config.ts` in `pi/package.json:7`. `--runInBand` is a Jest flag, not part of the local Vitest contract.
required_fix: Replace that acceptance check with `cd pi && pnpm test skill-review.test.ts` once the test exists. For pre-T5 Wave 2 validation, require a small checked-in fixture test or remove the placeholder command from the pass criteria.
confidence: high

## Finding 4

category: substantive defect
severity: medium
severity_rationale: The write boundary is ambiguous enough for a runtime implementation to pass tests with injected temp paths but write generated artifacts under the wrong working directory in real Pi sessions.
evidence: `.specs/skill-review-system/plan.md:314` says to write under `.tmp/skill-review/{timestamp}/` relative to `repo root/cwd`. Those are not equivalent. Pi command handlers receive `ctx.cwd`; if the user invokes `/skill-review` from `pi/`, `pi/extensions/`, or another subdirectory, a literal cwd-relative implementation writes to that subdirectory's `.tmp`, while the objective and dogfood checks expect the repo-root `.tmp/skill-review/{timestamp}/`.
required_fix: Define a single base path. Prefer resolving the git repository root or documented workspace root first, then joining `.tmp/skill-review/{timestamp}`. Add a command test where `ctx.cwd` is a subdirectory and assert the artifact path is still repo-root relative.
confidence: medium

## Finding 5

category: substantive defect
severity: low
severity_rationale: Millisecond timestamp directories are usually unique but not guaranteed; collision behavior matters because the command writes multiple artifacts and should not overwrite or merge two runs.
evidence: `.specs/skill-review-system/plan.md:313` recommends `YYYYMMDDTHHMMSSmmmZ` and `.specs/skill-review-system/plan.md:314` requires writing a whole artifact set under that directory, but the plan does not require exclusive directory creation, retry suffixes, or collision tests. A fixed clock in tests or two rapid invocations can target the same path.
required_fix: Require exclusive `mkdir` for the run directory and either fail clearly on collision or append a deterministic monotonic suffix. Add a test with an existing timestamp directory.
confidence: medium
