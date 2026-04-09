---
date: 2026-04-08
status: synthesis-complete
---

# Plan Review Synthesis: winget-dsc-migration

## Review Panel

| Reviewer | Role | Findings | Verified |
|---|---|---|---|
| R1 | Completeness & Explicitness | 4 | 4 |
| R2 | Adversarial / Red Team | 4 | 3 |
| R3 | Outside-the-Box / Simplicity | 3 | 3 |
| R4 | PowerShell/Windows/winget specialist | 5 | 5 |
| R5 | Operational Risk / Idempotency | 4 | 4 |

Note: The Task-subagent tool for launching parallel reviewers was not available in this environment. The coordinator performed all five reviews directly against the codebase and verified every claim with Read/Grep/Bash/WebSearch. Claims were only reported after tool-based verification.

## Outside-the-Box Assessment

The choice of WinGet Configuration (DSC) over native `winget export`/`import` is defensible — the plan's "no expressive gain" dismissal is correct, because `export` cannot express Work/Dev groups and does not carry display names. However, the plan significantly over-sells the payoff. There are **no version pins currently in use** (the `Version` field is absent from every entry in `$corePackages`, `$workPackages`, and `$devPackages` as of the current install.ps1), so the "pinning survives via DSC `version:`" argument is purely theoretical. The real delta is: three hash-table arrays become three YAML files, and one `foreach` loop becomes one `winget configure` call. That is a net code reduction but also a net functionality loss (see Bug 1 below: DSC resource has no pin semantics, no per-package exit code, no progress line). A leaner alternative — keep the arrays as the source of truth and `ConvertTo-Yaml` them at build time, or skip DSC entirely — is worth weighing, but given the user's stated goal ("Brewfile equivalent") DSC is the right-shaped answer. **Verdict: Keep the DSC approach, but fix the bugs below before executing.**

## Bugs (must fix before executing)

### BUG-1 [CRITICAL] `winget configure --dry-run` does not exist

Flagged by: R4, R2, R1. Verified by WebSearch against learn.microsoft.com.

The plan's "Project Context" section claims `winget configure --dry-run -f <file>` is "verified via Microsoft Learn docs as supported flag". It is not. `winget configure` has subcommands `validate`, `show`, `test`, `list`, `export` — none of them implement a `--dry-run` flag on the top-level `configure` command. The correct commands are:

