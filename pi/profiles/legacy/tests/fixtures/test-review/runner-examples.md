# Runner interpretation fixtures

The disposable calibration set includes these source/configuration examples without assuming the runner is installed:

- Node Test: `node --test tests/*.test.mjs`, with strict assertions and a named test.
- Vitest: `vitest@4.1.9` with an isolated setup file and one configured project.
- Jest: `jest@30.0.0` with an explicit ESM configuration and a version-specific mock boundary.
- TypeScript: `tsd@0.33.0` and a `@ts-expect-error` contract case.

The root records static-only evidence when a runner is unavailable. It never executes one runner in place of another or installs a missing dependency.
