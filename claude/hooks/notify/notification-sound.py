# /// script
# requires-python = ">=3.8"
# dependencies = []
# ///
"""
Claude Code Notification Sound Hook
====================================

Plays a sound notification when Claude Code is waiting for user input.
Triggers on PermissionRequest hook for immediate notification.

Platform support:
  - macOS: afplay with Hero.aiff
  - Linux: paplay/aplay with fallback to terminal bell
  - Windows: PowerShell Media.SoundPlayer with fallback to terminal bell

Exit codes:
  0 = Success (sound played or fallback used)
  0 = Silent failure (to avoid breaking Claude Code)

Environment variables:
  CLAUDE_DISABLE_HOOKS - Comma-separated list of hook names to disable
                         Use "notify" to disable this hook
  NOTIFY_SOUND - Custom sound file path (optional)
  NOTIFY_ENABLED - Set to "false" to disable (optional)
"""

import os
import platform
import shutil
import subprocess
import sys
from typing import Optional

HOOK_NAME = "notify"


def is_hook_disabled() -> bool:
    """Check if this hook is disabled via environment variable."""
    disabled_hooks = os.environ.get("CLAUDE_DISABLE_HOOKS", "").split(",")
    return HOOK_NAME in disabled_hooks or os.environ.get("NOTIFY_ENABLED") == "false"


def get_platform() -> str:
    """Detect the platform."""
    system = platform.system()
    if system == "Darwin":
        return "macos"
    elif system == "Linux":
        # Check if we're in WSL
        if os.path.exists("/proc/sys/fs/binfmt_misc/WSLInterop") or os.environ.get(
            "WSL_DISTRO_NAME"
        ):
            return "wsl"
        return "linux"
    elif system == "Windows":
        return "windows"
    else:
        return "unknown"


def get_default_sound(platform_name: str) -> Optional[str]:
    """Get default sound file path for the platform."""
    defaults = {
        "macos": "/System/Library/Sounds/Hero.aiff",
        "linux": "/usr/share/sounds/freedesktop/stereo/complete.oga",
        "wsl": "/mnt/c/Windows/Media/chimes.wav",
        "windows": "C:\\Windows\\Media\\chimes.wav",
    }
    return defaults.get(platform_name)


def play_sound_macos(sound_file: str) -> bool:
    """Play sound on macOS using afplay."""
    try:
        subprocess.Popen(
            ["afplay", sound_file],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


def play_sound_linux(sound_file: str) -> bool:
    """Play sound on Linux using paplay or aplay."""
    # Check if sound file exists
    if not os.path.exists(sound_file):
        return False

    # Try paplay first (PulseAudio)
    if shutil.which("paplay"):
        try:
            subprocess.Popen(
                ["paplay", sound_file],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return True
        except Exception:
            pass

    # Try aplay (ALSA)
    if shutil.which("aplay"):
        try:
            subprocess.Popen(
                ["aplay", sound_file],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return True
        except Exception:
            pass

    return False


def play_sound_windows(sound_file: str) -> bool:
    """Play sound on Windows using PowerShell."""
    # Convert WSL path to Windows path if needed
    if sound_file.startswith("/mnt/"):
        # /mnt/c/... -> C:\...
        parts = sound_file.split("/")
        if len(parts) >= 3:
            drive = parts[2].upper()
            rest = "/".join(parts[3:])
            sound_file = f"{drive}:\\{rest.replace('/', chr(92))}"

    # Try PowerShell
    if shutil.which("powershell.exe") or shutil.which("pwsh.exe"):
        pwsh = "powershell.exe" if shutil.which("powershell.exe") else "pwsh.exe"
        try:
            subprocess.Popen(
                [
                    pwsh,
                    "-Command",
                    f"(New-Object Media.SoundPlayer '{sound_file}').PlaySync()",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return True
        except Exception:
            pass

    return False


def play_terminal_bell():
    """Play terminal bell as fallback."""
    try:
        sys.stdout.write("\a")
        sys.stdout.flush()
    except Exception:
        pass


def main():
    """Main entry point for the notification hook."""
    try:
        # Check if hook is disabled
        if is_hook_disabled():
            sys.exit(0)

        # Get custom sound file or platform default
        platform_name = get_platform()
        sound_file = os.environ.get("NOTIFY_SOUND") or get_default_sound(platform_name)

        # Try to play sound
        success = False
        if sound_file:
            if platform_name == "macos":
                success = play_sound_macos(sound_file)
            elif platform_name in ["linux", "wsl"]:
                success = play_sound_linux(sound_file) or play_sound_windows(sound_file)
            elif platform_name == "windows":
                success = play_sound_windows(sound_file)

        # Fallback to terminal bell
        if not success:
            play_terminal_bell()

        # Always exit successfully to avoid breaking Claude Code
        sys.exit(0)

    except Exception as e:
        # Silent failure - write to stderr but don't break Claude Code
        print(f"Notify hook error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
