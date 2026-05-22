# VDI / Remote Development Notes

Date: 2026-05-22

## Context

The EISA repo is a Docker-first .NET 8 + Angular/Bun multi-service application. Local development currently relies on:

- `make` as the primary developer command surface
- Docker Compose for local runtime
- VS Code attach debugging into containers
- Angular dev server in Docker
- MySQL, Keycloak, Splunk, smtp4dev, Caddy proxy, and multiple .NET services

Primary local commands:

```bash
make up
make start
make logs
make browser
make down
make test
make lint
make test-e2e-file FILE=faq.spec.ts
```

The local stack can put significant load on developer machines, so we discussed ways to keep development productive while moving build/runtime work onto stronger remote infrastructure, especially Proxmox-hosted VMs.

---

## Current EISA Local Development Model

The happy path today is:

1. Windows developer runs `setup-windows.ps1`.
2. Developer uses `make start` / `make logs`.
3. App is accessed at `https://localhost:42500`.
4. C# debugging attaches from VS Code to running containers.
5. Angular hot reload runs through the `eisa-ng-devserver` container.
6. Docker Compose hosts the full environment.
7. Make is the public UX wrapper around Docker Compose, test, lint, auth, and Playwright workflows.

Key services include:

- `eisa.mvcweb`
- `eisa.advisory.api`
- `eisa.cert.mvcweb`
- `eisa.reporting.api`
- `eisa.helpsupport.api`
- `eisa.hostedserviceworker`
- `eisa-ng-devserver`
- `keycloak`
- MySQL databases
- Splunk
- smtp4dev
- Caddy reverse proxy

---

## Remote Development Patterns Discussed

### 1. Remote Docker Host, Local Files

Use Docker contexts or `DOCKER_HOST=ssh://...` to run Docker remotely while editing locally.

Example:

```bash
docker context create eisa-dev --docker "host=ssh://dev-vm"
docker context use eisa-dev
make start
```

Problem: Docker bind mounts refer to paths on the remote Docker host, not the local laptop. This repo uses bind mounts such as `./eisa-ng:/app`, so remote Docker alone is not enough unless paired with file sync.

Possible sync tools:

- Mutagen
- rsync loop
- Syncthing
- Git push/pull workflow

Assessment: possible, but fragile. File sync edge cases can become painful.

### 2. Remote Dev VM as the Workspace

Each developer gets a Proxmox VM where the repo actually lives. Developers connect using VS Code Remote SSH, JetBrains Gateway, RDP, SPICE, or another remote desktop tool.

Architecture:

```text
Developer laptop:
  editor/browser/thin client

Remote VM:
  repo checkout
  Docker Engine
  .NET SDK
  Bun
  Make
  all containers
```

Assessment: best MVP if the team can accept files living on the remote VM.

### 3. Cloud/Managed Dev Environment Platform

Tools like Coder, DevPod, Gitpod, GitHub Codespaces, and Google Cloud Workstations can provide standardized workspaces.

General finding:

- Great for VS Code, JetBrains, browser IDEs, Linux/container workspaces
- Less ideal for full Visual Studio or Eclipse-based desktop IDEs unless using remote desktop

### 4. Remote Kubernetes / Dev Namespace

Use Tilt, Skaffold, Garden, DevSpace, Okteto-style workflows, etc.

Assessment: powerful but likely not an MVP for this repo unless the team is already Kubernetes-native.

### 5. Remote BuildKit / Build Farm Only

Offloads image builds but not runtime.

Assessment: helpful later, but insufficient because this repo's load comes from both build and runtime services.

---

## Coder Research Summary

Links:

