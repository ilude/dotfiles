---
name: m365-tenant-automation
description: "Microsoft 365 tenant automation and inventory. Use when scripting Entra ID, Exchange Online, SharePoint Online, Teams, Graph, licensing, tenant inventory, or tenant-separated environment config. Not for generic PowerShell unrelated to M365."
---

# Microsoft 365 Tenant Automation

## Boundary

Use `m365-tenant-automation` for cloud tenant state and service APIs. Use `shell` for generic PowerShell mechanics. Use `private-store` for sensitive exports, credentials, and tenant data custody.

## Core Principles

- Scripts must be convergent: repeated runs should move the tenant toward the declared target state without duplicate objects or unnecessary churn.
- Treat live tenant inventory as the source of truth before mutation. Query current state and compare before creating, updating, or removing objects.
- Keep tenant-specific environments separate: config, exports, credentials, app registrations, domains, and IDs must not bleed across tenants.
- Prefer Graph, service modules, or supported CLI/API operations over UI-only runbooks. Verify API and CLI support before documenting a UI-only gap.

## Practical Steps

1. Identify tenant, environment, cloud, module versions, scopes, and target workload.
2. Capture live inventory for affected objects and keep sensitive exports in private storage.
3. Diff desired state against live state and present intended mutations.
4. Use `ShouldProcess`/`-WhatIf` for administrative PowerShell mutations.
5. Apply least-privilege scopes and tenant-specific authentication.
6. Re-query live state after mutation and record object IDs or audit-relevant evidence.

## Safety Checks

- Do not reuse cached tokens, app IDs, or environment files across tenants without explicit confirmation.
- Do not hardcode tenant IDs, secrets, domains, or certificate paths into reusable source.
- Do not delete or disable users, groups, apps, connectors, or policies without explicit approval and rollback notes.
- Store raw tenant exports under the private data workflow when they contain users, groups, domains, IDs, or configuration details.

## Anti-patterns

- Assuming declared config is accurate without live inventory.
- Creating objects without stable lookup keys and idempotency checks.
- Mixing prod, test, and client tenant variables in one environment file.
- Treating portal screenshots as the source of truth when APIs can return authoritative state.
