---
status: research-note
source: https://www.windmill.dev/docs/advanced/self_host
---

# Windmill for local scheduled automation

## Why this matters

Some automations should run on a schedule without dirtying the target repository. A self-hosted automation runner can hold schedules, logs, retry behavior, and secrets integration outside the repos it manages.

For agent workflows, this gives Pi or another AI agent a stable control surface: create scripts, inspect runs, trigger jobs, and update automation without embedding GitHub Actions files into every target repo.

## Useful signals

- **GitHub scheduled workflows are default-branch bound.** GitHub documents that many workflow events only trigger when the workflow file exists on the repository default branch, which makes in-fork scheduled automation a poor fit when `main` should stay identical to upstream. Source: [GitHub Actions events documentation](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#schedule).
- **GitHub already supports fork sync primitives.** Forks can be synced from the web UI, `gh repo sync`, or normal Git fetch/merge flows. Source: [GitHub Docs: Syncing a fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork).
- **Infisical supports Docker/Compose secret injection.** Services can receive machine identity or service-token based credentials and run commands with `infisical run`. Sources: [Infisical Docker Compose integration](https://infisical.com/docs/integrations/platforms/docker-compose), [Infisical Docker entrypoint](https://infisical.com/docs/integrations/platforms/docker).
- **Windmill is actively maintained and fits the control-plane role.** The project describes itself as an open-source platform for scripts, workflows, jobs, webhooks, and UIs, with Docker Compose self-hosting support. Sources: [Windmill self-host docs](https://www.windmill.dev/docs/advanced/self_host), [Windmill GitHub repository](https://github.com/windmill-labs/windmill), [Windmill schedules docs](https://www.windmill.dev/docs/core_concepts/scheduling).

## Compared options

### Ofelia

- Lightweight Docker-native scheduler.
- Best for simple cron jobs defined through Compose labels/config.
- Least platform overhead.
- Weaker fit if agents should manage jobs via a rich API/UI.

Source: [mcuadros/ofelia](https://github.com/mcuadros/ofelia).

### Cronicle

- Web UI, logs, manual job execution, distributed task scheduling.
- Good middle ground for a homelab cron dashboard.
- More scheduler than automation platform.

Source: [jhuckaby/Cronicle](https://github.com/jhuckaby/Cronicle).

### Windmill

- Full self-hosted workflow automation platform.
- Supports scheduled jobs, scripts, workflows, webhooks, UI, and API-oriented management.
- More operational weight than Ofelia, but better long-term fit if AI agents will create, inspect, and evolve automations.

Source: [Windmill docs](https://www.windmill.dev/docs/advanced/self_host).

## Possible Pi fit

Windmill can become the local automation substrate for Pi-managed operational tasks:

- scheduled repository maintenance;
- local backup/sync jobs;
- health checks;
- agent-triggered runbooks;
- jobs that need secret injection via Infisical;
- lightweight internal tools surfaced through Windmill UIs/webhooks.

Pi should not become the scheduler. Pi should author, review, and operate small Windmill jobs.

## Risks / reasons not to build yet

- Windmill is heavier than a single cron container.
- It adds state, upgrades, user management, and operational surface area.
- For one daily fork sync, Ofelia is simpler.
- The platform becomes worthwhile only if multiple automations accumulate or agent-managed workflows become recurring.

## KISS recommendation

Use **Windmill as the preferred local automation control plane** when the goal is agent-manageable scheduled workflows with logs, UI, and API access. Start with one narrow job: pi-mono fork sync. Keep job scripts small, auditable, and secret-free; pull secrets at runtime through Infisical.

## Related notes

- projects/pi-mono-fork-sync-automation.md
