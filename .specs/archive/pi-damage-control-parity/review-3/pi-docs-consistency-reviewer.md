# Pi Docs Consistency Review

## Findings

### 1. High — Plan invents an unsupported damage-control settings key/path contract

**Evidence:** The plan requires an explicit configured Claude policy path named `dangerCtrl.claudePolicyPath` from env or `settings.json`, with fail-closed semantics when set. Pi docs list damage-control rules as loaded from `pi/damage-control-rules.yaml` via `pi/lib/yaml-mini.ts` (`pi/README.md`, “Damage-control safety validation”; `pi/extensions/README.md`, “Damage-control extension”). Existing documented settings examples cover keys such as `personality`, router settings, transcript settings, and expertise settings, but no `dangerCtrl.*` damage-control settings namespace is documented.

**Required fix:** Either add a prior task to design and document the settings schema/source precedence for damage-control policy selection, or change the plan to use the documented rules file/path behavior and avoid claiming `dangerCtrl.claudePolicyPath` exists.

### 2. High — Plan contradicts documented damage-control loader/parser conventions

**Evidence:** The plan says Phase A must load Claude `patterns.yaml` via `loadYamlViaPython` and “does not extend yaml-mini.” Current Pi docs say damage-control rules are loaded from `pi/damage-control-rules.yaml` through the TS-native `pi/lib/yaml-mini.ts` parser and explicit type guards (`pi/README.md`), and `pi/extensions/README.md` says YAML config should use `yaml-mini` unless full YAML semantics require `loadYamlViaPython`, with a Documented Exception.

**Required fix:** Add an explicit documentation update/exception explaining why Claude policy loading needs `loadYamlViaPython`, what file(s) still use `yaml-mini`, and how subprocess/Python availability is validated. Otherwise keep the implementation on the documented TS-native loader path.

### 3. Medium — Plan places helper-style implementation in `pi/extensions/` without guarding auto-discovery conventions

**Evidence:** The plan edits `pi/extensions/damage-control-rules.ts`, `damage-control-engine.ts`, and `damage-control.ts`, but may need new adapter/normalizer modules. `pi/extensions/README.md` warns every top-level `*.ts` in `pi/extensions/` is auto-discovered as an extension and says helpers/libraries must go under `pi/lib/` or subdirectories, not top-level `pi/extensions/`.

**Required fix:** State that any new helper/adapter modules must live under `pi/lib/` or a non-auto-discovered subdirectory, unless they are existing top-level extension siblings already imported safely. Add a validation/check that no new non-extension top-level `pi/extensions/*.ts` file is introduced.

### 4. Medium — Validation commands mostly match docs, but omit install freshness for pnpm-managed dirs

**Evidence:** The plan correctly bans Bun and uses `cd pi/tests && pnpm test damage-control.test.ts`, `cd pi/extensions && pnpm run typecheck`, and `make check-pi-extensions`, matching `AGENTS.md`, `pi/README.md`, and `pi/extensions/README.md`. However, the docs explicitly prescribe `pnpm install --frozen-lockfile` in `pi/extensions/` and `pi/tests/` before typecheck/test when validating Pi TypeScript dependencies.

**Required fix:** Include `cd pi/extensions && pnpm install --frozen-lockfile` and `cd pi/tests && pnpm install --frozen-lockfile` in the validation contract or state why dependency installation is intentionally skipped because node_modules is already current.

### 5. Low — Source-vs-runtime policy is only partially reflected in evidence/archive tasks

**Evidence:** Pi docs say curated source/config such as `pi/extensions/`, `pi/lib/`, `pi/tests/`, and `pi/settings.json` are trackable, while generated runtime state such as `pi/history/`, `pi/sessions/`, `pi/multi-team/sessions/`, logs, caches, expertise JSONL, and `node_modules/` must remain local (`pi/README.md#source-vs-runtime-state`; `pi/PI-INSTRUCTIONS.md`). The plan writes evidence under `.specs/.../evidence`, but does not explicitly prohibit touching or archiving generated Pi runtime paths while collecting logs/debug state.

**Required fix:** Add a guard to evidence collection/archive preflight that excludes generated Pi runtime paths and debug logs unless sanitized, and confirms no `pi/history/`, `pi/sessions/`, `pi/multi-team/sessions/`, expertise logs, caches, or `node_modules/` are staged or archived.
