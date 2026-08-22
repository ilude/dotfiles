# Remote agent platform discussion notes

Status: exploratory notes, not an approved architecture or implementation plan

## Purpose

Capture the current discussion and source material for a future `/grill-me` session and PRD. The intended direction is an exe.dev-like personal remote development and agent environment, informed by selected Amp Orb features.

The product priorities are:

1. Easy to use.
2. Simple to install and operate.
3. Flexible enough for different repositories, tools, and execution modes.
4. Low ceremony for starting, observing, resuming, and collecting work.
5. Useful for CPU-heavy and long-running tasks that should continue away from the workstation.

This document records observations and questions. A cited idea is not automatically applicable or approved. Current implementation truth comes from the owning repositories and deployed behavior, not research notes or archived specifications.

## Problem statement

The primary need is to offload CPU-heavy and long-running development and agent work from the workstation to two existing Proxmox servers.

The desired experience is closer to a remote computer than a short-lived code-execution API:

- Start work with little setup.
- Let it continue after the local terminal or workstation disconnects.
- Reconnect from another session.
- Inspect logs, files, processes, and results.
- Run ordinary development tools and services.
- Preserve useful repositories, dependencies, and caches.
- Stop or discard work without manual cleanup across several systems.
- Add stronger isolation only where the workload requires it.

This is a single-user experimental system. High availability, multi-tenant billing, enterprise identity, and cluster consensus are not current drivers.

## Desired product shape

The leading product concept is a private, self-hosted environment with the simplicity of exe.dev:

```text
local CLI or Pi
    |
    v
remote machine or workspace
    |
    +-- shell and terminal
    +-- repository and normal filesystem
    +-- development tools
    +-- long-running processes
    +-- agent runtime
    +-- optional containers or stronger sandbox
```

The user should not need to understand the underlying runtime for ordinary work. VM, container, and possible microVM choices are implementation details unless a task needs an explicit isolation profile.

No decision has been made about whether the durable user-facing object is:

- a named machine;
- a project workspace;
- an agent thread;
- a job;
- or a small combination of these.

## Existing local foundation

### Proxmox and homelab-infra

There are two Proxmox servers. `modules/homelab-infra/` owns their infrastructure resources and service configuration.

Current repository contracts establish that:

- OpenTofu owns Proxmox resource declaration.
- Ansible owns host and service configuration.
- Bitwarden Secrets Manager owns configuration families and runtime secrets.
- SeaweedFS owns encrypted OpenTofu state.
- Site-specific inventory must not be copied into tracked public files.

The existing onramp host is a configurable Debian 13 KVM VM with CPU, memory, system disk, data disk, network, cloud-init user, and SSH keys declared in:

- [`modules/homelab-infra/infra/opentofu/onramp-host.tf`](../../modules/homelab-infra/infra/opentofu/onramp-host.tf)
- [`modules/homelab-infra/README.md`](../../modules/homelab-infra/README.md)
- [`modules/homelab-infra/AGENTS.md`](../../modules/homelab-infra/AGENTS.md)

The current infrastructure model does not yet establish a general worker resource distributed across both Proxmox servers. That is an observed gap, not proof that a new scheduler or dynamic provisioner is needed.

### Onclave

Onclave v2 is deployed as a signed HTTPS agent communication service backed internally by RabbitMQ. It currently provides:

- agent registration and presence;
- optional agent capability labels;
- heartbeats;
- durable per-agent message queues;
- acknowledgements, requeue, and dead lettering;
- correlated conversations;
- bounded delegation grants;
- audit records.

The current agent card and heartbeat schemas are defined in:

- [`modules/onclave/packages/envelope/src/protocol.ts`](../../modules/onclave/packages/envelope/src/protocol.ts)

The external transport boundary is documented in:

- [`modules/homelab-infra/.specs/onclave-https-agent-transport/plan.md`](../../modules/homelab-infra/.specs/onclave-https-agent-transport/plan.md)

Onclave does not currently provide remote process supervision, workspace lifecycle, resource scheduling, or a durable job model. It may be useful as a transport, but this discussion has not established that it must own or carry remote-worker control.

### Forgejo and storage

Forgejo and S3-compatible storage already exist in the homelab. They are possible mechanisms for repository and artifact exchange. Their existence does not by itself require the remote platform to use them.

## External platform observations

Provider claims below describe their published interfaces. Low-level implementation details are left unknown where the provider does not document them.

### exe.dev

Sources:

- [exe.dev](https://exe.dev/)
- [Running agents](https://exe.dev/docs/use-case-agent)
- [Meet exe.dev, Modern VMs](https://blog.exe.dev/meet-exe.dev)

Published characteristics:

- Full remote VMs rather than a restricted code runner.
- SSH-based creation and access.
- Persistent disks.
- Fast startup.
- Private HTTP services with managed TLS and sharing controls.
- Preinstalled coding agents and development tooling.
- A machine can remain useful for long-lived development and agent work.

What appears valuable for this project:

- The machine is understandable: it behaves like a normal computer.
- SSH is both a familiar access path and a low-ceremony control surface.
- Persistence avoids repeating repository and dependency setup.
- Managed service URLs reduce reverse-proxy and certificate work for each project.
- The platform does not force one agent or one development workflow.

Unknown or not yet verified:

- The underlying VMM and storage implementation.
- Exact suspend and resume semantics.
- How much orchestration is exposed beyond SSH and machine lifecycle.
- Which parts remain useful at a two-server, single-user scale.

### Amp Orbs

Sources:

- [What Are Orbs?](https://ampcode.com/what-are-orbs)
- [Agents in Orbs](https://ampcode.com/news/agents-in-orbs)
- [Putting an Agent in an Orb](https://ampcode.com/notes/putting-an-agent-in-an-orb)

Published characteristics:

- A fresh Debian environment associated with an Amp thread.
- Repository, tools, agent, terminal, file browser, diff review, and artifacts presented together.
- Automatic pause after inactivity and wake on demand.
- `.agents/setup` runs for a fresh environment.
- `.agents/resume` runs after wake.
- Prepared setup can be snapshotted and reused for later environments.
- HTTP services can be exposed through Portals.
- Changes can be synchronized to the local machine.
- Scheduled, webhook, Slack, team, and agent-to-agent entrypoints exist.

Features that may have high value here:

1. **Repository-owned setup hook.** A checked-in, idempotent setup entrypoint can prepare dependencies and project services without relying on an agent to infer every step.
2. **Resume hook.** A narrow wake hook can restore only state that does not naturally survive suspension or reboot.
3. **Integrated review.** Files, diffs, terminal output, logs, screenshots, and artifacts should be easy to inspect without reconstructing paths manually.
4. **Automatic idle handling.** Workspaces can stop consuming compute when inactive without being destroyed.
5. **Service URLs.** A project dev server can be reached without manually editing ingress for every run.
6. **Prepared environment reuse.** Expensive project setup can be cached or snapshotted.
7. **Consistent local and remote control.** Starting remote work should feel close to starting local work.

Features that are not automatically justified:

- Thread-per-machine as the only lifecycle model.
- Unlimited workspace semantics.
- Slack, webhook, schedule, multiplayer, or agent-to-agent features.
- Automatic fresh environment creation for every task.
- Amp-specific repository conventions or UI.

### Fly.io Sprites

Source:

- [Sprites](https://sprites.dev/)

Published characteristics:

- Persistent full Linux computers.
- A normal POSIX filesystem backed by durable storage and a local cache.
- Sleep, movement between hosts, and wake with filesystem state intact.
- Copy-on-write disk checkpoints.
- A per-environment URL with wake on request.
- A credential gateway that performs authorized API calls without handing the backing credential to the workload.
- API and CLI command execution.

Potentially valuable ideas:

- Separate durable filesystem state from the current compute host.
- Treat checkpoints as filesystem rollback rather than full process-memory resume.
- Wake a stopped workspace when its service URL receives a request.
- Keep long-lived provider credentials outside the execution environment.

These ideas may be expensive to reproduce locally and need a clear value test before entering the PRD.

### E2B, Daytona, Runloop, and Modal

Sources:

- [E2B documentation](https://e2b.dev/docs)
- [Daytona documentation](https://www.daytona.io/docs)
- [Runloop documentation](https://docs.runloop.ai/)
- [Modal Sandboxes](https://modal.com/docs/guide/sandbox)

These platforms generally expose programmable sandbox APIs rather than a simple personal remote-computer experience. Common primitives include:

- create an environment from a template;
- run and supervise commands;
- transfer files;
- expose ports;
- snapshot or persist filesystems;
- apply time and resource limits;
- collect results and lifecycle events.

They are useful references if the project later needs a programmatic workspace API. They are not evidence that the first version needs a general sandbox broker.

## Runtime and isolation observations

Candidate execution boundaries include:

| Boundary | Likely strength | Likely cost |
| --- | --- | --- |
| Persistent KVM VM | Familiar full computer, Linux or Windows, strong isolation | More resource and image management than a container |
| Proxmox LXC | Lightweight persistent Linux environment | Shares the Proxmox host kernel |
| Container inside a worker VM | Familiar project packaging and cleanup | Shares the worker VM kernel |
| Full VM per task | Strong disposable boundary | More provisioning and setup work |
| Firecracker or similar microVM | Dense disposable Linux isolation | Additional image, network, guest-agent, and nested-virtualization work |
| Direct process in a worker VM | Lowest ceremony for trusted work | Weak separation between jobs in the same worker |

Relevant upstream sources:

- [Firecracker](https://firecracker-microvm.github.io/)
- [Cloud Hypervisor](https://github.com/cloud-hypervisor/cloud-hypervisor)
- [Kata Containers](https://katacontainers.io/)
- [Hyperlight](https://hyperlight.org/)

Important distinction:

- Container creation is normally cheaper than booting a conventional VM.
- A prepared or snapshot-restored environment may reach application readiness faster than a cold container that must fetch images and install dependencies.
- Hyperlight advertises very fast VM creation but requires purpose-built guests and is not a normal Linux development machine.
- For long-running CPU work, environment preparation, persistence, cache reuse, isolation, and operability are more important than a small difference in launch latency.

No runtime has been selected.

## Bounded Pi session evidence

A read-only review of the existing local Pi analytics snapshot covered 2026-08-11 through 2026-08-18. The snapshot could not be refreshed in the review harness, so freshness and malformed-row status remain unknown. The review copied no raw prompts, transcripts, sensitive arguments, or private inventory.

This evidence describes current Pi workflow behavior only. It cannot validate CPU demand because the logs do not record process resource use. It cannot validate disconnect/reconnect or ephemeral-environment behavior because those platform capabilities do not exist. Those are user-stated requirements and future acceptance scenarios, not hypotheses that need prior log evidence. Concurrent work is already an explicit purpose and exercised behavior of the Pi subagent system; it does not depend on inference from this analytics snapshot.

### Current-workflow observations

- Several project sessions remained present for 13 hours to nearly three days and accumulated substantial tool activity.
- The snapshot covered several repository buckets and 120 subagent session files, although one aggregate query misclassified Windows subagent paths and must not be used for primary-versus-subagent counts.
- Fifteen reviewed churn interactions included repeated scope expansion, work continuing after a requested boundary, unsafe authority or ownership mistakes, failed or excessive delegation, repeated unchanged polling, inconclusive diagnostics, and incomplete outcomes.
- The strongest recurring theme in this bounded churn sample is loss of scope or lifecycle control, not a demonstrated single class of full-suite validation failure. The reviewed records were not coded into mutually exclusive categories, so they do not support a statistical dominant-cause claim.
- Some validation and review activity contributed to churn, including continued reviews after the user asked to finish and validation that passed without exercising the real integration boundary. The sample does not quantify how much repository-wide validation contributes across ordinary sessions.

### What the evidence can inform

- Remote work needs unambiguous ownership, progress, attempt, failure, completion, and cancellation state.
- Background completion should be delivered without repeated status polling.
- User-selected scope and stop conditions must remain visible during long-running work.
- Result and artifact handoff should not require reconstructing an entire session transcript.
- Future platform evaluation should add the resource and lifecycle measurements needed for its own acceptance criteria rather than pretending current Pi logs contain them.

## Current working product principles

These are discussion outcomes to test during `/grill-me`, not final requirements.

### Normal-computer experience

The default remote environment should support ordinary shell commands, package managers, compilers, databases, browsers, containers, and agent CLIs without requiring software to target a special guest API.

### Persistent by default, disposable when requested

Long-running work benefits from persistent repositories, dependency caches, and tools. A fresh or disposable environment should remain available for unknown repositories, risky dependencies, or clean reproducibility checks.

### Low ceremony

A normal workflow should not require the user to choose a hypervisor, configure networking, manage a queue, or understand internal lifecycle IDs.

The required lifecycle operations should be defined before choosing whether they appear through a CLI, Pi tools, SSH, a web interface, or another surface. Do not use speculative command syntax to drive the product model.

### Continue after disconnect

Remote work must not depend on the lifetime of an SSH connection, local terminal, Pi turn, or workstation process.

### Inspectable state

The user should be able to determine:

- what is running;
- where it is running;
- CPU and memory use;
- recent output;
- exit state;
- repository changes;
- exposed services;
- and how to stop or resume it.

### Flexible execution

The environment should permit direct processes and project containers. Stronger per-task isolation can be added where justified without changing the ordinary user experience.

### Boring operations

Prefer existing Proxmox, OpenTofu, Ansible, SSH, systemd, Git, and standard Linux behavior over a new distributed platform unless a concrete requirement disproves the simple path.

## Candidate Herdr-based operating slice

A separate implementation effort is building an always-running Linux LXC as the home for Herdr and Pi. The described operating model is:

- Windows runs the Herdr client and connects to the LXC over SSH.
- Herdr owns persistent terminal sessions; Pi and other coding agents run in those terminals and continue after workstation disconnection.
- Pi session content can be restored after a Herdr restart, although process-memory restoration is not implied.
- The LXC uses a non-root operator account and key-only SSH.
- Containers remain on an existing VM. The LXC uses a Docker-compatible CLI and named remote context connected over SSH to that VM's rootless Podman socket.
- A dedicated key remains in the LXC, and its public key is authorized only for a container API relay rather than an interactive shell. No Docker TCP port is exposed.
- OpenTofu, Ansible, Bitwarden Secrets Manager, and existing infrastructure ownership remain unchanged.

This could provide the first concrete continuity mechanism without requiring a generalized platform job model: Herdr owns terminals and agents, while Linux service supervision and the remote container engine own their respective workloads. It does not yet establish a unified status, cancellation, resource, or reboot-recovery contract across all three owners. Treat it as an active candidate slice whose observed behavior can inform the broader platform, not as an approved universal architecture.

A separate instance is implementing and testing this initial Herdr remote-work spike now. Its resulting implementation will land in this repository and the applicable submodules. The new Onclave-managed remote-agent system must not begin implementation before that spike is complete and tested. Its observed interfaces, disconnect behavior, restart behavior, remote-container boundary, and operational friction are prerequisites for choosing the first-system acceptance gate and refining the integration contract. Do not duplicate or preempt that work in this PRD effort.

## Onclave orchestration role

Onclave is intended to become the central orchestration system for managed remote environments, not only an agent message directory. It must discover environment adapters, route project status and lifecycle requests, and coordinate creation, inspection, and removal of managed VMs and LXCs through infrastructure subsystems.

OpenTofu remains authoritative for the infrastructure resources and state it manages. That state can establish declared and applied resource identity, placement, addressing, and outputs, but it is not authoritative for guest services, Herdr panes, Pi processes, containers, or application health. Onclave must query the owning environment or service adapters for those live facts and route lifecycle actions back to the owning subsystem rather than duplicating all runtime state centrally.

### Private infrastructure configuration service

Onclave will be the exclusive normal interface for versioned private infrastructure configuration. S3-compatible storage will hold immutable configuration bundles and manifests. Each version must identify its parent, content digest, schema, author, validation result, and activation state. Normal reads, writes, comparison, validation, activation, and rollback go through authorized and audited Onclave APIs.

Bitwarden Secrets Manager remains authoritative for actual secret values; configuration bundles contain secret references and bindings rather than broad plaintext credentials. OpenTofu state remains separate and authoritative for managed infrastructure resource state.

A generalized backup, snapshot, or migration-recovery subsystem is not part of this PRD. The initial slice provisions new resources and needs no prior backup. When an existing stateful service is later migrated, that one-time operation must verify the service's current backup or snapshot and restore path using existing mechanisms. This is a per-migration safety check, not an Onclave product capability. Control-plane bootstrap and disaster recovery are also outside the initial working-system gate.

Uploading configuration must not silently mutate infrastructure. Candidate storage, validation, planning, authorization, activation, and apply are distinct operations.

### Initial Onclave control data

SQLite is the initial structured store for Onclave control data. It may hold projects, environments, configuration-version metadata, active-version pointers, infrastructure operation records and transitions, and provider resource references. Use SQLite transactions for state changes; high availability and concurrent control-plane writers are not initial requirements.

Immutable private configuration bundles and large plan, log, and result artifacts remain in S3-compatible storage. OpenTofu resource state remains in its state backend, BWS retains secret values, and RabbitMQ provides delivery rather than authoritative operation state.

Do not add PostgreSQL, Temporal, Nomad, Consul, etcd, Redis, Kubernetes, Vault, or OpenBao merely to replace this initial boundary. If observed concurrency, availability, workflow, or query requirements later exceed SQLite, evaluate migration then without requiring a speculative migration framework in the first version.

### Infrastructure execution subsystem

From the product perspective, Onclave provisions and configures managed infrastructure. It accepts an authorized lifecycle outcome, selects an immutable private configuration version, and invokes an infrastructure execution subsystem. That subsystem materializes the selected configuration and BWS bindings, runs OpenTofu plan and authorized apply operations, runs Ansible convergence, and returns structured progress, artifacts, and outcomes. Live environment adapters then verify readiness.

Onclave owns orchestration intent, operation identity, policy transitions, progress, and outcome. It does not reimplement OpenTofu state reconciliation, Ansible convergence, or provider APIs. A later one-time migration of an existing stateful service uses that service's existing safety and rollback mechanisms; first-time provisioning has no backup prerequisite.

The source-code ownership boundary remains partly unresolved. The likely shape is that homelab-infra remains the provider- and site-specific execution subsystem managed through Onclave contracts, while Onclave owns the provider-neutral orchestration and private configuration API.

### Infrastructure coverage and sequencing

Broad homelab orchestration is part of the product scope. Onclave is intended eventually to manage existing homelab infrastructure as well as remote-agent environments.

The sequence is deliberately asymmetric: first prove the system by provisioning and operating new remote-agent infrastructure; then move existing homelab resources and workflows behind Onclave through bounded service-by-service migrations. The product is not complete at the broad orchestration level until that migration occurs, but migration is not a prerequisite for demonstrating the first usable remote-agent slice. No generalized backup system is required for that migration program.

## Candidate first vertical slice

This is a hypothesis for discussion, not an approved plan.

1. Provision one persistent Linux development VM on one Proxmox server.
2. Install a normal development baseline and one agent CLI.
3. Clone one real repository inside the VM.
4. Start a CPU-heavy or long-running task through a mechanism that survives disconnect.
5. Reconnect and inspect status and output.
6. Stop the task and verify its child processes stop.
7. Retrieve a code change or artifact.
8. Measure setup effort, ready-to-work latency, operational steps, resource use, and failure recovery.
9. Repeat on the second server only after the first path is understandable.

This slice can begin with SSH and systemd or another existing supervisor. It does not require Onclave, a custom worker daemon, dynamic VM creation, containers, or microVMs unless the chosen user workflow demonstrates the need.

## Related work kept outside this PRD

PR-first remote validation and bounded CI repair is a separate follow-up topic:

- [`.specs/pr-first-ci-repair/notes.md`](../pr-first-ci-repair/notes.md)

A future CI repair system may consume remote workspaces, but this PRD will not define PR policy, branch protection, CI repair loops, or automated merge behavior.

## Decisions from the current grill

### Functionality before interface

Define the intended workflows, lifecycle, persistence, isolation, recovery, and operating boundaries before designing CLI syntax or another user interface. Interface examples must not silently become product requirements.

### Persistent project workflow

One required workflow matches the user's current development style: a project has a persistent remote environment that retains its repository, toolchains, dependencies, caches, services, and ongoing work. Concurrent tasks may use worktrees or containers inside that environment when appropriate.

This decision applies to that workflow type only. It does not establish one persistent environment as the universal platform model.

### Continuity contract

Persistent environments preserve files and explicitly managed jobs and services. A local client disconnect does not stop remote work. After an environment reboot, files survive, selected services restart, and only jobs with an explicit durable recovery contract may resume or restart. Preserving complete machine memory is not required.

The initial operating policy is to keep persistent environments running. Automatic idle stop can be evaluated later without weakening the continuity contract.

### Required environment classes

The functional design must support:

1. Persistent project environments for recurring development with durable repository state, tools, caches, services, and ongoing work.
2. Ephemeral project environments prepared for a known project but intentionally disposable after clean, risky, parallel, or bounded work.
3. Generic blank environments for prototypes, arbitrary repositories, research, and other work that has no existing project profile.

A specialized batch-job environment is not currently a separate first-class class. Batch work may run inside one of these environments until evidence justifies another lifecycle.

### Pi session and log preservation deferred

Central preservation of full Pi sessions and logs is not an initial platform requirement. Session and log content may remain local to the originating environment. If a working platform later demonstrates a need for central retention, deliberate export, backup, or replication can be designed from observed workflows and sensitivity constraints.

The first version therefore does not require a central session catalog, automatic session archives, continuous replication, or a deletion-time retention policy. Deleting an ephemeral environment may also delete its local session history unless the user deliberately preserves it through an available general file or environment backup mechanism.

### Normal control boundary

Normal operation is divided by responsibility:

- Onclave creates, configures, discovers, inspects, retains, and deletes managed environments and coordinates infrastructure operations.
- Herdr opens and reconnects to interactive terminals and coding agents.
- Native Linux and project tools run builds, tests, services, and containers inside the environment.
- SSH is a recovery and low-level inspection path when the normal surfaces are insufficient.

Onclave does not need to replace ordinary shell and development tools, and routine environment lifecycle must not require the user to know internal hostnames, infrastructure commands, or provider topology.

### Initial cleanup policy

All environments require explicit deletion in the initial system. Persistent project, ephemeral project, and generic blank environments do not expire automatically. Ephemeral and blank describe intended use and disposability, not a time-triggered lifecycle.

Automated expiry, inactivity cleanup, retention warnings, and class-specific deletion policy are deferred until a working system provides real usage evidence. Explicit deletion may remove environment-local sessions, logs, uncommitted changes, and artifacts; the eventual control experience must make the target and consequence visible, but no automatic preservation system is required.

### Source and result handoff

Git remotes are the durable source and committed-change exchange path. Project environments authenticate with the selected work or personal repository identity and may clone, fetch, commit, and push within that identity's authority.

The platform must also support explicit retrieval of uncommitted changes, selected files, and artifact bundles from a remote environment. Retrieval must not silently overwrite unrelated local changes. Automatic bidirectional filesystem synchronization is not required. PR-first validation, branch policy, and automated merge behavior remain outside this PRD.

### Initial operating-system scope

The platform is Linux-only. Remote Windows environments, Windows-native workloads, and a future Windows-worker compatibility constraint are outside this PRD. The platform may define its environment, filesystem, shell, process, service, and container behavior using Linux semantics.

### Initial acceptance workload

The first successful platform slice must run an autonomous coding session remotely and have it perform a concrete CPU-heavy repository build, test, typecheck, or validation workload. Local disconnection must not stop the session or its explicitly managed work. After reconnecting, the user must be able to inspect current or final state, recent output, repository changes, and the validation command's exit result. Generated results must remain accessible in the environment.

The validation command supplies objective completion evidence; an agent's statement that it finished is not sufficient. Parallel per-leaf isolation and scoped credential delivery are subsequent security and concurrency acceptance stages, not prerequisites for proving this first remote-work baseline.

### Future per-leaf environment isolation scenario

A parent agent may need to assign different leaves to different repositories or bounded filesystem roots rather than forcing every leaf to use the parent's workspace. Each leaf should have one visible assigned boundary, with paths interpreted relative to it and no ability for the leaf to expand that boundary itself.

Tool-level path checks can prevent common accidental escapes and runaway recursive searches, but they do not securely contain arbitrary programs launched through a shell. Strong containment would require an operating-system isolation boundary such as a container, restricted mount namespace, or microVM. This is a future isolation and concurrent-workload scenario, not a decision that the initial platform must use microVMs or implement a Pi `workspaceRoot` override.

### Trust defaults by environment class

Trust follows the environment class:

- A persistent project environment is trusted for that project and may receive its project-specific credentials and durable state.
- An ephemeral project environment is bounded to that project and receives only explicitly assigned credentials and resources.
- A generic blank environment is untrusted and disposable by default and receives no credentials unless deliberately granted.

### Reduced ambient authority

Remote and disposable environments should reduce the command-policy surface by excluding workstation state that a workload does not need. Personal SSH keys, unrelated repositories, broad home-directory dotfiles, credential files, browser state, and local service sockets should not automatically enter an agent environment. Required secrets or identities should be supplied deliberately and with authority bounded to the workload where the external system supports it.

Repository access is an explicit project-scoped capability. Personal projects and work projects use separate repository identities; neither identity may fall back to the other. Persistent and ephemeral project environments may receive only the identity selected for that project, while generic blank environments receive no repository identity until one is deliberately assigned.

The platform must support SSH-based repository access, but this does not require copying the workstation's private-key files into an environment. Dedicated keys, short-lived certificates, signing or SSH-agent proxies, and forge integrations remain possible mechanisms. The functional requirement is that the environment can authenticate only as the selected personal or work repository identity and access only the intended repositories to the extent supported by the forge.

Filesystem isolation does not make remote commands safe. An AWS, database, source-control, Proxmox, or other remote command can still cause damage if the environment receives a credential with broad authority. Damage control must therefore continue to govern consequential remote operations; environment isolation and scoped credential delivery reduce ambient access but do not replace command-level policy for external systems.

The functional goal is a smaller and clearer authority boundary for each workload. No credential broker, injection mechanism, runtime, or policy engine has yet been selected.

### Secret delivery research as of 2026-08-21

Secret storage, workload identity, and credential brokering solve different problems:

- Tailscale setec is a lightweight secret store whose callers are authorized through tailnet identities and grants. It avoids distributing a separate vault credential, but an authorized workload receives the plaintext secret and can disclose or misuse it.
- HashiCorp Vault and OpenBao support workload auto-authentication, leased or dynamic credentials, renewal, revocation, templates, local agents, and process injection. They provide the broadest self-hosted authority machinery here, with materially higher operational cost than setec or the existing Bitwarden Secrets Manager.
- Infisical provides machine identities, an agent, templates, token renewal, and dynamic-secret leases. It is a more developer-oriented platform but remains another service and identity system to operate.
- Bitwarden Secrets Manager and 1Password service accounts provide project or vault-scoped machine access to stored secrets. They are suitable for deliberate retrieval but generally expose retrieved plaintext to the workload and rely on a bootstrap access token.
- SOPS is useful for encrypted configuration in Git but is not a runtime workload identity or credential broker. External Secrets Operator is Kubernetes-specific synchronization rather than a source of authority.
- SPIFFE/SPIRE and Teleport Machine ID issue workload identities and short-lived credentials, but introduce an identity control plane that may be disproportionate for two personal Proxmox servers unless several services need the same trust fabric.
- Provider-native federation or dynamic credentials, such as AWS IAM Roles Anywhere, can avoid long-lived cloud keys and enforce provider-side session policy. Equivalent provider-specific mechanisms are preferable when available because expiration and authorization are enforced by the target system.
- An outbound credential proxy can keep a backing API token out of the guest and inject it only into approved requests. This is the strongest pattern for agents using bearer-token APIs that cannot issue scoped temporary credentials, but it requires protocol-aware policy and cannot safely infer the intent of arbitrary encrypted traffic.

Amp Orbs and exe.dev demonstrate two current product approaches:

- Amp supports workspace, project, and personal secrets and environment variables that are loaded into orb processes. These values are therefore available inside the orb. Amp also lets each orb mint a short-lived OIDC token containing workspace, project, user, and thread identity for federation with AWS, GCP, Tailscale, internal services, SOPS/KMS, or a separately operated credential proxy. OIDC is the stronger path; conventional project secrets remain a plaintext-in-workload path.
- exe.dev integrations store backing secrets server-side and expose per-integration hostnames to attached VMs. Its edge proxies inject credentials into outbound HTTP requests, its GitHub App integration supports per-repository and read-only access without a token on the VM, its AWS and GCP integrations use OIDC federation, and its token-mint integrations expose short-lived vendor tokens while withholding durable credentials. Attachments can be scoped to a VM, VM tag, or all VMs. The backing secret stays off-VM, although the integration may still permit every operation allowed by the upstream credential unless the integration or upstream service narrows methods, paths, resources, or scopes.

GitHub repository activity and stars were checked only as rough adoption signals, not security validation. Vault, Infisical, SOPS, OpenBao, External Secrets Operator, SPIRE, and setec were active on 2026-08-21. The relevant design conclusion is to prefer target-issued temporary authority, then brokered requests, then narrowly scoped injected secrets; broad static credentials should not be copied into agent environments.

## Decisions intentionally left open

- Named machine, project workspace, thread, or job as the primary object.
- One persistent VM per server, one VM per project, or dynamically created VMs.
- Direct SSH control versus a small API or CLI service.
- Whether Onclave participates in control, notification, or neither.
- Linux-only first version versus Windows worker support.
- Direct process, container, LXC, KVM, or microVM execution profiles.
- How repositories enter and leave the environment.
- Whether checkpoints are required beyond normal backups and Git.
- Whether service URLs need automatic TLS and wake-on-request.
- Whether idle workspaces shut down automatically.
- Whether project setup follows `.agents/setup`, devcontainer metadata, a repository script, an image, or several supported options.
- How secrets are provided to work without placing broad credentials in images or snapshots.
- Whether a web UI provides enough value beyond CLI, SSH, and existing Proxmox visibility.

## `/grill-me` question set

### User experience

- What should one command accomplish from a clean workstation?
- Is the primary object a machine, project, agent thread, or job?
- Which operations must work from Pi, and which can remain ordinary CLI or SSH operations?
- Is interactive shell access central, or mainly a recovery and inspection path?
- What should happen when the local workstation sleeps or loses network access?
- What is the acceptable amount of repository setup per project?

### Persistence

- Which state must survive stop, reboot, host maintenance, and deletion?
- Are filesystem checkpoints needed, or are Git plus ordinary VM backups sufficient?
- Should background processes survive a workspace pause, or only files?
- How long should inactive workspaces remain?

### Execution

- What are the first three real CPU-heavy workloads?
- How many simultaneous workloads are expected?
- Must one job saturate the server, or should capacity be shared?
- Is GPU access relevant?
- Are Windows-native workloads required in the first version?

### Isolation and trust

- Are repositories trusted, unknown, or actively hostile?
- May jobs receive source-control or model-provider credentials?
- Is isolation between two jobs important for a single user?
- Which tasks justify a disposable VM or microVM instead of a persistent workspace?
- Is outbound network control a real requirement or a future hardening option?

### Operations

- Is manually creating a project VM acceptable, or must creation be automatic?
- What failure should be recoverable without opening Proxmox?
- What is the minimum acceptable status and log interface?
- Is patching one or two persistent worker VMs simpler than maintaining prepared environment images?
- Which operations are frequent enough to deserve automation?

### Integration

- What concrete benefit would Onclave provide over SSH plus a process supervisor?
- Should remote work be represented inside Pi, or should Pi invoke an independent CLI?
- Is Forgejo the preferred source/result handoff, or is direct synchronization needed?
- Are artifact uploads common enough to justify object-storage integration?
- Which Orb-like feature would be painful to add later if omitted initially?

### Scope control

- What does an exe.dev-like MVP include?
- Which Amp Orb features are valuable enough to include in that MVP?
- Which features should be explicitly excluded until repeated use demonstrates demand?
- What measurements decide whether the first slice should expand or be discarded?

## PRD preparation checklist

Before drafting the PRD, settle or bound:

1. Primary user workflow and user-facing object.
2. First real workload and completion evidence.
3. Persistence expectation.
4. Trust and isolation level.
5. Linux and Windows scope.
6. Minimum remote-control surface.
7. Repository and artifact flow.
8. Idle and cleanup behavior.
9. Role, if any, for Onclave.
10. Explicit non-goals.
11. Operational budget: services, images, databases, and moving pieces the user is willing to maintain.
12. Experiment exit criteria.

## Reference classification

### Current implementation authority

- [`modules/homelab-infra/AGENTS.md`](../../modules/homelab-infra/AGENTS.md)
- [`modules/homelab-infra/README.md`](../../modules/homelab-infra/README.md)
- [`modules/homelab-infra/infra/opentofu/onramp-host.tf`](../../modules/homelab-infra/infra/opentofu/onramp-host.tf)
- [`modules/onclave/README.md`](../../modules/onclave/README.md)
- [`modules/onclave/packages/envelope/src/protocol.ts`](../../modules/onclave/packages/envelope/src/protocol.ts)

### Current scoped contract

- [`modules/homelab-infra/.specs/onclave-https-agent-transport/plan.md`](../../modules/homelab-infra/.specs/onclave-https-agent-transport/plan.md) applies only if the remote platform uses Onclave's external agent transport.

### Exploratory context, not authority

- [`modules/homelab-infra/docs/agent-platform-design-handoff.md`](../../modules/homelab-infra/docs/agent-platform-design-handoff.md)
- [`docs/research/obsidian-vault/agent-workflows/patterns/sandboxed-agent-runtimes.md`](../../docs/research/obsidian-vault/agent-workflows/patterns/sandboxed-agent-runtimes.md)
- [`docs/research/obsidian-vault/agent-workflows/projects/daytona.md`](../../docs/research/obsidian-vault/agent-workflows/projects/daytona.md)
- [`docs/research/obsidian-vault/agent-workflows/workflow-ideas/multipass-yolo-sandboxes.md`](../../docs/research/obsidian-vault/agent-workflows/workflow-ideas/multipass-yolo-sandboxes.md)
- [`docs/research/obsidian-vault/agent-workflows/workflow-ideas/pipelines-and-policies.md`](../../docs/research/obsidian-vault/agent-workflows/workflow-ideas/pipelines-and-policies.md)

### Historical or superseded context

- [`.specs/archive/secure-lan-pi-coms/technology-stack-architecture-PRD.md`](../archive/secure-lan-pi-coms/technology-stack-architecture-PRD.md) describes an older hub, Tailscale, LXC, and workspace-provisioner direction. It is not a current design constraint.