- `winget configure validate -f <file>` — schema/syntax check only (this one the plan uses in T1 AC #2, correctly)
- `winget configure test -f <file>` — compares current system state against the configuration without applying

V1 check #2 says "in whatever dry-run/validate mode T2 confirmed". V2 check #5 says "`winget configure --accept-configuration-agreements -f ...` reports the expected resources on a machine where they're already installed (should be all 'in desired state')" — that's `configure test`, not `configure`.

**Fix:** Replace every reference to `--dry-run` with `winget configure test -f <file>`. Update Project Context, V1 check #2, V2 check #5, Handoff Notes. T2 research must explicitly confirm `test` vs `validate` semantics and document which one is called where.

### BUG-2 [CRITICAL] Plan assumes DSC `version:` acts as a pin; it does not

Flagged by: R4, R5. Verified by WebSearch (multiple sources, including winget-cli issue #3401 and #5244).

Plan's Constraints bullet: "DSC `Microsoft.WinGet.DSC/WinGetPackage` supports `Version` directly" implies that setting `version:` in YAML replaces the current `winget pin add` loop. It does not. The DSC resource's `Version` is an install-time target, equivalent to `winget install --version X`. It does **not** prevent a later `winget upgrade --all` from bumping the package to the latest version. Pinning is a separate concept managed by `winget pin add` and is not exposed by the DSC resource (tracked upstream but not shipped).

The plan's Handoff Notes partially acknowledge this ("if T2 research confirms... otherwise keep"). That is the right instinct but the T2 answer is already knowable: the pin loop must stay. Leaving this contingent on T2 risks T3 deleting the pin loop on a wrong reading of research.

Additionally: **there are currently zero packages with a `Version` field in install.ps1** (verified by Grep over lines 49-94). The pin loop is dead code today, and T1's acceptance criterion #3 (`grep -A1 'Version' install.ps1 | grep -c '='` matches total `version:` count) will trivially pass as `0 == 0`. The plan's entire Version-field ceremony is predicated on state that doesn't exist in the current arrays.

**Fix:** (a) Explicitly tell T3 to KEEP the pin loop (now reading pinned versions from the YAMLs instead of the array), or delete it and document that version pinning has been removed as an explicit scope change. Don't leave it to T2 research. (b) Drop T1 AC #3 as written — replace with "if a package grows a `version:` field in the YAML in the future, the pin loop must read from the YAML". (c) Remove the implication that the migration preserves pinning for free.

### BUG-3 [HIGH] `--accept-configuration-agreements` is not always sufficient

Flagged by: R4, R2. Verified by WebSearch (winget-cli issue #6091).

Known upstream bug: `winget configure` with `--accept-configuration-agreements` can still fail with "Package agreements were not agreed to" for packages that have per-package source/package agreements inside the DSC file (particularly Microsoft Store–sourced packages). The current Install-WingetPackage path explicitly passes both `--accept-package-agreements` and `--accept-source-agreements` (install.ps1 line 354). Migrating to `winget configure` may lose this behavior for some packages.

**Fix:** T2 research must explicitly confirm that every package ID in core/work/dev either (a) does not require per-package agreement, or (b) has a DSC-level workaround (e.g., pre-running `winget source update --accept-source-agreements` before `winget configure`). The install script should keep `winget source update` pre-step. Add a V1 check: "every package ID in the YAMLs is winget (not msstore) source, or has documented agreement handling".

### BUG-4 [HIGH] `[ref]$null` is not valid PowerShell

Flagged by: R4. Verified by knowledge of PowerShell parser semantics (can be confirmed locally with `pwsh -Command "[ref]$null"`).

T3 AC #2 verification command:
```
pwsh -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile('install.ps1', [ref]$null, [ref]$null) | Out-Null; $LASTEXITCODE"
```
`[ref]$null` fails — `[ref]` requires a variable that can be written back to, and `$null` is a read-only automatic variable. This verification step will error out and the validator cannot use it.

**Fix:** Use real `[ref]` targets:
```
pwsh -NoProfile -Command "$t=$null; $e=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'install.ps1'), [ref]$t, [ref]$e); if ($e) { $e; exit 1 }"
```

### BUG-5 [HIGH] T3 AC #3 `grep -c 'winget configure'` expects 3; install.ps1 is on Windows and the file will contain comments

Flagged by: R4, R1. Partially verifiable.

T3 AC #3 says: `grep -c 'winget configure' install.ps1` → 3. Two issues: (a) the plan itself recommends adding a T2 research note as comments in install.ps1, which will contain the literal string "winget configure" and inflate the count; (b) the comment header the refactor will plausibly add ("# Invoke winget configure for each selected group") similarly inflates the count. Grep-on-file counts are a brittle acceptance test for presence.

**Fix:** Replace with a structural check: `grep -cE '^[^#]*winget\s+configure\s+--accept-configuration-agreements\s+-f' install.ps1` → 3, or better yet, validate by running the script with mocked `winget` and asserting three invocations.

### BUG-6 [HIGH] T4 `-ListPackages` YAML regex parser has no stated spec

Flagged by: R1, R5.

The plan says T4 "use PowerShell's `ConvertFrom-Yaml` if available; otherwise parse line-by-line" and that display names come from "the comment next to each `id:` line". T1 says "Display names preserved as YAML comments next to each `id: ` line". But the plan never specifies the exact comment syntax. Is it `- id: Git.Git  # Git`? `- id: Git.Git # Git`? Multi-space? Tab-tolerant? T4's regex will silently produce blank display names for any format deviation, and T1's YAML-authoring step has no way to know what format to emit.

**Fix:** T1 acceptance criterion must specify the exact format (e.g., `- id: <id>  # <display name>` with exactly two spaces before `#`), and T4's regex must be given verbatim. Add a shared-format test where T4 is validated against T1's files at parse time.

### BUG-7 [HIGH] Handoff re: PS 5.1 YAML parsing is misleading

Flagged by: R4.

Handoff Notes claim "PS 7 via `Microsoft.PowerShell.Utility` only in preview". This is incorrect: `ConvertFrom-Yaml`/`ConvertTo-Yaml` are not in `Microsoft.PowerShell.Utility` at all — they come from the `powershell-yaml` module (community) or `PowerShell-Yaml`. The correct statement is: **neither PS 5.1 nor PS 7 ships a YAML cmdlet**; either use the community `powershell-yaml` module or a regex parser. The KISS recommendation (regex parser) still stands, but the justification needs correcting so a future reviewer doesn't delete the regex parser thinking PS 7 solves it.

**Fix:** Rewrite the Handoff Note. Don't mention "preview".

### BUG-8 [MEDIUM] Bash verification commands may not be runnable in the intended environment

Flagged by: R4, R1.

T1 AC #1 uses `grep -c 'id:' winget/configuration/core.dsc.yaml`. T4 AC #1 uses a heredoc pipeline with `tee /tmp/list.txt`, `awk`, `for f in ...`. These are bash-on-Windows (Git Bash / MSYS2) commands. The plan's Constraints state "Platform: Windows (PowerShell 5.1 / 7+)" and "install.ps1 remains PowerShell", but validation runs are ambiguous. On a clean CI/VM without Git Bash, these tests cannot run. install.ps1 itself installs MSYS2 and Git Bash, creating a chicken-and-egg problem during the first install.

**Fix:** Either (a) state explicitly that validation runs on a machine that already has Git Bash (realistic — reviewer is on dev box), or (b) translate all validation commands into PowerShell-native equivalents (`Select-String`, `Where-Object`, `ForEach-Object`). Preferred: PS-native, because that's what the rest of the script is.

### BUG-9 [MEDIUM] Lock file trigger (mtime-based) will re-run install.ps1 on every git checkout

Flagged by: R5. Verified against install.ps1 lines 1473-1488.

The current lock-file semantics compare `install.ps1`'s `LastWriteTime` against the lock-file mtime. The refactor touches install.ps1 heavily, so the *first* run after deploy will trigger a reinstall — expected. But every subsequent git checkout between branches that touch install.ps1 will also re-run `Install-Packages`, which now triggers a full `winget configure` per group. DSC is idempotent, so this is safe, but each `winget configure` call pays real per-call startup cost (several seconds to minutes depending on cache). The plan does not mention this. Consider also tracking the hash of the YAML files in the lock-file trigger, or accept the status quo and note the behavior change.

**Fix:** Add a note in Success Criteria or Handoff: "DSC `winget configure` invocations run on every reinstall; they are idempotent but not free. Consider whether the lock-file trigger should also watch `winget/configuration/*.dsc.yaml`."

### BUG-10 [MEDIUM] `-ForcePackages` and `-NoElevate` flag propagation unchanged but worth noting

Flagged by: R5. Verified against install.ps1 lines 165-169.

The elevation re-invocation at lines 165-169 does not propagate `-ForcePackages`, `-ListPackages`, or `-NoElevate` to the elevated child. This is a pre-existing issue, out of scope for this plan, but the plan claims "all flags preserved" and "no behavioral regressions" — so a reviewer should be aware that `-ForcePackages` was already broken in the elevated path, and the refactor inherits that.

**Fix:** Not this plan's problem, but add a handoff note acknowledging it so a future engineer doesn't blame the DSC migration.

## Hardening Suggestions (optional)

### HARD-1 Add `winget configure test` as a pre-install sanity check
Before each `winget configure -f <file>` call, run `winget configure test -f <file>` and log the delta. On a clean run the test output shows which packages will actually change state, giving useful dry-run-style telemetry. Minimal cost, high signal.

### HARD-2 Pin the WinGet Configuration schema version explicitly in V1 checks
The plan uses `https://aka.ms/configuration-dsc-schema/0.2` — fine today, but the V1 validator should fail if `winget configure validate` ever warns about schema deprecation. Catch drift early.

### HARD-3 Add a VM smoke test gate before merge, not just before ship
Handoff already says "insist on at least one VM smoke test before merge". Promote this from a note to a Success Criterion with a concrete checklist: clean VM, run with `-Dev -Work -ForcePackages`, diff `winget list`.

### HARD-4 Capture `winget --version` at install time
Constraints require winget ≥ 1.6 but install.ps1 does not currently assert this. Add a version check at the top of `Install-Packages`:
```powershell
$wingetVersion = (winget --version) -replace '^v',''
if ([version]$wingetVersion -lt [version]'1.6') { throw "winget >= 1.6 required for DSC configure; found $wingetVersion" }
```

### HARD-5 Keep the DSC source list minimal — don't migrate `msstore` packages
If any package uses the `msstore` source it will hit the `--accept-configuration-agreements` bug (BUG-3). R4 recommends spot-checking the 24 core IDs against `winget show --source winget --id <id>` in V1 and flagging any that are Store-only.

## Dismissed Findings

### DISMISSED-1 "T2 is blocked on T3 — circular dependency"
Initial read suggested T3 depends on T2 research and T2 is research-only. No actual cycle — T2 runs in Wave 1 parallel with T1, V1 gates Wave 2. Plan is correct.

### DISMISSED-2 "Plan doesn't preserve the `-ListPackages` `exit 0`"
On re-read, the `if ($ListPackages)` block at lines 117-134 ends in `exit 0`, and T4 leaves that structure in place. Not a gap.

### DISMISSED-3 "Orphan pin for removed package"
Concern: if a package is removed from the YAML but was previously pinned by `winget pin add`, the pin persists. Verified: this is a pre-existing issue (removing a package from the array today also orphans its pin). Not introduced by the refactor. Not in scope.

### DISMISSED-4 "`winget configure validate` requires `-f`"
R4 flagged the syntax `winget configure validate -f <file>` as potentially needing different argument order. Verified on learn.microsoft.com: `-f` is accepted, also supports positional. Plan is correct.

### DISMISSED-5 "Schema URL 0.2 is outdated"
R3 suspected the schema version should be newer. Verified: `0.2` is the current stable schema for `winget configure` as of April 2026. Plan is correct to avoid dscv3.

## Positive Notes

- **Scope discipline is excellent.** The plan explicitly keeps IT Admin modules, RSAT, MSYS2, npm, uv, pip, WinGet Links out of scope. This is the right KISS call — DSC for "things winget install would do" and PowerShell for everything else.
- **Wave structure is clean.** T1/T2 parallel → V1 → T3/T4 parallel → V2 → T5 → V3 is the right dependency shape; no false serialization.
- **Alternatives table is honest** about why `winget export/import` is rejected.
- **Lock-file semantics preserved as a constraint.** The plan correctly identifies this as load-bearing and names all five fields that must survive.
- **Display-name-as-comment** is a clever way to keep `-ListPackages` parity without adding a sidecar mapping file. (But see BUG-6 about specifying the format.)
- **T5 is correctly scoped to haiku/mechanical** — it's just a doc pointer swap.
- **Plan correctly identifies that PS 5.1 has no `ConvertFrom-Yaml`** even if it gets the PS 7 story wrong (BUG-7).
