---
name: forgejo-git
description: "Forgejo remotes, private values repos, API tokens, repository creation, push-to-create, tea, or SSH/API troubleshooting. Not for generic commits; use git-workflow."
---

# Forgejo Git Workflow

## Boundary

| Need | Use |
| --- | --- |
| Generic Git status/diff/stage/commit/branch work | `git-workflow` |
| Forgejo repo creation, API/SSH auth, push-to-create, `tea`, Forgejo remote setup | `forgejo-git` |
| Forgejo service install/configuration via Ansible | `ansible` |
| Forgejo API endpoint design | `api-design` |

## Core principle

Treat Forgejo as live infrastructure. Repository creation, token generation, push-to-create config, and private repo pushes can expose or mutate sensitive state. Prefer exact remotes, redacted output, and explicit confirmation for live changes.

## Practical workflow

1. Inspect local repo state without exposing secrets:
   - `git -C <repo> status --short --branch`
   - `git -C <repo> remote -v` only if host/path are safe to print; otherwise summarize presence.
2. Determine the intended remote shape:
   - SSH: `git@<forgejo-host>:<owner>/<repo>.git`
   - HTTPS/API base: `https://<forgejo-host>/api/v1`
3. If the repo does not exist, choose one supported creation path:
   - Forgejo API: `POST /api/v1/user/repos` with a token that can write repositories.
   - Push-to-create: enable `[repository] ENABLE_PUSH_CREATE_USER=true` or `ENABLE_PUSH_CREATE_ORG=true`, then push with `-o repo.private=true` when needed.
   - Web UI/manual creation if credentials/token are unavailable.
4. For API tokens:
   - Prefer existing operator-provided tokens when available.
   - If using server access, Forgejo supports `forgejo admin user generate-access-token --username <user> --scopes <scopes> --raw`.
   - Never print token values; store only in temp files with `0600` permissions and cleanup traps.
5. For `tea`:
   - Install/use in a disposable tooling context unless the project already vendors it.
   - Verify compatibility with the target Forgejo version before depending on it.
   - Fall back to REST API when `tea` token/login handling fails.
6. Push private nested repos with targeted commands:
   - `git -C values remote add origin <remote>`
   - `git -C values push -u origin main`
   - Do not run broad parent-repo staging commands that might include private nested data.

## Forgejo API quick reference

| Purpose | Endpoint |
| --- | --- |
| Current user check | `GET /api/v1/user` |
| Create repo for authenticated user | `POST /api/v1/user/repos` |
| Create token with basic auth | `POST /api/v1/users/:username/tokens` |
| Swagger/OpenAPI | `/api/swagger`, `/swagger.v1.json` |

Typical private repo payload:

```json
{
  "name": "homelab-infra-values",
  "private": true,
  "auto_init": false
}
```

## Troubleshooting

| Symptom | Likely cause | Next check |
| --- | --- | --- |
| `Host key verification failed` | SSH known_hosts missing | Add host key with `ssh-keyscan -H <host>` after verifying host intent |
| `Push to create is not enabled` | Forgejo default disables push-to-create | Use API create or enable push-to-create in `app.ini` |
| `access token does not exist` from `tea` | CLI token/login mismatch or scope issue | Test token with `GET /api/v1/user`; use REST API directly if needed |
| `Permission denied (publickey,password)` | Missing deploy/user SSH key in tool environment | Check SSH mount/agent/key policy before retrying |
| API `403` on repo create | Token lacks repo-write scope or user cannot create repos | Check scopes/user permissions; try `all` only with explicit approval |

## Safety rules

- Do not print tokens, private hostnames, private repo URLs, or private inventory unless explicitly requested.
- Do not enable push-to-create or change Forgejo config without explicit approval.
- Do not assume owner/org from hostname; ask or infer only from confirmed private values/user context.
- For nested private repos, keep parent public repo and child private repo Git operations separate.
- Before pushing private values, check for a nested repo (`values/.git`), remote presence, commit status, and upstream tracking.

## Anti-patterns

- Guessing a Forgejo repo owner/path from DNS alone.
- Printing generated access tokens or full API responses containing secrets.
- Creating public repos by default for private values/state.
- Treating `values/` as a normal subdirectory of the public repo.
- Enabling push-to-create globally when a one-time API repo creation is enough.
