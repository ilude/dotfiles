---
name: ssh
description: "SSH client/server configuration and troubleshooting: ssh, sshd, keys, agents, known_hosts, authorized_keys, AuthorizedKeysCommand, ProxyJump, authentication, or host-key verification. Not for Git operations; use git-workflow."
---

# SSH Configuration and Troubleshooting

## Boundary

| Need | Use |
| --- | --- |
| SSH transport, authentication, keys, agents, host verification, sshd, or tunnels | `ssh` |
| Git remotes, commits, branches, repository hosting, or provider APIs | `git-workflow` |
| Forgejo provider configuration after SSH transport is isolated | `git-workflow` and its `forgejo.md` reference |
| SSH transport settings owned by an Ansible inventory or role | `ansible` |
| SSH mounts in containers or devcontainers | `docker` |
| Archiving encrypted private material | `private-store` |

## Core principle

Identify the first failing SSH layer before changing configuration. Separate name resolution, network reachability, host verification, client configuration, authentication, session startup, and application behavior. Never weaken host verification or broaden key access as a diagnostic shortcut.

## Diagnostic workflow

1. Record the exact host alias, port, user, client environment, and failure text without exposing private key material.
2. Inspect effective client configuration:

```bash
ssh -G <host>
```

3. Run one bounded non-interactive diagnostic and inspect where negotiation stops:

```bash
ssh -vvv -o BatchMode=yes <host>
```

4. Classify the first failure:
   - DNS or connection: hostname, route, port, firewall, or listener.
   - Host verification: changed or missing host key.
   - Authentication: wrong user, identity, agent, algorithm, or server authorization.
   - Session startup: shell, command restriction, account policy, or remote environment.
   - Application protocol: SSH succeeded; diagnose the application separately.
5. Test one hypothesis at a time. Do not combine client, server, and application changes in one retry.

## Client identity and agent checks

- Use `ssh -G <host>` to confirm the effective `hostname`, `user`, `port`, `identityfile`, `identitiesonly`, and proxy settings.
- Use `ssh-add -l` to list agent fingerprints without printing private keys.
- Test an intended identity explicitly when policy permits:

```bash
ssh -o IdentitiesOnly=yes -i <private-key-path> <user>@<host>
```

- Follow repository-specific personal/work key priority rules instead of inventing fallback identities.
- Do not read, print, copy, or transmit private key contents. Inspect public keys or fingerprints when identity confirmation is required.

## Host-key verification

A host-key mismatch is an identity failure, not a connectivity inconvenience.

1. Inspect existing entries with `ssh-keygen -F <host>`.
2. Obtain the expected fingerprint from a trusted source such as the host console, provisioning output, or another authenticated channel.
3. Compare fingerprints before changing `known_hosts`.
4. Remove an obsolete entry with `ssh-keygen -R <host>` only after the replacement is verified.
5. Treat `ssh-keyscan` output as a key candidate, not proof of host identity.

Never use `StrictHostKeyChecking=no` as a routine fix.

## Server-side checks

When authorized to inspect the server:

- Use `sshd -T` to inspect effective daemon configuration rather than relying on one config file.
- Confirm the listener address and port before changing firewall or client settings.
- Inspect authentication logs for the exact failed user and attempt.
- On POSIX OpenSSH, check restrictive ownership and permissions for the account, `.ssh`, private keys, and `authorized_keys`; account for platform-specific ACL behavior on Windows.
- Confirm that account shells, forced commands, and login restrictions permit the intended session type.

## `AuthorizedKeysCommand`

When sshd delegates key lookup to an external command:

1. Read the effective `AuthorizedKeysCommand` and `AuthorizedKeysCommandUser` from `sshd -T`.
2. Resolve placeholders using representative values for the failing login.
3. Invoke the exact command as the configured user with the same relevant environment.
4. Capture exit status and stderr.
5. Verify executable paths, configuration paths, permissions, dependencies, and application readiness.
6. Edit sshd or the backing application only after the direct invocation identifies the failing layer.

If SSH transport works and the external command fails inside Forgejo, continue with `git-workflow/forgejo.md`.

## Common failure map

| Symptom | First checks |
| --- | --- |
| `Connection timed out` | Route, firewall, address, port, listener |
| `Connection refused` | Correct host/port, sshd running and listening |
| `Host key verification failed` | Existing entry, expected fingerprint, hostname aliases |
| `Too many authentication failures` | Agent identities, `IdentitiesOnly=yes`, intended key |
| `Permission denied (publickey)` | Effective user/key, server logs, authorization source, file access |
| Authentication succeeds but command fails | Forced command, shell, environment, application protocol |

## Safety rules

- Never display private key contents or include them in logs, prompts, or command-line values.
- Do not replace host keys without an independently verified fingerprint.
- Do not alter server authentication policy or add keys without authorization.
- Keep diagnostics bounded; avoid repeated password or key attempts that can trigger lockout controls.
- Prefer exact host aliases and explicit users over changing global SSH defaults.

## Anti-patterns

- Deleting `known_hosts` entries before verifying the replacement host.
- Treating every Git-over-SSH failure as a Git problem.
- Changing both client and server configuration before reproducing the first failure.
- Reading private key files to determine which identity they represent.
- Assuming the configured sshd file is the effective configuration.
- Debugging a failed `AuthorizedKeysCommand` through repeated service configuration changes instead of invoking it directly.
