---
created: 2026-09-06
status: paused
completed: null
---

# Adaptive web-fetch gateway

## Scope and current authority

The requested outcome is a homelab fetch gateway with ordinary HTTP, browser
retrieval, SQLite route learning and default Pi integration. Preserve private/local
fetching, public Jina fallback, output bounds, cancellation and annotation-only Luna.
The user also requested gateway circuit/curl recovery. Paywall/archive retrieval is
excluded. Legacy Pi, both SearXNG instances and concurrent Damage Control work stay
unchanged. No commits or pushes are authorized.

Whole-plan implementation/deployment was approved, then paused after scope churn.
The latest request authorizes cleanup of the extra launcher, bespoke publication
workflow and task-owned leftovers. Do not interpret cleanup as an instruction to
resume deployment. No gateway has been deployed.

## Ownership and retained implementation

Paths are relative to the dotfiles root:

- `modules/homelab-infra/services/web-fetch-gateway/`: Node 24/TypeScript gateway,
  direct/Trawl/Jina adapters, extraction/quality, capacity and SQLite learning.
- `modules/homelab-infra/infra/ansible/roles/web_fetch_onramp/` and matching playbook:
  rootless deployment, container-only browser guard, Caddy and state integration.
- `pi/profiles/default/extensions/web-tools/`: gateway client, circuit, local curl
  transport, existing extraction and final Luna screening. No cross-repo imports.
- Operational contract: module `docs/web-fetch-gateway.md` and default profile
  `docs/web-tools.md`. Read owning AGENTS.md and inspect current changes on resume.

Planning and Pi implementation profile: `pi/profiles/default`. Infrastructure tests
have no Pi-profile dependency. Preserve all unrelated changes in each repository.

## Decisions and evidence

- Sequential retrieval, one browser. Hedging was considered, not implemented.
- Browser HTTP abort does not imply cancellation. Retain the lease until observed
  idle; quarantine on uncertain cleanup. Owned tests verified lease retention,
  blocked competing acquisition, release and subsequent public JS retrieval.
- Container-only firewall blocks private/reserved IPv4 and new IPv6. Drop NET_ADMIN
  after setup, not all ordinary Podman capabilities: dropping all made Firefox hang.
  Owned direct/redirect/subrequest/mapped-loopback tests had zero private fixture hits.
- Historical preflight results remain in [preflight.md](preflight.md). Raw trial
  files are removed during cleanup; those paths are historical, not runnable inputs.
- Core gateway: 67 tests plus typecheck/build passed on Windows and pinned Linux
  Node 24 before cleanup. Pi: 35 focused tests passed before removal of launcher
  tests; full default typecheck passed after fixing gateway test typing.
- One `WEB_FETCH_GATEWAY_CLIENT` BWS record was created and read back. It is retained
  for service authentication; no other BWS record was changed. No local locator or
  credential launcher is needed. Pi uses its existing process-environment settings.
- The operator subsequently approved using the latest Trawl image despite its age.
  Registry verification resolved `latest` to the already-tested 1.5.0 digest:
  `sha256:9cf6668dc5e7160d739991ca1edfe308c48638696571d9413a18399696586698`.
  This is a one-time exception for that Trawl digest, not a general policy change.
  The deployment age check still needs to encode that narrowly scoped approval;
  Node and future image updates retain their existing holds.

## Cleanup disposition

Removed the separate Pi launcher and its tests, archive builder/build playbook,
manifest-release machinery, partial local archive/locator and redundant implementation
note. Stopped the publication tooling container; the remote builder was no longer
running. Removed its remote staging and task-owned derived image tags without force
or a global prune. Keep upstream image caches and unrelated containers untouched.

The retained deployment role now accepts two already-built local image IDs instead
of a private archive release. It checks their base labels and the normal upstream
image ages before changing runtime paths. Dockerfiles record those base labels.
This is a smaller deployment contract, not a completed or newly deployed service.

## Remaining work if implementation is resumed

- [x] **T1 — Core acquisition and routing:** implemented under the gateway package;
  prior unit/Linux evidence above. Do not repeat browser candidate research.
- [x] **T2 — Pi client and recovery:** implemented in default, preserving legacy.
- [ ] **T3 — Finish deployment wiring:** use the existing role and locally built
  images, without restoring a launcher or archive-publication subsystem. Complete
  scoped BWS image settings and site configuration. Verify only changed contracts.
- [ ] **T4 — Deploy and verify:** depends on T3, resumed deployment authority and
  image eligibility. Verify HTTPS, real default Pi/Luna use and route learning after
  restart. Do not change unrelated services.
- [ ] **T5 — Finish:** after T4, run the finite gateway/default Pi checks and one final
  infrastructure `just validate`. Correct docs, set an actual completion date and
  archive the whole spec directory only when the requested implementation is complete.

Cleanup does not satisfy T3–T5. Do not add new controllers, command surfaces,
benchmark suites or ordinary-work scheduling to complete them.
