# Changelog

## 2026-11-09: Avoid shared FETCH_HEAD races during Pi publication

- Replace the combined pull in `/commit push` with an explicit branch fetch and merge of the resolved commit ID. Background Git fetches, including T3 status refreshes, can overwrite the shared `FETCH_HEAD` file; publication no longer reads or writes that file.
- Preserve fast-forward or merge integration without rebasing, child-before-parent publication, first publication to an empty remote branch, normal hooks, conflict resolution, and existing failure/cancellation handling. Fetch and merge failures identify the failing phase and still block pushes.
- Add a real-Git regression that overwrites `FETCH_HEAD` between publication fetch and merge, and keep transport-repair and timeout coverage aligned with the separate operations. Existing Pi runtimes need a resource reload or restart to load the command change.

## 2026-11-09: Adapt default Pi presentation to T3 Code

- Introduce a small shared presentation boundary for plain notices, statuses and native-renderer/widget capabilities. Resolve the immediate Pi client separately from an enclosing Herdr terminal; RPC alone does not identify T3, and inherited T3 markers do not make native children T3-owned. Reuse the boundary for TPS output without changing timing calculations or terminal styling.
- Make profile command acknowledgments, `/commit` results, `/effort` results, and prompt-template invocation/time summaries visible through RPC-safe notices. Preserve existing session entries, model messages, prompt expansion, cancellation and turn-triggering behavior; do not expose expanded template prompts in notices or start recovery turns for command failures.
- Publish Pi version and reload-needed/check-failed state through plain status text outside the terminal, clearing it at shutdown. Keep the terminal footer intact and avoid its release polling and host probes when that footer is not rendered. Fall back to the full `/context` report for unsupported T3 widgets without claiming a widget was shown or hidden.
- Explain that `/plans` and `/update` do not support T3-managed workflows instead of suggesting a terminal relaunch as a T3 repair. No session-launch, branch, plan-execution or provider-restart integration is added. Do not synthesize native subagent cards: T3 currently treats the launch tool's return as child completion, which would misrepresent background children; accurate cards need a separate T3-side lifecycle change.
- Pass 159 focused tests across the affected paths and the default-profile typecheck. This is source/unit validation, not live T3 visual acceptance. Reload Pi resources or restart its runtime when idle to load the changes; no running conversation or desktop app was restarted.

## 2026-11-09: Keep Pi timing notices readable in T3 Code

- Send TPS completion timing and completion timestamps to T3 Code as plain text, avoiding terminal color escapes in its system notices. Preserve the visible notice, existing terminal styling, and timing calculations.
- Add the narrow output adapter and shared T3 integration-signal resolution without treating RPC mode alone as T3 or changing existing Herdr host distinctions. Keep one default Pi profile; other extensions are unchanged.
- Pass focused host/output tests and profile typecheck. Existing Pi processes need a resource reload or restart to load the change; no live T3 visual check or restart was performed.

## 2026-11-08: Sync portable T3 Code preferences through setup

- Track the work machine's selected T3 model defaults/favorites/visibility, interface and browser-preview preferences, speech/snapshot settings, thread-title and Git preferences, and portable keybindings. Make the existing cross-platform setup helper apply this baseline during installation or a manual rerun, without linking mutable T3 state.
- Treat tracked preference keys as authoritative and merge keybindings by key/context while preserving unrelated local settings and bindings. Keep credentials, provider launch configuration, machine/workspace/device identifiers, connections, databases, sessions and browser-local theme selection out of the snapshot. Preserve the existing locally resolved default Pi integration and running conversations.
- Extend the focused setup tests for preference application, local-state preservation, binding precedence, idempotence and malformed client files. Applying saved JSON does not prove loaded UI behavior; restart T3 when idle to load client preferences, then refresh Pi and use a new thread. Setup does not restart or reload anything itself.

## 2026-11-07: Fix Dolos archive integrity and sync-direction handling

- Distinguish plaintext-only, artifact-only and combined changes. The optional pre-commit hook only auto-packs known plaintext-only changes and rechecks under the exclusive lock. Allow Git's normal full-index lockfile for `git commit -a` and `git commit -i PATH`, while continuing to refuse automatic packing from other alternate indexes such as `--only`. Explicit manual packing remains a deliberate source-of-truth choice; the hook is not enabled automatically.
- Recommend unpacking without `--force` when the local plaintext directory is missing and an encrypted artifact exists, rather than suggesting a pack that cannot read its source. Preserve the existing sync-state classification and exit codes.
- Read staged paths losslessly so Unicode and special-character names cannot bypass plaintext protection. Protect the existing `private.bak` path from staging, resolve Git state from nested directories correctly, and keep worktree locks/indexes independent.
- Validate pack candidates against the same path, manifest and resource rules used for restoration. Preserve valid double-dot filenames, reject unsafe or reserved names and symlinks/junctions, detect source changes during packing, and propagate stream-finalization failures. Optional decryption verification runs before artifact promotion, and the index describes the bytes actually archived.
- Refuse unpack over changed plaintext or plaintext without a trusted index unless explicitly requested with `--force`. Keep scratch-first restoration and preserve an existing backup rather than silently deleting it. No real private vault was repacked or restored as part of this change.
- Update age to 1.3.2, edwards25519 to 1.2.0, x/crypto to 0.58.0 and x/sys to 0.49.0, including the SSH key-parsing vulnerability fix. Raise the build/bootstrap minimum to Go 1.26, use the Go 1.27.3 Docker builder, and make documented build target/help arguments work without changing the supported platform matrix.

## 2026-11-07: Preserve Git failure details in Dolos

- Report the failing Git command, underlying execution error and Git stderr when Dolos cannot discover its repository or state directory. Missing or unresolvable Git executables, including malformed `PATH` failures, no longer appear as a generic `not a git repository` error; genuine non-repository failures retain Git's explanation.
- Preserve existing exit codes and archive behavior.

## 2026-11-07: Install T3 Code desktop nightlies on Windows

- Replace the core WinGet stable package with the latest published nightly desktop installer from `pingdotgg/t3code` GitHub releases. Select the Windows x64 or ARM64 asset, check its SHA-256 when provided by GitHub, and run the silent installer through existing install-result reporting.
- Keep the separate stable CLI installer, default Pi provider setup, `-SkipPackages` behavior and other platforms unchanged. Do not automatically uninstall existing stable desktop installations.

## 2026-11-07: Batch PowerShell module availability checks

- Discover the remaining profile modules with one `Get-Module -ListAvailable` call instead of separate calls for each module. Preserve per-module availability flags, missing-module installation prompts and existing loading behavior.

## 2026-11-07: Remove unused PowerShell modules to reduce startup work

- Stop checking, auto-installing and loading Terminal-Icons, DockerCompletion and PSFzf in the PowerShell profile, and remove them from the Windows installer's user-module list. Remove Docker module completion registration and PSFzf's fuzzy-search bindings/helpers; preserve PSReadLine, CompletionPredictor, deferred Git completions and the existing colored `l`/`ll` directory listing. Existing installed module copies and the standalone `fzf` command are left on disk.

## 2026-11-07: Install the latest Herdr Desktop release on Windows

- Add Herdr Desktop to the normal Windows package-tooling path using its official release-server installer, separate from the existing Herdr TUI GitHub release channel. Upstream selects the latest Windows x64 asset from `app/latest.json`, verifies its SHA-256 checksum, adds the per-user PATH and Start menu entry, and installs herdr-core if missing.
- Preserve existing TUI installation, desktop configuration and running sessions. Rerunning setup updates the desktop binary without forcing a running app to restart; reopen it to load the update. `-SkipPackages` skips desktop installation, and other platforms' installation behavior is unchanged.

## 2026-11-07: Keep commit discovery within declared submodule boundaries

- Replace `/commit`'s global recursive Git submodule traversal with a repository-by-repository walk of top-level `.gitmodules` declarations that match indexed gitlinks and initialized checkouts. Vendored reference snapshots can contain orphan gitlinks without declaring them as managed submodules; T3's Alchemy reference triggered the previous missing-URL failure before commit review.
- Preserve legitimate nested modules, child-before-parent commit/pin ordering, normal staging and publication behavior, existing changes, and the vendored files themselves. Do not add submodule URLs, initialize references, delete data, or suppress errors from malformed managed configuration.
- Reproduce the original failure in a real temporary Git fixture, pass the focused regression and existing nested-ordering/basic commit checks plus reviewer tests and profile typecheck, and verify read-only discovery of the actual checkout. Existing Pi processes still need a resource reload or restart to use the changed command code.

## 2026-11-07: Add T3 desktop validation helpers and a Pi reload command

- Add Windows helpers for exact tool-linked thread navigation and visible-window PNG capture, using T3's registered protocol handler without typing into the composer. Remove inherited Electron Node mode only from the navigation child; preserve the running app, user drafts and unrelated sessions. Keep ambiguous/minimized/off-desktop targets and screen occlusion explicit rather than claiming hidden-window capture or automatic view restoration.
- Add default-profile `/reload-runtime` through Pi's command-context API, with metadata-only lifecycle/generation markers and a plain completion notice. Verify an isolated T3 thread loads an edit after a same-PID/same-session reload, responds to a subsequent model probe, and can be navigated to, captured and visually inspected. Focused tests and profile typecheck pass; old processes still need one fresh Pi runtime to acquire the command.
- Record a remaining installed-runtime caveat: after the successful reload and model probe, T3 reported provider-stream closure and the isolated Pi process exited. The cause remains unestablished; do not call long-lived stability clean or hide the warning with a notification workaround. No T3 source/bundle/database patch, desktop restart or change to the original colored timing notice is included.

## 2026-11-07: Build unsigned Windows T3 Code artifacts in Linux Docker

- Add a reusable pinned Linux builder using upstream's `cargo-xwin` and Electron Builder path, including Windows x64 native payloads, an unsigned NSIS installer, standalone Windows CLI and the matching Linux CLI archive for WSL. Import committed source through a Git bundle with shallow boundaries, without host credentials, ignored working files, live T3 state or Windows toolchain installation.
- Build `e455200077ce60806a01c8f28435b58860dcfc74` as local preview `0.1.7-preview.20261107.1`. Pass upstream Linux CLI smoke, Windows payload validation, Windows native-load/bundle verification and Windows CLI startup/HTTP smoke checks. Keep generated binaries/logs ignored and document rebuild/export commands; do not install or publish the preview, replace running T3, claim GUI/WSL guest acceptance, or change existing release channels. The unsigned installer retains the normal Beta app identity and is not a side-by-side installation.

## 2026-11-07: Add the T3 Code source fork and verify its main-branch build

- Fork `pingdotgg/t3code` to `ilude/t3code` and add it at `modules/t3code`, tracking the fork's `main` branch. Upstream scheduled nightlies build `main`; there is no separate nightly branch. Keep T3 source ownership in its module and leave existing modules unchanged.
- Verify commit `e455200077ce60806a01c8f28435b58860dcfc74` with the upstream release JS bundle command in an isolated Linux x64 Docker environment using pinned Node 26.12.1, pnpm 12.14.0 and Vite+ 1.4.0. All four bundle tasks pass with warnings; retain ignored local outputs and document the build path. This is not packaged-installer, native-helper, GUI or full-suite acceptance, and does not replace the installed app or touch live T3 data.

## 2026-11-07: Add dated upstream issue research guidance

- Add the default-profile `issue-research` skill and route issue/PR/discussion lookups from `web-tools` to it. Report creation/update dates, comment totals, relevant closure/merge dates, and evidence-based activity summaries rather than treating a recent timestamp or large comment count as ongoing progress.
- Distinguish substantive discussion and development from automated updates or isolated “any progress?” bumps after long quiet periods. Disclose unavailable metadata and partial history; keep retrieval bounded and installed-version availability separate from upstream status. This is on-demand guidance, not automated monitoring.

## 2026-11-07: Add a T3 Code operating skill

- Add default-profile `t3code` guidance for Pi-in-T3 diagnosis, explicit model selection, app-owned thread control, and requested desktop visual checks, with official upstream documentation and contributor-guide links. Keep host adaptation owned by the Pi extension skill rather than introducing another profile or runtime framework.
- Record successful capture and visual inspection of the actual Windows T3 window, plus delegated Pi launch and a persisted live message/response probe. Document screen-occlusion limits, CLI-version mismatch, and the missing built-in T3/Pi RPC reload route; an already loaded reload-command bridge still needs separate implementation and live validation.
- Keep saved configuration, message acceptance, completed responses, and actual extension reload as separate evidence. No runtime notification change, reload bridge, desktop restart, or claim of a complete autonomous visual-iteration loop is included.

