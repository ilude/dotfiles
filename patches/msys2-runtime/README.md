# Patched msys-2.0.dll

Fixes the `add_item` race condition that causes bash to crash with:

    fatal error - add_item ("\??\C:\Program Files\Git", "/", ...) failed, errno 1

## Install

```powershell
pwsh -File patches/msys2-runtime/install-patched-runtime.ps1
```

## Uninstall

```powershell
pwsh -File patches/msys2-runtime/install-patched-runtime.ps1 -Uninstall
```

## Details

- **Built from:** Cygwin 3.6.7 + MSYS2 patches
- **Build source:** `C:\projects\personal\msys2-runtime-fix\MSYS2-packages\`
- **PR:** https://github.com/msys2/msys2-runtime/pull/333
- **Tracking:** `claude/tracking/windows-bash-crash.md`

Remove this patch once the fix is accepted upstream and ships in a Git
for Windows release.
