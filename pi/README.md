# Pi Profiles

`pp` launches Pi with an isolated profile directory.

- `pp` uses `pi/profiles/default/`.
- `pp -p legacy` uses `pi/profiles/legacy/`, which contains the previous customized Pi setup and its local runtime state.
- Other named profiles use `~/.pi/profiles/<name>/`.

## Documentation ownership

This file owns cross-profile launcher and directory guidance. Customized legacy runtime documentation lives in [`profiles/legacy/docs/README.md`](profiles/legacy/docs/README.md), with the full setup guide in [`profiles/legacy/README.md`](profiles/legacy/README.md). Those documents do not describe the default profile. Keep new profile-specific documentation with its owning profile rather than recreating a shared `pi/docs/` tree.

## Default profile footer

The operator footer shows repository, model, context, and provider usage. `[reload]` indicates changed resource files since startup or reload. It checks the active profile's resources, trusted project resources, literal configured paths, and loaded command/tool/theme source paths every two seconds. It excludes credentials, sessions, generated model catalogs, and usage ledgers. Monitoring failures display `[reload check failed]`; package glob additions and arbitrary imported dependencies are not comprehensively discovered. Use `/reload` to load changes and reset the baseline.

The compatibility path `~/.pi/agent` points to the legacy profile so direct `pi` invocations retain the previous behavior.
