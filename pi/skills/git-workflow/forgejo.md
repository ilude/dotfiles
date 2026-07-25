# Forgejo Repository Hosting

Use this reference for Forgejo repository creation, remotes, API tokens, push-to-create, `tea`, and provider-specific authentication. Use the main `git-workflow` skill for ordinary Git state and history operations.

## Boundary

| Need | Use |
| --- | --- |
| Git status, diff, stage, commit, branch, merge, or push | `git-workflow` |
| Forgejo repository creation, API tokens, push-to-create, `tea`, or provider configuration | This reference |
| SSH client/server configuration, keys, host verification, or authentication troubleshooting | `ssh` |
| Forgejo Actions workflows and runners | `forgejo-actions` |
| Forgejo service installation or configuration through Ansible | `ansible` |

## Core principle

Treat Forgejo repository administration as live infrastructure. Repository creation, token generation, push-to-create configuration, and private repository pushes can expose or mutate sensitive state. Use exact remotes, redact sensitive output, and require explicit authorization for live configuration changes.

## Repository workflow

1. Inspect local repository state without exposing secrets:
   - `git -C <repo> status --short --branch`
   - Use `git -C <repo> remote -v` only when host and path values are safe to print; otherwise summarize whether the expected remote exists.
2. Confirm the intended endpoint:
   - SSH remote: `git@<forgejo-host>:<owner>/<repo>.git`
   - API base: `https://<forgejo-host>/api/v1`
3. If the repository does not exist, choose one supported creation path:
   - Forgejo API: `POST /api/v1/user/repos` with a token that can create repositories.
   - Push-to-create: enable `[repository] ENABLE_PUSH_CREATE_USER=true` or `ENABLE_PUSH_CREATE_ORG=true`, then push with `-o repo.private=true` when needed.
   - Web UI or manual creation when credentials are unavailable.
4. Push private nested repositories with targeted commands:
   - `git -C values remote add origin <remote>`
   - `git -C values push -u origin main`
   - Never stage the nested private data from the public parent repository.

## API tokens and `tea`

- Prefer an existing operator-provided token with the required scope.
- With authorized server access, Forgejo can generate a token using `forgejo admin user generate-access-token --username <user> --scopes <scopes> --raw`.
- Never print token values. Store temporary tokens in mode `0600` files and remove them after use.
- Use `tea` in a disposable tooling context unless the project already manages it.
- Verify `tea` compatibility with the target Forgejo version.
- When `tea` authentication fails, test the token with `GET /api/v1/user` before falling back to the REST API.

## API quick reference

| Purpose | Endpoint |
| --- | --- |
| Current user check | `GET /api/v1/user` |
| Create repository for authenticated user | `POST /api/v1/user/repos` |
| Create token with basic authentication | `POST /api/v1/users/:username/tokens` |
| Swagger/OpenAPI | `/api/swagger`, `/swagger.v1.json` |

Typical private repository payload:

```json
{
  "name": "homelab-infra-values",
  "private": true,
  "auto_init": false
}
```

## System SSH integration

Use the `ssh` skill first for host-key, transport, key-selection, and ordinary public-key authentication failures.

When system sshd delegates key lookup to Forgejo through `AuthorizedKeysCommand`:

1. Inspect effective sshd configuration and identify both `AuthorizedKeysCommand` and `AuthorizedKeysCommandUser`.
2. Invoke the exact configured command with representative arguments as the configured user; capture its exit code and stderr.
3. Verify the Forgejo executable path, configuration path, file access, and installed/locked application state such as `INSTALL_LOCK`.
4. Change sshd or Forgejo configuration only after the direct command identifies the failing layer.

## Troubleshooting

| Symptom | Likely cause | Next check |
| --- | --- | --- |
| SSH host verification or public-key authentication failure | Client/server SSH state | Follow the `ssh` skill before changing Forgejo |
| `AuthorizedKeysCommand` fails when run directly | Forgejo binary, config, permissions, or installed state | Run the exact command as its configured service user and inspect stderr |
| Push-to-create is disabled | Forgejo default configuration | Use API creation or explicitly authorize the `app.ini` change |
| `access token does not exist` from `tea` | CLI login mismatch, endpoint mismatch, or token scope | Test `GET /api/v1/user`; use the REST API if needed |
| API `403` on repository creation | Token lacks repository-write scope or user permission | Check scopes and user permissions before broadening access |

## Safety rules

- Do not print tokens, private hostnames, private repository URLs, or private inventory unless explicitly requested.
- Do not enable push-to-create or change Forgejo configuration without explicit authorization.
- Do not infer owner or organization from a hostname alone.
- Keep public parent and private nested repository operations separate.
- Before pushing private values, verify the nested repository, remote, commit state, and upstream branch.

## Anti-patterns

- Guessing a repository owner or path from DNS.
- Printing generated access tokens or complete API responses containing secrets.
- Creating public repositories by default for private values or state.
- Treating a nested private repository as an ordinary directory of its public parent.
- Reconfiguring SSH or Forgejo repeatedly without isolating the failing command.
- Enabling push-to-create globally when a one-time API creation is sufficient.
