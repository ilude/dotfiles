# MSYS2 Bash Crash Dossier

Status: Curated feature dossier
Last reviewed: 2026-07-17
Feature ID: `msys2-bash-crash`

This dossier is the single consolidated record for the 2026-03-27 MSYS2
bash crash investigation, remediation plan, source patch, and fix
verification - previously spread across `.specs/bash-crash-investigation.md`,
`.specs/bash-crash-remediation-plan.md`, `.specs/msys2-fix-add-item-race.patch`,
and `claude/tracking/windows-bash-crash.md` (now a pointer to this file).
It is curated repository source, not an automatic dump of local runtime
events. Verify current state against the live system before acting - see
Current State below for what has drifted since March.

## The crash

```
Error: Exit code 3221225477 (0xC0000005)
0 [main] bash (PID) C:\Program Files\Git\bin\..\usr\bin\bash.exe:
*** fatal error - add_item ("\??\C:\Program Files\Git", "/", ...) failed, errno 1
```

`0xC0000005` here is not a real Windows ACCESS_VIOLATION - MSYS2's
`api_fatal()` calls `_exit()` with this code. It bypasses Windows Error
Reporting entirely: no Event Viewer entries, no crash dumps, no WER reports.

## Root cause

The crash is in `msys-2.0.dll`'s mount table initialization
(`shared.cc` / `mount.cc`). When MSYS2 bash starts, it initializes a
per-user shared memory region containing the mount table; `add_item`
inserts mount entries (e.g. `C:\Program Files\Git` -> `/`).

**No mutex protects `add_item` itself** - only a spinlock at
`shared_info::initialize()`, with a 15-second timeout. Under concurrent
bash spawning, multiple processes race to populate the mount table; the
second one fails with `errno 1` (EPERM) because the entry already exists.
If the initializer is slow (nsswitch DC lookups, passwd resolution),
waiters time out and re-initialize, colliding on the already-created
immutable `"/"` mount entry.

`user_info::create()` calls `open_shared()` using the overload that
**discards** the OS-authoritative `created` flag from `CreateFileMappingW`,
relying on the fallible spinlock instead. The proper fix uses the
`created`-returning overload so exactly one process initializes and all
others wait deterministically - see `patch/add_item-race-fix.patch` for
both the proper fix (`shared.cc`) and a one-line bandaid (`mount.cc`,
`MOUNT_OVERRIDE`).

This is a 10+ year old unfixed bug in the Cygwin runtime, not specific to
this machine or to Claude Code.

## The March 2026 trigger

Visual Studio 2022 updated its bundled `msys-2.0.dll` on 2026-03-13. VS
ships MSYS2 runtime 3.6.x while Git for Windows (then pinned at 2.48.1)
shipped 3.5.7. When VS performed background Git operations, its runtime
wrote to the per-user shared memory with a different struct layout,
corrupting the mount table for concurrent Git Bash processes. Three
`msys-2.0.dll` versions were observed coexisting:

