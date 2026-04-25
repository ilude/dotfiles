---
title: ExplorerPatcher migration from valinet to Amrsatrio fork
status: change-applied
installed_version: 26100.4946.69.6_9a69350 (Amrsatrio prerelease, 2026-03-13)
previous_version: 26100.4946.69.6 (valinet stable, 2025-11-03)
trigger_windows_build: 10.0.26100.8115
last_checked: 2026-04-25
---

## Summary

Migrated ExplorerPatcher from the upstream `valinet/ExplorerPatcher` stable
release to the actively-maintained `Amrsatrio/ExplorerPatcher` fork to resolve
recurring `explorer.exe` AppHangB1 hangs caused by stale Windows binary
patterns in the upstream build.

## Symptom

- 38 `Application Hang` (Event ID 1002) entries for `explorer.exe` over a
  rolling 30-day window, averaging ~1.3 hangs/day.
- Three distinct hang signatures (P4 stack-frame hashes):
  - `62f3` x30 -- dominant signature, first seen 2026-03-30
  - `222d` x6 -- first seen 2026-03-27
  - `0895` x2 -- 2026-04-17 only
- Hang clustering at 8 AM and post-lunch hours, consistent with explorer
  resuming from idle/lock and re-entering hooked code paths.
- Each hang manifested as taskbar/start-menu unresponsiveness; explorer.exe
  auto-restarted via the Application Hang recovery path.

## Diagnosis

WER `Report.wer` files for the five most recent hang reports were copied from
`C:\ProgramData\Microsoft\Windows\WER\ReportArchive\` (admin-only) to a
user-readable cache and inspected.

Every report listed two non-Windows DLLs in its `LoadedModule` table at low
indices (loaded early in process startup):

```
LoadedModule[64]  = C:\Program Files\ExplorerPatcher\ep_taskbar.5.dll
LoadedModule[24x] = C:\Program Files\ExplorerPatcher\pnidui.dll
```

`ep_taskbar.5.dll` is the Win10-style taskbar replacement; `pnidui.dll` is
the Win10-style network/clock/volume flyout replacement. Both are injected
into `explorer.exe` by ExplorerPatcher.

## Root cause

ExplorerPatcher works by pattern-matching against specific byte sequences in
Windows DLLs (`twinui.pcshell.dll`, `Windows.UI.Xaml.dll`, `ExplorerFrame.dll`,
etc.) and installing function-detour hooks. When Microsoft ships a cumulative
update that shifts these patterns, the hooks land on shifted code and the
hooked thread stalls -- producing the observed `AppHangB1` events.

The system was running Windows build `10.0.26100.8115` while the installed
`valinet/ExplorerPatcher` binaries were built for `26100.4946`. The upstream
project has not shipped a stable release since 2025-11-03 (5+ months at time
of writing), and there are no open PRs targeting this compatibility gap. See
upstream issue `valinet/ExplorerPatcher#4831` ("KB5074109 broke EP") for an
example of the same drift.

## Why the Amrsatrio fork

`Amrsatrio/ExplorerPatcher` is a contributor fork with active recent commits
that update the binary pattern matchers for newer Windows builds. Relevant
commits as of this writing:

- `2026-04-19` -- fix vtable pattern issues in `Windows.UI.Xaml.dll`,
  `InputSwitch.dll`, and `CStartExperienceManager`
- `2026-04-17` -- update `CAddressBand::ResizeToolbarButtons()` patterns for
  `Servicing_CFDNavButtonsTheming` builds
- `2026-04-08` -- fix pattern inconsistencies in `twinui.pcshell.dll`
- `2026-04-02` -- `Windows.UI.Xaml` patches for build 29553+

The fork ships tagged prereleases; the latest at the time of the change is
`26100.4946.69.6_9a69350` (published 2026-03-13).

## Change applied

1. Disabled the two heaviest hooks via registry to confirm they were the
   hang source:
   ```
   HKCU\Software\ExplorerPatcher\OldTaskbar  : 2 -> 0
   HKCU\Software\ExplorerPatcher\FlyoutMenus : 1 -> 0
   ```
   Explorer restarted; no `ExplorerPatcher` modules loaded in the new
   process. Backup of the prior registry state saved to
   `%TEMP%\ep-backup-20260425-101610.reg`.

