# Windows taskbar customization

## Current workstation setup

Verified on 2026-11-16: this workstation uses Windhawk for taskbar customization,
not ExplorerPatcher. ExplorerPatcher has no uninstall entry, installation directory
under Program Files, or Windows `dxgi.dll` injection file. A leftover
`%APPDATA%\ExplorerPatcher` directory remains; it is not evidence of an active install.

The obsolete ExplorerPatcher migration note has been removed from this repository.
The exact date ExplorerPatcher was removed from the workstation was not recorded.

Active Windhawk mods after the operator's updates:

| Mod ID | Observed version | Settings |
| --- | --- | --- |
| `taskbar-icon-size` | `1.3.11` | `TaskbarHeight=34`, `IconSize=24`, `TaskbarButtonWidth=44`, `IconSizeSmall=16`, `TaskbarButtonWidthSmall=32` |
| `windows-11-taskbar-styler` | `1.11.1` | `theme=Aeris`, `xamlDiagnosticsHandling=alert`, `clickThroughTaskbar=0`; no custom styles or theme resource variables configured |

These versions describe the observed installation, not repository-enforced pins.
The earlier tray alignment problem was observed before these updates. Resolution
has not been confirmed; the 34-pixel taskbar height is still configured.

## Configuration ownership and tracking

Windhawk currently stores these mods' settings locally under:

```text
HKEY_LOCAL_MACHINE\SOFTWARE\Windhawk\Engine\Mods\<mod-id>\Settings
```

The parent mod key contains installation metadata such as `Version`, `Disabled`
and `LibraryFileName`. Updating a mod in Windhawk does not update this repository.
There is currently no Windhawk export/import script, installer integration or
machine-readable settings snapshot here. This document records the current setup.

Settings can be version-controlled in this repository. The recommended scope is
mod IDs, enabled state and per-mod settings in a readable configuration file, with
explicit export/apply commands if automated restoration is wanted. Keep installed
DLLs, caches, generated library filenames and timestamps local. Settings alone do
not install the mods or guarantee compatibility with another Windows build or mod
version. Applying the machine-wide settings may require elevation.

Do not export the entire Windhawk installation registry tree as portable settings:
its generated library references belong to the local installation. Install the
mods through Windhawk before restoring their settings.