- Git for Windows: 3.5.7 (19 MB, patched) at `C:\Program Files\Git\usr\bin\`
- Standalone MSYS2: 3.6.5 (3.2 MB) at `C:\msys64\usr\bin\`
- Visual Studio: 3.6.x (3.2 MB) under
  `C:\Program Files\Microsoft Visual Studio\...\TeamFoundation\`

Additional contributing factors identified during investigation, by
likelihood:

1. **Rapid concurrent bash spawning (confirmed, primary amplifier).**
   Claude Code spawns a new bash process per command with no pooling.
   Hooks amplified this: 13 hook registrations, each firing
   `bash -c "python ..."` plus a detached `log_rotate.py`
   `subprocess.Popen`. A single Edit could trigger 6+ processes; 10 rapid
   Bash commands could produce 20+ (~30 bash processes/min observed).
2. **nsswitch.conf `windows` provider** causes `DsGetDcName` lookups that
   can hang 15-20s on domain-joined machines, holding the shared-memory
   spinlock and widening the race window for all other bash processes.
3. **Windows security updates KB5079473/KB5083532** (March 17-18) may have
   changed kernel memory management around the same window; correlation
   only, not confirmed causal.
4. **Anti-malware DLL injection / Defender scan latency** during process
   startup can widen the critical section further.
5. **ASLR/Mandatory ASLR (possible)** can interfere with Cygwin's fixed
   shared memory addresses and fork() emulation.

## Fix verified (2026-03-27)

A patched `msys-2.0.dll`, built from Cygwin 3.6.7 source with the
`shared.cc` `created`-flag fix applied, was installed to
`C:\Program Files\Git\usr\bin\msys-2.0.dll`. Stress tested: 5 parallel bash
commands with 13 hooks active, zero crashes. Build source was at
`C:\projects\personal\msys2-runtime-fix\MSYS2-packages\` (verify this path
still exists if rebuilding).

## Current state (re-verified 2026-07-17)

Re-checked against the live system rather than assumed from the March
record - several mitigations have drifted:

| Mitigation | March 2026-03-27 | Verified 2026-07-17 |
| --- | --- | --- |
| Patched `msys-2.0.dll` (Cygwin 3.6.7, `created`-flag fix) | Installed and stress-tested | **Still installed** - `C:\Program Files\Git\usr\bin\msys-2.0.dll`, `.bak`, and `.patched-backup` all present |
| Pin Git for Windows to 2.48.1 | Applied | **Drifted** - installed Git is now 2.55.0.windows.3; `winget/configuration/core.dsc.yaml` has no `version:` constraint on `Git.Git`, so `winget upgrade` overrode the manual pin exactly as originally warned it might. The patched DLL's fate across this Git upgrade is unverified - a Git for Windows update can overwrite `usr/bin/msys-2.0.dll` with its own build, silently reverting the fix. |
| nsswitch.conf `db_home` drops `windows` | Applied (tracking doc claims `env cygwin desc`) | **Reverted or never persisted** - live file reads `db_home: env windows cygwin desc` |
| SessionStart bash pre-warm (`bash -c true`) | Applied | **Not present** - `claude/settings.json` SessionStart only runs `team_cleanup.py` |
| Debounced log rotation (skip Popen unless >1h since last rotation) | Applied | **Applied** - `_rotation_recently_ran()` / `.last-rotation` gating present in all three damage-control hooks |
| Hooks use bare `python`, not `uv run` | Applied (separate console-flashing fix) | Still applied |
| Hooks switched to PowerShell shell | Not applied | Not applied |
| Windows Defender exclusions for `Git\usr\bin` / `Git\bin` | Applied | Not re-verified this session (needs admin to read `Get-MpPreference`); see `.specs/archive/defender-tuning-ai-cli/`, resolved 2026-07-17, for the broader exclusion effort |

**Priority action if the crash recurs:** verify the patched DLL is still in
place first (`Get-FileHash` against the known-good build, or just retest -
if it crashes, the DLL was overwritten). If reverted, either restore from
`.patched-backup` or rebuild, and this time add an explicit `version:` to
`core.dsc.yaml` so `winget configure` - not a one-off manual pin - enforces
it. This is the exact failure mode the original plan predicted for an
unenforced pin, and it happened.

## Matching upstream issues

| Issue | Description |
| --- | --- |
| claude-code#30165 | Exact same crash, filed 2026-03-18, v2.1.63 (primary issue) |
| claude-code#37920 | bash.exe.stackdump files from same crash |
| claude-code#19415 | Parallel bash tool execution causes freeze |
| claude-code#25558 | `CLAUDE_CODE_SHELL` ignored on Windows |
| git-for-windows/git#493 | Same add_item crash (nsswitch DC lookup) |
| git-for-windows/git#1135 | Same crash in Jenkins CI |
| git-for-windows/git#4076 | Best documented add_item crash |
| git-for-windows/git#3870 | High-concurrency msys-2.0.dll regression |
| msys2/MINGW-packages#11616 | add_item during parallel gem install |

Also affects: JetBrains IDEs, Bazel CI, Ruby bundler - any tool spawning
concurrent MSYS2 processes. Re-check issue status before citing as current;
statuses above last confirmed 2026-03-27.

## Remaining follow-ups (never completed)

- [ ] Submit PR to msys2/msys2-runtime or git-for-windows/msys2-runtime with
      the `created`-flag fix
- [ ] Comment on claude-code#30165 with root cause analysis and fix
- [ ] Configure Visual Studio to use system Git instead of its own bundled
      runtime (Tools -> Options -> Source Control) - removes the original
      March trigger at the source
- [ ] Consider removing standalone MSYS2 at `C:\msys64` if unused, or pin
      it to match Git for Windows' runtime version
- [ ] Add an enforced `version:` pin for `Git.Git` in
      `winget/configuration/core.dsc.yaml` (see Current State - this is the
      confirmed drift)
- [ ] Request `CLAUDE_CODE_SHELL` PowerShell fallback (#25558) or bash
      process pooling/serialization on Windows upstream
- [ ] Re-verify the patched DLL survived the Git 2.48.1 -> 2.55.0.3 upgrade

## Environment (as of 2026-03-27 investigation)

Windows 11 Enterprise 10.0.26200; GNU bash 5.2.37(1)-release
(x86_64-pc-msys); Python 3.14 primary, 3.13 also on PATH; MSYSTEM=MINGW64.

## Source patch

`patch/add_item-race-fix.patch` in this directory has the full upstream fix
sketch (Option A: proper `shared.cc` fix using the `created` flag, applied
in the March build; Option B: one-line `MOUNT_OVERRIDE` bandaid in
`mount.cc`) and build/test instructions for reproducing against
`cygwin-3.6.7`.
