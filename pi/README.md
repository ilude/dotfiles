# Pi Profiles

`pp` launches Pi with an isolated profile directory.

- `pp` uses `pi/profiles/default/`.
- `pp -p legacy` uses `pi/profiles/legacy/`, which contains the previous customized Pi setup and its local runtime state.
- Other named profiles use `~/.pi/profiles/<name>/`.

## Documentation ownership

This file owns cross-profile launcher and directory guidance. Customized legacy runtime documentation lives in [`profiles/legacy/docs/README.md`](profiles/legacy/docs/README.md), with the full setup guide in [`profiles/legacy/README.md`](profiles/legacy/README.md). Those documents do not describe the default profile. Keep new profile-specific documentation with its owning profile rather than recreating a shared `pi/docs/` tree.

The compatibility path `~/.pi/agent` points to the legacy profile so direct `pi` invocations retain the previous behavior.