## 2026-11-07: Establish incremental Pi host-adapter direction

- Guide extension work toward shared host resolution and narrow injected adapters for T3 Code, Herdr desktop, Herdr TUI, and ordinary terminals, reusing existing verified Herdr detection. Separate the immediate RPC client from an enclosing terminal and keep presentation and host operations outside feature logic.
- Grow adapters only for requested feature changes, without a new profile, generic framework, or broad migration. This is skill guidance only: existing runtime behavior, unsupported integrations, and the T3 timing notification remain unchanged.

## 2026-11-07: Integrate experimental Hatchery compute and configuration facilities

- Combine general VM hardware/startup, owned template preparation/cloning, discovery, explicit guest SSH/setup, read-only BWS references and common systemd refresh behind a separate experimental entry. Keep runtime credentials outside serialized declarations, raw secret values out of state/results/logs, and refresh driven by explicit deployment/revision rather than a watcher.
- Preserve legacy VM props/state/fingerprint and the VM-only immutable runner. Reuse protected same-directory SSH uploads and optionally bind uniquely owned cloud-config artifacts to existing snippet storage without configuring hosts/storage. Combined Node 26 offline checks pass; the bounded disposable live slices below are not production deployment claims.

- Correct live-exposed Proxmox cloud-init SSH-key encoding, repeated command-array fields and numeric guest-agent completion readback. Poll side-effect-free readiness before submitting each command once; retain scalar form encoding and avoid automatically repeating an ambiguously failed command. Focused offline checks pass. A subsequent fresh cleanup check found no candidate guests, disks or snippets, with the pre/post-cleanup guest set unchanged; the broader live matrix remains incomplete.
- Pass the separate native VM/template/clone slice, including caller startup/preparation, clone identity isolation, memory/power convergence, rebuild refusal and no-change/drift behavior without API writes. Fix lost preparation files by flushing guest writes before template hard stop; same-ID recreation passed. Native destruction and independent guest/storage/snippet checks preserved the original guest set. Provider typecheck and 53 tests pass. Guest-configuration acceptance is a separate slice below; no production rollout occurred.
- Pass separate VM SSH transfers/setup, protected systemd delivery and native Action plan/no-op/explicit-revision behavior, including no restart for unchanged delivered bytes and service retention when the Action is removed. Verify synthetic values stay out of serialized state/logs. Real BWS adapter lookup remains operator-only for the existing authorized configuration family; only synthetic values reach the guest. Native destruction and independent cleanup preserve the original guest set. No source fixes or redundant offline reruns were needed. Container-specific service behavior, reboot persistence and application health remain untested.

## 2026-11-07: Complete isolated Hatchery LXC and DNS acceptance

- Pass bounded primary-target native Alchemy acceptance for LXC lifecycle, memory/rootfs updates and IPv4 readiness, plus disposable Technitium records, adoption, adapter bindings, drift repair and shared-configuration retention. Verify removal of the test guest, owned disk and private test artifacts, and preservation of existing guests. AAAA queries passed, but the guest had no IPv6 connectivity.
- Preserve fixes established by Proxmox 8.4.21 and Technitium 15.6.2: accept the single appended LXC description newline, confirm zone absence before treating record-read errors as missing, and write/verify FWD TTL zero. Optional host-status audit denial did not require privilege expansion. Production DNS/services remain unchanged; later compute/SSH/secrets/systemd additions need their own acceptance.

## 2026-11-07: Isolate further Hatchery provider development from live acceptance

- Authorize disposable primary-target provider acceptance and develop the next compute/startup/template/SSH additions in separate worktrees while that testing continues. Keep the tester's checkout and state independent, preserve its fixes, and integrate only after the existing acceptance run finishes before validating the additions.
- Permit task-scoped local commits and publication when useful, without including unrelated work or inferring production deployment, infrastructure takeover, or changes to the VM-only immutable runner. New provider additions remain in development, not live-validated claims.
- Accept read-only BWS secret abstraction, explicit refresh/redeployment rather than background synchronization, and common Linux systemd service operations with separate application recipes. Keep BWS access credentials off guests and raw values out of persisted declarations/state/logs; stored-secret writes and Docker/Kubernetes management are not part of these additions.

## 2026-11-07: Add local Hatchery LXC and Technitium providers

- Add a Proxmox LXC resource for new unprivileged containers with configurable dual-stack networking, DNS and compute, supported-field readback/updates, rootfs growth, ownership-checked lifecycle, bounded network/address readiness, and idempotent destruction. Retain immutable allocation/template/storage/bootstrap-key identity and preserve the VM-only runner and legacy VM state behavior. Accepted Proxmox configuration may remain pending until restart; address readiness is not SSH/application readiness.
- Add native Technitium A/AAAA/CNAME/TXT, multivalue and binding-aware alias resources plus the Alchemy DNS adapter, including Outputs, zone inference and retained verification records. Preserve native explicit adoption, instance comments and targeted owned-value deletion. Forwarder/FWD/catalog and supported server settings have actual readback/drift-aware convergence while remaining retained on destroy; omitted catalog/optional settings stay unmanaged.
- Complete the broader local provider continuation rather than stopping at the first LXC/A-CNAME slice. Node 26 package checks pass. The subsequent isolated acceptance above establishes bounded live behavior, not production deployment. Preserve deployed split DNS, current resource ownership and the BWS/private configuration boundary; no resource migration is authorized.

## 2026-11-06: Stop cancelling progressing commits after three minutes

- Remove the overall `/commit` deadline, which could expire after successful module commits and pushes and cancel the final parent push. Keep explicit cancellation and existing per-operation Git, shell, and publication timeouts; do not replace the cap with another arbitrary workflow budget.
- Continue verifying uncertain push outcomes instead of blindly retrying publication. Preserve active elapsed-time reporting without counting time waiting for operator decisions.

## 2026-11-06: Let the commit agent resolve routine workflow problems

- Return incomplete execution, new files, hook changes, and ordinary Git/publication errors to the private reviewer for inspection, scoped repair, and a fresh plan instead of immediately failing the whole command. Preserve completed commits and require remaining contents to be reviewed rather than replaying the old snapshot.
- Allow plan correction within the existing active-work deadline instead of imposing a two-correction limit. Give the agent an explicit blocker report for problems requiring user intent or access; cancellation, terminal provider failures, and unconfirmed push outcomes still stop safely.
- Keep normal hooks, ignore approval, reviewed whole-file execution, code-owned publication, child-before-parent ordering, working-file preservation, and actual-state reporting. No new checks or approval gates run during `/commit`; reload the extension to load the runtime change.

## 2026-11-06: Keep routine commit exclusions quiet

- Let the default `/commit` reviewer use ordinary Git judgment to exclude obvious generated artifacts and caches without asking, including files not yet covered by ignore rules. Exclude newly added ignored files by default instead of turning every match into an inclusion question.
- Reserve ignore dialogs for consequential inclusion ambiguities and concrete reasons to intentionally include ignored files. Keep explicit approval for ignore exceptions, existing tracked-file handling, working-file preservation, staging, and commit execution unchanged; no artifact classifier or new runtime gate is added.

## 2026-11-06: Distinguish Pi's Herdr desktop and TUI hosts

- Keep one default Pi profile and add runtime host context for Herdr desktop, original TUI, core-only terminals and ordinary terminals. Verify desktop membership through the caller's exact core terminal and space/tab labels; leave failed probes explicitly unverified rather than guessing from installed apps or terminal branding.
- Route the existing `herdr` skill to separate desktop/core guidance and the preserved original TUI procedures. Read the desktop app's generated guide and API declarations for the installed version instead of copying its manual.
- Keep existing TUI tools, visible-subagent behavior, tab launching, plans, naming and update coordination unchanged. These features are not yet ported to desktop. Load the new context and skill catalog with a settled `/reload` or fresh Pi session; no separate profile, dependency installation or desktop configuration change is needed.

## 2026-11-06: Add the dedicated Hatchery command runner

- Implement the approved non-onramp workflow: homelab-infra provisions a dedicated controller LXC and delivers explicit BWS-backed primary/secondary Proxmox bindings; Hatchery manages only newly allocated workload VMs. Existing guests, their infrastructure ownership, and unrelated production networking/services remain unchanged.
- Add the SSH-invoked `hatchery` command for plan/create, status/readiness, exec, upload/download, and destroy. Preserve immutable allocation identity, per-allocation SSH trust and isolated persistent state; serialize controller commands without adding a daemon, API, queue, scheduler, or database. Missing target images fail before mutation, with no fallback.
- Install checksum-verified source and Node 26, pinned pnpm and Alchemy dependencies, and an isolated Python bootstrap helper. Keep site tokens in root-only files and exclude them from resource state; do not deliver the BWS bootstrap credential to the controller.
- Deploy the initial shared Caddy ingress in a new dedicated LXC for LAN and personal-tailnet HTTPS, using Technitium internal records, Cloudflare DNS-only external records, and DNS-01 certificate management. Verify both paths with real provider responses and an isolated Codex client, then retire the old trial Serve route while preserving its identity and credentials. One instance is justified now, not a hard future rule. Preserve intentional work/personal tailnet separation; no WAN forwarding, Funnel, or public Internet ingress is added.
- Retire the superseded homelab experiment launcher and operational runbook, including its duplicated bootstrap and scratch-lifecycle logic. Keep reusable workload code and historical acceptance evidence in Hatchery; homelab-infra retains controller provisioning and private configuration delivery.
- Provide a separate checksum-pinned CLIProxyAPI trial recipe with loopback defaults and explicit private-LAN binding for shared ingress, independent API/management keys, and stock session affinity. Keep human Codex OAuth and an actual model request distinct from service readiness; preserve existing Claude Code, Codex, Pi, and `ccyl` authentication.

## 2026-11-06: Manage Herdr desktop configuration in dotfiles

- Link `~/.config/herdr-app/` to `config/herdr-app/` through both the cross-platform and WSL Dotbot configurations. Preserve the workstation's existing settings, keys and themes, with personal layouts and mods managed in the same directory.
- Keep regenerated support files, upstream-owned layouts/mods, telemetry and local runtime state out of Git. Preserve those files locally and leave the separate Herdr TUI configuration and running core terminals unchanged.

## 2026-11-06: Reopen Hatchery placement to avoid onramp VMs

- Record the operator's preference to keep Hatchery deployments off existing onramp VMs, superseding the earlier, never-deployed onramp runner placement. Keep controller location and disposable-worker placement explicit and unresolved rather than silently selecting a replacement host.
- Preserve the TypeScript/Node, Alchemy, Proxmox-provider, SSH-access, and isolated-state direction. Update Hatchery's requirements, architecture, decisions, and handoff without provisioning resources or transferring existing infrastructure ownership.

## 2026-11-06: Add direct homelab inventory lookups

- Add a read-only `bws-snapshot.py lookup <field>` path in homelab-infra for one global inventory scalar, such as the configured Forgejo URL. Use the existing BWS locator and credentials, make one BWS request, and print only the requested value without rendering files or starting Docker.
- Document the exact dotfiles-root invocation so simple configuration questions do not require rediscovering snapshot internals or searching architecture documents. Missing fields and non-scalar sections return errors rather than exposing broader inventory.

## 2026-11-06: Install the Forgejo CLI across workstation platforms

- Add `forgejo-cli` (`fj`) to the macOS Homebrew bundle and install upstream release binaries on Windows x86-64 and GNU/Linux x86-64/ARM64, including WSL package setup. WinGet currently has no matching package; Windows configuration-only runs keep skipping package updates.
- Share one Python installer for latest-stable release selection, per-user `~/.local/bin` placement, repeatable version checks, and executable validation before replacement. Leave Forgejo host selection, authentication, credentials, and existing Git SSH configuration unchanged.

## 2026-11-06: Add T3 Code alongside Herdr

