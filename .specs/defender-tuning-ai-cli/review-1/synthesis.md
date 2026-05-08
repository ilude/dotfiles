---
date: 2026-05-08
status: synthesis-complete
---

# Plan Review Synthesis: Defender RTP tuning for AI CLI workloads

Note on methodology: this run was executed by a single coordinator agent
performing all six reviewer roles in sequence (no parallel sub-agents were
available in this session), then verifying each CRITICAL/HIGH finding against
the actual scripts in `C:\Users\mglenn\` and Microsoft Learn docs. Findings
that could not be verified are marked "Unverified -- needs human confirmation".

## Review Panel

| Reviewer | Role                          | Findings | Verified Issues |
|----------|-------------------------------|----------|-----------------|
| M1       | Completeness & Explicitness   | 8        | 5               |
| M2       | Adversarial / Red Team        | 7        | 4               |
| M3       | Outside-the-Box / Simplicity  | 5        | 3               |
| D1       | Security & Access Control     | 7        | 4               |
| D2       | Operational Risk / SRE        | 7        | 5               |
| D3       | Compliance & Audit            | 5        | 2               |

## Outside-the-Box Assessment

The plan is solid in spirit -- data-driven, additive, preserves Tamper
Protection -- but it overcommits to a Wave 2 step (T4 contextual exclusions)
whose mechanics the plan describes incorrectly. The simpler, equally
effective path is: do Wave 1 baseline, do T3 extension exclusions, then STOP
and re-measure before building the 42-entry contextual matrix. Microsoft's
own top recommendation -- ReFS Dev Drive + Performance Mode -- is
acknowledged but deferred; if T3 alone cuts MsMpEng below the 5% target,
T4 is unnecessary. Plan is also opaque about a pre-existing inconsistency:
the on-disk `defender-add-exclusions.ps1` still hardcodes the npm/pnpm
paths the plan claims were removed. Cleaning that up is a prerequisite to
any V1 check that compares against the live exclusion list.

## Bugs (must fix before executing)

### B1 [CRITICAL] -- Reference script contradicts plan's "current state"
**Flagged by:** D1, D2, D3, M1
**Verification:** CONFIRMED. `C:\Users\mglenn\defender-add-exclusions.ps1`
lines 23-37 still include `AppData\Local\pnpm`, `AppData\Local\npm-cache`,
`AppData\Roaming\npm`, and `.claude\projects`. Plan Constraints says the
existing list does NOT contain these (claims they were removed for the npm
CVE wave). V1 check #4 ("no proposed addition reintroduces npm/pnpm cache
path exclusion") will SUCCEED while those entries actively remain in the
live `(Get-MpPreference).ExclusionPath` from a prior run, masking the
problem.
**Fix:** Before Wave 1 begins, (a) dump `(Get-MpPreference).ExclusionPath`
elevated and reconcile with the plan's "preserve" list of 9 paths;
(b) update `defender-add-exclusions.ps1` to remove the npm/pnpm/claude\projects
entries so it matches the plan's stated baseline; (c) actually run
`Remove-MpPreference -ExclusionPath` for any stale entries on the live
system. Add this as Task T0.

### B2 [CRITICAL] -- T4 contextual exclusion syntax is wrong
**Flagged by:** M1, M3, D2
**Verification:** CONFIRMED via
https://learn.microsoft.com/en-us/defender-endpoint/configure-contextual-file-folder-exclusions-microsoft-defender-antivirus
and the Add-MpPreference reference. The documented syntax is
`Add-MpPreference -ExclusionPath "<path>\Process:""<full exe path>"""` --
the contextual modifier is appended to the path string with a backslash
prefix; there is no `OnAccess` keyword (the available `ScanTrigger`
modifiers are `\Scheduled`, `\OnDemand`, `\BM`). The plan's T4 description
("documented `OnAccess` trigger and process-scoping syntax") and AC3
("contextual exclusion listing") do not match the actual API surface and
will produce 42 nonsensical path entries that Defender stores literally
without enforcing the contextual narrowing.
**Fix:** Rewrite T4 to use the documented syntax
`<path>\Process:"<full exe path>"`. Drop "OnAccess" entirely. Note that
the `Process:` modifier must contain the absolute exe path (`node.exe` will
not match -- there are usually 3+ node.exe binaries on a dev box).

### B3 [HIGH] -- T4 process list uses bare exe names
**Flagged by:** M1, D1
**Verification:** CONFIRMED via MS docs ("Process:""C:\App\app.exe""").
Plan T4 instructs adding `node.exe`, `git.exe`, `python.exe`, `pnpm.exe`,
`bash.exe`, `nvim.exe` as bare names. Microsoft's contextual-exclusion
syntax requires the absolute path. With multiple node installs (system,
nvm-windows, pnpm-shipped, Windows Store), bare `node.exe` cannot match
contextually.
**Fix:** Resolve each exe via `Get-Command` / `where.exe` at script-build
time and emit absolute paths. If multiple match (e.g. multiple node
installs), emit one contextual entry per resolved path.

### B4 [HIGH] -- Self-elevation pattern cannot detect elevated child failure
**Flagged by:** D2, M2
**Verification:** CONFIRMED. `defender-add-exclusions.ps1` line 13-15 uses
`Start-Process pwsh -Verb RunAs -Wait` without `-PassThru`. The parent
shell cannot read `$LASTEXITCODE` from the elevated child. Plan T1 AC1
asks operator to verify "elevated child exits 0" -- there is no mechanism
in the reference pattern to surface that exit code to the caller. UAC
denial returns silently. Idempotency claim in T3 AC2 ("exit code 0 each
time") inherits the same gap.
**Fix:** Use `Start-Process -PassThru -Wait`, capture
`$proc.ExitCode`, and write a sentinel value to the output txt that the
parent can read (e.g. last line `EXITCODE=0`). Update all defender-*.ps1
scripts in `C:\Users\mglenn\` to this pattern.

### B5 [HIGH] -- T4 "no partial state" guarantee not enforceable
**Flagged by:** D2
**Verification:** CONFIRMED by inspection of plan text and
Add-MpPreference semantics. T4 says "exit clean if not supported, no
partial state". But `Add-MpPreference -ExclusionPath` succeeds for any
string -- it does not validate contextual modifiers as syntactically
meaningful. The script cannot pre-detect "build supports contextual
exclusions" by trying one Add and rolling back; the Add will succeed even
on a build that ignores the modifier semantically.
**Fix:** Replace the "detect support" check with a positive validation:
after adding one test contextual entry, run a behavioral test (drop EICAR
under that path opened by an out-of-process tool vs. the named process),
confirm asymmetric detection. If asymmetric detection fails, conclude
"contextual narrowing not enforced" and roll back via `Remove-MpPreference
-ExclusionPath` for every entry the script just added. Track the added
list in a transcript file so the rollback is precise.

### B6 [HIGH] -- EICAR test in `~/Downloads` does not validate T4
**Flagged by:** D1, M2
**Verification:** CONFIRMED by the contextual exclusion semantics. EICAR
dropped via Explorer or browser into `~/Downloads` is opened by
`explorer.exe` / browser, neither of which is on the T4 process list. So
RTP will detect normally, regardless of whether contextual narrowing
works. The test confirms basic RTP only; it does NOT prove the
contextual exclusions are correctly scoped (a bug in T4 -- e.g. wrong
syntax that silently reverts to broad exclusion -- would still pass this
EICAR test).
**Fix:** Replace V2 step #5 with a paired test: drop EICAR inside
`~/.dotfiles` (a contextually excluded path) and (a) try to read it
with `node.exe -e "fs.readFileSync(...)"` -- expect no detection,
exclusion working as intended; (b) try to read it with `notepad.exe`
or `cmd.exe /c type` -- expect detection, broad exclusion is NOT in
effect. Both must hold.

### B7 [HIGH] -- New-MpPerformanceRecording prerequisite not checked
**Flagged by:** D2, M1
**Verification:** Unverified -- needs human confirmation. The
`defender-perf-record.ps1` script in this user's home directory uses the
cmdlet without a pre-flight check. On some Win11 Enterprise builds and
WSUS-managed environments, the underlying WPR component or the
MpPerformanceRecording capability may not be present, causing
`New-MpPerformanceRecording` to fail with a missing-component error. Plan
T1 has no fallback if this happens.
**Fix:** Pre-flight check at top of T1 script:
`if (-not (Get-Command New-MpPerformanceRecording -ErrorAction SilentlyContinue)) { write clear error; exit 2 }`. If module is present but recording fails, capture the
error and surface to txt with the documented `Add-WindowsCapability` or
DISM remediation instructions.

### B8 [HIGH] -- T4 omits Git binary directories from contextual conversion
**Flagged by:** M1
**Verification:** CONFIRMED. Constraints lists 9 existing paths to
preserve including `C:\Program Files\Git\mingw64\bin` and
`C:\Program Files\Git\usr\bin`. T4 lists only 7 paths to convert,
explicitly omitting these two. AC3's `7 paths * 6 processes = 42` math
matches T4's body, but leaves the broad `Program Files\Git\*` exclusions
intact forever. Those are the most security-relevant of the broad path
exclusions (any malicious binary dropped there gets a free pass).
**Fix:** Either (a) add the Git bin paths to T4's conversion list -- but
the natural process is `bash.exe` and `git.exe` themselves, which makes
the contextual scope nearly identical to the broad scope and gains
little; or (b) document explicitly why those two paths stay broad
(Git for Windows ships its own `bash.exe`, `find.exe`, `grep.exe`, etc.
that live there and self-execute frequently; contextual scoping would
require listing all of them). Pick one and update T4 + AC3 math.

### B9 [MEDIUM] -- 180-second recording window orchestration unclear
**Flagged by:** M2, D2
**Verification:** CONFIRMED. T1 description says "the 180-second window
must cover a representative agent session" but the script blocks the
elevated shell on `New-MpPerformanceRecording -Seconds 180`. The user
must drive Claude Code + pi from a separate non-elevated window during
those 180 seconds. Plan does not say this. New executor with empty
context will run the script in a single window, get a 180-second idle
recording, fail AC3 (ETL >= 1MB), and not understand why.
**Fix:** Add explicit pre-step to T1: "Open a second pwsh window now;
when the script prints 'Recording...', switch to that window and run
representative agent activity for the full 180 seconds."

### B10 [MEDIUM] -- V1 Compare-Object check is malformed
**Flagged by:** M1
**Verification:** CONFIRMED. V1 check #3 reads
`Compare-Object (Get-MpPreference).ExclusionPath <decisions list>`.
`Get-MpPreference` requires admin to read; V1 is `[haiku] -- validator`
which does not specify elevation. And `<decisions list>` is the file
path of a markdown file, not an array. Compare-Object will receive a
single string and return non-empty diff. The check will always fail or
always pass depending on accident.
**Fix:** Specify `(Get-MpPreference).ExclusionPath` is collected from an
elevated dump file produced by T1's script, and `<decisions list>` must
be parsed into an array of strings (e.g. lines matching `^- ` in
`baseline-decisions.md`).

## Hardening Suggestions (optional improvements)

### H1 [MEDIUM] -- Add a single source-of-truth exclusion manifest
**Flagged by:** D3
**Proportionality:** OtB would call this proportionate. The plan creates
N scripts each adding subsets of exclusions; auditing the union later
requires running them all. A single `defender-exclusions.json` (or .psd1)
declaring path/process/extension/contextual entries with one-line
justifications, plus an idempotent applier script, is the
audit-defensible pattern.
**Suggestion:** After T3/T4, fold all additions into one declarative
manifest; rewrite the apply scripts as readers of that manifest. Defer
to a follow-up plan if scope grows.

### H2 [MEDIUM] -- Detect Group Policy / Intune override on this host
**Flagged by:** D3
**Proportionality:** Worth one PowerShell call. Win11 Enterprise may have
Intune-managed Defender; locally-set exclusions can be silently overridden
by managed policy on next sync.
**Suggestion:** At top of T1, run
`Get-MpPreference | Select-Object IsTamperProtected, Force*` and
`Get-MpComputerStatus | Select-Object AMServiceEnabled, RealTimeProtectionEnabled, AntivirusEnabled, IsTamperProtected`
plus a check for managed-policy registry presence:
`Test-Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Exclusions'`. If
managed, surface a clear "exclusions may be overridden" warning.

