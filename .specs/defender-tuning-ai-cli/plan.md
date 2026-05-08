---
created: 2026-05-08
status: draft
completed:
---

# Plan: Defender RTP tuning for AI CLI workloads

## Context & Motivation

User runs Claude Code, OpenAI Codex CLI, pi (`@earendil-works/pi-coding-agent`,
formerly `@mariozechner/pi-coding-agent`), and Gemini CLI on Windows 11
Enterprise (12-core). These agents spawn many short-lived child processes
(`node`, `git`, `find`, `grep`, `rg`, `python`) that read/write thousands of
small files in `node_modules`, `.venv`, `.git/objects`, JSONL transcripts, etc.
With Microsoft Defender Real-Time Protection (RTP) on, `MsMpEng.exe` spikes
CPU during agent work. Disabling RTP entirely eliminates the spikes but is a
significant security regression.

This session already:
- Added `Set-MpPreference -ExclusionPath` for `~/.dotfiles`, `C:\Projects`,
  `~/.claude`, `~/.copilot`, `~/.pi`, `~/.config/opencode`, `~/.cache`,
  `C:\Program Files\Git\mingw64\bin`, `C:\Program Files\Git\usr\bin`.
- Added `Set-MpPreference -ExclusionProcess rg.exe`.
- Removed npm cache exclusions because of the recent npm supply-chain CVE wave.
- Patched `~/.dotfiles/pi/lib/commit/git.ts`, `~/.dotfiles/pi/extensions/workflow-commands.ts`,
  `~/.dotfiles/pi/lib/yaml-helpers.ts`, `~/.dotfiles/pi/extensions/operator-status.ts`,
  `~/.dotfiles/pi/extensions/subagent/index.ts`, `~/.dotfiles/pi/extensions/pwsh.ts`,
  `~/.dotfiles/pi/extensions/quality-gates.ts` -- to resolve the real Git binary
  on Windows, add `windowsHide: true`, and replace `which` with
  `where.exe` on Windows.

Confirmed via background research (sources cited inline below):
- `ScanAvgCPULoadFactor` and `EnableLowCpuPriority` apply only to scheduled and
  on-demand scans, not RTP. Documented at
  https://learn.microsoft.com/en-us/powershell/module/defender/set-mppreference?view=windowsserver2025-ps
- Tamper Protection (which is ON for this user) blocks
  `DisableBehaviorMonitoring`, `DisableIOAVProtection`,
  `MAPSReporting=Disabled`, `SubmitSamplesConsent=NeverSend`,
  lowering `CloudBlockLevel`, and `PUAProtection=Disabled` from PowerShell.
  Verified via the same Set-MpPreference reference and
  https://cloudbrothers.info/en/current-limits-defender-av-tamper-protection/
- Microsoft's own highest-leverage recommendation for dev workloads is the
  ReFS Dev Drive with Performance Mode -- "significantly better protection
  than... folder exclusions" --
  https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-endpoint-antivirus-performance-mode
- Contextual exclusions (process-scoped, OnAccess) narrow broad path
  exclusions without losing scan coverage for other processes:
  https://learn.microsoft.com/en-us/defender-endpoint/configure-contextual-file-folder-exclusions-microsoft-defender-antivirus
- Performance Analyzer (`New-MpPerformanceRecording` + `Get-MpPerformanceReport`)
  gives per-file/per-process scan attribution:
  https://learn.microsoft.com/en-us/defender-endpoint/tune-performance-defender-antivirus

## Constraints

- Platform: Windows 11 Enterprise, 12 cores
- Shell: PowerShell 7+ (`pwsh`); Bash via Git for Windows also available
- Tamper Protection is ON. Plan must NOT depend on disabling it. Settings
  blocked by Tamper Protection are out of scope.
- Existing Defender exclusion list (preserve unless explicitly migrating):
  `C:\Program Files\Git\mingw64\bin`, `C:\Program Files\Git\usr\bin`,
  `C:\Projects`, `C:\Users\mglenn\.cache`, `C:\Users\mglenn\.claude`,
  `C:\Users\mglenn\.config\opencode`, `C:\Users\mglenn\.copilot`,
  `C:\Users\mglenn\.dotfiles`, `C:\Users\mglenn\.pi`; processes: `rg.exe`.
- Security ceiling: do NOT re-add npm/pnpm cache path exclusions (recent
  supply-chain CVEs). Do NOT add broad process exclusions for `node.exe` or
  `git.exe` (same reason).