- Install the T3 Code desktop app through Windows core WinGet/macOS Homebrew and add its official CLI installation path. Configure Pi after default-profile setup, including configuration-only Windows runs, without changing Herdr installation, configuration, saved machines or active sessions.
- Merge T3's local provider settings to use the native Pi executable and the existing default profile, retaining credentials in place and preserving unrelated T3 settings. Use Pi's own model default when T3 has no stored default, and prevent T3 Pi processes from claiming an inherited Herdr pane context.
- Document RPC UI limits, headless custom subagents versus T3-native delegation, native-launch versus shell-launch behavior, and remote Windows hosting differences. Do not enable network access, services, new accounts, or legacy-profile changes as part of setup.

## 2026-11-06: Make Bedrock usage readable

- Replace internal billing-query and local-cutoff timestamps with one local date and minute-level update time. Hide cache statistics when no token data exists, label AWS-reported spend plainly, and flag missing request costs as an incomplete known-spend total rather than implying zero cost or pending pricing. Accounting and refresh behavior are unchanged.

## 2026-11-05: Add a portable Hatchery resume checkpoint

- Add cross-machine pickup instructions and a suggested planning prompt to Hatchery's existing handoff, linked from its README. Record the next recommended runner milestone, starting code, unresolved interface/allocation details, and the distinction between accepted direction and an implementation plan not yet written.
- Resume from published repositories rather than copying temporary state or credentials. Preserve the narrow first workflow and long-term infrastructure replacement goal without authorizing live deployment or migration as part of this checkpoint.

## 2026-11-05: Clarify Hatchery's long-term replacement goal

- Record the operator's goal for Hatchery to replace homelab-infra once its ideas prove out. Keep disposable compute as the initial proving ground rather than a permanent product boundary; the current management split is transitional, with no immediate migration or expanded first-version scope.
- Update Hatchery's PRD and related design documents, and require accepted product changes to be reflected in the PRD during the discussion rather than only in chat or supplementary records. Preserve current resource ownership until deliberate handover and keep private site configuration/secrets separate from reusable product code.

## 2026-11-05: Restore fresh Pi registration with Onclave

- Add concise infrastructure contributor guidance for new persistent container directories: distinguish host-managed and container-owned paths, account for rootless UID/GID mapping, preserve established ownership during normal applies, and verify service writes after reapplying configuration.
- Preserve RabbitMQ's existing container-owned data-directory permissions during normal infrastructure applies. The previous directory setup reset ownership to the host deploy user, preventing RabbitMQ from creating new agent queues while API health endpoints still returned success.
- Repair the live directory ownership and restart RabbitMQ and core to recover failed queues without deleting queues, changing databases, or advancing the application image. Verify fresh signed registration, heartbeat, delivery polling, and a native default-profile Pi connection, then reapply configuration and confirm ownership is retained. Add a regression check for first-install initialization versus existing container-owned storage.

## 2026-11-05: Restore Pi startup screen and usage reports

- Undo the quiet-startup change so the default profile shows its startup screen again. Restore automatic usage reports for fresh conversations and `/new` or `/clear`, while keeping resumed and branched conversations footer-only.
- Preserve the pending-report marker across an immediate resource reload to avoid losing or duplicating the report. Explicit `/usage` and background footer updates remain unchanged. Restart Pi to load the startup setting and extension changes.

## 2026-11-05: Record the initial Hatchery runner direction

- Accept TypeScript/Node with pinned Alchemy v2, our own narrow Proxmox provider, and SSH configuration facilities for initial work. Place the runner command on the existing onramp host, called over SSH by existing agents, with persistent local allocation state and BWS-backed configuration rather than new permanent infrastructure.
- Record the decision, reasons, experiment findings, validation limits, published checkpoint, and remaining work in Hatchery's handoff and align its design documents. The runner is not deployed, the public recipe/command API remains open, and broader disposable guest ownership still requires agreement; existing OpenTofu guests remain unchanged.

## 2026-11-05: Evaluate Alchemy with one disposable Proxmox VM

- Add a pinned Alchemy v2 experiment in Hatchery with a custom Proxmox VM resource and an agentless SSH-managed file. Keep the product API, framework selection, and broader compute ownership unresolved.
- Add a homelab-owned controller adapter that reuses validated BWS configuration and the existing pinned Debian cloud image. Use a tiny per-guest NoCloud ISO for DHCP, guest-agent startup, and a dedicated SSH key rather than requiring router access or a static address. Keep credentials and isolated Alchemy state outside tracked source and do not reuse OpenTofu state.
- Record the explicitly approved ownership exception for one scratch VM and its bootstrap ISO. Existing guests, services, DNS, routers, and OpenTofu resources remain outside the experiment. The syntax-comparison examples remain hypothetical.
- Distinguish unreachable SSH state from a confirmed missing file. Alchemy recreates missing resources before updating drifted ones, so reporting a file as missing merely because its VM is stopped can block the VM-first repair path.
- Exercise live creation and SSH readiness, no-op deployment, a file-only update, stopped-VM drift repair, and repeated teardown. Independently confirm the scratch VM, ISO, and disks are gone while preexisting guest IDs remain. Keep explicit drift checks distinct from unchanged deployments; this is not a general production-readiness result.

## 2026-11-05: Separate Onclave images from production deployment

- Keep Onclave responsible for application code, image builds, and local development/test assets. Publish the source-SHA image first and advance the private registry's `latest` tag only after successful checks and publication; embed the source revision in the image instead of injecting it from infrastructure.
- Make homelab-infra's native Quadlets the production authority and move PostgreSQL backup/restore helpers there. Retire source-file downloads, application commit/checksum/tag/digest inputs, and the old commit-based core rollout rather than maintaining competing deployment paths. Preserve dependency pins, native storage, application secrets, and existing service topology.
- Use Podman's daily rootless auto-update timer for Onclave core only, with persistent read-only private-registry authentication. Configuration applies retain the installed application image, including when a configuration change requires a restart; first installation pulls `latest`, and the updater owns subsequent image advancement.
- Keep `traefikturkey/onclave` available and unarchived. Preserve the separate Onclave, homelab-infra, and workstation repositories and their ownership boundaries.

## 2026-11-05: Start Hatchery as a disposable-compute product

- Add private Forgejo `mike/hatchery` as the `modules/hatchery/` submodule on `main`, with a documentation-only PRD, architecture direction, decision ledger, contributor instructions, and a portable project design skill.
- Record ephemeral, immutable, code-defined compute for agents, our own agentless SSH configuration facilities, SSH-key authentication across controlled transports, and abstract secret access with BWS first. Preserve open language, microVM, and provisioning-ownership decisions rather than treating proposals as implemented behavior.
- Keep Hatchery product work separate from homelab-infra deployment and site configuration. No compute resources, service deployments, or existing Proxmox ownership contracts change during repository setup.

## 2026-11-05: Move the active Onclave branch and release path to Forgejo

- Move only `feature/v2-broker-core` and its full ancestor history to private `mike/onclave`, keeping that branch as the Forgejo default and local tracking branch. Retain the GitHub repository read-only after replacement verification; do not copy the other branch refs.
- Run checks and SHA-tagged core image publication in Forgejo Actions and the private `onclave` organization's container namespace. Package privacy follows its owning user or organization, not the linked private Git repository, so keep the Git repository at `mike/onclave` without changing the `mike` account's visibility. Add an Onclave-scoped container runner instance on the existing host without broadening the values repository's deployment-runner registration. Keep publisher and read-only deployment credentials separate and BWS-owned.
- Extend managed Onclave deployment to authenticated commit-pinned Forgejo source files and private OCI pulls while preserving source checksums, immutable image digests, and the core-only rollout's pin-only boundary. Use the normal service role for the initial hosting-provider switch.
- Restore the existing managed Forgejo HTTPS service and correct its stale runner host alias. Supply inventory-backed Forgejo host mappings to the runner's job containers and the Onclave deployment host, retaining HTTPS verification. Use the deploy user's registry authentication file through the supported systemd environment for automatic Podman pulls. Preserve exact authenticated SSH host keys across multiple direct-access handoffs in one playbook rather than clearing keys collected earlier in that execution.

## 2026-11-04: Move homelab infrastructure hosting to private Forgejo

- Move the canonical `homelab-infra` repository to private Forgejo under `mike/homelab-infra`, preserving Git history, branches, and tags. Retain the GitHub repository as an archived, read-only migration snapshot rather than deleting it.
- Use `git@forgejo:mike/homelab-infra.git` for the submodule and its origin. Each workstation needs a local `forgejo` SSH alias and an authorized personal key before recursive cloning; keep the real service address out of tracked configuration. Preserve public-safe source rules, BWS ownership, and the separate nested `values/` repository.
## 2026-11-05: Allow one-response approval of flagged web fetches

- When Luna flags fetched content, show the user its URL and flagged excerpts and allow reading that response once as untrusted source material. This supports capturing and reviewing deliberately instructional documents, such as agent prompts, without treating their contents as permission to execute them.
- Preserve screening on every fetch, blocking without approval or a UI, cancellation, acquisition routing, and search-result behavior. Approved responses carry a warning and `flagged-approved` metadata; no allowlist or model-controlled bypass is added. Reload Pi to load the change.

## 2026-11-04: Use Terra at medium effort for Pi commits

- Switch `/commit` from latest Luna at low effort to latest available native OpenAI Terra at medium effort, currently `gpt-6.1-terra`, to try improved review reliability alongside the repository-scoping repair.
- Preserve the existing latest Anthropic Haiku fallback at low effort, same-repository retry history, quiet command output, whole-file plans, and child-before-parent execution/publication. Leave the main conversation model unchanged. Improved live commit judgment is not yet established.

## 2026-11-04: Isolate commit reviews and refresh the Chrome host launcher

- Start each child or parent repository's commit review with its own transcript, relative-path tools, and candidate inventory. Keep other repository names only as boundary context so child and parent files are not mixed during review.
- Let invalid ignore-request arguments return to the reviewer for correction without opening a dialog or ending the run. Preserve stopping behavior for failed Git operations, cancellation, required noninteractive input, and ignore mutations.
- Distinguish ignore candidates absent from the selected repository from changed files that are not staged additions. Accept native Windows candidate separators without changing POSIX literal backslashes. Label the repository separately instead of displaying a misleading concatenated path. Preserve retry/publication context within a repository, code-owned whole-file commits, hooks, ignore approvals, and actual-Git result reporting without new runtime gates.
- Refresh the Windows Claude Chrome native-host wrapper to use the current user's npm-installed executable instead of the previous user's WinGet path.

## 2026-11-04: Share one archive uploader across Pi sessions

- Keep one background uploader per machine and canonical profile instead of having every open Pi session repeatedly scan the same logs. Live validation of the earlier unchanged-file optimization still found substantial duplicate work, so this supersedes the decision to defer shared worker ownership.
- Retain ownership between scans. Standby sessions make lightweight ownership checks and take over after the owner stops or exits; an owner without an available client yields as well. Forward sync requests from standby sessions to the owner, checking at most every five seconds while idle, while keeping the owner's existing one-minute wait between completed periodic scans.
- Reuse local PID/token claims and dead-owner recovery. Preserve source-level claims, committed checkpoints, raw backup bytes, approved source coverage, and legacy exclusion. Expose an owner flag in local archive status without writing coordination activity into archived logs.
- Pass four real-process ownership tests covering repeated scans, abrupt and graceful takeover, standby sync forwarding, disconnected ownership, and profile isolation, alongside the 20 existing focused archive tests and Onclave typechecking. Reload six inactive sessions and verify one shared owner retaining the same claim across a 259-second live observation. Seven background Pi processes averaged 0.30 CPU cores combined; earlier eight-process observations averaged 0.86–1.10 cores, but differing process counts and activity prevent a controlled percentage-improvement claim. Active conversations were left untouched and still need a reload to join shared ownership.

## 2026-11-04: Quiet Pi startup, clear, and reload output

- Hide Pi's startup header, model scope, and loaded-resource dump with the default profile's `quietStartup` setting.
- Refresh Codex usage only in the footer during session lifecycle events, without appending automatic Codex/Bedrock reports or pending report markers. Keep full reports available through `/usage` and `/bedrock`.
- Apply model visibility filters without an informational transcript banner. Preserve filtering, background usage refresh, and footer status.

## 2026-11-04: Keep Pi clear-session progress out of the transcript

