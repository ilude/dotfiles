# Local access and read-only discovery

## Working local setup

The verified local environment uses WSL distribution `Ubuntu-24.04`, cloud alias `openstack`, and an external cloud configuration at:

- Windows: `C:\Users\Mike\.config\openstack\clouds.yaml`
- WSL: `/mnt/c/Users/Mike/.config/openstack/clouds.yaml`

These are local defaults, not portable requirements. Check the current environment when they do not work. Do not display the file: it contains authentication material.

The OpenStack CLI was not on the WSL PATH. The installed `uv` can run it without adding a repository dependency. From PowerShell:

```powershell
wsl -d Ubuntu-24.04 -- bash -lc 'export OS_CLIENT_CONFIG_FILE=/mnt/c/Users/Mike/.config/openstack/clouds.yaml; ~/.local/bin/uvx --from python-openstackclient openstack --os-cloud openstack flavor list --long -f json'
```

For several commands in one WSL shell, define a helper:

```sh
export OS_CLIENT_CONFIG_FILE=/mnt/c/Users/Mike/.config/openstack/clouds.yaml
os() { ~/.local/bin/uvx --from python-openstackclient openstack --os-cloud openstack "$@"; }
```

Use normal nested quoting when invoking that shell through PowerShell. `uvx` may download dependencies on first use.

## Discovery commands

Run only the commands needed for the question:

```sh
os configuration show --mask -f json
os region list -f json
os flavor list --long -f json
os quota show --usage -f json
os server list --long -f json
os volume list -f json
os network list -f json
os router list -f json
os floating ip list -f json
os extension list --network -f json
```

Use masked configuration output only when resolving cloud/region context. Do not use `token issue` as a discovery shortcut: its output exposes a bearer token.

The project has been using region `ZO-PNW`. Verify the selected region rather than silently querying a different one.

## Interpret capacity

OpenStack reports flavor RAM and RAM quota in MiB. Divide by 1024 for GiB. A quota limit of `-1` means unlimited for that quota entry, not infinite physical capacity.

For one proposed flavor, calculate additional instance headroom from the minimum of:

- Remaining instance slots.
- Remaining vCPUs divided by flavor vCPUs, rounded down.
- Remaining RAM divided by flavor RAM, rounded down.

Account for reservations and the deployment's other resources, such as boot volumes and storage. Public connectivity is a separate constraint: another private worker does not inherently require another floating IP.

The observed `z1.r.xlarge` flavor has 8 vCPUs and 16384 MiB RAM. Re-query before using that as a current provisioning fact. No flavor-specific usage quota was established by the general quota query.