- [Coder workspace access docs](https://coder.com/docs/user-guides/workspace-access)
- [Coder remote desktops docs](https://coder.com/docs/user-guides/workspace-access/remote-desktops)
- [Coder Desktop docs](https://coder.com/docs/user-guides/desktop)
- [Coder Windows + Visual Studio blog](https://coder.com/blog/microsoft-windows-visual-studio-in-coder)
- [Run any application or IDE in Coder](https://coder.com/blog/run-any-application-or-ide-in-coder)
- [Coder JetBrains docs](https://coder.com/docs/user-guides/workspace-access/jetbrains)

### Visual Studio

Coder can support full Visual Studio, but not like VS Code Remote SSH. The pattern is:

```text
Coder provisions Windows VM
→ installs Coder agent
→ installs Visual Studio
→ developer connects by RDP
→ Visual Studio runs inside the Windows VM
```

Coder's own Visual Studio guidance notes that Visual Studio requires Windows and therefore needs a Windows remote environment plus a visual connection such as RDP.

### WSO2 Integration Studio / Eclipse

WSO2 Integration Studio is Eclipse-based.

Links:

- [WSO2 Integration Studio docs](https://mi.docs.wso2.com/en/latest/develop/wso2-integration-studio/)

Coder can run arbitrary GUI IDEs through:

- Linux workspace + VNC/XFCE
- Windows workspace + RDP

This is possible, but not a first-class native remote IDE integration.

### Coder Takeaway

Coder is strongest for:

- VS Code
- code-server
- JetBrains Gateway
- Cursor/Windsurf/Antigravity-style VS Code derivatives
- SSH/web terminal
- web apps
- remote desktop as a configurable access method

For full Visual Studio and WSO2 Integration Studio, Coder works mostly as a workspace/orchestration layer plus RDP/VNC.

---

## Cloud Tooling for Visual Studio and WSO2

Links:

- [Microsoft Dev Box overview](https://learn.microsoft.com/en-us/azure/dev-box/overview-what-is-microsoft-dev-box)
- [Microsoft Dev Box product page](https://azure.microsoft.com/en-us/products/dev-box/)
- [Google Cloud Workstations](https://cloud.google.com/workstations)

### Microsoft Dev Box / Windows 365

Microsoft Dev Box docs currently state that Dev Box is in maintenance mode and Microsoft's forward investment for developer cloud environments is focused on Windows 365.

Windows 365 Cloud PC is likely the cleanest managed option for:

```text
Full Visual Studio
+ WSO2 Integration Studio
+ arbitrary Windows GUI tools
+ Remote Desktop/browser access
```

Pros:

- Full Windows desktop
- Visual Studio works normally
- WSO2 should work normally as a Windows desktop app
- Managed with Microsoft/Intune/Entra tooling

Cons:

- Licensing/cost
- Docker Desktop/WSL2/nested virtualization must be validated
- Less dev-environment-as-code than Coder/Gitpod-style systems

### Azure Virtual Desktop

More flexible than Windows 365, but more platform work. Good if the org already has AVD expertise.

### Amazon WorkSpaces / AppStream

Can stream Windows desktops or apps, but is not dev-specific. Visual Studio and WSO2 are possible, but image management, licensing, and Docker/WSL2 validation remain.

### GitHub Codespaces / Gitpod / Google Cloud Workstations

Great for containerized Linux/VS Code/JetBrains workflows. Not a good fit for full Visual Studio or desktop WSO2 Integration Studio.

---

## Low/No-License Self-Hosted Citrix-Like Options

### Apache Guacamole

Link:

- [Apache Guacamole](https://guacamole.apache.org/)

Browser-based gateway for RDP, VNC, SSH.

Pros:

- Open source
- Browser access
- Works with Proxmox VMs
- Can front Windows Visual Studio VMs and Linux WSO2 desktops

Cons:

- Access gateway, not full VDI
- Weak/limited true multi-monitor support
- VM lifecycle/provisioning still handled elsewhere

### Kasm Workspaces

Links:

- [Kasm Workspaces](https://kasm.com/)
- [Kasm Community Edition](https://kasm.com/community-edition)
- [Kasm Windows overview](https://docs.kasm.com/docs/latest/guide/windows/overview/index.html)

Kasm is strongest as a browser-delivered Linux workspace/app streaming platform. It can also front Windows environments through RDP, Microsoft RDS, Azure Virtual Desktop, or Windows 365.

Best fit here:

- WSO2 Integration Studio on Linux desktop/container
- Browser-delivered Linux dev tools
- Possibly portal/access layer to Windows RDP desktops

Visual Studio fit: possible through Windows RDP, but Kasm is not the primary Windows VM manager.

### IsardVDI

Links:

- [IsardVDI](https://www.isardvdi.com/en/)
- [IsardVDI project site](https://isard-vdi.github.io/)
- [IsardVDI docs](https://isard.gitlab.io/isardvdi-docs/)

IsardVDI is closer to a true open-source VDI platform. It directly manages KVM/libvirt hypervisors and supports Linux and Windows desktops, templates, quotas, pools, groups, and multiple viewers.

Best fit here:

- Real self-hosted VDI lifecycle
- Windows Visual Studio VM templates
- Linux or Windows WSO2 templates

Concern: it manages KVM/libvirt directly, so integration with existing Proxmox management needs validation.

### Ravada VDI

Links:

- [Ravada VDI](https://ravada.upc.edu/)
- [Ravada docs](https://ravada.readthedocs.io/)
- [Ravada GitHub Pages](https://teclib.github.io/ravada/)

Ravada is a free/open-source VDI broker for KVM-oriented environments. It is aimed at Linux sysadmins and supports SQL/LDAP auth.

Best fit here:

- Simpler FOSS VDI broker
- KVM desktop provisioning
- Windows/Linux guest desktops with SPICE-style access

Concern: less polished than Kasm, less full-featured than IsardVDI.

---

## Kasm vs IsardVDI vs Ravada Summary

| Option | Role | Best Fit | Visual Studio | WSO2/Eclipse | Notes |
|---|---|---|---|---|---|
| Kasm Workspaces | Browser workspace/app streaming | Linux desktops/apps, browser UX | Medium via RDP | Good | Most polished browser UX |
| IsardVDI | True open-source VDI | Windows/Linux VM lifecycle | Good | Good | Most Citrix/Horizon-like FOSS option |
| Ravada VDI | Lightweight VDI broker | KVM desktop brokering | Good | Good | Simpler, more sysadmin-oriented |

Ranking by priority:

```text
User-friendly browser UX:
1. Kasm
2. IsardVDI
3. Ravada

True VDI lifecycle:
1. IsardVDI
2. Ravada
3. Kasm

WSO2 on Linux:
1. Kasm
2. IsardVDI
3. Ravada

Full Visual Studio:
1. IsardVDI
2. Ravada
3. Kasm as access portal only
```

Important caveat: for Visual Studio, plain Proxmox Windows VM + native RDP may beat all three in simplicity and user experience.

---

## Multi-Monitor Support

Multi-monitor support differs sharply between browser canvas access and native remote clients.

### Browser Canvas Model

Examples:

- Guacamole
- Kasm browser desktop
- noVNC
- HTML5 viewers

Usually gives one large browser canvas. The remote OS may not see separate monitors.

Good for:

- light admin
- terminal/browser
- occasional access

Weak for:

- full-day Visual Studio
- Eclipse/WSO2
- serious debugging
- window snapping per monitor

### True Multi-Monitor Remote Session

Examples:

- native Microsoft RDP client
- SPICE with native remote-viewer/virt-viewer
- enterprise VDI protocols

Remote OS sees multiple displays. This is what developers expect.

### Product Summary

| Solution | Multi-Monitor Quality | Notes |
|---|---|---|
| Native RDP | Best | Strongest Windows Visual Studio experience |
| Guacamole | Weak/limited | Browser canvas |
| Kasm | Limited/okay | Browser workspace; Windows depends on underlying RDP mode |
| IsardVDI | Potentially good | Better with native SPICE/client than browser viewer |
| Ravada | Potentially good | Better with native SPICE/client than browser viewer |
| Windows 365 / AVD / Citrix / Horizon | Best enterprise | Purpose-built |

Recommendation: use browser access as a fallback/convenience path, but native RDP/SPICE clients for full-day developer use.

---

## Moonlight / Sunshine

Links:

- [Sunshine](https://github.com/LizardByte/Sunshine)
- [Moonlight](https://moonlight-stream.org/)

Moonlight/Sunshine could help with remote desktop responsiveness, especially for GUI-heavy development.

Architecture:

```text
Sunshine = host/server on remote dev VM
Moonlight = client on developer laptop
```

Strong fit:

- Visual Studio GUI in Windows VM
- WSO2/Eclipse GUI
- smoother scrolling/window movement
- lower latency than browser VNC/noVNC/Guacamole
- GPU-accelerated desktop streaming if GPU/iGPU/vGPU is available

Does not solve:

- VM provisioning
- identity/access governance
- audit/compliance
- image management
- Docker orchestration
- licensing

Security caveat: do not expose directly to the internet. Use VPN, WireGuard, Tailscale/Headscale, private LAN, or similar.

Good possible stack:

```text
Proxmox
+ per-dev Windows/Linux VM templates
+ Sunshine in VM
+ Moonlight on laptop
+ Guacamole/Kasm as fallback/admin browser access
+ VPN/WireGuard/Tailscale/Headscale
```

Takeaway: promising as a premium remote display path, not a management platform.

---

## cv4pve-vdi

Links:

- [cv4pve-vdi GitHub](https://github.com/Corsinvest/cv4pve-vdi)
- [Guest setup docs](https://github.com/Corsinvest/cv4pve-vdi/blob/master/docs/GUEST-SETUP.md)
- [Launchers docs](https://github.com/Corsinvest/cv4pve-vdi/blob/master/docs/LAUNCHERS.md)
- [Services docs](https://github.com/Corsinvest/cv4pve-vdi/blob/master/docs/SERVICES.md)

`cv4pve-vdi` is a desktop VDI client/launcher for Proxmox VE. It lets users browse/filter/connect to VMs and containers through:

- SPICE via `remote-viewer`
- VNC via internal WebSocket bridge
- custom service launchers
- RDP
- SSH
- PuTTY
- arbitrary tools

It also supports:

- card/list views
- VM start/shutdown
- real-time CPU/RAM stats
- Proxmox tags
- multi-host/multi-cluster
- kiosk mode
- QEMU guest agent integration
- service discovery
- RDP SSO using Windows Credential Manager

### Why It Matters

This may be an excellent lightweight MVP because it keeps Proxmox as the platform and avoids introducing a full VDI broker.

Possible flow:

```text
Developer opens cv4pve-vdi
→ sees only assigned VM(s), based on Proxmox permissions
→ clicks RDP/SPICE/SSH
→ native client launches
→ developer works in Visual Studio or WSO2
```

### Visual Studio Fit

Good if using Windows VMs and native RDP:

```text
Proxmox Windows VM
+ Visual Studio
+ cv4pve-vdi RDP launcher
+ mstsc multi-monitor support
```

### WSO2 Fit

Good with either:

```text
Linux VM + SPICE + remote-viewer + WSO2
```

or:

```text
Windows VM + RDP + WSO2
```

### Limitations

`cv4pve-vdi` does not provide:

- VM provisioning workflows
- golden image management
- auto-cloning per user
- lifecycle policies
- quota planning beyond Proxmox permissions
- browser-only access
- autoscaling
- pooled/nonpersistent desktops

Those would still be handled by Proxmox templates, scripts, OpenTofu/Terraform, Ansible, naming/tagging conventions, and administrative process.

### Takeaway

This may be worth testing before Kasm/Isard/Ravada because it is simple and Proxmox-native.

---

## Recommended MVP Paths

### MVP 1: Plain Proxmox + Native Clients

```text
Proxmox VM template per role
+ one VM per developer
+ native RDP for Windows Visual Studio users
+ native SPICE/RDP for Linux WSO2 users
+ Docker runtime on VM or nearby Linux host
```

Add Guacamole only for fallback/browser access.

### MVP 2: Proxmox + cv4pve-vdi

```text
Proxmox remains source of truth
+ pools/permissions/tags
+ cv4pve-vdi as user launcher
+ RDP/SPICE/SSH custom launchers
```

This provides a user-friendly entrypoint without replacing Proxmox.

### MVP 3: Kasm for WSO2/Linux Desktops

```text
Kasm Linux desktop image
+ WSO2 Integration Studio
+ browser access
```

Good if WSO2-on-Linux in a browser is acceptable.

### MVP 4: IsardVDI/Ravada for Full VDI Lifecycle

Only if manual Proxmox VM management becomes painful.

```text
VDI broker
+ templates
+ user self-service
+ quotas
+ VM lifecycle
```

Need to validate coexistence with Proxmox.

---

## Suggested Proofs of Concept

### POC A: Visual Studio Remote Desktop Baseline

```text
Proxmox Windows VM
+ Visual Studio
+ repo checkout
+ Docker Desktop/WSL2 or remote Linux Docker host
+ native RDP multi-monitor
```

Evaluate:

- Visual Studio performance
- multi-monitor usability
- debugging containers
- Docker/WSL2 feasibility under Proxmox
- licensing implications

### POC B: WSO2 Linux Desktop

```text
Linux VM or Kasm desktop
+ WSO2 Integration Studio
+ SPICE/RDP/browser access
```

Evaluate:

- WSO2 UI responsiveness
- build/deploy behavior
- source control workflow
- clipboard/file transfer
- multi-monitor acceptability

### POC C: cv4pve-vdi Launcher

```text
Proxmox users/pools/permissions
+ cv4pve-vdi on developer laptop
+ RDP/SPICE/SSH services
```

Evaluate:

- ease of login
- whether users only see their VMs
- RDP SSO
- service discovery
- power controls
- kiosk mode
- support burden

### POC D: Moonlight/Sunshine Display Path

```text
Proxmox VM
+ Sunshine
+ Moonlight client
+ VPN/private network
```

Evaluate:

- latency
- typing/mouse feel
- resolution/multi-monitor setup
- security posture
- reconnect/reboot behavior

---

## Current Best Guess

For this team and Proxmox environment, the lowest-risk path is likely:

```text
Proxmox per-dev VMs
+ native RDP/SPICE for serious development
+ cv4pve-vdi as the friendly launcher
+ Guacamole/Kasm as browser fallback if needed
+ optional Moonlight/Sunshine for premium low-latency display
```

Avoid starting with a full VDI broker unless VM lifecycle/self-service becomes the main pain.

For full Visual Studio specifically, native RDP into a Windows VM is still likely the simplest and best multi-monitor experience.

For WSO2 Integration Studio, test both Linux+SPICE/Kasm and Windows+RDP before deciding.
