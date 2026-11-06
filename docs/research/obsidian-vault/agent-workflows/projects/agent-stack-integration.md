---
status: research-synthesis
created: 2026-11-06
updated: 2026-11-06
source_session: 01a16436-7d63-73dd-8d73-acae2f6f5c85
---

# Integrating Pi, Herdr, Onclave, Hermes, and useful background work

## Purpose and status

Consolidate the recent vault changes, the IndyDevDan video discussion, and current
repository evidence into an integration discussion. This is not approval to build
every referenced system. The [coordinating plan](../../../../../.specs/agent-stack-integration/plan.md)
is draft pending selection of the first delivery.

Research date: 2026-11-06 UTC. Source baseline: dotfiles `ac12dbe1`. Repository
inspection was read-only; no live infrastructure was accessed or changed. Upstream
Pi Durable and Hermes observations below come from the preceding discussion's
source research, not a fresh verification of all upstream releases.

## Recent Git vault changes reviewed

The recent window is November 5-6, 2026. Reviewed the source notes, their capture,
indexes, and the merge delta; followed directly related older research, not every
historical topic in the vault.

| Commit | Addition | Meaning for integration |
| --- | --- | --- |
| `fb06b0d8` | [CLIProxyAPI account hub](cliproxyapi-account-hub.md) and [source capture](cliproxyapi-account-hub-source.md) | An unapproved auth/routing experiment. Affinity and cache TTL are different. Client protocol compatibility does not establish subscription-use permission. |
| `a58510cb` | [Agent-first homelab OS](../../homelab-os/index.md), [base research](../../homelab-os/base-os-research.md), [development lifecycle](../../homelab-os/proxmox-development.md) | A possible future substrate, not a selected OS or prerequisite for current applications. Hadron/Kairos and Flatcar remain candidates; Kubernetes is undecided; KubeVirt is not Firecracker. |
| `f4a6a4fe` | [Onclave deployment ownership](onclave-deployment-ownership.md) | Implemented image/deployment split. Product publishes images; infrastructure owns production Quadlets, configuration, persistent storage, and updates. |
| `ac12dbe1` | Merge and module-pin reconciliation | Carries the new research and implementation references; does not approve exploratory designs. |

Also read the uncommitted [Herdr sidebar note](../workflow-ideas/herdr-agent-sidebar-layout.md).
It preserves a native grouping requirement that installed APIs have not established.
Do not quietly substitute cosmetic workspace names, Git worktrees, or a Herdr build.
Its existing README/index changes and the note itself were preserved.

## Video references