- Keep Herdr delivery failures in the existing recoverable footer status instead of also appending a permanent warning to the conversation. Preserve report retries, response validation, and automatic status clearing after successful delivery.
- Remove `/clear`'s persistent “Starting a new session…” notification. Preserve session replacement, automatic reload when profile resources changed, command acknowledgment, and actionable cleanup/reload warnings.
- Add regression coverage for quiet clears with unchanged and changed resources. Focused clear/error tests and default-profile typechecking pass. The complete reload integration file still reports timer-count failures in its existing lifecycle assertions; live terminal repaint behavior is not verified by these tests.
- Trace separate debugger text over the editor to a temporary live-inspector probe used during session-upload diagnosis, not to `/clear` or a configured launch flag. No debugger launch configuration is changed.

## 2026-11-04: Reduce repeated archive work in idle Pi sessions

- Check a source's full file fingerprint against its committed archive checkpoint before creating a per-source lock or opening the source. Unchanged files no longer create and remove lock directories in every connected Pi session. Changed files retain the existing locked recheck, path validation, upload, and checkpoint behavior.
- Preserve backup coverage, the per-session scan schedule, and legacy exclusion. Do not add a shared backup-worker election. Pass 20 focused archive tests and Onclave typechecking; a local three-worker unchanged-file fixture used about 60% less CPU time. Existing Pi processes must reload or restart to load the change; workstation-wide CPU improvement has not yet been measured.

## 2026-11-04: Reconcile analytics fixes with upstream Pi compatibility updates

- Merge the local analytics-rendering and native test-context corrections with the published GitHub updates, retaining both sets of regression coverage and the injected keybinding-hint support. Keep test fixtures compatible with the installed Pi 1.4 API without removing the newer hint and subprocess-result fields.
- Pass default-profile typechecking and 65 focused analytics-rendering, Codex usage, goal, and commit-plan tests under Pi 1.4. No Pi installation or runtime configuration change is made by this merge; Pi 1.5 checks were not rerun locally.

## 2026-11-04: Share Herdr companion placement and own dedicated pane lifetimes

- Route programmatic shell, command, and agent companions through the same serialized layout owner as visible Pi subagents, preserving the primary orchestrator's full-width lower row and existing readable overflow. Nested coordinators use the originating primary, not a competing layout anchor. Preserve external/manual layouts rather than rearranging live work.
- Add dedicated command launches with task, agent, and persistent-service lifetimes. Capture exit status and recent terminal output before retiring task/agent panes, and retrieve saved results by job ID after closure. Dedicated `ccyl` launches still use the existing shell profile/provider routing; ordinary interactive `pi`, `ccyl`, and user terminals keep their behavior.
- Keep service panes until explicitly closed and avoid idle-shell sweeps. Windows foreground-shell classification was observed alongside live benchmark, Godot, and Python descendants. Dedicated Windows hosts also terminate their shell after the command returns, avoiding the profile-loaded PowerShell exit hang reproduced during acceptance. Explicit close/interrupt protects the actual calling pane rather than whichever pane another client has focused.
- Pass default-profile typechecking, 175 focused tests, and isolated Windows Herdr acceptance for mixed placement, output capture, and task retirement without a replacement shell. Real Claude interaction and attached-client rendering remain unverified; existing production panes were not rearranged or closed. Reload settled Pi sessions or start fresh processes to load the tool and guidance changes; no Herdr restart or plugin relink is required.

## 2026-11-03: Keep Claude usage right-aligned in resized panes

- Query the live terminal width for the custom Claude Code status line, including when hook output is piped, before falling back to `COLUMNS`. Reserve footer side padding so right-aligned usage is not placed beyond the available line in narrower ccyl panes.
- Preserve provider-specific usage and left-side shortening; remove the fixed 40-column minimum and 400-column maximum from width detection.

## 2026-11-03: Add native Pi session and log archival

- Extend Onclave with a separate signed archive facility for full native session JSONL and the existing Bedrock usage, Codex cache-observation, adapter audit, and Herdr naming logs. Preserve raw bytes and unknown session entries rather than replacing them with improvement-note summaries.
- Keep local files as Pi's working storage and durable input during disconnection. Archive immutable source snapshots with reusable content-addressed chunks and distinguish historical unknown origin from uploader attribution. Background uploads run with an orchestrator, not a new daemon, and do not block native Pi operation.
- Exclude credentials, browser data, caches, debug snapshots, and runtime coordination. Keep local analytics unchanged; rotated diagnostics that disappear before observation cannot be reconstructed. Deployment and historical backfill completion require separate verification.

## 2026-11-03: Build online Onclave improvement-record storage

- Add Onclave service, signed client, deferred Pi tool, and import tooling for process feedback, failures, synthesized knowledge, tool-call reviews, and classification corrections. Keep instructions and implementation in Git while preparing workflow data for centralized storage.
- Preserve source references and Markdown, derive machine/process/session/repository provenance for new captures, and reject stale revisions or conflicting record IDs rather than overwriting concurrent work. Report failed writes as not saved; offline caching and automatic consolidation remain deferred.
- Deploy the signed API and additive database migration through the existing Onclave service role. Import and read-back verify 206 current records, including uncommitted additions; switch active skills to centralized storage and remove eight data files from Git tracking while retaining ignored local historical copies. Git history is unchanged.
- Verify signed workstation access and CI's full test/integration suite. The local Tailscale client reports `NoState`, so remote Tailscale-path acceptance remains unverified; LAN access works. Offline caching and server-side consolidation are not part of this milestone.

## 2026-11-03: Open a fresh Pi instance when branching an empty session

- Make `/branch` use the same fresh-instance launch path as `/pi` when the current branch has no user or assistant conversation, including after `/clear`. Preserve the cwd, profile, and optional title without creating a dummy session file or branch metadata. Conversations with history retain normal branching behavior.

## 2026-11-02: Support Pi 1.4.0 and 1.5.0 in the default profile

- Prefer the host-injected keybinding hint helper when rendering subagent and log-analytics results, retaining the imported helper as a fallback for older Pi versions. Serialize browser structured output as JSON and narrow image transform parameters at the schema boundary to accommodate API type differences.
- Update log-analytics renderer fixtures for injected keybinding helpers and the required query execution option. Keep changes in the default profile; legacy remains untouched.
- Pass the full default-profile typecheck and 110 focused log-analytics, subagent-presentation, Codex usage, and commit tests under Pi 1.5.0. Typecheck default-profile extension/library sources against Pi 1.4.0 using a temporary TypeScript path mapping; no global Pi installation or package configuration changed. Pass the native damage-control loader/composition smoke with Pi 1.5.0. Pi 1.4.0 native CLI composition was not run.

## 2026-11-01: Resolve targeted planning and runtime feedback findings

- Continue ordinary planning through one consequential question at a time, incorporate answers, and reach executable readiness. Replace competing draft/stopping cues in the owning skill and template while preserving explicitly requested drafts, genuine external blockers, settled decisions, and the planning/execution boundary.
- Label settled partial/blocked subagent assignments as terminal outcomes, not live progress or pending questions. Explain explicit follow-up and show recorded process/pane and cleanup state without changing saved-conversation reopening, retention, or retry behavior.
- Render partial or unexpected analytics call arguments without unchecked array/object assumptions, including the previously observed `profiles.join` crash path. Keep the analytics API and valid-call presentation unchanged.
- Pass all 16 focused subagent-status and analytics-render tests. Full-profile typecheck still reports the three existing context-fixture errors in unchanged `tests/codex-usage-tool.test.ts`. Source/instruction review found no additional task-related defects; live attached-client behavior and future planning adherence remain unverified. Load through a fresh default-profile process or settled-only `/reload` with no active or retained subagents.
- Separately diagnose seven October 30 follow-up readiness failures across four children: two also reported cleanup ownership errors. The complete ledger is in the existing weekly review; historical startup transitions and loaded runtime remain unavailable, so no startup repair or deadline change is inferred.

## 2026-11-01: Make default Brave control functionality-first

- At the operator's direction, remove custom Damage Control/AI browser action authorization, private-transfer bookkeeping, and page-request interception from owned and attached browser execution. Other tools retain their separate Damage Control behavior. Keep exact browser/process/session/target/frame checks, configured credential bindings, and native warning/manual CAPTCHA handling.
- Capture raw screenshots without privacy inspection, masking/restoration, or top-level/per-frame approvals, superseding the narrower October 31 screenshot change. Browser connections now survive agent turns and disconnect on session switch or shutdown; attached Brave and its tabs remain open.
- Add keyboard chords (`press`), multiline/tabular text insertion (`paste`), local file-input assignment (`upload`), and contenteditable `fill`. Paste does not change the OS clipboard; application-specific spreadsheet paste still requires actual cell verification.
- Pass 305 browser-related tests and live acceptance through the registered on-disk tools in the operator's attached Brave: keyboard replacement, multiline input, contenteditable fill, a fixture's tabular paste handler, file upload, exact iframe editing, and PNG capture. Verify the actual Google Sheet opens and screenshots correctly, but make no sheet edits or universal compatibility claim. Full-profile typechecking still reports only the three existing context-type errors in `tests/codex-usage-tool.test.ts`.
- Reload the settled default-profile Pi session or start a fresh process to load the new tool schemas. The functionality-first controller is not a browser/network sandbox and screenshots are not redacted; security hardening is deferred as requested.

## 2026-11-01: Route selective workflow learning through existing Pi skills

- Add a short default-profile routing cue for meaningful operator corrections, bottlenecks, and reusable successful techniques. Extend `agent-process` to distinguish instruction problems from tooling, execution, and evaluation problems, updating relevant existing records rather than accumulating rules.
- Keep detailed procedures on demand, preserve shared-edit approval and explicit project-local evolution authority, and separate captured evidence from executable policy. Brief capture does not end an unfinished task; later comparable work assesses usefulness without per-turn reflection or scheduled monitoring.
- This is an instruction-only refinement, not a runtime trigger, new memory store, or background optimizer. Source review and incident walkthroughs check consistency, not future adherence. Load through a fresh default-profile session or settled-only `/reload` with no active or retained subagents.

## 2026-10-31: Enable Zomboid garbage-bin deletion

- Enable `TrashDeleteAll` in the managed game-server configuration so players can use the garbage-bin Delete All button. Deploy through the targeted service workflow without resetting the world or changing other gameplay settings.
- Push homelab-infra commit `5e8acc4` and verify the deployed setting and running game container. All 479 public validation tests pass (one skipped); full validation stops at the private-values check because this checkout has no `values/` directory.

## 2026-10-31: Remove per-iframe screenshot authorization

- At the operator's request, remove the separate read-authorization and privacy-inspection loop for embedded frames during screenshot capture. It incorrectly treated Google Sheets' blank helper frames as navigation destinations and blocked the entire screenshot.
- Keep top-level screenshot authorization, browser/session identity checks, and sensitive-control masking and restoration across all frames. No change to navigation, field editing, or request interception.
- Pass 181 focused browser tests, including screenshot capture with blank and cross-origin embedded frames without separate iframe approvals. Full-profile typechecking still reports the three existing context-type errors in `tests/codex-usage-tool.test.ts`. Reload the settled Pi session to load this change; live screenshot capture and sheet editing remain unverified.

## 2026-10-31: Recognize dedicated-worker parent frames in browser attachment

- Bind browser-level dedicated-worker attachment events through Chromium's exact `parentFrameId` when no parent target/session is supplied. Google Sheets exposed this missing relationship after the opaque-origin fix: the tool treated its worker as unrelated and closed the CDP connection.
- Wait for initial managed-page frame mappings when needed, register worker guards before resuming paused execution, and continue refusing unknown or ambiguous ownership. Do not infer ownership from the selected tab or adopt unrelated workers.
- Pass 156 focused browser tests and, after reload, verify a normal-tool text snapshot of the live spreadsheet with its worker and opaque frames present. Full-profile typechecking still reports only the three existing context-type errors in `tests/codex-usage-tool.test.ts`. Existing screenshot authorization does not support opaque blank-frame destinations, so visual layout inspection and the sheet update remain blocked; no sheet content has changed.

## 2026-10-30: Fix browser snapshots with opaque embedded frames

