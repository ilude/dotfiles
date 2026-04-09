---
created: 2026-04-08
status: completed
completed: 2026-04-08
---

# Plan: Migrate install.ps1 winget packages to WinGet Configuration (DSC)

## Context & Motivation

The user asked whether winget has a Brewfile equivalent. Web research confirmed two live options:

1. **WinGet Configuration** — Microsoft-maintained, first-party, declarative YAML built on PowerShell DSC 3.0. Ships in `winget` ≥ 1.6 (2023). Idempotent, can install packages *and* configure Windows settings. Invoked via `winget configure -f <file>`.
2. **progre/winget-bundle** — community Brewfile clone. Active (last commit 2026-03-23) but only 3 stars → single-maintainer risk unacceptable for a dotfiles repo.

Selected: **WinGet Configuration (DSC)**. Durable, first-party, already present on every target machine that has a modern winget.

Today, `install.ps1` hand-rolls package installation in three hash-table arrays (`$corePackages`, `$workPackages`, `$devPackages`) iterated through `Install-WingetPackage`, which shells out to `winget install` and maps exit codes. The goal is to replace those arrays and the install loop with declarative `.dsc.yaml` files invoked via `winget configure`, while preserving every existing behavior of `install.ps1` (flag semantics, lock file, failure tracking, `-ListPackages`, pinning, WinGet Links shim creation).

## Constraints

