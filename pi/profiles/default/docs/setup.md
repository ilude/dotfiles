# Pi setup

Run shell commands from the repository root. Use Bash, including Git Bash or WSL
on Windows, for the shell scripts below.

## Install or repair

The [repository installer](../../../../README.md#installation) installs Pi and
configures the default profile. With Pi and pnpm already installed, repeat just
the profile setup with:

```sh
bash scripts/pi-default-setup
```

This installs frozen dependencies, refreshes runtime links, sets `~/.pi/agent` and
runs offline checks. It does not sign you in. Only the default profile is set up.

## Log in

1. Start `pi` in your workspace.
2. Run `/login` and choose native `openai` with the ChatGPT subscription flow.
3. Send a short prompt through that same launch to confirm access.

For quota reporting, run `/usage login`, then `/usage`. That uses a separate
`openai-codex` OAuth grant; it does not replace the model login. Credentials belong
to the active profile. Do not copy or relabel credentials between providers or profiles.

## Update

Run `/update` in idle default-profile Pi. It upgrades Pi, refreshes runtime links
and resumes eligible sessions; busy sessions are skipped.

After upgrading global Pi another way, refresh the links yourself:

```sh
bash scripts/pi-deps-link-setup --profile default
```

Restart existing Pi processes to use the new version. Herdr setup does not need
rerunning for an ordinary Pi upgrade. T3's provider-settings update action uses
the repository adapter to install Pi and refresh default runtime links together;
chat `/update` remains unsupported there. Run `node scripts/t3-code-setup.mjs`
once to configure the adapter on an existing T3 installation.

## Development checks

```sh
make check-pi-default
pnpm --dir pi/profiles/default test prompting-skill.test.ts
```

Use pnpm, not Bun. Pass test filters directly after `test`, without `--`.
The setup script's offline checks do not verify subscription access.

## Troubleshooting

- **Wrong launcher:** check `type -a pi` in Bash or `Get-Command pi -All` in PowerShell.
- **Wrong profile or model:** inspect the affected process's cwd, `PI_CODING_AGENT_DIR`, `~/.pi/agent` target and selected provider/model. A fresh shell can hide the original problem.
- **Native launch fails:** retest that path without adding `PI_CODING_AGENT_DIR` to make it pass. A wrapper-only test is not enough.
- **Changes not showing:** reload the shell for launcher changes; use `/reload` or `/reload-runtime` for resources, with no active or retained subagents. Files changed on disk are not necessarily loaded in the running process.
- **Old profile layout:** stop Pi before using `scripts/migrate-pi-profiles.ps1`.