- Normalize Chromium's `://` and empty embedded-frame security origins to the opaque `null` origin. Google Sheets uses blank helper frames with this metadata; listing them previously threw `Invalid URL` and discarded the otherwise successful main-page snapshot.
- Keep opaque frames classified as private without inheriting the parent page's origin. Browser ownership, destination authorization, and observation screening remain unchanged.
- Pass 153 focused browser tests and verify corrected frame listing against the live spreadsheet. Full-profile typechecking remains blocked by three existing context-type errors in `tests/codex-usage-tool.test.ts`. Run `/reload` in a settled Pi session to load the fix; full live snapshot verification and sheet editing remain pending.

## 2026-10-30: Correct Pi tool contexts in usage and goal tests

- Use Pi's native tool-context type in the Codex usage and goal-control test fixtures, including the nested-tool members, and replace the goal test's handwritten tool callback interface with the native tool definition. Preserve existing assertions and production behavior.
- All 15 focused tests pass, and default-profile typechecking now passes without suppressing the three context-type errors. No runtime reload is needed for these test-only corrections.

## 2026-10-30: Prevent analytics display crashes on streamed arguments

- Treat in-progress analytics call arguments as unvalidated display input rather than assuming complete arrays and nested records. Skip unusable collection values while retaining available scope details in collapsed and expanded views, preventing a display error from terminating a subagent.
- Preserve execution-time schema validation and model-facing results. No question-cancellation, subagent lifecycle, browser, or legacy behavior changes. Load the fix with a fresh default-profile process or `/reload` when no subagents are active or retained.

## 2026-10-30: Require approval before overriding Git ignores

- Explicitly prohibit the default agent and private `/commit` reviewer from force-adding ignored files, weakening ignore rules, or bypassing `.gitignore`, `.git/info/exclude`, or global excludes without discussing the specific paths and reason and obtaining user approval. General implementation, archival, commit, or push authorization does not approve an exception.
- Require staged-new-file ignore inspection and the existing informed ignore decision before including a matching candidate; preserve normal handling of existing tracked modifications. Cover publication conflict resolution without changing runner code, tool permissions, or legacy.
- The reviewer prompt takes effect on its next invocation. Refresh profile-wide instructions with a fresh session or `/reload`. This instruction change does not establish future model adherence or correct existing EISA MRs.

## 2026-10-29: Add same-session goal execution

- Add default-profile `/goal` commands for starting, inspecting, pausing, and resuming authorized work through native checkpoints and compaction. Keep the original goal and direct user decisions authoritative over findings and summaries; stop for one consequential question or a concrete blocker. Planning, `/do-it`, and worktrees are not prerequisites or added approval gates.
- Document optional whole-run Bedrock dollar and absolute Codex weekly-usage thresholds, unavailable-usage pauses, conservative pacing, and a fixed 10% reserve solely for restoring buildability. Counters cover only their named systems, do not restrict omitted providers, and cannot guarantee strict ceilings against in-flight usage or reporting lag.
- Wire authenticated descendant admission, per-exchange enrollment, accounting acknowledgements, and goal-owned stopping. Include Bedrock compaction and internal permission/review helpers without double-counting aggregate returned usage. Preserve cleanup errors and keep in-flight descendant accounting open through cancellation.
- Pass 245 focused tests across 19 files. Full-profile typechecking remains blocked by three existing context-type errors in `tests/codex-usage-tool.test.ts`; live provider-boundary and attached-terminal behavior remain unverified. See `pi/profiles/default/docs/goal.md` for syntax and limits. Load with a fresh default-profile process or settled-only `/reload` with no active or retained subagents; restored goals require explicit resume.

## 2026-10-29: Add opt-in Windows SSH server setup

- Add `scripts/windows-ssh-setup.ps1` as an explicit administrator command, separate from all normal installers. Install the built-in Windows OpenSSH Server, enable automatic service startup, and limit the standard local SSH firewall rule to Domain/Private networks.
- Offer `-AllowTailscale` for an additional interface-scoped exception, including on Public physical networks. Preserve existing SSH configuration, keys, unrelated firewall rules, and managed policy; do not claim machine-wide firewall lockdown or verified remote authentication.
- Document setup, restart handling, key authorization, and client verification in the root Windows installation guidance. Keep DNS and live inventory outside workstation setup.

## 2026-10-29: Replace the rejected agent sidebar plan

- Remove the rejected `subagent-sidebar-and-instance-activity` plan and its disposable dotfiles task worktree/branch at the operator's direction, discarding that worktree's uncommitted implementation.
- Add the replacement draft at `.specs/native-agent-sidebar-and-activity/plan.md`, preserving the requested indented Team Lead/overflow entries, permanent dedicated Team Leads, instance-wide activity count, and coordinator follow-through on unfinished work. Explicitly exclude Herdr source changes/builds and Git-worktree layout machinery.
- Keep readiness honest: the installed native grouping interface for agent entries remains unresolved. This records planning and cleanup, not implemented sidebar behavior. The separate Herdr source checkout and unrelated work remain untouched.

## 2026-10-29: Streamline Pi-driven Claude Code reviews through Herdr

- Consolidate the existing Herdr skill's `ccyl` workflow: preserve subscription routing, include Opus/high launch syntax, inspect startup dialogs before waiting, and supply self-contained assignments. Document recovering completed answers from the matching native Claude transcript without duplicating work or restarting Herdr. Workspace-trust approval behavior remains unchanged.
- Replace duplicate Windows-account-specific Claude SessionStart hooks with one quoted `$HOME`-relative command, preserving the event matcher, timeout, and generated hook script. A fresh local `ccyl` launch through Herdr completed the hook with status 0, showed Opus 5.5/high without the startup warning, and returned the verification reply. Other machines were not tested. Existing Claude processes need a fresh launch for startup verification; reload settled Pi sessions to refresh skill discovery.

## 2026-10-29: Unify web and browser tool selection

- Consolidate provider selection in `web-tools`, narrow provider discovery descriptions, and document role/tool availability without broadening permissions. Move dated capability evidence and Browserbase onboarding into conditional references; align provider credential lifecycle instructions while keeping the existing tooling unchanged.

- Add a default-profile `web-tools` routing skill and link local Brave, Browserbase, and Firecrawl guidance to it. Keep native search/fetch as the starting point for ordinary lookup and reading, distinguish image search from scraping Google Images, and route by required output and local versus cloud state.
- Carry requested artifact saving through related steps, report capability-specific verification, and diagnose failures before changing providers. Preserve existing browser ownership, credentials, and runtime behavior; no new tool, automatic fallback, or legacy changes. Reload settled default-profile sessions to discover the guidance.

## 2026-10-29: Add Firecrawl skill and HTTP helper

- Add a default-profile `firecrawl` skill for single-page scraping, search, URL discovery, and bounded crawls. Its PowerShell HTTP helper uses the existing Bitwarden locator/controller credential or an existing `FIRECRAWL_API_KEY`, without installing a CLI or storing another copy of credentials.
- Verify live single-page access against Example Domain; search and crawl remain untested. Fresh default-profile sessions discover the skill from any working directory; existing sessions need settled-only `/reload`. Legacy is unchanged.

## 2026-10-29: Add a default-profile Browserbase skill

- Add the discoverable `browserbase` skill for hosted browser automation, Fetch/Search, templates, and Stagehand integrations through the `browse` CLI. Resolve the API key from the existing homelab Bitwarden locator and controller credential without duplicating secrets in Pi configuration.
- Keep local Brave browsing on the existing browser-tools workflow, isolate cloud CLI sessions by task, and document free-tier limits and full session-link reporting. No native tool or legacy-profile changes. Fresh default-profile sessions discover the skill from any working directory; existing sessions need `/reload` when no subagents are active or retained.

## 2026-10-29: Expose Codex weekly quota to agents

- Add the default profile's discoverable `codex_usage` tool for fresh weekly percentage used, reset Unix time, and fetch timestamp. Reuse `/usage` quota authentication without initiating login or changing native OpenAI model credentials. Missing weekly data remains unavailable rather than zero; request and authentication errors remain visible.
- Restart Pi or use `/reload` with no active or retained subagents to load the tool. Legacy is unchanged.

## 2026-10-28: Execute reviewed commit plans in code

- Make `/commit` and `/commit push` use the AI for staged review, whole-file grouping, subjects, and reasoned exclusions, then let runner code stage, validate, commit, verify, and publish. Normal review has no mutation shell or publication tool; `bash` is available only to resolve established publication conflicts.
- Require a complete structured plan before committing changed files. Return exact validation errors for an initial proposal and up to two corrections, then stop without executing an invalid plan. A missing plan with pending changes or unfinished eligible work cannot produce a success label or publish an unchanged HEAD. Clean repositories may finish as no-ops.
- Preserve ignore questions, working and index-only contents, normal hooks, deepest-first review, child-before-parent publication, pull-before-push integration, detached publication skipping, model selection, and response retries. Report actual commits, remaining changes, exclusions, retained index references, and publication outcomes, including partial results after failure. No new runtime validation gates or legacy changes. Run `/reload` in an existing Pi process to load the remedy.

## 2026-10-28: Initialize Bedrock footer from cross-sign-in personal AWS usage

- Reconcile month-to-date CloudWatch invocation costs for the same username across IAM users and named role sessions in the same account, regardless of machine. Match the complete username, exclude other users and service identities, and aggregate before the dashboard's top-user limit.
- Record personal scope in snapshot metadata and preserve existing ledgers. A newly initialized snapshot covers older local unpriced records through its cutoff; later local usage remains incremental. This is a logged-usage estimate, not an invoice or continuous synchronization of other machines.

## 2026-10-29: Refresh personal Bedrock billing automatically

- Run the narrow live personal CUR Lambda query in the background at default Pi session start, new/clear, resume, and about every 15 minutes. Share concurrent refreshes, cancel pending work and timers on shutdown, and keep model requests and UI startup independent of billing latency. `/bedrock reconcile` remains an optional immediate refresh.
- Show `bedrock: $amount` from the last successful current-month CUR total plus priced Pi/Claude local usage since local query-start capture, including usage recorded during the query. Persist that capture separately from AWS generation time. Failed refreshes keep the successful baseline and subsequent local accumulation; clear/new never resets the ledger. `/bedrock` and `/usage` use the same calculation.
- Keep historical CloudWatch and pre-port baseline files untouched but exclude them from the new Pi billing calculation. Preserve all-session shared-ledger accounting and accounting-only restricted children, with no new child network or timers. This is approximate personal tracking, not exact billing coverage or deduplication.
- Ignore the generated CUR cache and atomic-write leftovers. Invoke only the dedicated personal Lambda with the selected AWS profile, reject Lambda errors as well as CLI failures, and clean system-temporary response files. Restart Pi or use settled-only `/reload` with no active or retained subagents to load these changes.

## 2026-10-29: Prefer posted personal CUR total in the Bedrock footer

- Add a validated, profile-local payer CUR snapshot cache refreshed only by `/bedrock reconcile`. A current-month posted total takes precedence over CloudWatch and local Pi/Claude estimates in the footer; local accounting remains available separately and the existing CloudWatch baseline is not overwritten.
- Fetch the deployed `snapshots/mike.glenn/current.json` object from the personal billing bucket in `us-east-2` with the selected AWS CLI profile. Accept UTC timestamps serialized with either `Z` or `+00:00`, matching the deployed object.

## 2026-10-29: Surface native Herdr capabilities

- Distinguish same-client `herdr machine add` connections from `/connect`, which opens a separate client. Link upstream guidance for agent diagnostics, popups, direct attachment, multiple clients, and restart restoration, keeping optional history and experimental handoff unchanged.
- Include machine labels in custom Pi sidebar rows on both platforms. Reload Herdr configuration to apply; installed client/server support for documented features remains to be checked before use.

## 2026-10-29: Reconcile Bedrock costs for the named SSO identity

- Allow `/bedrock reconcile` to use the `AWSReservedSSO_ccb-bedrock-developer` caller and keep its baseline filtered to the complete assumed-role ARN, preserving session-level attribution and existing personal IAM-user behavior.
- Other assumed roles remain rejected. The AWS identity and deployed dashboard were inspected read-only; log query execution was denied for the configured IAM user.

## 2026-10-27: Complete parent gitlinks in the default Pi commit runner

