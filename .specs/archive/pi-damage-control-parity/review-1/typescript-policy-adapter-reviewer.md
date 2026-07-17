# TypeScript Policy Adapter / Runtime Integration Review

## Finding 1 — HIGH — YAML parsing/boolean coercion can silently invert ask/block semantics

**Evidence:** The plan requires Pi to load `claude/hooks/damage-control/patterns.yaml` directly, but the current Pi loader uses `parseYamlMini` (`pi/extensions/damage-control-rules.ts`) and validates only Pi keys. `pi/lib/yaml-mini.ts` explicitly keeps non-string scalars as strings, so Claude entries such as `ask: true`, `enabled: true`, and `timeoutMs: 50` will not be typed as booleans/numbers. If the adapter checks `entry.ask === true`, all Claude ask rules become hard blocks; if it treats any non-empty string as truthy without validation, malformed values can become ask rules.

**required_fix:** Use a real YAML parser in the TypeScript extension/test package, or add a typed normalization layer that explicitly coerces and validates Claude scalar fields (`ask`, `enabled`, `timeoutMs`, severities/types) before rule construction. Add tests proving `ask: true` maps to `action: "ask"` and missing/false `ask` maps to `"block"` using the actual Claude YAML parser path.

## Finding 2 — HIGH — JavaScript regex compatibility is not guaranteed by the plan

**Evidence:** Claude’s `bashToolPatterns` are authored for Python `re` and are currently executed by Python hooks. Pi will execute them with `new RegExp(pattern, "i")` (`pi/extensions/damage-control-engine.ts`). The plan only says to evaluate Claude regexes case-insensitively; it does not require a compile-all compatibility gate or an adapter for Python/JS regex semantic differences. Existing patterns include lookbehind constructs such as `(?<!git\s)` and many escaped shell/path constructs; a single unsupported or differently interpreted pattern currently falls through in `commandMatchesRule` and returns false, creating silent allows.

**required_fix:** Add a normalization-time compile pass for every Claude regex in Node, fail closed on any incompatible pattern, and archive the incompatible-pattern list. Tests must assert that all loaded Claude command/injection/secret regexes compile under the runtime Node version and that invalid regexes make policy health failed rather than being skipped during evaluation.

## Finding 3 — HIGH — Windows/MSYS path normalization can cause zero-access/read-only misses

**Evidence:** The runtime canonicalizes paths, then matches with `matchesPattern` using mixed `path.sep`, raw `/`, `path.basename`, and case-sensitive string comparisons (`pi/extensions/damage-control-engine.ts`). Claude policy contains POSIX/MSYS/Windows forms including `C:/Windows/System32/config/SAM`, `*/Microsoft/Protect/`, `~/.ssh/`, and `/c/Users` shell paths. On Windows, canonical paths may contain backslashes and drive-letter casing; in Git Bash/MSYS inputs may use `/c/...` while Node path handling is Windows-native or POSIX depending on runtime. The plan mentions ESM/path handling in constraints but does not require separator/case normalization tests.

**required_fix:** Normalize both policy patterns and candidate paths to a single comparison form (forward slashes, expanded home, stable drive-letter casing, MSYS `/c/...` and WSL `/mnt/c/...` handling where applicable) before glob/prefix/suffix matching. Add Windows/MSYS-specific tests for `C:/Windows/...`, `C:\Windows\...`, `/c/Users/...`, `~/.ssh/id_ed25519`, and globbed credential paths.

## Finding 4 — MEDIUM — Applying Bash-only Claude rules to `pwsh` changes behavior without a policy basis

**Evidence:** Claude’s top-level comment says `bashToolPatterns` are matched against Bash tool commands only. The plan’s T4 says to wire normalized policy into `bash`, `pwsh`, file tools, write/edit tools, and truncating operations. Current Pi evaluates `rules.dangerous_commands` for both `bash` and `pwsh`. Reusing Bash regexes for PowerShell can over-block unrelated PowerShell text while still missing native destructive forms unless separately modeled.

**required_fix:** Preserve source-tool scope during normalization: Claude `bashToolPatterns` should produce rules scoped to `bash` unless an explicit Pi overlay adds `pwsh` patterns. Add tests proving a representative Bash rule does not fire for `pwsh` solely because it came from `bashToolPatterns`, and add separate PowerShell rules/tests for native `Remove-Item`, `Set-Content`, etc.

## Finding 5 — MEDIUM — Overlay/fallback ordering is underspecified and Claude rule order is semantically significant

**Evidence:** The plan says to load Claude policy as canonical and keep `pi/damage-control-rules.yaml` as fallback/overrides. Claude comments state ordering matters: `git rm` must precede general `rm`, catastrophic `rm -rf /` must precede softer ask rules, and metadata exfil rules are placed first. If Pi fallback/overrides are merged before, after, or deduplicated without an explicit precedence model, an ask rule can shadow a hard block or a broad fallback can change Claude parity.

**required_fix:** Define and test merge semantics. Recommended: use Claude order unchanged as the base; apply Pi-only overlays only in clearly named append/prepend sections with documented precedence; fail on duplicate patterns with conflicting actions unless explicitly resolved. Add regression tests for `git rm`, `rm -rf /`, `rm -f file`, and `git push --force-with-lease` to prove ordering preserves Claude outcomes.
