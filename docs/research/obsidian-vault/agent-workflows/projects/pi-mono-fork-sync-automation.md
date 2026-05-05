---
status: research-note
source: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork
---

# pi-mono fork sync automation

## Why this matters

The local fork `ilude/pi-mono` should stay clean for PR branches while tracking the parent repository `badlogic/pi-mono`. Putting a scheduled GitHub Action into `.github/workflows/` on the fork's `main` would make `main` diverge from upstream, which defeats the clean-fork goal.

The better pattern is external automation: keep the fork clean and let an outside scheduler sync it.

## Current repo relationship

- Fork/origin: `git@github.com:ilude/pi-mono.git`
- Upstream/parent: `git@github.com:badlogic/pi-mono.git`
- Local remote added:

```bash
git remote add upstream git@github.com:badlogic/pi-mono.git
```

## Useful signals

- GitHub supports syncing forks from the web UI, GitHub CLI, and command-line Git. Source: [GitHub Docs: Syncing a fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork).
- GitHub CLI provides the concise remote operation:

```bash
gh repo sync ilude/pi-mono -b main
```

- Scheduled GitHub Actions are not a clean solution when their workflow file must live on the default branch. Source: [GitHub Actions events documentation](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#schedule).
- Infisical can inject secrets into Dockerized commands with `infisical run`. Sources: [Infisical Docker Compose integration](https://infisical.com/docs/integrations/platforms/docker-compose), [Infisical Docker entrypoint](https://infisical.com/docs/integrations/platforms/docker).
- Windmill supports self-hosted scheduled workflows and scripts via Docker-oriented deployment. Sources: [Windmill self-host docs](https://www.windmill.dev/docs/advanced/self_host), [Windmill scheduling docs](https://www.windmill.dev/docs/core_concepts/scheduling).

## Target architecture

```text
Windmill schedule
  -> fork-sync script/job
      -> Infisical runtime secret injection
          -> GitHub CLI
              -> gh repo sync ilude/pi-mono -b main
```

Secrets stay outside the repo:

- GitHub token with the minimum permission needed to sync/push the fork.
- Infisical machine identity credential for the Windmill worker/job environment.

## Candidate Windmill job

A minimal Bash job should be enough:

```bash
set -euo pipefail

infisical run --projectId "$INFISICAL_PROJECT_ID" -- \
  gh repo sync ilude/pi-mono -b main
```

If `gh repo sync` is too opaque for conflict handling, use explicit Git commands in a disposable checkout:

```bash
set -euo pipefail

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

infisical run --projectId "$INFISICAL_PROJECT_ID" -- bash -lc '
  git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/ilude/pi-mono.git" "$0/repo"
  cd "$0/repo"
  git remote add upstream https://github.com/badlogic/pi-mono.git
  git fetch upstream main
  git checkout main
  git merge --ff-only upstream/main
  git push origin main
' "$workdir"
```

Prefer `--ff-only` semantics. If the fork's `main` diverges, the job should fail and notify rather than create merge commits or overwrite work.

## Agent management model

Pi or another AI agent should be able to manage this automation by:

- editing the Windmill script definition or source-controlled job spec;
- triggering a manual run after changes;
- reading Windmill run logs;
- checking GitHub branch state;
- updating documentation when behavior changes.

The agent should not store GitHub tokens in files or print secrets in logs.

## Risks / reasons not to build yet

- Windmill is more infrastructure than a single GitHub Action or cron job.
- `gh repo sync` behavior should be tested against a non-critical fork first.
- Token scope must be minimized.
- Failure mode matters: conflict/divergence should alert, not force-push.

## KISS recommendation

Use **Windmill** for this automation because it keeps `ilude/pi-mono:main` clean while giving agents a manageable scheduled-job control plane. Implement only one job first: daily fast-forward sync from `badlogic/pi-mono:main` to `ilude/pi-mono:main`, with secrets pulled through Infisical at runtime.

## Related notes

- [[projects/windmill-automation]]