- Move deepest-first repository sequencing into `/commit`'s runner instead of relying on one private model turn to coordinate every repository. If a parent's pin is omitted, stage the updated child gitlink and resume normal staged review/grouping and commit before continuing.
- Complete child publication before the parent pass, including child HEAD changes from pull/merge. Defer premature parent requests, refresh pins before and after parent integration, and finish requested publication after pin commits without duplicate pushes of an unchanged HEAD.
- Preserve explicit exclusions, staged submodule removals, index-only content, native hooks, detached local commits, clean outgoing children, and bare `/commit`'s local-only behavior. No unreviewed automatic commits, separate audit phase, or changes to legacy. Reload the default profile to activate.

## 2026-10-27: Close completed Pi subagents and reopen saved conversations for follow-up

- Ordinary subagents now close their processes and panes on completion instead of offering a `retain` launch choice. Their conversations and results remain saved; explicit `subagent_control message` follow-ups reopen the same session with its original role, permissions, and launch configuration, then close again when done. Reopening uses the current owning runtime, not a new cross-restart registry.
- Align root/coordinator tool descriptions, Team Lead and council prompts, child instructions, and lifecycle documentation around that contract. Remove speculative-retention encouragement and duplicated protocol guidance; stop instructing roles to use unavailable parent tools.
- Preserve running and waiting-parent children, explicit user intervention, and the separately authorized Integrator successor that survives the departing orchestrator. Existing sessions need a settled-only `/reload` with no open owned children, or a restart, to load the change.
- Passed 325 subagent/successor tests, default-profile typecheck, runtime smoke, and diff checks. Fourteen opt-in live tests were skipped; attached-client reopening remains unverified.

## 2026-10-27: Show running subagents in the Pi footer

- Show `agents: N running` on the second footer line after Onclave and before token stats. Count running children and descendants owned by the current session using existing lifecycle updates, with no polling. Hide the indicator when none are running; waiting and settled retained agents do not count.

## 2026-10-27: Separate spawned subagent tabs from personal work tabs

- Group overflow and dedicated Team Lead tabs in one lazily created Herdr workspace per orchestrator, labeled from its origin tab. Keep the orchestrator, ordinary inline subagents, and user-created work tabs in their existing workspace. Capacity, team grouping/migration rules, and execution behavior are unchanged; no Git worktree is created.
- Track Herdr's new pane IDs across workspace moves while retaining terminal/process identity, focus, and owned cleanup. Remove the initial shell and empty owned workspace, accept Herdr's automatic removal, and preserve tabs added by the operator.
- Passed 75 focused layout/model/cleanup tests, default-profile typecheck, and two isolated Herdr 0.9.5 tests for overflow placement and team migration/return. Attached-client presentation remains unverified. Activate with `/reload` only when no subagents are active or retained, or restart Pi.

## 2026-10-26: Integrate origin before default Pi commit publication

- `/commit push` now uses `publish_repository` as the sole pull owner for each captured own branch. Git fast-forwards when possible and merges divergence without rewriting history; established conflicts return recoverable evidence for clear resolution and retry, while other pull failures block dependent publication.
- Keep child repositories ahead of parents and refresh parent gitlinks to integrated child HEADs before parent publication. Bare `/commit` remains local-only.

## 2026-10-26: Add Windows remote Herdr connect command

- Add default-profile `/connect <ssh-alias>` to open a Windows Terminal tab running the local `herdr --remote` client. The alias is resolved by local SSH configuration, and inherited `HERDR*` context is cleared only in the child terminal to avoid nested-attachment rejection.
- The command does not install, restart, configure, or change the remote server. Other platforms report unsupported.

## 2026-10-26: Keep default Pi release cache machine-local

- Stop tracking the default profile's generated release-indicator cache to avoid timestamp churn and cross-machine merge conflicts. Each machine retains its local copy; Pi recreates missing caches and refreshes them through the existing release checks.

## 2026-10-26: Document remote workstation access discovery

- Point agents to homelab-infra's public-safe remote-access runbook for native Herdr SSH attachment, inherited Windows Terminal context, separate WinRM credentials, and network-access constraints. Keep live inventory and secrets under the module's existing BWS ownership rather than duplicating them in documentation or `values/`.
- Record the successful native Herdr connection separately from partial WinRM checks and unverified work, Tailscale, and public-network paths. This documentation does not change host configuration or managed firewall policy.

## 2026-10-26: Fix Windows Pi updates and retain failure context

- `/update` now uses the existing PowerShell Git Bash resolver for runtime dependency linking on Windows instead of bare `bash`, which can select WSL and fail to find Windows pnpm packages. Non-Windows behavior and cooperative restart eligibility are unchanged.
- Update installation/link and unexpected failures remain visible as notifications and are also persisted in model context, so a subsequent question can refer to the error without a screenshot. Recording the error does not start an automatic agent turn. Reload or restart Pi to load the extension changes.

## 2026-10-26: Disable default Pi inline image previews

- Disable the default profile's terminal image protocol to avoid the unsupported Kitty graphics path through Herdr into Windows Terminal while investigating visible encoded-image text. Image attachments and model image understanding remain enabled; Kitty keyboard support and Herdr configuration are unchanged.
- Run `/reload` in affected Pi sessions while settled with no active or retained subagents, or restart them, to load the setting. The suspected graphics corruption still needs confirmation through normal use with inline previews disabled.

## 2026-10-25: Allow slower commit publication and report uncertain pushes accurately

- Give `/commit push` publication 120 seconds instead of the 15-second local Git inspection limit. Local inspections keep their existing timeout.
- When a push is cancelled or times out, check whether the remote branch already points to the intended commit before reporting success. Unconfirmed publication is reported as an unknown outcome, not as no push performed; no automatic push retry is introduced, and dependent publication stops while the outcome is unknown.

## 2026-10-25: Keep visible subagent panes readable

- Replace the fixed two-row, five-column Herdr subagent grid with one row of at most two agents above a stable half-height orchestrator. Placement uses roughly 50 columns and 14 rows per pane, sending excess agents to named overflow tabs instead of repeatedly subdividing unreadable terminals. Tiny windows still permit unsplit singleton tabs.
- Preserve Team Lead grouping with dedicated team tabs, a bottom-half leader, and readable team overflow. Clean layouts reassess capacity at lifecycle boundaries without polling or recreating processes. Manual divider edits freeze the affected tab against further automatic splitting or migration; whole-window resize is no longer mistaken for a manual edit.
- Focus preservation, pane ownership, child lifetimes, cleanup, and manual tab names remain unchanged. Focused tests and isolated Herdr 0.9.5 inert-process acceptance cover geometry, migration, identity, and cleanup; attached-client presentation remains unverified. Load the change with a settled-only default-profile `/reload` or restart, not while subagents are active or retained.

## 2026-10-25: Standardize refreshable work-account AWS SSO setup

- Document named AWS CLI v2 SSO sessions as the supported work-account setup for the `bedrock` profile, preserving the existing account, role, and regions. Compatible clients can refresh short-lived credentials within the organization's sign-in session instead of relying on the older inline SSO configuration.
- Keep AWS configuration and token caches local, select the profile explicitly rather than changing the machine-wide default, and verify identity separately from model access. Organization session expiry and role permissions are unchanged.

## 2026-10-25: Resolve Git Bash for Windows Pi restarts

- `/pi --restart` now resolves Git Bash through the existing PowerShell `Get-GitBash` helper on Windows before refreshing runtime links. This avoids accidentally selecting WSL's `System32\\bash.exe`; non-Windows launch behavior is unchanged.

## 2026-10-25: Restart the current Pi session without updating

- `/pi --restart` refreshes the default profile's Pi runtime link, then requests a cooperative restart into a new Herdr tab using the version resolved from that link. It does not install packages. Outside Herdr, it reports that new-tab restart is unsupported and leaves the current process running. The command offers `--restart` in argument autocomplete; `/new-instance` behavior is unchanged.
- The replacement waits for bootstrap admission, then the original session exits through the existing cooperative safety checks. `/update` keeps its same-tab behavior. No live terminal restart was performed during implementation.

## 2026-10-25: Use merge-based Git pulls and explicit submodule updates

- Make merge-based pulls the shared default: fast-forward when possible and merge divergent history without rebasing existing commits. Stop automatically assigning rebase preferences to new tracking branches; explicit rebase commands remain available for unpublished work.
- Disable implicit submodule recursion so pulling the parent does not also update independent module checkouts. This avoids the recursive-rebase failure on committed submodule-pointer changes and preserves deliberate module branch selection.
- Remove existing branch-specific rebase overrides in the local dotfiles, homelab-infra, and Onclave checkouts so they inherit the shared policy. Other existing clones can retain local overrides and need separate review; this change does not pull, rewrite history, or publish commits.

## 2026-10-24: Delay co-op Zomboid utility shutoffs to 2–6 months

- Set water and electricity to their 2–6 month presets. Update the associated shutoff-day modifiers as well, since leaving the captured 14-day values would retain the earlier cutoff despite changing the presets.
- Select each utility's shutoff day separately within the installed game's 60–179 day range and retain those values across restarts. Timing follows the existing world's age; alarm decay, other gameplay settings, saves, and characters remain unchanged. No world reset is included.

## 2026-10-24: Allow co-op safehouses in non-residential buildings

- Enable `SafehouseAllowNonResidential` so players can claim eligible shops, warehouses, and other non-residential buildings. One owner can share a claim through the game's existing player invitations and member respawn controls; this does not automatically enroll every account.
- Preserve the existing safehouse access, fire, loot, and 144-hour inactivity rules, along with world and character progress. No mod or world reset is required.

## 2026-10-24: Announce co-op Zomboid player deaths

- Enable `AnnounceDeath` in the authoritative server configuration so player deaths produce a global chat message. Animal-death announcements remain disabled, and the existing world, characters, and other gameplay settings are preserved.

## 2026-10-24: Double co-op Zomboid book-reading speed again

- Reduce `MinutesPerPage` from 0.5 to 0.25 in the authoritative sandbox template, halving skill-book reading time again. XP multipliers, other gameplay settings, world saves, and characters remain unchanged.
- Apply through the existing targeted game deployment and normal save/stop/start lifecycle, without a world reset or game upgrade.

## 2026-10-23: Carry browser task context through follow-ups and honor timeout overrides

- Browser intent interpretation uses the active task and bounded recent conversation to distinguish continuation from a new, cancelled, or completed task. Reload acknowledgments and manual login-step completion can retain established scope without repeating the full request. Known private browser observations are excluded from interpretation context, and one-time approvals are not retained or renewed.
- Explicit browser `timeout_ms` values reach CDP operations as well as the overall call deadline, so a longer call can extend the normal 30-second command limit. Overrides remain per-call; request-policy, automated-review, and resource-check deadlines remain separate.
- Reload default Pi with no active or retained subagents, or restart it, to load these changes. No live browser interaction, login, commit, or publication is included.

## 2026-10-23: Avoid reviewing one approved browser navigation twice

- An explicit HTTP/HTTPS navigation previously received a policy decision, then its intercepted initial Document could require another review under the background 10-second deadline. The same approved navigation now carries a one-shot identity/target/frame/URL-bound dispatch lease, analogous to the existing file-navigation lease.
- Local request inspection, DNS classification, frame revalidation, native warning refusal, and the existing deadline remain in place. Changed projections or destinations, body-bearing requests, redirects, assets, and later documents do not inherit approval. There is no localhost-wide exception or reusable manual grant.
- New direct input still replaces independently interpreted browser task scope. A follow-up such as “done” does not authorize local assets; restating the active development task may still be needed for the full page flow. Reload default Pi with no active or retained subagents, or restart it, to load the repair. Focused synthetic checks and typecheck passed; no live browser or login was exercised for this change.

## 2026-10-23: Expose secret-safe browser request failure diagnostics

- Owned-browser interception previously swallowed all request-check exceptions into `BlockedByClient`, leaving startup and navigation cancellation without actionable evidence. Explicit navigation and intercepted failures now retain at most eight fixed-code diagnostics with the check stage and cancellation source, not URLs, query strings, bodies, credentials, or raw exception messages.
- Browser tool errors include recent diagnostics, and `browser_session` status exposes them in text and structured results even after tooling disconnects. Reload default Pi while no subagents are active or retained, then repeat the normal guarded operation and inspect status if failure happens asynchronously. Reload clears this in-memory history.
- Request policy still fails closed; deadlines, exact ownership checks, opaque/error-document refusal, TLS validation, and the explicit isolated-localhost exception are unchanged. Synthetic tests and typecheck passed; the live startup cause still needs the new diagnostics from the affected operation. No browser was restarted or navigated during this change.