| Video | Existing Onclave vault content ID | Coverage used here |
| --- | --- | --- |
| [10 Levels of Jev For Agentic Engineers](https://www.youtube.com/watch?v=_U-O5lYhJ7Q) | `d51ee54fefa64fbb9e7edbab0e2d484a` | Stored generated outline: binary decisions, multiple-choice classification, composite scores, confidence, routing, tool integration, compaction, single/multiple-file assessment, agent-directed use. Not a full independent transcript verification. |
| [My Jev Pi Durable Agent CURATES News: HYPE, FACT, or SIGNAL](https://www.youtube.com/watch?v=OLqP8jxJ0Wc) | `9d6c92c49dbe425b84846202f7750669` | Stored summary/outline and bounded search snippets about proactive news curation. |
| [Pi Durable PROACTIVE Agents: Jev Triggers My ON-CALL Pi Agent](https://www.youtube.com/watch?v=DNDYYHsypZg) | `eef39a43817c4c96a9caeb502deea485` | Stored summary/outline and opening transcript passage identifying upstream authors and the incident demo. |

All three callbacks reported full summary coverage but unavailable SponsorBlock
lookup. That does not establish absence of advertising or correctness of every
summary claim. Model confidence is not fact verification or authorization.

## What the components actually own

| Component | Current evidence | Useful role; limits |
| --- | --- | --- |
| Pi CLI + Herdr | Default profile runtime and visible subagent integration; linked Pi package reads `1.5.0` | Interactive engineering and supervised remote work. A retained terminal is not a checkpointed application. The earlier conversation's global `1.2.0` observation is stale. |
| Onclave communication | [Current product README](../../../../../modules/onclave/README.md), protocol v3 and supported Pi adapter | Signed inter-instance communication and service notifications. Same-server independent sessions use native Herdr; owned children use subagent controls. No Hermes adapter or webhook ingress is delivered. |
| Onclave vault | `modules/onclave/services/core/src/vault/{jobs,pipeline,durability,routes}.ts` | Content, retrieval, analysis jobs and completion callbacks. PostgreSQL job state and object storage already have recovery contracts. Do not add another engine merely because a video says durable. |
| Hermes | [Managed tuning](../../../../../modules/homelab-infra/docs/hermes-tuning.md), role and [operator PRD](../../../../../modules/homelab-infra/docs/hermes-operator-pilot-prd.md) | An assembled assistant with upstream memory, skills, scheduling and messaging. Its installed version/features and operator-pilot implementation were not live-verified. |
| Pi Durable | [Announcement](https://earendil.com/posts/pi-durable/), [package](https://github.com/earendil-works/pi/tree/main/packages/durable), [Cloudflare sample](https://github.com/earendil-works/pi-durable-cloudflare) | Official experimental application framework, not Dan's invention or a Pi CLI toggle. Persisted tasks, documents, inboxes and waits; host restarts/wakes it. Existing CLI extensions are not automatically portable. |
| Jev | `pi/profiles/default/extensions/jev.ts`, `lib/jev/`; [existing spec](../../../../../.specs/jev-workflow-experiments/plan.md) | Implemented on-demand typed classifier. Skill/recipes and live experiments remain deferred in the existing spec. No demonstrated live accuracy, billing or credential validity here. |
| Onboard | `C:/Projects/Personal/onboard`: README, `app/models/feed.py`, `feed_article.py`, `feed_cache.py` | Flask RSS/bookmark dashboard, scheduled feed refresh and processors. Both downloaded and cached articles pass through processors, so inserting paid inference there could repeat work. Existing dirty application changes must be preserved. |
| Hatchery | Root ownership rules; [Alchemy experiment](../../../../../modules/homelab-infra/docs/hatchery-alchemy-experiment.md) | Disposable-compute product boundary. Checkout is empty here, so no product contract was verified. The one-VM experiment is evidence of a specific prototype, not a production API or general ownership transfer. |
| homelab-infra | [Instructions](../../../../../modules/homelab-infra/AGENTS.md) and [Onclave deployment](../../../../../modules/homelab-infra/docs/onclave-deployment.md) | Resources, deployment, BWS/site bindings, networking and persistent-service lifecycle. Future app-platform ownership does not displace currently available tooling. |

Hermes remembers preferences and previous work; Pi Durable records execution
checkpoints. These are different capabilities. Current upstream Hermes cron docs
also describe receipt recovery, with interrupted executions paused for review.
Do not reduce that distinction to "Hermes has no recovery." Neither system makes
arbitrary external effects exactly-once.

## Related research and stale assumptions

- [Archived task architecture](agent-task-architecture.md) and
  [durable task dependencies](../workflow-ideas/durable-task-dependency-systems.md)
  discuss earlier local task registries. Their old paths and "current" descriptions
  are dated evidence, not active-default implementation truth. They are not the
  new upstream `pi-durable` package. Do not inspect or revive legacy Pi to adopt them.
- [Pipelines and policies](../workflow-ideas/pipelines-and-policies.md) supports
  explicit results/artifacts, but does not approve a new universal workflow engine.
- [Menos](menos.md), [knowledge compiler](../workflow-ideas/menos-knowledge-compiler.md)
  and [Markdown memory](../patterns/markdown-skills-memory.md) suggest curated
  research and memory. New integrations should consume current Onclave vault
  contracts rather than restore retired clients or implicit session ingestion.
- [Windmill](windmill-automation.md) is a candidate when several recurring jobs
  justify it. It is not a dependency of one Hermes routine.
- [Remote-platform PRD](../../../../../.specs/remote-agent-platform/PRD.md) assigns
  environment lifecycle and a private configuration service to Onclave. Current
  repository rules assign disposable-compute product work to Hatchery, live
  configuration to BWS, and deployment to homelab-infra. Those proposed overlaps
  need an explicit decision before building a control plane; do not revise the old
  PRD silently or treat it as implemented.

## Recommended integration shape, not a settled design

```text
Human
  +-- Pi / Herdr: interactive engineering and supervision
  +-- Hermes: recurring assistant routines and messaging
          |
          +-- supported application interfaces / explicit future adapters
                  +-- Onclave: communication, vault and analysis
                  +-- Jev: advisory classification of selected evidence
                  +-- Onboard: display of curated information

homelab-infra: deploy and configure the services above
Hatchery: optional disposable execution once its product contract is available
Pi Durable: optional runtime for a specific restart-sensitive agent application
```

The lines are proposed integrations, not a claim that a universal adapter exists.
Keep job state authoritative with its producer; a message acknowledgement is not
completion, and an Onboard view need not become another job database.

### Candidate first delivery: news relevance and a shortlist

Recommend public-feed curation as the first cross-component outcome, while remote
Pi readiness continues separately:

1. Select a small public feed set and operator interest rubric.
2. Classify/rank articles, retaining source links and explicit uncertainty.
3. Store reusable results outside page rendering and cache-read processors.
4. Expose a standard RSS/Atom shortlist if that satisfies Onboard without a new
   widget/API; otherwise specify the smallest enrichment projection.
5. Use Hermes scheduling if the deployed version and interfaces fit. A small
   scheduled application worker is the alternative, not an automatic second runtime.
6. Use Onclave for content needing its existing analysis/retrieval, not as a
   mandatory extra hop for every RSS item. Hermes access requires an actual adapter.

Jev provides typed answers, not generated explanations. Any displayed explanation
must be deterministic from supplied evidence/rubrics or explicitly sourced to a
separate generation step. Do not fabricate rationale from a score.

### Independent or later tracks

- Remote Herdr/Pi readiness: already handed to an independent tab; consume its
  actual results rather than duplicate deployment work here.
- Read-only incident triage: a separate next workflow, not automatic remediation.
- Durable execution: introduce only for the selected application's concrete
  checkpoint/wait/restart needs; do not replace existing Onclave vault recovery.
- Hatchery/OS experiments: use disposable compute for lab work, not a migration of
  household infrastructure or a dependency of curation. No base OS is selected.
- CLIProxyAPI: keep an opt-in auth experiment, not the shared credential foundation.
- Herdr native sidebar hierarchy: preserve the separate investigation and no-build
  requirement; do not make curation depend on an unshipped upstream feature.

These are recommendations for sequencing, not approved scope or acceptance gates.

## Correction: previous discussion capture did not retain the discussion

The earlier submission with content ID `1101c6f48daf4a948bef78f968a919c5` stored the
Pi Durable web article, not the supplied discussion synthesis. Current
`services/core/src/vault/routes.ts` consumes `transcript_text` only in its YouTube
branch; ordinary web ingest extracts the URL and disregards that text. Search
returned article passages, consistent with its callback title.

This Markdown note is the explicit discussion capture. If a searchable Onclave
copy is wanted, use a supported text upload or annotation contract and verify the
retained text. Current annotation creation stores Markdown with a parent content
ID; it does not itself demonstrate summary generation or search indexing. Do not
repeat a URL-plus-transcript submission as though it were a generic note API.

## Sources and evidence limits

- [Hermes upstream](https://github.com/NousResearch/hermes-agent),
  [memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory),
  [cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron).
- [Onclave deployment ownership](onclave-deployment-ownership.md) contains dated
  successful checks and validation limits; it is not blanket current live proof.
- Onboard source was inspected at `4a73fe1` plus existing uncommitted changes.
- Hatchery product source is unavailable; no submodule initialization was done.
- No live BWS, inference, cron, SSH, restart or deployment checks were run here.

## KISS recommendation

Choose one first outcome, preferably a useful public-news shortlist in Onboard.
Use current services and the smallest interchange format that achieves it. Keep
remote access, auth pooling, a new host OS, generic orchestration and durable-agent
framework adoption independent until the selected workflow actually needs them.
