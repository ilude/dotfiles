---
name: zeroone-openstack
description: Inspect and operate ZeroOne OpenStack resources using the local cloud configuration. Use for flavors, quotas, worker capacity, networking, floating IPs, and OpenTofu deployment questions.
---

# ZeroOne OpenStack

Read [local access and commands](references/local-access.md) for the working WSL CLI setup and read-only discovery commands. Read [networking](references/networking.md) when evaluating public access or floating-IP port forwarding.

## Workflow

- Use the configured OpenStack API for account-specific facts. Discover flavors, quota usage, and network capabilities rather than inferring them from generic OpenStack documentation or flavor names.
- Establish the selected cloud, region, and project context before interpreting results. Keep credentials in the external cloud configuration; do not print or copy its contents into chat, scripts, or version-controlled files.
- Distinguish quota, current allocation, physical capacity, and price. Flavor visibility and quota headroom do not establish that a launch will succeed or what it costs. Read-only inventory does not authorize billable resource creation.
- For deployment changes, inspect the repository's current OpenTofu configuration and state ownership. Preserve existing changes and use a fresh plan to identify the actual resource changes before applying an authorized deployment.
- Treat workers as shared hosts capable of running multiple game services. Keep service lifecycles, persistent data, ports, and resource settings independent. Adding a game does not imply stopping another game or removing its ingress. Assess aggregate workloads and host headroom when sizing; configured memory limits are ceilings, not actual consumption.
- Keep build/configuration work separate from live infrastructure changes. A blocked deployment choice need not block independent server definitions or client-pack artifacts.
- Report observations with their scope and date when retaining them. Store changing addresses, resource IDs, quotas, and deployment status in current project configuration/documentation, not as permanent skill rules.