## 2026-10-23: Normalize Windows browser process start-time identity

- Browser-session state serializes Windows process start times as JSON `/Date(milliseconds)/` values, while the live CIM adapter reports ISO timestamps with sub-millisecond precision. Exact string comparison falsely marked the same Brave process stale, disconnecting page operations despite matching PID, executable, profile, CDP port, and launch marker.
- Process identity now compares recognized date representations at millisecond precision, retaining the full tuple checks and rejecting unparseable mismatches. Reload or restart default Pi to activate the fix; no live browser operation was performed.

## 2026-10-23: Use native Herdr for same-server session communication

- Explicitly directed communication with independent sessions now uses native Herdr on the same connected server, including supported non-Pi CLI agents. Onclave remains the route for supported instances outside that server; owned delegation stays on `subagent` / `subagent_control`. Registration, service/vault tools, and terminal callbacks are unchanged.
- Herdr discovery distinguishes optional live names from agent types and exposes recognizable pane/tab/workspace context plus Pi session identity. Existing targeted actions resolve default Onclave IDs and unique short aliases to current local panes, without a registry or claiming registration. Ambiguous identities require disambiguation; missing local matches do not prove remote placement, and custom Onclave-ID overrides have no native mapping.
- Layout labels and lifecycle-result rendering now reflect native responses. Prompt submission and settled-state observation no longer claim a correlated answer or completed work. Guidance uses ordinary prompts, bounded waits, and terminal reads, preserving native busy/blocked/draft behavior rather than adding a messaging protocol.
- Reload default Pi with no active or retained subagents, or restart it, to activate wrapper and guidance changes. Offline checks do not establish real attached-client interaction. No publication or deployment is included.

## 2026-10-23: Make browser approvals and page interactions actionable

- Explicit browser approvals now separate human decision time from bounded automated checks. Allow once covers only the pending action, including cross-tool private exports; historical manual grants no longer authorize later actions. Fill retains post-secret validation without a second policy decision.
- Bounded snapshots expose uniquely targetable controls, visibility/disabled facts, separate text/control budgets, explicit truncation, and subtree focusing. Click/fill refuse ambiguous and disabled targets rather than silently choosing the first match. Bounded exact-frame scrolling reports actual movement and boundaries for a fresh snapshot.
- Attached Brave traffic remains normal, unintercepted page traffic. Pi-owned background-request prompts retain the 10-second deadline and can still expire closed. Neither mode is a network sandbox, and generated selectors can become stale after rerenders.
- Reload or restart Pi to load the tools. Synthetic checks do not establish live Office/SharePoint usability; no live browser run or publication is included.

## 2026-10-23: Preserve normal page traffic in operator-attached browsers

- Attached Brave sessions no longer intercept each page-generated network request. Office/SharePoint internal POSTs previously appeared as exports and produced repeated approval dialogs that expired while the operator was working.
- Explicit agent navigation, observations, clicks, fills, and credential resolution retain their policy checks, as do native browser warning checks. This deliberately removes network-stage transfer and redirect enforcement in attached browsers; it does not claim to distinguish harmless service requests from writes or disclosures. Pi-owned browsers retain request interception.
- The earlier end-of-run disconnect remains in place, but addressed only idle prompts, not the active-page problem. Reload existing Pi sessions to load the corrected behavior.

## 2026-10-23: Disconnect browser interception when a Pi run ends

- Default Pi now releases its CDP connection, request interception, and pending browser approvals when the agent run ends. SharePoint and Office background telemetry previously kept triggering short-lived damage-control dialogs in an otherwise idle session.
- Brave and its open tabs are preserved. The next browser operation reconnects through the existing policy checks; this does not grant background traffic policy approval or turn the tooling into a browser-wide network sandbox.

## 2026-10-23: Let quiet commits recover from read-only checks

- Default Pi's `/commit` mutation shell now treats a nonzero read-only Git check, such as `git diff --cached --quiet` finding differences, as a result returned to the reviewer instead of a terminal failure. The call ends at that point and the reviewer continues, matching the workflow's existing recovery rule. Previously such a check in a mutation chain aborted the whole run with no commits.
- The same shell refuses working-tree discards (`git restore` without `--staged`, `checkout`, `switch`, `clean`, and `reset --hard/--merge/--keep`) without running them, since the workflow never discards working contents. Actual staging, commit/hook, and publication failures remain terminal.
- Reload Pi while no subagents are active or retained to load the change.

## 2026-10-23: Preserve AWS credential-chain auth during default Pi compaction

- Default Pi's unified compaction now dispatches its summary through the model registry's request-time stream path. Bedrock Mantle routes using the AWS credential chain can therefore mint their normal request token even though registry authentication has no static API key. The selected model, provider, and AWS environment remain unchanged; no model fallback, fake key, or credential copying is introduced.
- Restart Pi or reload the default profile while settled to activate the extension change. Existing context is retained on a compaction failure; live AWS/Bedrock access and summary quality were not exercised.

## 2026-10-22: Make the co-op Zomboid configuration explicit

- The game deployment now owns complete server, sandbox, and spawn-region templates based on the existing world's configuration instead of patching selected fields into generated defaults. Credentials and private server identity remain in BWS; the old overlapping world-settings overrides are removed.
- The co-op settings show players on the map and allow player safehouse claims and safehouse respawning. Faster book reading remains enabled; XP, other gameplay choices, safehouse access rules, world saves, and character/account data are preserved. The trash-bin Delete All button stays disabled.
- Configuration changes use the existing targeted deployment and normal game save/stop/start lifecycle. This does not add world resets, game upgrades, router changes, or backup automation.

## 2026-10-22: Skip empty indexes without aborting quiet commits

- Default Pi's `/commit` now checks the target repository's staged index at execution time before a normal Git commit. An empty index is a successful skip, so an unnecessary clean-submodule commit attempt no longer blocks eligible parent changes.
- The guard preserves repository/global Git options, handles unborn repositories and compound shell calls, and leaves unstaged contents untouched. Nonempty commits still run normal hooks; actual staging, index, commit/hook, and publication failures remain terminal. No blanket exit-code suppression or extra staging is added.
- Real-Git regressions cover clean and unstaged-only submodules followed by parent commits, an unborn empty index followed by its first staged commit, and existing hook-failure behavior. Reload Pi while no subagents are active or retained to load the command-runner change. No operator commits or pushes were performed.

## 2026-10-22: Update Pi and restart eligible Herdr sessions

- Default Pi adds `/update`: install the latest stable Pi with pnpm, refresh its runtime links, then make one explicit pass across the connected Herdr server. Eligible sessions resume their exact saved conversations, cwd, and profile; peer results are reported before the invoking session restarts last. Supervised sessions retain their pane; existing sessions migrate to a replacement pane in the same tab. Outside Herdr, only that session is considered.
- Busy sessions, active prompts, queued messages, unsent editor text, active or retained subagents, unsaved sessions, and unsupported launchers are skipped. There is no background retry, Herdr update, or forced termination. Failed installation or link refresh prevents restarts.
- Default shell and ordinary Herdr launches now retain a small Node host around the real Pi process. Existing Herdr sessions can load compatibility support with `/reload`, without manually exiting or reopening a tab. Their replacement waits for the original process to exit before opening the conversation, then confirms its exact session and updated version. Sessions that have not loaded support remain skipped rather than receiving injected terminal commands. Pane/tab labels and naming ownership survive update restarts, while normal exits still retire plugin-owned panes. Legacy and explicit recovery mode are unchanged.
- Focused offline tests cover installation ordering, eligibility, connected-server scope, caller-last reporting, real fake-child replacement, compatibility admission and old-process exit ordering, same-tab migration, session/version confirmation, and shell argument forwarding. No live package update or operator-session restart was performed during implementation.

## 2026-10-20: Allow routine internal SSH host enrollment

- Inventory-managed hosts on the trusted LAN allow automatic enrollment and replacement of SSH host keys, limited to matching known-host entries. Host-key checking stays enabled; dedicated deployment-managed trust stores retain their own contracts.

## 2026-10-20: Show stable release lag in Pi's footer

- The default footer checks stable Pi and Herdr releases against the running Pi and connected Herdr server versions, using a four-hour active-profile cache. Current versions are grey; one stable release behind is muted yellow; further behind is muted red. Outdated labels link to the corresponding release notes.
- Herdr preview labels omit date/hash suffixes, for example `η v0.9.3-preview`; full versions remain available for release comparisons and links. Preview versions compare against subsequent stable releases. Checks run outside footer rendering and stop on session shutdown; nothing installs, restarts, or prompts automatically. Reload with no active or retained subagents, or restart Pi to load the change. Legacy remains unchanged.

## 2026-10-20: Sign in from Pi's missing-quota footer

- Default Pi's underlined `login needed` footer label starts Codex sign-in when clicked in fullscreen mode. `/usage login` provides the same action from the keyboard in either terminal mode; regular mode leaves mouse handling to the terminal.
- Sign-in skips the method menu using session-environment detection: browser login for local Windows/macOS and graphical Linux, device-code login for SSH/Mosh and headless Linux. Pi's native browser/device-code flow and active-profile credential storage are reused, then quota refreshes immediately. A configured, working default browser is not guaranteed by detection; the built-in `/login openai-codex` retains manual method selection. Cancellation closes the dialog, and duplicate clicks do not start competing logins. Native OpenAI authentication and selected model routing remain unchanged, so quota still requires the separate Codex grant. No Codex CLI or browser-cookie access is added; legacy remains untouched.
- Reload while idle with no active or retained subagents, or restart Pi, to load the change. Existing `/login openai-codex` followed by `/usage` remains available.

## 2026-10-20: Show the connected Herdr version in Pi's footer

- Default Pi now shows `η v<server-version>` before its existing `π` version when running inside Herdr. It reads the connected server, not the installed CLI, so older running servers remain distinguishable after an update.
- The bounded lookup runs once when the footer is installed, not during rendering. Outside Herdr or when status is unavailable, the segment is omitted. Reload while no subagents are active or retained, or restart Pi, to load it; legacy remains unchanged.

## 2026-10-18: Keep commit inspections from aborting the workflow

- Default Pi's `/commit` now separates ordinary read-only shell inspections from mutation calls instead of guessing from command text. Compound inspections and normal no-match results such as `git check-ignore` exit 1 return to the private agent for interpretation or correction rather than stopping the commit workflow.
- Failed staging, unstaging, ignore-file changes, commits/hooks, and publication still stop dependent work without undoing successful work. Failure diagnostics retain the full command instead of truncating the part most likely to explain the failure. Both shell tools retain the native executor and existing timeouts; the inspection tool is not a shell sandbox.
- Focused regressions cover compound inspection recovery through a real commit, complete failure commands, and existing mutation/hook failure handling. Reload while idle with no active or retained subagents, or restart Pi, to load the change. Legacy remains untouched.

## 2026-10-18: Keep empty vault lookups valid in Pi history

- Onclave's Pi adapter now serializes an unmatched YouTube video lookup as `null` instead of a text block with a missing value. The malformed block previously persisted in session history and caused subsequent OpenAI request preparation to fail, including after resuming the session.
- A regression test covers the empty lookup and its structured output contract. Restart Pi to load the adapter fix; existing affected history needs a separate targeted repair before resuming. Other lookup results and legacy configuration are unchanged.

## 2026-10-18: Refresh Webshare connections for transcript retries

- Onclave transcript fetching uses attempt-scoped Webshare proxy agents so rate-limit retries request a fresh connection instead of reusing a potentially rejected tunnel. Concurrent fetches do not share those agents; existing retry limits, backoff and request deadlines remain in place.
- Fresh connections allow the configured rotating proxy pool to select another exit IP, but do not guarantee a distinct IP or success when the pool is blocked. Credentials remain private and unchanged. The source change requires a published image and managed deployment before it affects the running service.

## 2026-10-18: Add an optional Playit game relay