- Platform: Windows (PowerShell 5.1 / 7+)
- Shell: bash for tooling commands per repo shell invariants; install.ps1 remains PowerShell
- **No behavioral regressions**: `-Work`, `-Dev`, `-ITAdmin`, `-SkipPackages`, `-ForcePackages`, `-ListPackages`, `-NoElevate` must all still work
- **Lock file semantics preserved**: `~/.dotfiles.lock` still written with same fields and still triggers reinstall on install.ps1 mtime change
- **Idempotency preserved**: re-running must be safe (already true for DSC `winget configure`)
- **WinGet Links maintenance preserved**: the manual symlink creation in `$wingetLinks` / `$maintenanceLinks` blocks is orthogonal to DSC and must keep running
- **Work/Dev splits must remain separate files** so `-Work` / `-Dev` flags still conditionally install those groups
- `winget configure` must be available (winget ≥ 1.6). Fail loud if not.
- IT Admin PowerShell modules and RSAT features stay in PowerShell — DSC resources exist but they're out of scope for a KISS first pass
- MSYS2 pacman, npm globals, uv tools, pip hooks stay in PowerShell — not winget packages
- **Version pinning stays in the `winget pin add` loop.** DSC `Microsoft.WinGet.DSC/WinGetPackage` `version:` is an install-time target only — it does NOT prevent `winget upgrade` from bumping the package. Pinning is a separate mechanism not exposed by the DSC resource (upstream: winget-cli#3401, #5244). The pin loop at install.ps1 lines 713-717 must be preserved. **Note**: zero packages in the current arrays carry a `Version` field, so the pin loop is dead code today — preserved for future use, not active pinning.
- **All package IDs must use the `winget` source, not `msstore`.** `--accept-configuration-agreements` has a known bug (winget-cli#6091) where per-package agreements for msstore-sourced packages can still fail inside `winget configure`. V1 must spot-check.
- **Minimum winget version: 1.6.** `Install-Packages` must assert this at entry and fail loud.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **WinGet Configuration (DSC) YAML per group** | First-party, declarative, idempotent, Microsoft-maintained, zero new deps | More verbose than Brewfile; `winget configure` has per-call overhead | **Selected** |
| progre/winget-bundle | Brewfile-style one-liners, supports scoop too | 3 stars, single maintainer, new dep | Rejected: unacceptable bus factor for dotfiles |
| Native `winget export`/`import` | Zero deps, already works | Not declarative in a useful sense; no cleanup; JSON blob, not a DSL; can't express Work/Dev groups cleanly | Rejected: no expressive gain over current arrays |
| Single monolithic DSC file with assertions for `-Work`/`-Dev` | One file | DSC assertions can't read PowerShell script params cleanly; can't turn off groups | Rejected: loses flag semantics |

## Objective

`install.ps1` no longer contains the `$corePackages`, `$workPackages`, `$devPackages` arrays or the `Install-WingetPackage` / pin loops. Instead it invokes `winget configure -f <path>` for the selected groups. Package definitions live in `winget/configuration/{core,work,dev}.dsc.yaml`. All existing flags, lock file behavior, WinGet Links maintenance, and `-ListPackages` output continue to work. Re-running `install.ps1` is still idempotent and produces equivalent or identical installed state.

## Project Context

- **Language**: PowerShell (install.ps1), YAML (new DSC config files), Bash (shell tooling)
- **Test command**: none repo-wide; manual verification via `pwsh -File install.ps1 -ListPackages`, `winget configure validate -f <file>` (schema check), and `winget configure test -f <file>` (state diff — the actual "dry-run" replacement; `--dry-run` does NOT exist on `winget configure`)
- **Lint command**: `shellcheck` for bash scripts; no PowerShell linter currently wired in. YAML validated by `winget configure` itself.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T1 | Author DSC YAML config files for core/work/dev | 3 new | feature | sonnet | builder | — |
| T2 | Research `winget configure` exit codes & dry-run behavior | 0 (research) | research | sonnet | Explore | — |
| V1 | Validate wave 1 (YAML parses, dry-run succeeds, research notes complete) | — | validation | sonnet | validator-heavy | T1, T2 |
| T3 | Refactor install.ps1 to invoke `winget configure` per group, remove arrays and `Install-WingetPackage` | 1 | feature | sonnet | builder | V1 |
| T4 | Update `-ListPackages` to read and print from the DSC YAMLs | 1 | feature | sonnet | builder | V1 |
| V2 | Validate wave 2 (install.ps1 parses, ListPackages output matches pre-migration snapshot, dry-run of full install succeeds) | — | validation | sonnet | validator-heavy | T3, T4 |
| T5 | Update AGENTS.md, CLAUDE.md, README.md to document the new DSC config layout | 3 | mechanical | haiku | builder-light | V2 |
| V3 | Validate wave 3 (docs reference real paths, no stale `$corePackages` mentions) | — | validation | haiku | validator | T5 |

## Execution Waves

### Wave 1 (parallel)

**T1: Author DSC YAML config files** [sonnet] — builder
- Description: Translate the `$corePackages`, `$workPackages`, `$devPackages` arrays from `install.ps1` lines 49-94 into three WinGet Configuration YAML files under `winget/configuration/`. Each file uses schema `https://aka.ms/configuration-dsc-schema/0.2` and the `Microsoft.WinGet.DSC/WinGetPackage` resource. Each package becomes one resource with `id`, explicit `source: winget` (never `msstore` — see Constraints), and (when the current array has a `Version` field) `version`. Preserve display names as YAML comments for `-ListPackages` parity.
- **Display-name comment format is load-bearing for T4 parsing.** Use exactly: `    id: <package-id>  # <Display Name>` (two spaces before `#`, one space after). Do not use tabs. The comment must be on the same line as the `id:` key. T4's regex parser is locked to this format.
- Files must be idempotent — re-running `winget configure -f <file>` on an already-configured machine must be a no-op.
- Files:
  - `winget/configuration/core.dsc.yaml` (new) — all 24 entries from `$corePackages`
  - `winget/configuration/work.dsc.yaml` (new) — all 6 entries from `$workPackages`
  - `winget/configuration/dev.dsc.yaml` (new) — all 6 entries from `$devPackages`
- Acceptance Criteria:
  1. [ ] Three YAML files exist with the exact package IDs from install.ps1
     - Verify (PowerShell-native, runs on clean VM without Git Bash): `(Select-String -Path winget/configuration/core.dsc.yaml -Pattern '^\s*id:').Count` returns `24`, work returns `6`, dev returns `6`
     - Pass: exact counts match
     - Fail: count mismatch → diff against install.ps1 arrays, add missing entries
  2. [ ] Each file parses as valid WinGet Configuration YAML with no deprecation warnings
     - Verify: `winget configure validate -f winget/configuration/core.dsc.yaml` (repeat for work, dev)
     - Pass: exit 0, "Configuration file is valid", and no "deprecat" substring in stdout/stderr
     - Fail: schema error or deprecation warning → check `$schema` URL, resource namespace, indentation; investigate whether schema has advanced past 0.2
  3. [ ] Every package ID in every YAML declares `source: winget` (never `msstore`) — guards against winget-cli#6091 per-package agreement bug
     - Verify: `(Select-String -Path winget/configuration/*.dsc.yaml -Pattern '^\s*source:\s*msstore').Count` returns `0`
     - Pass: zero matches
     - Fail: rewrite the offending entry to use a winget-source alternative or document the exception
  4. [ ] Display-name comment format matches T4's parser contract exactly
     - Verify: `(Select-String -Path winget/configuration/*.dsc.yaml -Pattern '^\s*id:\s+\S+\s{2}#\s.+$').Count` equals the total `id:` count (36)
     - Pass: counts equal
     - Fail: reformat to `    id: <id>  # <Display Name>` (two spaces, one space)

**T2: Research `winget configure` exit codes and flags** [sonnet] — Explore
- Description: Confirm behavior we'll rely on in T3: (a) exit code on success/partial-failure, (b) whether `--accept-configuration-agreements` alone is sufficient for all winget-sourced packages (winget-cli#6091 context), (c) `winget configure validate` vs `winget configure test` semantics and which to use when — note that `--dry-run` does NOT exist, `test` is the state-diff replacement, (d) how failures inside a multi-resource file are reported (stop on first failure or continue?), (e) confirmed minimum winget version (plan assumes ≥ 1.6). Return findings as a short note the builder can paste into install.ps1 comments.
- **Pin loop answer is already known: KEEP IT.** DSC `version:` is not a pin (upstream winget-cli#3401, #5244). T2 does not need to re-verify this — flagged here so T3 does not mistakenly delete the pin loop.
- Files: none (research only). Produce a findings summary in the Task reply.
- Acceptance Criteria:
  1. [ ] Research note answers all five questions above with citations to learn.microsoft.com or the winget-cli GitHub repo
     - Verify: validator reads the Task reply
     - Pass: all five answered with a URL each
     - Fail: any unanswered → validator flags and re-dispatches research

### Wave 1 — Validation Gate

**V1: Validate wave 1** [sonnet] — validator-heavy
- Blocked by: T1, T2
- Checks:
  1. Run T1 acceptance criteria 1–4 above (counts, validate, source:winget, comment format)
  2. `winget configure validate -f winget/configuration/core.dsc.yaml` exits 0 with no deprecation warnings; repeat for work, dev
  3. `winget configure test -f winget/configuration/core.dsc.yaml` runs to completion and reports resource states without errors; repeat for work, dev. This is the real "dry-run" — confirms the DSC resource can be invoked and the current machine state is readable.
  4. Confirm T2 research note is complete; if any of the five questions unanswered, block
  5. Source verification: every package ID in the three YAMLs is reachable via `winget show --source winget --id <id>` (spot-check 3 random IDs per file, AND verify none resolve only to `msstore`). Fails guard against BUG-3 (winget-cli#6091).
- On failure: create fix task targeting the specific YAML or research gap, re-validate

### Wave 2 (parallel)

**T3: Refactor Install-Packages to use `winget configure`** [sonnet] — builder
- Blocked by: V1
- Description: Replace the body of `Install-Packages` (install.ps1 lines ~692–1013) for the **winget-package** portions only. Specifically:
  - Delete `$corePackages`, `$workPackages`, `$devPackages` arrays (lines 49–94)
  - Delete `Install-WingetPackage` function (lines 348–382)
  - At the top of `Install-Packages`, assert `winget --version` parses to `[version]` ≥ `1.6` and throw with a clear message if not (see HARD-4)
  - Replace the "Core Packages" / "Developer Packages" / "Work Packages" loops with `winget configure --accept-configuration-agreements -f <path>` calls. For each group, run `winget configure test -f <path>` first and log its output as a pre-flight delta (see HARD-1), then the actual `configure` call
  - **Preserve the pin loop** (lines 713-717) — DSC `version:` is not a pin (winget-cli#3401, #5244). The loop currently iterates an array; rewrite it to iterate the YAML by reusing T4's YAML reader to read any entries that carry `version:`. Pin loop is dead code today (no packages have versions) but stays for future use.
  - Preserve: `$script:failed` tracking (non-zero exit appends `"winget-configure:<group>"`), WinGet Links blocks, npm/pip/uv/MSYS2/zsh/PS module/RSAT sections
  - Run `winget source update --accept-source-agreements` once before the first `winget configure` call, to mitigate residual per-source agreement prompts (BUG-3 guard)
  - `-ListPackages` is handled by T4 — leave the `if ($ListPackages)` block alone
- Files: `install.ps1`
- Acceptance Criteria:
  1. [ ] `install.ps1` no longer contains `$corePackages`, `$workPackages`, `$devPackages`, or `Install-WingetPackage`
     - Verify: `(Select-String -Path install.ps1 -Pattern '\$(core|work|dev)Packages|Install-WingetPackage').Count`
     - Pass: `0`
     - Fail: stale reference → remove
  2. [ ] Script parses as valid PowerShell
     - Verify:
       ```
       pwsh -NoProfile -Command "$t=$null; $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path './install.ps1'), [ref]$t, [ref]$e); if ($e) { $e | ForEach-Object { $_.Message }; exit 1 }"
       ```
     - Pass: exit 0, no output
     - Fail: print errors and fix
  3. [ ] `winget configure` is invoked exactly once per selected group (comment-insensitive structural check)
     - Verify: `(Select-String -Path install.ps1 -Pattern '^\s*[^#]*winget\s+configure\s+--accept-configuration-agreements\s+-f').Count`
     - Pass: `3` (core always, work behind `-Work`, dev behind `-Dev`)
     - Fail: wrong count → adjust conditional structure
  4. [ ] Failure tracking still populates `$script:failed`
     - Verify: `Select-String -Path install.ps1 -Pattern '\$script:failed\s*\+='` returns at least as many hits as the pre-refactor file (run on both versions and compare)
     - Pass: explicit `if ($LASTEXITCODE -ne 0) { $script:failed += "winget-configure:$group" }` present per group
     - Fail: missing → add
  5. [ ] `winget --version` assertion is present
     - Verify: `Select-String -Path install.ps1 -Pattern "\[version\].*'1\.6'"` returns ≥ 1 hit
     - Pass: assertion present
     - Fail: add per HARD-4

**T4: Rewrite `-ListPackages` to read from DSC YAMLs** [sonnet] — builder
- Blocked by: V1
- Description: Replace the body of the `if ($ListPackages)` block (lines 117–134) so it reads the three `winget/configuration/*.dsc.yaml` files and prints the same three sections (`Core Packages`, `Work Packages`, `Developer Packages`) with the same colors and the same `<id> - <name>` layout. IT Admin modules and user modules sections are unchanged.
- **YAML parser contract (locked to T1's format):** use a regex line parser — do NOT add a `powershell-yaml` module dependency. Regex: `^\s*id:\s+(?<id>\S+)\s{2}#\s+(?<name>.+?)\s*$`. Two spaces before `#`, one after. Matches T1's emitted format exactly.
- Note: neither PS 5.1 nor PS 7 ships a `ConvertFrom-Yaml` cmdlet; both would require the `powershell-yaml` community module. Regex parser is the KISS call for this fixed-shape file.
- Files: `install.ps1`
- Acceptance Criteria:
  1. [ ] `install.ps1 -ListPackages` output contains every package ID from all three YAML files
     - Verify (PowerShell-native):
       ```
       $out = pwsh -NoProfile -File install.ps1 -ListPackages
       $ids = Select-String -Path winget/configuration/*.dsc.yaml -Pattern '^\s*id:\s+(\S+)' | ForEach-Object { $_.Matches[0].Groups[1].Value }
       $missing = $ids | Where-Object { $out -notmatch [regex]::Escape($_) }
       if ($missing) { $missing; exit 1 }
       ```
     - Pass: no missing IDs
     - Fail: debug YAML reader / regex format drift
  2. [ ] Output format matches pre-migration shape (three color-coded sections + IT Admin + user modules)
     - Verify: capture pre-migration snapshot from the `main` branch before starting the refactor (`git show main:install.ps1 | pwsh -Command "Set-Content /tmp/before-install.ps1 -"`; run it; save output). Diff against feature-branch output.
     - Pass: same headers, same ordering within each group as YAML file order, every ID present
     - Fail: reformat

### Wave 2 — Validation Gate

**V2: Validate wave 2** [sonnet] — validator-heavy
- Blocked by: T3, T4
- Checks:
  1. Run T3 (AC 1-5) and T4 (AC 1-2) acceptance criteria
  2. `pwsh -NoProfile -File install.ps1 -ListPackages` succeeds and shows the right package counts (36 total winget IDs)
  3. PowerShell parse check (corrected form — `[ref]$null` is invalid):
     ```
     pwsh -NoProfile -Command "$t=$null; $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path './install.ps1'), [ref]$t, [ref]$e); if ($e) { $e | ForEach-Object { $_.Message }; exit 1 }"
     ```
     Pass: exit 0
  4. Cross-task integration: both T3's install flow and T4's list flow read the same YAML files, so verify a fresh package added to `core.dsc.yaml` shows up in both `-ListPackages` output and the `winget configure test` pre-flight (add a test entry, run both, remove the entry)
  5. State-diff (not dry-run — that flag does not exist): `winget configure test --accept-configuration-agreements -f winget/configuration/core.dsc.yaml` completes without errors and, on a machine where packages are already installed, reports the resources as "in desired state" / equivalent language
- On failure: fix task targeting specific check, re-validate

### Wave 3

**T5: Documentation updates** [haiku] — builder-light
- Blocked by: V2
- Description: Update three docs to reference the new DSC config layout. Do not invent new sections — find existing mentions of package arrays / Brewfile / winget and update them in place.
- Files:
  - `AGENTS.md` — update the install/packages section if it references the array layout
  - `CLAUDE.md` — the "Claude and Windows installation note" section and any winget install pointer
  - `README.md` — if it documents how to add a package, update the instruction to "edit `winget/configuration/<group>.dsc.yaml`"
- Acceptance Criteria:
  1. [ ] No doc references `$corePackages`, `$workPackages`, or `$devPackages` arrays
     - Verify: `grep -rnE '\$(core|work|dev)Packages' AGENTS.md CLAUDE.md README.md`
     - Pass: no matches
     - Fail: update remaining references
  2. [ ] Each doc that currently explains how to add a package now points at `winget/configuration/<group>.dsc.yaml`
     - Verify: `grep -l 'winget/configuration' AGENTS.md CLAUDE.md README.md`
     - Pass: at least one file mentions the new path (whichever ones documented the old workflow)
     - Fail: add the pointer

### Wave 3 — Validation Gate

**V3: Validate wave 3** [haiku] — validator
- Blocked by: T5
- Checks:
  1. Run T5 acceptance criteria
  2. `grep -rn 'Install-WingetPackage' .` returns no matches outside `.specs/` and historical logs
- On failure: fix task, re-validate

## Dependency Graph

```
Wave 1: T1, T2 (parallel) → V1
Wave 2: T3, T4 (parallel) → V2
Wave 3: T5 → V3
```

## Success Criteria

1. [ ] **VM smoke test is a merge gate, not an optional post-check.** Running `pwsh -NoProfile -File install.ps1 -Dev -Work -ForcePackages` on a clean Windows VM produces the same installed package set as the pre-migration script
   - Verify:
     1. Snapshot clean VM
     2. Capture `winget list --source winget` on `main` after a clean install
     3. Revert, check out feature branch, re-run installer
     4. Diff the two `winget list` outputs
   - Pass: every package ID from pre-migration is present at same-or-newer version; no unexpected additions
   - Fail: block merge; do not ship
2. [ ] Running `pwsh -NoProfile -File install.ps1 -ListPackages` on main branch vs feature branch shows the same IDs in the same sections
   - Verify: `git stash; pwsh -File install.ps1 -ListPackages > $env:TEMP\before.txt; git stash pop; pwsh -File install.ps1 -ListPackages > $env:TEMP\after.txt; Compare-Object (Get-Content $env:TEMP\before.txt) (Get-Content $env:TEMP\after.txt)`
   - Pass: only cosmetic differences (headers, coloring) — every ID present in both
3. [ ] Re-running `install.ps1` on an already-configured machine is a no-op for winget packages (DSC idempotency)
   - Verify: `pwsh -NoProfile -File install.ps1 -ForcePackages` twice; check second run's `winget configure` section reports all resources "in desired state"
   - Pass: no installs on second run
4. [ ] `-SkipPackages`, `-Work`, `-Dev`, `-ITAdmin`, `-NoElevate` all still behave as documented
   - Verify: manual smoke test of each flag on a VM (see handoff note about pre-existing `-ForcePackages`/`-NoElevate` propagation gap)
   - Pass: behavior matches `install.ps1` `.SYNOPSIS` block
5. [ ] `~/.dotfiles.lock` still written with all existing fields
   - Verify: `Get-Content ~/.dotfiles.lock | ConvertFrom-Json | Select-Object -ExpandProperty PSObject | Select-Object -ExpandProperty Properties | ForEach-Object Name`
   - Pass: contains `installed_at`, `install_reason`, `work`, `dev`, `itadmin`

## Handoff Notes

- **`winget configure` exit codes are not as well documented as `winget install`.** T2 research must pin this down. Fallback: parse stdout for "Failed" lines, or accept all-or-nothing semantics and set `$script:failed += "winget-configure:<group>"` on any non-zero exit. Either is acceptable — pick based on T2 findings.
- **PowerShell YAML parsing — corrected note.** Neither PS 5.1 nor PS 7 ships a `ConvertFrom-Yaml` cmdlet. `ConvertFrom-Yaml` comes from the `powershell-yaml` community module, not `Microsoft.PowerShell.Utility`. T4 uses a regex line parser — do NOT replace it with `Import-Module powershell-yaml` thinking PS 7 "solves" this. It does not.
- **Pin loop stays.** DSC `WinGetPackage` `version:` is an install-time target, not an upgrade pin (winget-cli#3401, #5244). T3 rewrites the loop to read any `version:`-bearing entries from the YAMLs, but the loop itself remains. It's dead code today (no packages carry `Version`) — preserved for future use.
- **`winget configure --dry-run` does not exist.** Anywhere the plan or install.ps1 would naturally reach for "dry run", use `winget configure test -f <file>` (state diff) or `winget configure validate -f <file>` (schema check). Pre-flight each `configure` call with `test` for free telemetry (HARD-1).
- **Schema URL 0.2 is stable; V1 fails on deprecation warnings.** Use `https://aka.ms/configuration-dsc-schema/0.2`. `dscv3` is experimental — do not adopt until it graduates. V1 check #2 greps for "deprecat" in validate output to catch schema drift early (HARD-2).
- **Minimum winget version 1.6 is asserted at `Install-Packages` entry.** If a user's machine has older winget, the refactor throws with a clear message rather than silently calling a non-existent subcommand (HARD-4).
- **Source lockdown: winget only, no msstore.** `--accept-configuration-agreements` has a known bug for msstore-sourced packages inside `winget configure` (winget-cli#6091). V1 spot-checks every ID resolves via `winget show --source winget --id <id>` (HARD-5). Plus a `winget source update --accept-source-agreements` runs once before the first `configure` call.
- **Lock-file trigger behavior change.** The existing lock-file trigger (install.ps1 lines 1473-1488) compares `install.ps1` mtime against the lock-file mtime. After this refactor, editing `winget/configuration/*.dsc.yaml` does NOT trigger a reinstall — only edits to `install.ps1` do. This is a behavior regression the plan explicitly accepts as a known trade-off: DSC `winget configure` is idempotent and fast on no-op, so running it on every install.ps1 edit is fine, but if you *only* touch a YAML you must re-run with `-ForcePackages`. If this becomes annoying in practice, extend the trigger to also watch the YAMLs (out of scope for this plan).
- **Pre-existing flag-propagation gap (NOT caused by this refactor).** install.ps1 lines 165-169 only propagate `-SkipPackages`, `-Work`, `-Dev`, `-ITAdmin` to the elevated child process. `-ForcePackages`, `-NoElevate`, and `-ListPackages` are dropped on elevation. This predates the DSC migration. Called out here so a future reader doesn't blame the refactor when `pwsh install.ps1 -ForcePackages` from a non-admin shell silently ignores the flag.
- **IT Admin / RSAT / user modules unchanged.** Stay in PowerShell arrays — not winget packages, and moving them to DSC (via `PSDscResources`) is a bigger project. Out of scope.
- **No test harness exists** for install.ps1. All verification is manual. VM smoke test is now a formal Success Criterion (#1), not a handoff note.
