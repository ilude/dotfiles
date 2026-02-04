# Notification Sound Hook

Plays a sound notification when Claude Code is waiting for user input (via `AskUserQuestion` or permission requests).

## How It Works

The hook is triggered by the `PermissionRequest` event, which fires when:
- Claude uses `AskUserQuestion` to ask you questions
- Claude requests permission for an operation

This provides **immediate** notification (not the 60+ second delay of `idle_prompt`).

## Platform Support

| Platform | Sound Command | Default Sound |
|----------|---------------|---------------|
| macOS | `afplay` | Hero.aiff |
| Linux | `paplay` or `aplay` | complete.oga |
| Windows/WSL | PowerShell `Media.SoundPlayer` | chimes.wav |
| Fallback | Terminal bell (`\a`) | System bell |

## Configuration

### Custom Sound File

Set the `NOTIFY_SOUND` environment variable to use a custom sound:

```bash
# In your ~/.bashrc or ~/.zshrc
export NOTIFY_SOUND="/path/to/your/sound.wav"
```

### Disable Notifications

Temporarily disable:
```bash
export NOTIFY_ENABLED=false
```

Or disable via Claude's hook disable mechanism:
```bash
export CLAUDE_DISABLE_HOOKS=notify
```

### Per-Session Toggle

To disable for a single session, run before starting Claude:
```bash
NOTIFY_ENABLED=false claude
```

## Testing

Test the notification directly:
```bash
python ~/.claude/hooks/notify/notification-sound.py
```

You should hear a sound or see no output (silent success).

## Troubleshooting

### No sound on Windows/WSL

If you're on WSL and don't hear sounds, check:
1. Windows audio is working
2. PowerShell is available: `which powershell.exe`
3. Sound file exists: `ls /mnt/c/Windows/Media/chimes.wav`

### No sound on Linux

Check if audio commands are installed:
```bash
which paplay  # PulseAudio
which aplay   # ALSA
```

Install if missing:
```bash
# Ubuntu/Debian
sudo apt-get install pulseaudio-utils alsa-utils

# Fedora/RHEL
sudo dnf install pulseaudio-utils alsa-utils
```

### No sound on macOS

The `afplay` command is built-in. If it's not working:
1. Check system volume is not muted
2. Try playing the sound manually: `afplay /System/Library/Sounds/Hero.aiff`

## Implementation Details

Based on research of the [claude-code-notify plugin](https://github.com/AbdelrahmanHafez/claude-code-notify), this hook:

- Uses platform detection via Python's `platform.system()`
- Runs sound commands in background with output suppressed
- Falls back to terminal bell if sound fails
- Exits successfully even on errors (to avoid breaking Claude Code)
- Uses `bash -l` to ensure PATH is properly set in WSL

## Related Issues

- [#13024](https://github.com/anthropics/claude-code/issues/13024) - Feature request for WaitingForInput hook
- [#13370](https://github.com/anthropics/claude-code/issues/13370) - SSH bell emission request
- [#1288](https://github.com/anthropics/claude-code/issues/1288) - Sound notifications discussion

## Credits

Implementation inspired by [AbdelrahmanHafez/claude-code-notify](https://github.com/AbdelrahmanHafez/claude-code-notify).
