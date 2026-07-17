# TypeScript Runtime Review

## Finding 1 — High — `loadYamlViaPython` contract does not match the plan's reliability assumptions

**Evidence:** The plan requires Claude `patterns.yaml` to load via `loadYamlViaPython` and says runtime validation commands should use `uv run --with pyyaml`, but `pi/lib/yaml-helpers.ts:3-27` only accepts YAML **content**, shells to ambient `python`/`python3`, and returns `undefined` on failure without exposing stderr or exit status. On Windows/MSYS this is exactly the environment where ambient `python` may not have PyYAML, even though `uv run --with pyyaml` would.

**Required fix:** Before T2, update the implementation contract to either (a) make `loadYamlViaPython` configurable/testable with an explicit interpreter command and structured error result, or (b) use an in-process YAML dependency in `pi/extensions` with pnpm lock updates. Tests must cover missing PyYAML/interpreter and assert configured Claude policy fails closed with a diagnosable health error, not a generic `undefined` parse failure.

## Finding 2 — High — Phase B names sections that current Pi rule types cannot represent

**Evidence:** The plan requires support for `zeroAccessExclusions`, `readOnlyPaths`, `writeConfirmPaths`, `contentScanPaths`, and `injectionPatterns`, but `DamageControlRules` currently has only `dangerous_commands`, `zero_access_paths`, `no_delete_paths`, and `domain_constraints` (`pi/extensions/damage-control-rules.ts:15-20`). `validateDamageControlRules` only requires/validates those three array sections (`pi/extensions/damage-control-rules.ts:44-93`), and the runtime handlers only consume zero-access/no-delete for file tools (`pi/extensions/damage-control.ts:430-472`).

**Required fix:** Split Phase B into explicit schema/runtime/test subtasks that add typed fields, validation, normalization, and handler behavior for each mapped Claude section. Do not leave Phase B as a single checklist item that can be marked complete while only command parity exists.

## Finding 3 — Medium — Settings key/env-var name is underspecified and likely to be implemented untypeably or unreadably

**Evidence:** The plan names `dangerCtrl.claudePolicyPath` as an “env var or settings.json key”. `process.env.dangerCtrl.claudePolicyPath` is not valid TypeScript; bracket access would be required for a dotted env name, and dotted env variable names are awkward/non-portable in shell assignment. Separately, Pi’s settings helper explicitly says dotted paths are **not** expanded (`pi/lib/settings-loader.ts:166-170`), so `getSetting("dangerCtrl.claudePolicyPath", ...)` will not read `{ "dangerCtrl": { "claudePolicyPath": ... } }`.

**Required fix:** Define two concrete names and accessors in the plan, e.g. env `PI_DAMAGE_CONTROL_CLAUDE_POLICY_PATH` plus settings object `{ "dangerCtrl": { "claudePolicyPath": "..." } }`, read via `loadCascadedSettings().merged` with type guards. Add tests for user/project/local settings precedence and env override behavior.

## Finding 4 — High — Current command evaluation is case-insensitive and skip-on-invalid, contradicting required Claude parity

**Evidence:** The plan correctly requires case-sensitive default matching and fail-closed regex compilation, but the existing engine compiles every `rule.regex` with global `"i"` and catches invalid regexes by returning `false` (`pi/extensions/damage-control-engine.ts:195-201`). If T2 only normalizes Claude rules into the current `DangerousCommand.regex` field, `RM file` will be blocked/asked despite the plan’s required allow, and invalid/incompatible rules will be silently skipped at evaluation time.

**Required fix:** Add a compiled/validated rule representation (or an explicit `caseSensitive`/`compiledRegex` path) and make load-time validation the only place regex compilation can fail. Remove the evaluation-time catch/skip behavior for normalized Claude rules, and add the required `RM file` plus invalid-regex fail-closed tests before relying on the engine.

## Finding 5 — Medium — Path normalization requirements exceed current canonicalization/glob implementation

**Evidence:** Phase B requires Windows/MSYS normalization for `C:/...`, `C:\...`, `/c/...`, `/mnt/c/...`, `~`, and credential globs. Current `matchesPattern` expands only `~/` with `os.homedir()` and uses Node `path`/string matching (`pi/extensions/damage-control-engine.ts:55-91`); on Windows, `/c/Users/...` and `/mnt/c/...` are not equivalent to `C:/Users/...`, and glob matching is not anchored. The plan does not specify where this normalization layer lives or how it integrates with `sharedCanonicalize`.

**Required fix:** Add a dedicated path-normalization task and tests before claiming Phase B parity. Define canonical forms for drive letters, MSYS `/c`, WSL `/mnt/c`, backslashes, and home expansion; then ensure all protected-path matchers receive the same normalized representation.