2. Downloaded Amrsatrio prerelease `ep_setup.exe` to:
   ```
   %USERPROFILE%\Downloads\ep_setup_amrsatrio_26100.4946.69.6_9a69350.exe
   ```
   - Source: `https://github.com/Amrsatrio/ExplorerPatcher/releases/tag/26100.4946.69.6_9a69350`
   - Size: 12,002,304 bytes
   - SHA256: `36a118afa05f784f570adcbf938a0d388243505ab6583bdf4f2727a8377880a8`
   - File metadata: `FileVersion=26100.4946.69.6`, `CompanyName=ExplorerPatcher Developers`,
     `OriginalFilename=ep_setup.exe`

3. Installer run as administrator. It uninstalls the existing valinet
   binaries and replaces them with the Amrsatrio build. The
   `HKCU\Software\ExplorerPatcher` registry tree is preserved across the
   re-install.

4. After install, taskbar/flyout hooks re-enabled:
   ```
   HKCU\Software\ExplorerPatcher\OldTaskbar  : 0 -> 2
   HKCU\Software\ExplorerPatcher\FlyoutMenus : 0 -> 1
   ```
   followed by `Stop-Process -Name explorer -Force`.

5. Redirected EP's auto-update channel from upstream (valinet stable) to
   the Amrsatrio prerelease feed, so the built-in updater no longer
   prompts to roll back to the broken valinet build:
   ```
   HKCU\Software\ExplorerPatcher\UpdatePreferStaging = 1
   HKCU\Software\ExplorerPatcher\UpdateURLStaging    = https://api.github.com/repos/Amrsatrio/ExplorerPatcher/releases?per_page=1
   ```
   Mechanism (per `ExplorerPatcher/updates.cpp`):
   - With `UpdatePreferStaging=1`, EP fetches `UpdateURLStaging` as a
     GitHub API JSON array, takes `releases[0]`, finds the asset named
     exactly `ep_setup.exe` (case-sensitive), downloads its first ~98
     bytes, parses the version + commit hash from the DOS stub, and
     compares against the locally installed binary's embedded hash.
   - Hash differs => update notification. Hash matches => no prompt.
   - One unauthenticated GitHub API request per EP session (well under
     the 60/hr unauth limit).
   - The `UpdateURL` (stable channel) is left empty; this avoids the
     ambiguous behavior of `Amrsatrio/.../releases/latest/download/ep_setup.exe`,
     which returned a different (older) asset size during testing.

## Validation plan

- Watch for new `Application Hang` (Event ID 1002) entries for `explorer.exe`
  over the next 7--14 days.
- A successful migration is zero new hangs from the same `LoadedModule` set
  in WER reports.
- If hangs return after re-enabling the hooks on the Amrsatrio build, the
  fallback is Windhawk + the "Win10 taskbar on Win11 24H2/25H2" mod from
  `ramensoftware/windhawk-mods` (actively maintained, daily commits).

## Revert procedure

If the Amrsatrio build introduces other regressions:

1. Run `ep_setup.exe /uninstall` (Amrsatrio build) to remove EP entirely.
2. Re-import the registry backup if the previous tweak set is wanted back:
   ```
   reg import "%TEMP%\ep-backup-20260425-101610.reg"
   ```
3. Reinstall valinet stable from
   `https://github.com/valinet/ExplorerPatcher/releases/latest` and accept
   the known hang behavior, OR proceed to the Windhawk fallback.

## References

- Upstream project: `https://github.com/valinet/ExplorerPatcher`
- Active fork:      `https://github.com/Amrsatrio/ExplorerPatcher`
- Upstream issue (compat drift):
  `https://github.com/valinet/ExplorerPatcher/issues/4831`
- Related upstream issues:
  `#4738`, `#4666`, `#4690`
- Windhawk fallback: `https://github.com/ramensoftware/windhawk-mods`