- The game deployment can run the requested Playit agent as a persistent, digest-pinned container, with its key sourced privately from BWS. Host networking lets the agent forward configured tunnels to the existing game UDP ports without changing router rules or restarting the game.
- Playit tunnel allocation and local targets remain provider-side configuration; starting an authenticated agent alone does not establish a working player connection. Existing direct access, world settings and server credentials remain unchanged.

## 2026-10-17: Manage Zomboid sandbox and spawn choices

- The game deployment can enforce selected sandbox settings, built-in spawn towns and the PvP rule from BWS inventory. It patches only selected settings and restarts only the game when configuration differs, preserving other options and services.
- Normal redeployment never resets the world. An explicitly requested regeneration removes only the named multiplayer save, including characters and world progress, while retaining server configuration and account credentials. Starter kits affect new characters, including replacements after death.

## 2026-10-17: Separate portable repository IDs from native paths

- Default Pi now has shared repository-ID helpers alongside its platform-aware absolute-path comparison. IDs use forward-slash separators and `.` for the root; Windows tool inputs accept native separator spelling without changing POSIX literal backslashes, case, or path segments. Filesystem paths and shell-specific conversions remain separate.
- `/commit` uses that contract consistently for inventory, publication, ignore decisions, and result labels. This fixes Windows failures where `modules/onclave` did not match the native `modules\\onclave` inventory key. Captured branches, attached/detached eligibility, child-first publication, and stopping after an actual failed push are unchanged.
- Focused tests cover Windows/UNC and POSIX semantics on either host, plus multi-component child repository publication and ignore decisions with real temporary Git repositories. Reload while idle with no active or retained subagents, or restart Pi, to load the change. Legacy remains untouched.

## 2026-10-17: Enforce the managed Zomboid join password

- The homelab game deployment now loads the player join password from its own BWS runtime key, distinct from administrator, player-account and RCON credentials. Missing or empty join credentials stop deployment instead of removing the password.
- Ansible updates the password through Zomboid only when the persisted setting differs. The live change also saves the server configuration, without a restart or replacing other server options; password tasks and command responses are excluded from logs.

## 2026-10-17: Manage a Zomboid game stack on an existing Docker host

- Homelab infrastructure adds a targeted deployment for the Broccoli Project Zomboid server, authenticated Dozzle logs, and browser-based RCON administration on a separate existing Docker host. Deployment uses a dedicated Compose project and does not provision a VM or reuse the managed Apphost target.
- BWS owns host configuration and administration credentials. Game installation and world/configuration data persist separately; RCON stays inside the game network, while the two web interfaces use the host's existing Caddy HTTPS ingress. Only the game UDP ports are published directly. A player-facing hostname uses a public DNS-only A record and a managed LAN override, avoiding reliance on router NAT loopback; the public record must be updated if the WAN address changes.
- Existing services and deliberately stopped containers retain their lifecycle state. Caddy receives a bounded managed configuration block and graceful reload without replacing its single-file bind-mounted configuration. DNS certificate credentials are scoped to their respective sites, preserving the existing wildcard site's token rather than replacing it with a token for a different zone.

## 2026-10-17: Keep Codex quota authentication inside Pi

- Default Pi quota reporting now uses the active profile's existing `openai-codex` OAuth credential through Pi's authentication APIs. Pi handles storage and locked renewal across sessions; the reporter no longer depends on Codex CLI installation, its credential files, or an `app-server` subprocess. The prior CLI-only fix worked only on machines with that separate external sign-in.
- Machines without quota authorization use Pi's built-in `/login openai-codex` browser/device flow, then `/usage`. Existing Pi credentials need no new login. Native `openai` model authentication, selected models, quota caching, report contents, and legacy behavior are preserved; credentials are not copied between providers or machines.
- The footer now distinguishes missing login, renewal failure, rejected authorization, network/timeouts, and API failures, retaining explicitly stale quotas after failed refreshes. Reload while idle with no active or retained subagents, or restart Pi, to load the change.

## 2026-10-17: Prompt for SSH config reads

- Default Pi Damage Control now asks for approval to read `~/.ssh/config` instead of hard-blocking it. Writes, deletion, and reads of other SSH files remain blocked. Canonical target protections still apply to symlinks.
- Reload while idle with no active or retained subagents, or restart Pi, to load the change. Legacy behavior is unchanged.

## 2026-10-17: Install and update Herdr from the Bash installer

- `./install` now installs or updates Herdr on Linux, macOS, WSL, and Git Bash, matching `install.ps1`. It updates only when the installed version is older than the latest stable GitHub release (minimum 0.9.0 when GitHub is unreachable), using the official `herdr.dev` installers: `install.sh` on Unix (`~/.local/bin` unless `HERDR_INSTALL_DIR` is set) and `install.ps1` through PowerShell on Windows.
- Failure is soft: an existing Herdr keeps working and the step is reported as skipped. `install.ps1` behavior is unchanged.

## 2026-10-16: Add context-sensitive default Pi code review

- Added a `code-review` skill for reviews inside Pi with the selected model, including Codex subscription models, and assigned it to the existing independent reviewer role. Reviews investigate candidate defects, challenge their evidence, and distinguish confidence from practical importance and fix/defer/discuss recommendations.
- Priorities reflect the project's actual use, exposure, constraints, and accepted limitations. Confirmed minor issues can be deferred; relevant unconfirmed concerns can be discussed without becoming mandatory work. Generic best practices and hypothetical future scale do not create enterprise requirements for personal projects.
- Invoke `/skill:code-review` with the target and relevant context, or request an independent reviewer. Reload with no active or retained subagents, or restart Pi, to discover the skill and updated role. Existing model/effort defaults and repository-specific rules remain unchanged. No new command, Codex CLI integration, automatic fixes, mandatory check phase, or Claude/legacy changes.

## 2026-10-14: Report commit publication and Herdr status from actual results

- `/commit push` now publishes through a private Git tool and reports its actual command result instead of requiring an exact AI completion phrase. Existing child-first ordering, branch targets, failure handling, and push timeouts remain unchanged; no extra remote verification, approvals, or retries were added. The private task also identifies its local host and path conventions to avoid inventing WSL paths on Windows.
- Herdr lifecycle reporting now checks server response envelopes and exposes failed delivery through one non-blocking warning per session and a status that clears on recovery. The existing two attempts and quiet-subagent behavior remain unchanged. Preserve this local override when refreshing Herdr's generated integration.
- Reload while idle with no active or retained subagents, or restart Pi, to load these changes.

## 2026-10-14: Tolerate harmless Herdr naming response formatting

- Automatic tab naming now extracts title text alongside model reasoning, trims surrounding line breaks, and normalizes horizontal whitespace and case. Multiline explanations, unsupported content, punctuation, and oversized titles remain rejected.
- Naming instructions now state the same character and length limits as validation. Failed responses record bounded shape information, not conversation text or reasoning, to distinguish formatting failures.
- Pi model access, manual-title protection, timeouts, cooldown, and the failure cutoff are unchanged. Reload while idle with no active or retained subagents, or restart Pi, to load the change.

## 2026-10-14: Preserve commit outcomes for the next model turn

- `/commit`, F9, and F10 now persist final outcomes and full failure diagnostics in model context without triggering an automatic reply or recovery. The existing single displayed result and private runner remain unchanged.
- Corrects the prior completion change, which removed both redundant replies and next-turn visibility by using interface-only entries. Reload while idle or restart Pi to load the fix; previously displayed failures are not retroactively added to model context.

## 2026-10-13: Restore live Codex quotas without changing native model access

- Restored real subscription quota percentages to the default Pi footer and reset times, banked-reset counts and expirations, and credit balances to `/usage`. This replaces the local-cache-only workaround, which did not meet the request to restore subscription stats. Only reported quota windows are displayed; a missing five-hour window is no longer shown as an invented `0%`.
- Pi retains one native `openai` login and Sol 6.1 model access. Quotas use the operator-authorized existing, separate Codex CLI ChatGPT credential, not a shared OAuth grant or another Pi login. Native model authentication passed while the quota API rejected that credential; the Codex route could fetch quotas but rejected Sol 6.1. Codex owns renewal and persistence of its file-backed credential through its account API, without copying refresh tokens into Pi or changing the CLI's saved provider configuration.
- Restored shared five-minute quota caching and UI-only polling, with explicit stale/unavailable states on failure. Local cache history, Bedrock accounting, display-only report persistence, and legacy remain unchanged. Reports interrupted by immediate reload are discarded or completed once. Reload with no active or retained subagents, or restart Pi, to load the change.

## 2026-10-13: Complete default extension compatibility with Pi 1.2.0

- Herdr first-user tab naming now discriminates user and custom startup events before reading a prompt or consuming first-prompt state. Custom-triggered turns retain shared branch, delegation, and successor context. Updated event fixtures and added coverage for custom startup followed by a user prompt and branch context on custom runs.
- After the operator completed native OpenAI ChatGPT login, default startup was restored to `openai/gpt-6.1-sol` at low thinking. Pi 1.2.0 supports both native `openai` and the distinct legacy `openai-codex` route; the earlier temporary startup repair matched existing credentials, not a native-provider removal. Credentials were not copied or relabeled, and classifier routing, model-family behavior, safety policy, and legacy contents remain unchanged.
- Reload with no active or retained subagents, or restart Pi, to load the extension fix. Existing sessions retain their selected model until switched or restarted. Native/wrapped startup and a bounded native authenticated request were verified separately from offline event/model tests; interactive Herdr UX remains unverified and non-blocking.

## 2026-10-13: Restore Sol startup selection after Pi 1.2.0 upgrade

- Default startup and Sol 6.1's model-scope entry now use `openai-codex`, matching the installed Pi 1.2.0 runtime and the default profile's existing subscription login. The previous `openai` default could not match the authenticated model and new instances fell back to another provider. Model ID, low thinking default, other scope entries, credentials, and Anthropic billing warnings remain unchanged. This corrects startup selection only; existing sessions retain their selected model.

## 2026-10-13: Restore direct commit feedback and complete eligible groups

- `/commit` now reports results only through its session entry, without starting an extra main-agent turn. Private work uses Pi's standard animated loader above the editor with phase messages and cleanup on success, failure, or cancellation; ignore dialogs remain usable.
- Review guidance commits every eligible group, including tracked feedback records, and retains reasons for reviewer-selected exclusions. Ignore dialogs reject tracked modifications. Running time still depends on repository work and private model responses; the historical delay is not established by a successful UI correction.

## 2026-10-13: Focus tool-failure review history retrieval

- Tool-call analysis still reads all classification corrections, but searches and reads relevant prior incident reports instead of loading the entire analysis log before every review. Broader history is read when missing evidence could change the finding; durable records and explicitly requested exhaustive session reviews remain unchanged.

## 2026-10-13: Queue headless subagent follow-ups during busy turns

- Headless parent answers and waiting-state messages now explicitly queue as follow-ups when native Pi is still finishing its current turn. Registering a parent question no longer leads to an idle-only prompt rejection that fails the assignment.
- Idle follow-ups still start normally. Running-child steering, explicit redirects, question identity, and visible delivery remain unchanged. No new gate, retry loop, or timeout is added.

## 2026-10-13: Follow Pi upgrades in Herdr launches

- Herdr plugin setup now registers the stable default-profile dependency path instead of freezing a version-specific pnpm store entrypoint. New instances, branches, and hosted children resolve the linked package’s CLI on each launch. Refresh dependency links after a global Pi upgrade with `bash scripts/pi-deps-link-setup --profile default`, now recorded in root `AGENTS.md`; existing registrations need one setup refresh. Running sessions, explicit-entry registrations, preflight, and pane lifecycle remain unchanged.

## 2026-10-12: Discover system-wide Brave installs for Windows debugging shortcuts

- Windows Brave shortcut setup now finds per-user and system-wide installations, with `BRAVE_PATH` available as an override. The previous per-user-only default skipped this machine's Program Files installation.
- Desktop, Start Menu, and Quick Launch shortcuts, including True Launch Bar shortcuts stored in Quick Launch, retain their existing profile selections and unrelated arguments while adding explicit loopback CDP launch flags. Existing backup, idempotence, and browser-session ownership behavior is unchanged.

## 2026-10-11: Replace fragile test assertions with behavioral boundaries


[Showing lines 1-360 of 5191 (50.0KB limit). Use offset=361 to continue.]