- All Defender configuration scripts must be self-elevating (the existing
  `defender-add-exclusions.ps1` / `defender-remove-exclusions.ps1` pattern in
  `C:\Users\mglenn\` is the precedent) and idempotent (Add-MpPreference is
  idempotent; removal scripts must be safe to re-run).
- ASCII punctuation only in any file content created by this plan.

## Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Disable RTP entirely | Zero RTP overhead; easiest | Major security regression; auto-reverts after 24h or reboot; user already rejected as ongoing posture | Rejected |
| Tune `ScanAvgCPULoadFactor`/`EnableLowCpuPriority` | One-line change | Per Microsoft docs, these only affect scheduled/on-demand scans, not RTP | Rejected (no RTP effect) |
| Add broad process exclusions for `node.exe`, `git.exe`, `python.exe` | Largest CPU win | Equivalent to disabling RTP for the most common malware-execution vectors; user rejected this on supply-chain risk grounds | Rejected |
| Add extension exclusions (`.pack`, `.idx`, `.pyc`, `.tsbuildinfo`) | Targeted; not Tamper-blocked; minimal security delta (these are not active malware vectors) | Requires data-driven validation that these are actually hot paths | **Selected** for Wave 2 |
| Convert path exclusions to contextual (process-scoped) `OnAccess` | Tightens posture vs current state -- only the named dev processes skip scans, others don't | Newer feature; needs verification that it works on the user's Windows build | **Selected** for Wave 3 |
| Performance Analyzer recording first | Drives later decisions from data, not guesses | Adds one waiting step | **Selected** for Wave 1 |
| ReFS Dev Drive + Performance Mode | Microsoft's documented best option for dev workloads | Requires creating a new ReFS volume (VHDX or partition) and migrating `C:\Projects` and `~/.dotfiles` onto it; large change | **Deferred** to a follow-up plan |

## Objective

Reduce `MsMpEng.exe` CPU overhead during AI-CLI agent workloads to a level
where the user no longer needs to disable RTP, while:

1. Preserving RTP coverage on all paths and processes that aren't part of the
   confirmed dev hot path.
2. Driving every additional exclusion from `Get-MpPerformanceReport` data
   rather than guesswork.
3. Producing reusable scripts (under `C:\Users\mglenn\`) so future tuning is
   auditable and reversible.

End state: a measurable drop in `Get-MpPerformanceReport`'s top-process /
top-file scan time during a representative agent session, plus an updated
exclusion configuration that does not require disabling RTP or Tamper
Protection.

## Project Context

- **Language**: PowerShell scripts (this plan creates / modifies `.ps1` files
  under `C:\Users\mglenn\`). No build system involved.
- **Test command**: none -- verification is operational (`Get-MpPreference`
  output before/after, `Get-MpPerformanceReport` deltas).
- **Lint command**: none.

## Task Breakdown

| # | Task | Files | Type | Model | Agent | Depends On |
|---|------|-------|------|-------|-------|------------|
| T0 | Reconcile live exclusion list with plan-declared baseline; remove stale npm/pnpm/.claude\projects entries; update reference script | 2 ps1 (1 modified, 1 new) + 1 txt | mechanical | sonnet | builder | -- |
| V0 | Validate Wave 0 reconciliation (live state matches Constraints baseline) | -- | validation | haiku | validator | T0 |
| T1 | Record Performance Analyzer baseline during representative agent activity | 1 ps1 + 1 etl + 1 txt | feature | sonnet | builder | V0 |
| T2 | Identify hot extensions and processes from baseline; decide additional exclusions | 1 md (decision log) | mechanical | haiku | builder-light | T1 |
| V1 | Validate Wave 1 baseline + decisions | -- | validation | haiku | validator | T1, T2 |
| T3 | Add extension exclusions (.pack, .idx, .pyc, .tsbuildinfo + any from T2) | 1 ps1 | mechanical | haiku | builder-light | V1 |
| T4 | Convert existing path exclusions to contextual process-scoped exclusions for node, git, python, pnpm | 1 ps1 | feature | sonnet | builder | V1 |
| V2 | Validate Wave 2 exclusions applied; record post-change Performance Analyzer data | -- | validation | sonnet | validator-heavy | T3, T4 |
| T5 | Compare baseline vs post-change Performance Analyzer reports; document outcome | 1 md | mechanical | haiku | builder-light | V2 |
| V3 | Validate Wave 3 outcome: scan time on top processes/files reduced or explain why not | -- | validation | haiku | validator | T5 |

## Execution Waves

### Wave 0 (sequential: T0)

**T0: Reconcile live exclusion list with plan baseline** [sonnet] -- builder
- Description: The on-disk reference script
  `C:\Users\mglenn\defender-add-exclusions.ps1` still hardcodes
  `AppData\Local\pnpm`, `AppData\Local\npm-cache`, `AppData\Roaming\npm`,
  and `.claude\projects` -- entries the Constraints section says were
  removed. The live `(Get-MpPreference).ExclusionPath` may also still
  contain them from a prior run. This task brings all three (script,
  live state, plan) into agreement BEFORE any V1 check compares against
  them.
  Steps:
  (a) Write `C:\Users\mglenn\defender-reconcile.ps1` (self-elevating
  using the corrected `-PassThru -Wait` pattern from Handoff Notes).
  Script dumps `(Get-MpPreference).ExclusionPath` and
  `(Get-MpPreference).ExclusionProcess` to
  `C:\Users\mglenn\defender-reconcile-before.txt`.
  (b) Compute set difference between live list and the 9-path "preserve"
  list in Constraints. For any extra entry that matches
  `(npm|pnpm|\.claude\\projects)`, run `Remove-MpPreference -ExclusionPath <entry>`.
  (c) For any "preserve" entry MISSING from the live list, run
  `Add-MpPreference -ExclusionPath <entry>`.
  (d) Edit `defender-add-exclusions.ps1` in place: remove the
  `$user\AppData\Local\pnpm`, `$user\AppData\Local\npm-cache`,
  `$user\AppData\Roaming\npm`, and `$user\.claude\projects` entries from
  the `$paths = @(...)` array.
  (e) Dump after-state to `defender-reconcile-after.txt` with the same
  ACL-fix idiom used by other scripts.
- Files:
  `C:\Users\mglenn\defender-reconcile.ps1` (new),
  `C:\Users\mglenn\defender-reconcile-before.txt` (output),
  `C:\Users\mglenn\defender-reconcile-after.txt` (output),
  `C:\Users\mglenn\defender-add-exclusions.ps1` (modified).
- Acceptance Criteria:
  1. [ ] After running, `(Get-MpPreference).ExclusionPath` (elevated dump)
     equals the 9-path Constraints list exactly (set equality).
     - Verify: open `defender-reconcile-after.txt`; compare to the 9-entry
       list in Constraints
     - Pass: same 9 entries, no extras, no missing
     - Fail: any extra/missing -> rerun with corrected diff logic
  2. [ ] `defender-add-exclusions.ps1` no longer contains the strings
     `AppData\Local\pnpm`, `AppData\Local\npm-cache`, `AppData\Roaming\npm`,
     `.claude\projects`.
     - Verify: `Select-String -Path C:\Users\mglenn\defender-add-exclusions.ps1 -Pattern 'pnpm|npm-cache|Roaming\\npm|claude\\projects' -SimpleMatch:$false`
     - Pass: zero matches
     - Fail: matches present -> re-edit the script
  3. [ ] `(Get-MpPreference).ExclusionProcess` still contains exactly
     `rg.exe` (no other process exclusions added or removed by T0).
     - Verify: dump the process list in
       `defender-reconcile-after.txt`
     - Pass: exactly `rg.exe`
     - Fail: drift -> investigate before continuing

### Wave 0 -- Validation Gate

**V0: Validate Wave 0** [haiku] -- validator
- Blocked by: T0
- Checks:
  1. T0 acceptance criteria 1, 2, 3 pass.
  2. The before/after txt files both exist and are readable by the
     non-elevated user (ACL fix applied).
- On failure: re-run T0 after fixing the specific check that failed; do
  NOT begin Wave 1 until V0 passes.

### Wave 1 (sequential: T1 -> T2)

**T1: Record Performance Analyzer baseline** [sonnet] -- builder
- Description: Write `C:\Users\mglenn\defender-perf-baseline.ps1` (self-elevating
  using the corrected `Start-Process -PassThru -Wait` exit-code-propagation
  pattern from Handoff Notes). The script must, in order:
  (1) **Pre-flight: cmdlet availability.** Verify
      `Get-Command New-MpPerformanceRecording -ErrorAction SilentlyContinue`
      returns a CommandInfo. If absent, write a clear message to the
      output txt explaining the missing component (likely
      `Add-WindowsCapability -Online -Name 'Windows-Defender-ApplicationGuard'`-class
      capability or WPR feature) and exit code 2 without recording.
  (2) **Pre-flight: managed-policy detection.** Run
      `Get-MpComputerStatus | Select-Object AMServiceEnabled, RealTimeProtectionEnabled, AntivirusEnabled, IsTamperProtected`
      and `Test-Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Exclusions'`.
      If the managed-policy registry path exists, write a "WARNING: Defender
      may be managed by Group Policy / Intune; locally-set exclusions can
      be silently overridden on next sync" line at the top of the output
      txt. Do NOT abort -- continue with the recording so the operator has
      data either way.
  (3) **Pre-flight: concurrency lock.** If
      `Get-Process -Name 'wpr' -ErrorAction SilentlyContinue` returns a
      process, exit with a clear message ("WPR/perf recorder already
      running -- close it before starting a new recording"). Exit code 3.
  (4) Print `Recording for 180 seconds. SWITCH to a separate non-elevated
      pwsh window NOW and exercise representative agent activity until
      this script returns.` Then run
      `New-MpPerformanceRecording -RecordTo $env:USERPROFILE\defender-perf-baseline.etl -Seconds 180`.
  (5) After recording, generate
      `C:\Users\mglenn\defender-perf-baseline.txt` with
      `Get-MpPerformanceReport -Path <etl> -TopFiles 50 -TopExtensions 20
      -TopProcesses 20 -TopScans 20 -TopPaths 10 -TopPathsDepth 4`. Apply the
      ACL-fix tail from `C:\Users\mglenn\defender-perf-record.ps1` so the
      report is readable to the non-elevated user. Append a final line
      `EXITCODE=0` so the calling parent shell can verify success.

  Operator orchestration (must be in plan AND echoed by the script before
  recording starts): the elevated shell that runs this script BLOCKS for
  180 seconds. The operator must, in a separate non-elevated pwsh window:
  (a) open Claude Code in `~/.dotfiles` and run a Bash + Grep + Edit
  sequence on a non-trivial file; (b) in another tab, run
  `pi /commit` against `~/.dotfiles` with at least one staged change.
  Both must run concurrently for most of the 180 s.
- Files: `C:\Users\mglenn\defender-perf-baseline.ps1` (new),
  `C:\Users\mglenn\defender-perf-baseline.etl` (output),
  `C:\Users\mglenn\defender-perf-baseline.txt` (output)
- Acceptance Criteria:
  1. [ ] Elevated child exit code propagated to parent and equal to 0
     (uses `Start-Process -PassThru -Wait` and either re-throws non-zero
     `$proc.ExitCode` or writes a final `EXITCODE=N` line that the
     parent / V1 reads).
     - Verify: `Select-String -Path C:\Users\mglenn\defender-perf-baseline.txt -Pattern '^EXITCODE=0$'`
     - Pass: exactly one match
     - Fail: missing or non-zero -> read txt for the reason; UAC denied
       and component-missing each have distinct messages
  2. [ ] Baseline txt contains non-empty TopFiles, TopProcesses, TopExtensions sections.
     - Verify: `Select-String -Path C:\Users\mglenn\defender-perf-baseline.txt -Pattern 'TopFiles|TopProcesses|TopExtensions' -SimpleMatch`
     - Pass: at least three matches, with 5+ entries under each header
     - Fail: empty sections -> usually means no agent activity in the
       second window during recording; rerun and follow the orchestration
       steps in the description
  3. [ ] ETL file is >= 1 MB (indicating real activity captured).
     - Verify: `(Get-Item C:\Users\mglenn\defender-perf-baseline.etl).Length`
     - Pass: >= 1048576
     - Fail: < 1 MB -> rerun with the second-window agent activity confirmed
       running for at least 150 of the 180 seconds
  4. [ ] If managed-policy registry path was detected, the warning line is
     present at the top of the txt; otherwise no warning is required.
     - Verify: `Select-String -Path C:\Users\mglenn\defender-perf-baseline.txt -Pattern 'managed by Group Policy|Intune' -SimpleMatch:$false`
     - Pass: presence matches detection state
     - Fail: detection-vs-warning mismatch -> fix the pre-flight branch

**T2: Identify hot exclusion candidates** [haiku] -- builder-light
- Blocked by: T1 (needs the txt)
- Description: Read `C:\Users\mglenn\defender-perf-baseline.txt` and write
  `C:\Users\mglenn\.dotfiles\.specs\defender-tuning-ai-cli\baseline-decisions.md`
  with: (a) ranked list of TopExtensions; (b) ranked list of TopProcesses
  whose ProcessPath is NOT already covered by an existing path exclusion;
  (c) the proposed exclusion set for T3 (extensions) and T4 (contextual
  process-scoped). The list of candidates to confirm: `.pack`, `.idx`,
  `.pyc`, `.tsbuildinfo`, plus any other extension contributing >= 5% of
  TotalDuration in the baseline.
- Files: `C:\Users\mglenn\.dotfiles\.specs\defender-tuning-ai-cli\baseline-decisions.md` (new)
- Acceptance Criteria:
  1. [ ] Decisions file lists at least the 4 candidate extensions and ranks each by total scan time.
     - Verify: `Select-String -Path C:\Users\mglenn\.dotfiles\.specs\defender-tuning-ai-cli\baseline-decisions.md -Pattern '\.pack|\.idx|\.pyc|\.tsbuildinfo' -SimpleMatch`
     - Pass: 4 matches, each with an associated time figure
     - Fail: missing entries -> re-read baseline.txt and update
  2. [ ] Each "add" decision cites the line in baseline.txt that supports it.
     - Verify: visual review
     - Pass: every proposed exclusion ties back to a measured row
     - Fail: any speculative addition -> remove or annotate as speculative

### Wave 1 -- Validation Gate

**V1: Validate Wave 1** [haiku] -- validator
- Blocked by: T1, T2
- Checks:
  1. T1 acceptance criteria pass (including the `EXITCODE=0` line and
     the managed-policy warning gate).
  2. T2 acceptance criteria pass.
  3. The decisions file's proposed exclusions do not overlap with the
     existing exclusion list (no duplicates).
     - Source for live list: read the elevated dump file
       `C:\Users\mglenn\defender-reconcile-after.txt` produced by T0
       (V0 confirmed it is current and ACL-readable). Parse the
       `ExclusionPath:` block into an array (one entry per line, trim
       leading whitespace).
     - Source for proposed list: parse
       `~/.dotfiles/.specs/defender-tuning-ai-cli/baseline-decisions.md`,
       extracting only lines under a heading "## Proposed exclusions"
       that match `^- ` (markdown list items); strip the leading `- `.
     - Verify: `Compare-Object -ReferenceObject $live -DifferenceObject $proposed | Where-Object SideIndicator -eq '=='` returns no rows.
     - Pass: zero overlap rows
     - Fail: any overlap -> remove from the proposed list before Wave 2
  4. No proposed addition reintroduces an `AppData\Roaming\npm`,
     `AppData\Local\npm-cache`, or `AppData\Local\pnpm` path exclusion.
     - Verify: `Select-String -Path ~/.dotfiles/.specs/defender-tuning-ai-cli/baseline-decisions.md -Pattern 'AppData\\Roaming\\npm|AppData\\Local\\npm-cache|AppData\\Local\\pnpm' -SimpleMatch`
     - Pass: zero matches
     - Fail: matches present -> reject the proposal; redo T2
- On failure: route the specific failure back to T1 or T2 for a fix; no Wave 2 work begins.

### Wave 2 (parallel: T3 + T4)

**T3: Apply extension exclusions** [haiku] -- builder-light
- Blocked by: V1
- Description: Write `C:\Users\mglenn\defender-add-extension-exclusions.ps1`
  (self-elevating) that calls `Add-MpPreference -ExclusionExtension` for the
  list confirmed in T2 (`.pack`, `.idx`, `.pyc`, `.tsbuildinfo` plus any
  approved additions). Mirror the structure of the existing
  `defender-add-exclusions.ps1`: BEFORE/ADDING/AFTER sections, ACL fix on the
  output txt, idempotent re-runs.
- Files: `C:\Users\mglenn\defender-add-extension-exclusions.ps1` (new),
  `C:\Users\mglenn\defender-add-extension-exclusions.txt` (output)
- Acceptance Criteria:
  1. [ ] Each approved extension is present in `(Get-MpPreference).ExclusionExtension` after run (admin shell).
     - Verify: `pwsh -Command "& { . { Start-Process pwsh -Verb RunAs -ArgumentList '-NoProfile','-Command','(Get-MpPreference).ExclusionExtension | Out-File ~/ext-check.txt' -Wait } ; Get-Content ~/ext-check.txt }"`
       (or read the AFTER section of the script's output txt)
     - Pass: every approved extension appears in the listing
     - Fail: missing extension -> check elevated transcript, re-run
  2. [ ] Script is idempotent (second run reports "no changes" or only re-OKs the same items, with no errors).
     - Verify: run the script twice; compare AFTER sections
     - Pass: identical exclusion set after both runs, exit code 0 each time
     - Fail: differences or errors -> the script is not idempotent; fix before V2

**T4: Convert path exclusions to contextual process-scoped** [sonnet] -- builder
- Blocked by: V1
- Description: Write `C:\Users\mglenn\defender-convert-contextual.ps1`
  (self-elevating using the `Start-Process -PassThru -Wait` exit-code
  pattern). This task uses Microsoft's documented contextual exclusion
  syntax: `Add-MpPreference -ExclusionPath '<path>\Process:"<full exe path>"'`
  -- the contextual modifier is appended to the path string with a
  backslash prefix; valid `ScanTrigger` modifiers are `\Scheduled`,
  `\OnDemand`, `\BM`. There is NO `OnAccess` keyword. Reference:
  https://learn.microsoft.com/en-us/defender-endpoint/configure-contextual-file-folder-exclusions-microsoft-defender-antivirus
  and the `Add-MpPreference` cmdlet reference.

  Subject paths and rationale:
  - **Convert**: `~/.dotfiles`, `C:\Projects`, `~/.claude`, `~/.copilot`,
    `~/.pi`, `~/.config\opencode`, `~/.cache`. These are repos / agent
    state where dev tools read/write but other processes generally
    should not.
  - **Keep broad** (do NOT convert): `C:\Program Files\Git\mingw64\bin`,
    `C:\Program Files\Git\usr\bin`. Git for Windows ships its own `bash.exe`,
    `find.exe`, `grep.exe`, `sed.exe`, `awk.exe`, `tar.exe`, etc. inside
    those bin directories and they self-execute / cross-execute
    constantly during git operations. Contextual scoping would require
    listing each of those binaries; the contextual scope ends up nearly
    identical to the broad scope and gains little. Document this
    explicitly in `defender-convert-contextual.txt` so a later auditor
    sees the deliberate decision.

  Subject processes (must be resolved to ABSOLUTE exe paths at script
  build time -- bare names will not match contextually):
  `node.exe`, `git.exe`, `python.exe`, `pnpm.exe`, `bash.exe` (Git for
  Windows), `nvim.exe`. For each process name, use `where.exe <name>`
  and emit one contextual entry per resolved absolute path. With multiple
  node installs (system, nvm-windows, pnpm-shipped, Windows Store), this
  yields 1-N entries per (path, process-name) cell. The script must
  also handle "process not found" by skipping that process gracefully
  with a logged note.

  Steps:
  (a) Resolve every process name to its absolute path(s) via
      `where.exe`. Build the cartesian product (path x resolved-exe).
      Persist the planned-additions list to a transcript file
      `C:\Users\mglenn\defender-convert-contextual-plan.txt` BEFORE
      mutating Defender state, so rollback can replay precisely.
  (b) Add ONE test contextual entry first -- e.g.
      `<temp-dir>\Process:"<resolved bash.exe>"` against a freshly-
      created `C:\Temp\dca-test\` -- and run the behavioral validation
      step (see AC1 below) BEFORE adding the rest of the entries.
  (c) If the behavioral validation passes, add all remaining
      contextual entries from the plan transcript.
  (d) If the behavioral validation fails (contextual narrowing not
      enforced on this build), iterate the planned-additions transcript
      and run `Remove-MpPreference -ExclusionPath '<exact entry>'` for
      every entry already added (precise rollback), then exit code 4
      with a clear message. Do NOT remove the broad path exclusions
      under any circumstance in this task.
  (e) On success, dump the final contextual exclusion entries to
      `defender-convert-contextual.txt` with the count, the planned vs
      actual comparison, the "kept broad: Git bins, see rationale"
      note, and the final `EXITCODE=0` sentinel.
- Files: `C:\Users\mglenn\defender-convert-contextual.ps1` (new),
  `C:\Users\mglenn\defender-convert-contextual.txt` (output),
  `C:\Users\mglenn\defender-convert-contextual-plan.txt` (transcript for rollback).
- Acceptance Criteria:
  1. [ ] **Behavioral support test passes**: with one contextual entry
     added against a temp directory `C:\Temp\dca-test\` scoped to the
     resolved `bash.exe`, drop the EICAR string into a file inside that
     dir; reading via the named process must NOT trigger detection
     (exclusion enforced); reading via `notepad.exe` or `cmd /c type`
     MUST trigger detection (broad coverage still in effect).
     - Verify: read script output txt for the paired-test result lines
       and the eventual rollback-or-proceed branch
     - Pass: asymmetric detection observed AND remaining entries added
     - Fail: symmetric (both detect or neither detects) -> the script
       must run the precise rollback (step (d)) before exiting code 4;
       the operator does NOT proceed to V2
  2. [ ] No broad path exclusion was removed by this task.
     - Verify: dump current `(Get-MpPreference).ExclusionPath` (elevated)
       and confirm all 9 entries from the post-T0 baseline are present
     - Pass: 9 entries unchanged; same set
     - Fail: any path missing -> immediate restore via
       `Add-MpPreference -ExclusionPath`
  3. [ ] All planned (path x resolved-exe) contextual entries from the
     transcript are present in `(Get-MpPreference).ExclusionPath`
     (each formatted as `<path>\Process:"<full exe path>"`).
     - Verify: read `defender-convert-contextual-plan.txt` for the planned
       list; read `defender-convert-contextual.txt` for the verified-after
       list; `Compare-Object` must show zero side-only rows.
     - Pass: planned == applied
     - Fail: drift -> rerun script (idempotent); inspect failures section
  4. [ ] The Git-bin paths (`C:\Program Files\Git\mingw64\bin`,
     `C:\Program Files\Git\usr\bin`) are NOT converted; the rationale
     line is present in the output txt.
     - Verify: `Select-String -Path C:\Users\mglenn\defender-convert-contextual.txt -Pattern 'Git\\(mingw64|usr)\\bin' -SimpleMatch`
     - Pass: matches present in the rationale block; no contextual
       entries created against those paths
     - Fail: Git bins converted -> revert those entries

### Wave 2 -- Validation Gate

**V2: Validate Wave 2** [sonnet] -- validator-heavy
- Blocked by: T3, T4
- Checks:
  1. T3 and T4 acceptance criteria pass.
  2. Re-run `New-MpPerformanceRecording -RecordTo
     $env:USERPROFILE\defender-perf-postchange.etl -Seconds 180` during a
     repeat of the same representative agent activity used in T1.
     Reuse T1's pre-flight checks (cmdlet availability, managed-policy
     warning, concurrency lock) and operator orchestration (second
     non-elevated window driving Claude Code + pi).
  3. Generate `C:\Users\mglenn\defender-perf-postchange.txt` mirroring T1's
     report parameters (`-TopFiles 50 -TopExtensions 20 -TopProcesses 20
     -TopScans 20 -TopPaths 10 -TopPathsDepth 4`).
  4. Confirm `(Get-MpPreference).ExclusionExtension` and contextual exclusion
     entries match what T3/T4 wrote (compare against the T4
     `defender-convert-contextual-plan.txt` transcript).
  5. **Paired EICAR test for contextual narrowing** (NOT a generic RTP
     smoke test). Steps, scripted via
     `C:\Users\mglenn\defender-eicar-paired.ps1` (self-elevating):
     (a) Stage a fresh dir `C:\Temp\eicar-smoke\` (created and ACL'd by
         the script). This avoids OneDrive Known Folder Move on
         `~/Downloads` and any pre-existing exclusions.
     (b) Stage a contextually-excluded subject path -- create
         `~/.dotfiles/.tmp-eicar-test/` (under a contextually excluded
         path) and write the EICAR string there.
     (c) Test 1 (control, non-excluded path):
         drop EICAR string in `C:\Temp\eicar-smoke\eicar.com` via
         `Set-Content`; confirm Defender quarantine event in
         `Microsoft-Windows-Windows Defender/Operational` log within
         30 s. PASS = detection event observed.
     (d) Test 2 (contextual exclusion in effect):
         from the contextually-excluded subject path, read the EICAR
         file with one of the resolved excluded processes (e.g.
         `node.exe -e "console.log(require('fs').readFileSync('<path>','utf8'))"`).
         PASS = no detection event for that read.
     (e) Test 3 (broad coverage retained):
         from the same contextually-excluded subject path, read the
         EICAR file with `notepad.exe` or `cmd /c type <path>`.
         PASS = detection event observed (broad scan still on for
         non-listed processes).
     (f) Cleanup: remove `C:\Temp\eicar-smoke\` and the temp test file
         under `.dotfiles`. Do not commit anything generated by this
         test to the dotfiles repo (ensure a gitignore line for
         `.tmp-eicar-test/` exists or use `--git-dir`-bypassing path).

     All three tests must pass for V2 to succeed. If Test 2 fails
     (detection occurred where contextual exclusion should have
     suppressed it) the contextual entry was not enforced -- T4
     either had wrong syntax or the build does not honor the
     modifier; trigger T4's rollback path. If Test 3 fails
     (no detection from notepad/cmd) the broad path coverage is gone
     and T4 over-applied; restore the broad path exclusion and
     re-investigate.
- On failure: identify which check regressed (extension entries lost,
  contextual entries missing, post-change recording empty, paired
  EICAR mismatch), create a fix task, re-validate.

### Wave 3 (sequential: T5)

**T5: Outcome comparison** [haiku] -- builder-light
- Blocked by: V2
- Description: Write
  `C:\Users\mglenn\.dotfiles\.specs\defender-tuning-ai-cli\outcome-report.md`
  comparing `defender-perf-baseline.txt` vs `defender-perf-postchange.txt`:
  TopFiles total scan time delta, TopProcesses total scan time delta,
  TopExtensions delta. Mark target as MET / PARTIAL / NOT MET. If NOT MET,
  list candidate next moves (most likely the deferred Dev Drive option, or
  a per-process scan-direction tweak, or further extension exclusions).
- Files: `C:\Users\mglenn\.dotfiles\.specs\defender-tuning-ai-cli\outcome-report.md` (new)
- Acceptance Criteria:
  1. [ ] Outcome report cites concrete before/after numbers from the txt files.
     - Verify: visual review
     - Pass: at least TopProcesses TotalDuration sum before/after, plus the
       headline metric (sum of top-20 scan time)
     - Fail: numbers missing -> re-read source txt files
  2. [ ] Outcome explicitly classifies result and lists next steps if not MET.
     - Verify: visual review
     - Pass: classification line present; if not MET, at least 2 next-step options
     - Fail: missing classification -> add it

### Wave 3 -- Validation Gate

**V3: Validate Wave 3** [haiku] -- validator
- Blocked by: T5
- Checks:
  1. T5 acceptance criteria pass.
  2. Outcome report is committed to the spec dir alongside this plan.
- On failure: create fix task, re-run.

## Dependency Graph

```
Wave 0: T0 -> V0
Wave 1: T1 -> T2 -> V1
Wave 2: T3, T4 (parallel) -> V2
Wave 3: T5 -> V3
```

## Success Criteria

1. [ ] User no longer needs `Set-MpPreference -DisableRealtimeMonitoring $true`
   to keep CPU usage tolerable during agent work.
   - Verify: run a 3-minute representative agent session with RTP fully
     enabled; observe `Get-Process MsMpEng | Select-Object CPU` deltas
     and Task Manager average -- aim for sustained < 5% of total system CPU
     (= ~60% of one core on a 12-core box).
   - Pass: average MsMpEng < 5% during the session
2. [ ] Top-N (N=20) process and file scan time in the post-change Performance
   Analyzer report is reduced vs the baseline by at least 50% on the
   dominant agent processes.
   - Verify: T5 outcome report classification line == MET
   - Pass: classification == MET
3. [ ] No exclusions added that reintroduce npm/pnpm cache paths or broadly
   exclude `node.exe`/`git.exe` as processes.
   - Verify: `(Get-MpPreference).ExclusionPath -join ';' | Select-String 'npm|pnpm'`
     and `(Get-MpPreference).ExclusionProcess -contains 'node.exe' -or (Get-MpPreference).ExclusionProcess -contains 'git.exe'`
   - Pass: no matches; both `-contains` checks return False
4. [ ] V2's three-test paired EICAR validation passed (Test 1 control
   detection in `C:\Temp\eicar-smoke\`; Test 2 contextual exclusion
   suppresses detection for the excluded process; Test 3 broad coverage
   still detects for a non-excluded process). NOTE: `~/Downloads` is
   intentionally NOT used because OneDrive Known Folder Move can interfere
   with detection-event timing.
   - Verify: read the V2 paired-EICAR script's output txt
   - Pass: all three tests passed
   - Fail: Test 2 fail -> contextual exclusion not enforced (rerun T4
     rollback); Test 3 fail -> broad coverage gone (restore broad
     exclusion); Test 1 fail -> RTP itself is broken (out of scope, file
     ticket)

## Validation Contract

`/do-it` must satisfy this contract before reporting the plan complete or archiving it.

### Required automated validation

1. [ ] Run the strongest repo-wide validation command for the touched code paths.
   - Command: `cd ~/.dotfiles/pi/extensions && pnpm run typecheck && cd ~/.dotfiles/pi/tests && pnpm test`
     (only required if Wave 2 / Wave 3 ends up modifying any pi customization;
     this plan is primarily Defender configuration so typecheck/test is
     defensive)
   - Pass: exits 0 with no errors
   - Fail: do not archive; update `## Execution Status` with the failing
     command and next fix

2. [ ] Run task-specific verification from every acceptance criterion above.
   - Command: see each task's `Verify:` command
   - Pass: every acceptance criterion passes
   - Fail: create/fix a task, rerun affected checks

### Manual validation

- Required: yes
- Steps:
  1. After V2: confirm in Windows Security UI that Real-Time Protection is
     still ON and Tamper Protection is still ON.
  2. After V2: run a 3-minute Claude Code + pi session in `~/.dotfiles`
     with active agent activity; visually monitor Task Manager
     "Antimalware Service Executable" -- target average < 5% CPU.
  3. Confirm the V2 paired EICAR test (three tests in `C:\Temp\eicar-smoke\`
     and a contextually-excluded subject path) all passed -- see Success
     Criteria #4 for the asymmetric-detection requirement.

If manual validation is required and not confirmed passed, `/do-it` must
classify the result as `implemented-awaiting-manual-validation`, update
`## Execution Status`, and must not archive the plan.

### Deployment validation

- Required: no
- Procedure: None.

### Archive rule

`/do-it` may archive this plan only after all required automated validation,
task-specific verification, and manual validation pass.

## Handoff Notes

- **Self-elevation pattern (corrected)**: the existing
  `C:\Users\mglenn\defender-add-exclusions.ps1` uses
  `Start-Process pwsh -Verb RunAs -Wait` WITHOUT `-PassThru`, which means
  the parent cannot read the elevated child's exit code (UAC denial,
  cmdlet missing, etc. all return silently). All scripts in this plan
  (T0, T1, T3, T4, V2's EICAR script) must use the corrected pattern:
  ```
  $proc = Start-Process pwsh -Verb RunAs -Wait -PassThru `
      -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",$PSCommandPath
  if ($proc.ExitCode -ne 0) { Write-Error "Elevated child exited $($proc.ExitCode)"; exit $proc.ExitCode }
  ```
  Each elevated child must also write a final `EXITCODE=N` line at the
  end of its output txt so the parent / V-gate can verify success even
  across the user-readable file rather than only via the process handle.
  T0 patches this pattern into `defender-add-exclusions.ps1` as well.
- **ACL fix idiom** (grant the non-elevated user Read on the output txt
  so the parent shell can read results): see existing scripts.
- **Performance Analyzer report parameter pitfall**: bare `-Top` is
  ambiguous on this build; always use specific
  `-TopFiles`, `-TopProcesses`, `-TopExtensions`, `-TopScans`, `-TopPaths`,
  `-TopPathsDepth`. The on-disk `defender-perf-report-fixed.ps1` already
  uses these correctly.
- **Contextual exclusion syntax** (corrected): the documented Microsoft
  syntax is `Add-MpPreference -ExclusionPath '<path>\Process:"<full exe path>"'`.
  The contextual modifier is appended to the path string with a backslash
  prefix. There is NO `OnAccess` keyword; the available `ScanTrigger`
  modifiers are `\Scheduled`, `\OnDemand`, `\BM`. Process scope requires
  the absolute exe path (bare `node.exe` will not match contextually,
  and dev boxes typically have multiple node installs). T4 resolves
  every process name via `where.exe` and emits one entry per resolved
  absolute path.
- **No silent build-support detection**: `Add-MpPreference -ExclusionPath`
  succeeds for any string and does not validate contextual modifiers
  semantically. The only reliable "is contextual narrowing enforced?"
  check is the paired EICAR test (T4 AC1 / V2 step 5). If the test
  shows symmetric detection, treat that as "not supported" and run T4's
  precise rollback before exiting.
- **Single recording at a time**: only one Defender perf recording
  in flight; T1 / V2 each pre-flight `Get-Process -Name 'wpr'` and abort
  if found.
- **Symlink/junction access-path semantics**: Defender path exclusions
  match the access path string, not the resolved target. If
  `~/.dotfiles` contains a junction, files accessed via the junction
  path match the `.dotfiles` exclusion; files accessed via the
  resolved underlying path do NOT match unless that path is also
  excluded. We have already added `~/.claude`, `~/.copilot`, `~/.pi`,
  `~/.config\opencode` (the access paths) even though they resolve
  into `~/.dotfiles` -- this is intentional, do not "deduplicate"
  those entries.
- **Managed-policy override risk**: if T1's pre-flight detects a
  managed-policy registry path under
  `HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Exclusions`,
  every `Add-MpPreference` change in this plan can be silently
  overridden on next Intune / GP sync. The plan still proceeds (data
  is still useful) but every output txt carries the warning at the
  top. Operator should confirm with corporate IT whether they own
  Defender policy on this host before treating the changes as
  permanent.
- **Background ETL recordings tie up the Defender perf recorder; only
  one at a time.** T1 / V2 must not run in parallel.
- **Pi customizations**: already patched this session to use the real
  Git binary and `windowsHide: true`. If a fresh `pi-coding-agent`
  upstream release lands during execution and reverts those, re-apply
  via the patches captured in this session's history. Out of scope for
  this plan to formally version-control those upstream patches; track
  separately if the upstream-revert risk recurs.
- **Audit / single-source-of-truth manifest (deferred hardening)**: a
  consolidated `defender-exclusions.json` declarative manifest plus an
  idempotent applier script is the audit-defensible long-term pattern.
  This plan creates several scripts each adding subsets; folding them
  into a manifest can be done as a follow-up plan once T3/T4 settle.
  Not in scope here.
