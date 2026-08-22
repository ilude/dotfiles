---
created: 2026-08-22
status: draft
---

# PRD: Self-Hosted Remote Agent Platform

## Problem

CPU-heavy builds, validation commands, long-running development services, and autonomous coding sessions currently depend too heavily on a Windows workstation. The workstation may remain online and available; the problem is dependence on remote-desktoping into it for routine access, not workstation unavailability or replacement. The work should run on homelab compute, continue when the local client disconnects, and remain directly accessible from another laptop without streaming the workstation desktop through AnyDesk. Remote-desktop access is slow, inefficient, and poorly suited to moving from an ultrawide workstation display to a smaller screen. Compact phone monitoring is a later need that makes the desktop-streaming model still less suitable.

The desired experience is a private version of the useful parts of exe.dev and Amp Orbs: normal Linux computers, persistent project state, disposable environments when needed, direct terminal and agent access, repository-owned setup, safe credential boundaries, private service publication, and understandable lifecycle operations. The system is single-user and experimental. It begins on one Proxmox server but must not make one server the permanent product boundary.

The existing homelab already has Proxmox, OpenTofu, Ansible, Bitwarden Secrets Manager (BWS), S3-compatible storage, RabbitMQ, Onclave, Technitium, Caddy, Forgejo, and a rootless Podman workload host. The product should compose those authorities rather than create a new scheduler, monitoring stack, secret manager, backup platform, or universal process model before observed use requires one.

## Users / Jobs To Be Done

- **Primary user:** One operator using Windows as the main workstation and other trusted laptops while away from the desk.
- **Primary job:** Start development or agent work remotely, disconnect, and later inspect or continue it without returning through the workstation desktop.
- **Secondary job:** Create a clean or disposable Linux boundary for risky repositories, parallel autonomous work, reproduction, and bounded experiments.
- **Later job:** Check progress and perform bounded lifecycle actions from a compact browser or phone interface.

## Goals

1. Offload CPU-heavy and long-running development and agent work from the Windows workstation.
2. Preserve work across local client disconnects and support direct reconnection from another trusted machine.
3. Provide persistent project environments, ephemeral project environments, and generic blank environments.
4. Use one central Herdr service for the first usable remote interaction experience.
5. Make Onclave the central orchestration system for managed environments and, later, broader homelab infrastructure.
6. Keep authoritative state with the systems that own it while providing deterministic adapters for efficient discovery and control.
7. Reduce ambient authority by separating personal and work repository identities, withholding unrelated credentials, and containing unknown user-space code.
8. Publish declared private development services through Onclave-managed intent and Caddy-managed TLS and proxying.
9. Preserve simple operation by deferring scheduling, telemetry, automatic cleanup, checkpoints, generalized backups, and rich clients until use demonstrates a need.

## Non-Goals

- Multi-user operation, high availability, consensus, automatic failover, or multi-tenant billing.
- Windows workers or Windows-native remote workloads.
- GPU discovery, placement, passthrough, or shared GPU services.
- Capacity admission control, reservations, priorities, or a workload scheduler.
- Automatic environment expiry, inactivity cleanup, or retention management.
- Onclave CPU, memory, disk, process, container, or historical telemetry.
- Filesystem checkpoints, automatic snapshots, environment cloning, or process-memory suspension.
- An Onclave backup platform or generalized migration-recovery subsystem.
- Central Pi session or log archival and replication.
- Public service sharing or an initial Authentik-style publication gateway.
- Automatic infrastructure retries, rollback, continuation, or failed-environment deletion.
- Initial protection against new host-kernel or hypervisor escapes.
- An initial hostile-sandbox profile with restricted egress, syscall policy, device policy, or mandatory dedicated VM or microVM execution.
- PR-first CI validation, repair, merge policy, or branch-protection automation.
- A web or phone interface in the Herdr MVP.
- Reproducing exe.dev's Cloud Hypervisor, OCI-to-block-device, image-cache, or storage implementation.

## Product Concepts

### Project

A project is the durable organizing concept. It owns repository identity, setup behavior, declared services, network capabilities, and one or more environments. A project is not limited to one machine, one agent thread, or one execution mode.

### Environment classes

1. **Persistent project environment:** Durable repository, tools, caches, services, and ongoing work for a trusted project.
2. **Ephemeral project environment:** Fresh project-prepared boundary for clean reproduction, risky work, parallel autonomous work, or bounded experiments.
3. **Generic blank environment:** Disposable Linux boundary without a project profile or credentials by default.

