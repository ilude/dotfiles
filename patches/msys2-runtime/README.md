# Patched msys-2.0.dll

Manual recovery patch for the `add_item` race condition that can cause
Git Bash/MSYS startup crashes like:

    fatal error - add_item ("\??\C:\Program Files\Git", "/", ...) failed, errno 1

## Current status

As of 2026-06-25, automatic installation is disabled in `install.ps1`.
The patch remains available for manual testing or recovery only.

Git for Windows `2.55.0-rc2` installs an MSYS runtime based on Cygwin
`3.6.9` (`b4195d69133078c498a1bf811c4fb0c61fc3c8af`). Local testing with
100 concurrent non-login Bash startups completed without reproducing the
crash:

```powershell
& 'C:\Program Files\Git\usr\bin\bash.exe' -c 'for i in {1..100}; do /usr/bin/bash -c "true" & done; wait'
```

The upstream `add_item` fix is still not merged:

- PR: https://github.com/msys2/msys2-runtime/pull/333
- Status: open, not merged
- Current upstream `msys2-3.6.9`: does not include this PR
- Current Git for Windows runtime commit `b4195d69`: does not include this PR

Git for Windows `2.55.0-rc2` does include a separate MSYS runtime fix for
pseudo-console shutdown hangs:

- https://github.com/msys2/msys2-runtime/pull/339

## Manual install

Use only after reproducing the `add_item` race on the installed Git for
Windows runtime, or when intentionally testing this older 3.6.7 build.

```powershell
pwsh -File patches/msys2-runtime/install-patched-runtime.ps1
```

## Manual uninstall

```powershell
pwsh -File patches/msys2-runtime/install-patched-runtime.ps1 -Uninstall
```

## Build details for this stored DLL

- Built from: Cygwin 3.6.7 + MSYS2 patches
- Build source: `C:\projects\personal\msys2-runtime-fix\MSYS2-packages\`
- Output hash: `FB8B077CAB708428D6FEFBFE80A8278313E8814C79DFF47F4C84B8D231EF5AB9`

This stored DLL is not the correct base for Git for Windows `2.55.0-rc2`.
If the race needs to be patched on current Git for Windows, rebuild from
the Git for Windows SDK using `git-for-windows/MSYS2-packages` and
`git-for-windows/msys2-runtime` at the runtime commit shipped by the
installed Git version.

Reference build flow:

```sh
sdk build msys2-runtime
cd /usr/src/MSYS2-packages/msys2-runtime/src/msys2-runtime/winsup/cygwin
# apply or cherry-pick PR #333
cd /usr/src/MSYS2-packages/msys2-runtime/src/build-x86_64-pc-msys/x86_64-pc-msys/winsup/cygwin
make
```

The rebuilt output is `msys0.dll`. Close all Git Bash/MSYS processes,
back up `C:\Program Files\Git\usr\bin\msys-2.0.dll`, then copy the new
`msys0.dll` into that location as `msys-2.0.dll`.