### H3 [MEDIUM] -- Symlink/junction bypass risk
**Flagged by:** D1
**Proportionality:** Low likelihood, easy mitigation.
**Suggestion:** Document that path exclusions match the access path, not
the resolved path. If `~/.dotfiles` contains a junction to `C:\Projects\...`,
files accessed via the junction match the `.dotfiles` exclusion; files
accessed via the resolved path do not. Note in plan; no code change.

### H4 [LOW] -- Concurrency lock for perf recordings
**Flagged by:** D2
**Proportionality:** Mostly self-correcting; user notices the error.
**Suggestion:** Add a one-line check: `Get-Process -Name 'wpr' -ErrorAction SilentlyContinue` (the underlying recorder); if present, fail fast with a
clear message before starting a new recording.

### H5 [LOW] -- OneDrive Known Folder Move on `~/Downloads`
**Flagged by:** D3
**Proportionality:** Affects EICAR test reproducibility only. If
`~/Downloads` is OneDrive-redirected, EICAR drop triggers OneDrive sync
behavior which can interfere with the detection event timing.
**Suggestion:** Use `C:\Temp\eicar-smoke\` (created and ACL'd by the
test script) as the EICAR landing pad instead of `~/Downloads`.

### H6 [LOW] -- Pi customization patches not version-controlled
**Flagged by:** D3
**Proportionality:** Not a defender-tuning concern, mentioned in plan
context only. Audit hole if upstream pi reverts and patches are lost.
**Suggestion:** Out of scope for this plan; track separately. The plan
already notes "if upstream reverts, re-apply via this session's history",
which is enough for now.

## Dismissed Findings

- **"Tamper Protection blocks Add-MpPreference exclusion adds"** (raised
  during D1 sweep): DISMISSED. Tamper Protection blocks the specific
  AV-disabling preferences enumerated in the plan (DisableBehaviorMonitoring,
  etc.); it does NOT block exclusion adds. Confirmed via cited
  cloudbrothers.info reference and behavior of the existing
  `defender-add-exclusions.ps1` which already runs successfully.
- **"`-Top` ambiguous"** false positive in M2's first pass: the plan's
  Handoff Notes already document this; `defender-perf-report-fixed.ps1`
  on disk uses explicit `-TopFiles`/`-TopProcesses`/etc. correctly. Not a
  bug.
- **"180s is too short to capture meaningful agent activity"**: dismissed
  as taste/tuning. The plan's AC3 (ETL >= 1MB) is a reasonable
  rough-validation gate. Operator can lengthen if needed.
- **"Plan should mandate ReFS Dev Drive instead"**: M3 raised this;
  Constraints already explicitly defer it as a follow-up because of the
  volume migration cost. Constraint accepted.
- **"V1 must verify EICAR works first"** (M2): dismissed -- not Wave 1's
  job; EICAR test belongs in V2.

## Positive Notes

- Plan correctly identifies that `ScanAvgCPULoadFactor` /
  `EnableLowCpuPriority` do not affect RTP -- this is a common
  misconception and rejecting it up front is good.
- Plan correctly defers the broad `node.exe`/`git.exe` process exclusion
  on supply-chain grounds; this is the right security call given recent
  npm CVE waves.
- Plan correctly uses Performance Analyzer to drive decisions instead of
  guessing extensions.
- Self-elevation + idempotency + ACL-fix pattern is right; only the
  exit-code-propagation gap (B4) needs fixing.
- Tamper Protection out-of-scope decision is correctly stated.
- Acceptance criteria with explicit Verify/Pass/Fail blocks are
  well-structured and executor-friendly.
- The plan's Handoff Notes already capture the bare-`-Top` pitfall and
  the contextual-exclusion-newness caveat -- shows the author has run
  into these before.
