# Workstation BWS locator

Ignored `settings.local.json` is the workstation's project/API locator for BWS.
Copy `settings.example.json` on a new workstation and set the existing project ID
and API endpoint. It contains no bootstrap credential, runtime secret, inventory
snapshot or service selection. Keep `BITWARDEN_ACCESS_KEY` in the authorized
caller environment, never this file or tracked source.

Pi's Browserbase/Firecrawl helpers and `scripts/bws-lookup.py` use this location.
The lookup prints one scalar `HOMELAB_ANSIBLE_INVENTORY` `all.vars` field, using one
BWS list request and no Docker container or deployment snapshot:

```sh
uv run python scripts/bws-lookup.py forgejo_root_url
```

Private homelab-config retains its own existing caller locator. BWS remains the
configuration/secret authority. The old homelab-infra locator and private values
checkout are preserved locally for historical compatibility, not required
workstation source. Do not create per-skill locator or credential copies.