A specialized batch environment is not initially a separate class.

### Lifecycle authorities

- **Onclave:** Project and environment identity, desired lifecycle, orchestration operations, discovery and routing, configuration APIs, publication intent, and capability attachment.
- **OpenTofu:** Declared and applied infrastructure resource state.
- **Ansible:** Host and service convergence.
- **Herdr:** Durable interactive workspaces, terminals, and agent interaction.
- **Linux and Podman:** Processes, services, and containers.
- **Caddy:** Let's Encrypt certificate automation, TLS termination, and proxy data plane.
- **Technitium and CoreDNS/Joyride:** DNS authority and optional dynamic record data.
- **BWS:** Secret values and identity bindings.
- **S3-compatible storage:** Immutable private configuration bundles and large artifacts.
- **SQLite:** Onclave structured control data.
- **RabbitMQ:** Delivery, not authoritative operation state.

## Current Herdr Baseline

The tracked source contract in `modules/homelab-infra` at commit `e54b612` defines an optional Debian 13 unprivileged LXC with nesting disabled, a persistent non-root operator home, key-only SSH, pinned Herdr and Pi installation, the Herdr Pi integration, and a restricted Docker SSH stdio relay to the existing rootless Podman socket. The transport private key remains inside the Herdr LXC; the onramp side receives only a forced-command public-key entry that cannot open a shell or forwarding path.

Focused source validation with the repository-pinned `python-hcl2 7.3.1` passes: 20 tests and 12 subtests across inventory, OpenTofu, runtime, and onramp relay contracts.

This is not live behavioral evidence. The current record does not prove OpenTofu apply, Ansible convergence, live SSH, Podman transport, restart persistence, workstation disconnect and reconnect, or Pi session restoration. Those checks are a prerequisite acceptance gate, not completed behavior.

## External Reference: exe.dev

Published exe.dev documentation describes full remote VMs on bare-metal hosts using Cloud Hypervisor, which the provider treats as a replaceable implementation detail. VMs boot from OCI container images attached as bootable block devices; exe.dev reports creation in about two seconds and accepts a provider-controlled kernel. Its default Ubuntu 24.04 image includes systemd and broad development tooling, while custom OCI images and one-time setup scripts are supported. The product combines persistent disks, routed SSH names, an SSH and JSON lifecycle API, HTTPS proxying, machine status, and the web- and mobile-accessible Shelley agent.

Useful product patterns are normal-machine semantics, SSH as a low-ceremony access path, persistent project state, centrally routed HTTPS services, and optional in-guest agents. The exact OCI-to-block-device construction, cache and copy-on-write design, persistent storage, placement, and suspend or resume internals are not publicly established by the reviewed sources. This platform shall not reproduce those mechanisms without local evidence that prepared Proxmox LXC or KVM templates fail the required readiness and isolation contracts.

Sources reviewed on 2026-08-22:

- [How does exe.dev work?](https://exe.dev/docs/faq/how-exedev-works)
- [Customizing VMs](https://exe.dev/docs/customization)
- [exe.dev API](https://exe.dev/docs/api)
- [Shelley](https://exe.dev/docs/shelley/intro)
- [Meet exe.dev, Modern VMs](https://blog.exe.dev/meet-exe.dev)

## Requirements

### Functional Requirements

#### Scope and environment model

- **REQ-001:** The platform shall support one operator, begin on one Proxmox server, and later operate managed environments across more than one Proxmox server without redefining project or environment identity.
  - Verification: Initial configuration and domain models identify host placement separately from project and environment identity; the later multi-host milestone provisions and discovers environments on a second Proxmox server through the same lifecycle contract.

- **REQ-002:** The platform shall represent the project as the durable organizing concept for repository identity, setup, services, capabilities, and environments.
  - Verification: One project can reference more than one environment without duplicating its project-level configuration.

- **REQ-003:** The platform shall support persistent project, ephemeral project, and generic blank environment classes.
  - Verification: The environment schema distinguishes all three classes and enforces their different trust and credential defaults.

- **REQ-004:** The initial platform shall support Linux CPU workloads only.
  - Verification: Initial environment profiles require neither Windows behavior nor GPU placement or passthrough.

#### Herdr MVP and environment access

- **REQ-005:** The MVP shall use one central Herdr service as the normal remote interaction and monitoring interface.
  - Verification: A trusted laptop can connect directly to the Herdr service and inspect a retained workspace without opening the Windows workstation desktop.

- **REQ-006:** The central Herdr service shall own durable panes while target environments retain their own repositories, processes, credentials, and Pi session files.
  - Verification: A Pi process launched for an isolated environment runs inside that target and writes its session and repository state there.

- **REQ-007:** Herdr shall enter isolated LXCs, VMs, or future microVMs through SSH or an equivalent native guest transport and shall enter project containers through the restricted Docker-compatible transport and container execution.
  - Verification: Each supported target profile returns a stable connection record containing environment identity, transport, target alias, operator identity, verified host-key trust, working directory, and Pi resume information.

- **REQ-008:** The platform shall not require a separate Herdr service in every environment.
  - Verification: A newly provisioned target can be opened from the central Herdr service without installing another Herdr control endpoint in the target.

- **REQ-009:** The platform shall treat first-class recognition of a Pi process beyond an SSH hop as unproven until a live executable test establishes Herdr's observed behavior.
  - Verification: The test records whether Herdr sees the remote Pi as an agent or only as an SSH-backed pane, and requirements do not claim richer behavior than observed.

#### Continuity and work execution

- **REQ-010:** Disconnecting the local Herdr client, closing the laptop, or losing the client network connection shall not stop remote work.
  - Verification: A remote validation command continues through a client disconnect and its final exit result is available after reconnection.

- **REQ-011:** Persistent environments shall initially remain running and preserve files and explicitly managed services.
  - Verification: Files survive client disconnect and environment reboot; selected services restart according to their declared Linux recovery behavior.

- **REQ-012:** A job shall resume or restart after an environment reboot only when it has an explicit recovery contract.
  - Verification: An ordinary shell process is not reported as resumed after reboot, while a declared recoverable service follows its specified restart behavior.

- **REQ-013:** The first workload shall run an autonomous coding session and a concrete CPU-heavy build, test, typecheck, or validation command remotely.
  - Verification: Completion is determined from the command exit result and retained output, not solely from an agent statement.

#### Project setup, source, and results

- **REQ-014:** A project may declare one optional repository-owned, idempotent environment setup procedure.
  - Verification: A fresh project environment runs the procedure after checkout and exposes its output, failure, and exit result.

- **REQ-015:** The initial setup contract shall not require support for multiple competing setup standards, prepared images, or project snapshots.
  - Verification: A project can use one preparation entrypoint without the platform interpreting devcontainer, Nix, mise, and other formats directly.

- **REQ-016:** Git shall be the durable source and committed-result exchange path.
  - Verification: A project environment can clone, fetch, commit, and push using its assigned repository identity.

- **REQ-017:** Personal and work projects shall use separate repository identities with no fallback between them.
  - Verification: A work project cannot authenticate using the personal identity and a personal project cannot authenticate using the work identity.

- **REQ-018:** The platform shall support SSH-based repository access without requiring workstation private-key files to be copied into Herdr or a target environment.
  - Verification: Repository access succeeds using a dedicated or brokered project identity while the workstation private-key paths are absent.

- **REQ-019:** The platform shall support explicit retrieval of uncommitted changes, selected files, and artifact bundles without silently overwriting unrelated local changes.
  - Verification: Retrieval into a conflicting local path stops or creates a separate result rather than overwriting the existing file.

#### Trust, isolation, and credentials

- **REQ-020:** A persistent project environment shall receive only the authority assigned to that project.
  - Verification: Unrelated project credentials, repositories, workstation dotfiles, browser state, and local service sockets are absent.

- **REQ-021:** An ephemeral project environment shall receive only explicitly assigned project credentials and resources.
  - Verification: A fresh ephemeral environment lacks unrelated personal, work, infrastructure, and administrative credentials.

- **REQ-022:** A generic blank environment shall receive no project or repository credentials by default.
  - Verification: Creating a generic blank environment produces no repository identity or secret binding unless explicitly attached later.

- **REQ-023:** Environments used for unknown repositories shall contain malicious package scripts and arbitrary user-space programs so they cannot access host files, sibling environments, ungranted credentials, or Proxmox and Onclave administrative interfaces.
  - Verification: A containment test attempts each prohibited access and passes only when all are denied.

- **REQ-024:** Deleting an environment shall revoke its attached credentials and network capabilities.
  - Verification: Previously issued environment access cannot be used after confirmed deletion.

- **REQ-025:** Damage control shall continue to govern consequential remote operations even when filesystem and credential isolation are present.
  - Verification: An environment with an authorized remote credential cannot bypass the applicable command policy merely because it is isolated.

- **REQ-026:** Project setup may request a credential or network capability but shall not contain reusable enrollment, BWS, or administrative authority.
  - Verification: Repository content can name a capability while the backing credential remains in BWS or its owning broker.

#### Onclave orchestration and infrastructure

- **REQ-027:** Onclave shall be the central orchestration system for managed environment lifecycle, discovery, routing, operation progress, and outcome.
  - Verification: Environment create, inspect, retain, and delete requests receive stable operation identities and queryable outcomes.

- **REQ-028:** Onclave shall query authoritative systems through deterministic provider and runtime adapters rather than treating cached control data as live runtime truth.
  - Verification: Environment, Herdr, Podman, Caddy, OpenTofu, and Ansible status responses identify their source and refresh from the owning boundary when an action depends on current state.

- **REQ-029:** The owning Onclave or infrastructure subsystem shall create, maintain, and improve deterministic state and fact retrieval tooling as observed workflows require it.
  - Verification: Each supported authority has a bounded adapter or probe with a machine-readable result and explicit failure state.

- **REQ-030:** Onclave shall invoke a provider-specific infrastructure execution subsystem to run OpenTofu planning and authorized application, Ansible convergence, and live readiness verification.
  - Verification: One operation links its selected configuration, plan artifact, apply result, Ansible result, readiness result, and provider resource references.

- **REQ-031:** Onclave shall not reimplement OpenTofu state reconciliation, Ansible convergence, or provider APIs in its orchestration core.
  - Verification: Infrastructure mutation occurs through the owning tools and adapters, while Onclave records intent and outcome.

- **REQ-032:** Onclave shall eventually orchestrate broader existing homelab infrastructure through bounded service-by-service migrations after the remote-agent path is proven.
  - Verification: The provider-neutral contract can represent a non-agent homelab service without requiring that migration for the first remote-agent milestone.

#### Configuration and durable control data

- **REQ-033:** Onclave shall be the exclusive normal API for versioned private infrastructure configuration.
  - Verification: Normal configuration reads, writes, validation, comparison, activation, and rollback use authorized Onclave operations rather than direct bucket mutation.

- **REQ-034:** Private configuration shall be stored as immutable bundles in S3-compatible object storage with version metadata, parent identity, content digest, schema, author, validation result, and activation state.
  - Verification: Activating a new version does not mutate the bytes or metadata of an existing version.

- **REQ-035:** SQLite shall store Onclave projects, environments, configuration metadata, active-version pointers, operation transitions, and provider resource references initially.
  - Verification: Restarting the single Onclave control-plane instance restores those records and interrupted operation state from SQLite.

- **REQ-036:** BWS shall remain authoritative for secret values; configuration bundles shall contain secret references or bindings rather than broad plaintext credentials.
  - Verification: Inspection of an accepted configuration bundle finds references but no secret values covered by the BWS contract.

- **REQ-037:** OpenTofu state shall remain separate from Onclave configuration objects and ordinary operation artifacts.
  - Verification: Resource reconciliation reads its configured OpenTofu backend rather than deriving state from Onclave SQLite or artifact objects.

- **REQ-038:** RabbitMQ shall provide delivery but shall not be the authoritative store for environment or operation state.
  - Verification: Onclave can recover environment and operation records after broker message retention or queue recreation.

#### Failure and deletion behavior

- **REQ-039:** When configuration selection, OpenTofu planning or application, Ansible convergence, registration, or readiness verification fails, Onclave shall stop at that stage.
  - Verification: No downstream stage begins after the recorded failure.

- **REQ-040:** A failed operation shall retain the partial environment and record the failed stage, exit result, bounded error summary, full artifact reference, known resources, adapter reachability, and mutation certainty.
  - Verification: The operator can distinguish no mutation, known mutation, and uncertain mutation from the operation result.

- **REQ-041:** Recovery from a failed infrastructure operation shall require an explicit inspect, re-plan, retry, or delete operation.
  - Verification: Onclave performs no automatic retry, rollback, continuation, or failed-environment deletion.

- **REQ-042:** Initial environment cleanup shall occur only through explicit deletion by stable environment identity.
  - Verification: Inactivity and elapsed time never delete an environment.

- **REQ-043:** Explicit deletion shall be final without activity detection, archival, retained disks, or a second platform confirmation.
  - Verification: Deletion removes known publication, DNS, network, runtime, and infrastructure resources and reports any remaining resource references.

#### Service publication and network access

- **REQ-044:** A project may declare publishable services with logical identity, protocol, backend port, and readiness information in its environment contract.
  - Verification: Setup can start the service without directly editing shared DNS, Caddy configuration, or certificate credentials.

- **REQ-045:** Onclave shall own endpoint allocation, publication authorization, DNS and route intent, project and environment ownership, and publication removal.
  - Verification: Two concurrent environments cannot claim the same final endpoint, and deleting one removes only its publication intent.

- **REQ-046:** Caddy shall obtain and renew Let's Encrypt certificates through Cloudflare DNS-01, terminate TLS, and proxy to declared service backends.
  - Verification: A private declared HTTPS service presents a valid certificate and routes to the intended backend without exposing certificate private keys to the project setup procedure.

- **REQ-047:** Initial published services shall be private-network only.
  - Verification: A published service is reachable from the approved private access path and not through an unauthenticated public route.

- **REQ-048:** Technitium shall remain the DNS authority; CoreDNS or Joyride may provide Onclave-managed dynamic record data without becoming the publication control plane.
  - Verification: DNS resolution and route intent have one identified owner each, and stopping a backend does not grant Joyride authority over Caddy policy.

#### Personal and work tailnets

- **REQ-049:** The operator shall be able to reach Herdr, Onclave, and private published services through the personal tailnet while traveling.
  - Verification: A trusted client on the personal tailnet reaches those endpoints without routing through the Windows workstation desktop.

- **REQ-050:** Selected work project environments shall reach work-tailnet resources through one shared controlled connector initially.
  - Verification: An authorized work project reaches an allowed work resource while a personal project and generic blank environment cannot use the connector.

- **REQ-051:** The work-tailnet connector shall not route or expose work-tailnet resources to the personal tailnet.
  - Verification: A personal-tailnet client cannot reach a work-only destination through the connector.

- **REQ-052:** Onclave shall control connector attachment and revocation, while BWS retains the connector identity or credential binding.
  - Verification: Detaching a project removes its connector path without disclosing the connector credential to the project environment.

#### Capacity, resource reporting, and session retention

- **REQ-053:** The initial platform shall start requested environments without aggregate capacity admission control, reservations, priorities, or queueing.
  - Verification: Onclave does not reject or delay a valid request solely because managed allocation totals exceed an internal threshold.

- **REQ-054:** Onclave shall retain only lifecycle state required for its operations and shall not initially collect CPU, memory, disk, process, container, or historical utilization telemetry.
  - Verification: Resource diagnosis remains available through Proxmox, Herdr, native Linux or container tools, and SSH rather than an Onclave telemetry database.

- **REQ-055:** Pi session content and logs may remain local to the originating environment and may be lost when an environment is deleted.
  - Verification: The platform imposes no central archive, replication, or deletion-time session-retention requirement.

#### Client roadmap

- **REQ-056:** The Herdr MVP shall not require an Onclave web or phone interface.
  - Verification: The primary remote workflow can be completed from a trusted laptop using Herdr and the owning native tools.

- **REQ-057:** If post-MVP client functionality is implemented, the first such stage shall be a deterministic Onclave API and CLI, informed by observed Herdr MVP use.
  - Verification: Machine-readable lifecycle and status operations are defined independently of browser presentation before a monitoring UI is implemented.

- **REQ-058:** If a monitoring interface is implemented, it shall follow the API and CLI stage and may expose projects, environments, agents, bounded output, results, artifacts, service links, and actions based on observed needs.
  - Verification: The monitoring interface consumes the established deterministic contracts rather than preceding them or scraping Herdr terminal output.

- **REQ-059:** If a complete exe.dev-like browser and phone experience is implemented, it shall follow the smaller monitoring interface and be limited to interaction needs demonstrated by the preceding stages.
  - Verification: The Herdr MVP and API and CLI stages contain no requirement for browser terminal, file browser, diff editor, or full agent-conversation UI, and any later full client records the observed gap it addresses.

### Non-Functional Requirements

- **NFR-001:** The normal workflow shall not require the operator to choose a hypervisor, know Proxmox topology, or invoke OpenTofu and Ansible commands directly.
  - Verification: Environment lifecycle is requested through the owning product surface and provider details remain behind the execution subsystem.

- **NFR-002:** Runtime and provider adapters shall return deterministic, machine-readable results with explicit unavailable, stale, failed, and unknown states where applicable.
  - Verification: Repeating a read against unchanged authoritative state produces equivalent normalized results.

- **NFR-003:** Sensitive values shall not be written to tracked files, ordinary operation logs, agent messages, configuration bundles, images, or snapshots.
  - Verification: Secret scanning and bounded artifact inspection find only authorized references or redacted values.

- **NFR-004:** Environment access shall use non-root identities and verified host trust where the selected runtime supports them.
  - Verification: SSH rejects root and password login for the Herdr baseline and does not rely on opportunistic host-key discovery.

- **NFR-005:** The restricted remote container path shall not expose a Docker TCP API, interactive relay shell, SSH forwarding, or a Docker daemon on the Herdr LXC.
  - Verification: The exact stdio relay succeeds and non-exact commands, shell access, and forwarding fail.

- **NFR-006:** The initial control plane shall operate correctly as one Onclave instance with SQLite and shall not claim high availability.
  - Verification: Restart recovery succeeds on the single instance, and no acceptance criterion requires concurrent control-plane writers or failover.

- **NFR-007:** Project setup, infrastructure execution, and deletion shall report explicit terminal outcomes rather than silently falling back to alternate credentials, runtimes, or workflows.
  - Verification: Missing dependencies, credentials, or authoritative state fail with an identified owner and next action.

- **NFR-008:** Tracked implementation and documentation shall remain public-safe and shall not contain live inventory, site domains, addresses, keys, tokens, or BWS values.
  - Verification: Repository public-safety validation passes with placeholders and secret references only.

## Acceptance Criteria

### Herdr prerequisite gate

1. [ ] Given the reviewed Herdr OpenTofu and Ansible package, when it is applied to the intended new resource, then exactly one expected unprivileged, no-nesting Herdr LXC is created without unrelated resource deletion.
   - Verification: The reviewed plan and post-apply state show the expected create and no unrelated changes.

2. [ ] Given the provisioned Herdr LXC, when the operator connects directly, then key-only non-root SSH succeeds and root, password, forwarding, and unapproved-source access fail.
   - Verification: Direct positive and negative SSH checks pass with sanitized evidence.

3. [ ] Given Herdr, Pi, and the integration in the LXC, when the Herdr service and LXC restart, then the operator home, integration state, transport identity, and restorable Pi session files remain available.
   - Verification: Pre- and post-restart checks identify the same persistent files and a Pi session can be reopened.

4. [ ] Given a running remote validation command, when the laptop client disconnects and reconnects from another trusted laptop, then the command continues and its output and exit result remain available through Herdr.
   - Verification: The command PID or owning process continues remotely during disconnection and the final result is observed after reconnection.

5. [ ] Given the `herdr-onramp` context, when the exact Docker stdio command is used, then it reaches the rootless Podman socket; non-exact commands and an interactive shell are rejected.
   - Verification: Positive context use and negative relay tests pass, with no Docker daemon or TCP API present.

### First Onclave-managed system gate

6. [ ] Given an active private configuration version, when Onclave provisions a persistent project environment, then one operation links the immutable configuration object, OpenTofu plan and result, Ansible result, readiness result, and provider resource identity.
   - Verification: SQLite and S3 references reconstruct the complete operation without relying on RabbitMQ history.

7. [ ] Given the persistent project environment, when an autonomous coding session runs a CPU-heavy validation command and the client disconnects, then remote work continues and reconnecting exposes output, repository changes, artifacts, and exit result.
   - Verification: The command result and repository inspection directly demonstrate completion.

8. [ ] Given the same project, when Onclave provisions an ephemeral project environment, then it receives only the project-bounded repository identity, setup procedure, declared services, and approved capabilities.
   - Verification: Required project access succeeds and unrelated personal, work, infrastructure, and administrative access fails.

9. [ ] Given work in the ephemeral environment, when the operator retrieves an uncommitted change and artifact, then the results arrive without overwriting an unrelated local file.
   - Verification: A deliberate local conflict is preserved and reported.

10. [ ] Given the ephemeral environment's stable identity, when the operator explicitly deletes it, then its publication, DNS intent, network attachment, runtime resources, infrastructure resources, and attached authority are removed, or every remaining resource is reported.
    - Verification: Authoritative adapters confirm absence or return the exact residual references.

11. [ ] Given a generic blank environment, when it is created without explicit capabilities, then no repository identity, project secret, personal or work tailnet access, or administrative endpoint access is present.
    - Verification: Credential and network-boundary checks pass.

12. [ ] Given an unknown repository containing malicious user-space access attempts, when it runs in its assigned isolated environment, then host files, sibling files, ungranted credentials, sibling control paths, and administrative interfaces remain inaccessible.
    - Verification: Each prohibited access attempt fails without claiming kernel or hypervisor exploit resistance.

13. [ ] Given a declared private HTTP service, when Onclave publishes it, then Technitium resolves its endpoint, Caddy obtains a Let's Encrypt certificate through Cloudflare DNS-01, and Caddy proxies to the intended backend without a public unauthenticated route.
    - Verification: DNS, TLS, route ownership, backend response, and public-access negative checks pass.

14. [ ] Given a selected work project, when Onclave attaches the shared work-tailnet connector, then the project reaches an allowed work resource while personal and blank environments cannot use the connector and the personal tailnet cannot reach work-only resources through it.
    - Verification: Positive work access and all negative cross-domain tests pass.

15. [ ] Given a failure at any infrastructure stage, when the operation terminates, then no downstream stage starts and the operator receives the failed stage, exit result, artifact reference, known resources, adapter reachability, and mutation certainty.
    - Verification: An injected pre-mutation failure and an injected post-mutation failure both produce the required distinct records without automatic retry or cleanup.

## Dependencies

- The landed Herdr source package and its focused tests.
- One live Herdr deployment and direct acceptance gate before new Onclave-managed platform implementation begins.
- Proxmox, OpenTofu, Ansible, BWS, S3-compatible storage, RabbitMQ, Technitium, Caddy with Cloudflare DNS-01, Forgejo, and the existing rootless Podman host.
- Tailscale personal-tailnet access and an approved work-tailnet connector identity when a work project requires it.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Source tests are mistaken for live continuity evidence | The core remote-work premise remains unproven | Keep the live Herdr prerequisite gate explicit and block new platform implementation until it passes |
| Central Herdr sees an SSH process but not a remote Pi agent | Rich lifecycle state is unavailable | Preserve terminal access as the MVP contract and run one live executable integration test before adding agent-state requirements |
| Shared work-tailnet connector conflates project identity | Work access is broader or less auditable than intended | Enforce Onclave attachment policy and move to per-environment membership if the connector cannot provide required isolation |
| Onclave cached state diverges from native owners | Unsafe or misleading lifecycle actions | Refresh action-critical facts from deterministic authoritative adapters |
| SQLite becomes insufficient | Concurrent orchestration or query behavior degrades | Keep the initial single-writer boundary; evaluate PostgreSQL only from observed pressure |
| Proxmox image readiness is too slow | Ephemeral environments lose value | Measure prepared LXC and VM templates before considering custom OCI-to-disk or microVM infrastructure |
| Explicit deletion targets the wrong environment | Irrecoverable state loss | Require stable environment identity in the request and report the full cascade and residual resources |
| Publication control exposes an unintended service | Sensitive development service becomes reachable | Keep publication private, allocate endpoints centrally, and separate project service declarations from shared Caddy and DNS credentials |

## Open Questions

These questions require live evidence or implementation experiments rather than further speculative requirements discussion:

1. Does Herdr recognize and control a Pi process launched beyond an SSH hop, or only retain the SSH-backed pane?
2. Which Proxmox runtime and template mechanism best satisfies each environment class and the user-space containment requirement?
3. How quickly can ordinary prepared LXC and KVM templates reach project readiness on the first Proxmox server?
4. Which deterministic CoreDNS, Technitium, and Caddy integration is simplest once the publication contract is exercised?
5. Does the shared work-tailnet connector provide sufficient protocol support, auditability, and project isolation?
