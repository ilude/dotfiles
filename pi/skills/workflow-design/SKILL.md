---
name: workflow-design
description: "Activate when improving repo developer/operator command UX, task runners, justfiles, Makefiles, package scripts, shell scripts, deployment commands, workflow docs, or command-surface consolidation."
---

# Workflow Design

Use this skill when designing, reviewing, or refactoring a repository's developer/operator command UX.

## Goal

Create a minimal, obvious, convention-over-configuration workflow where developers and operators use one primary command interface and do not need to guess which Make targets, just recipes, package scripts, shell scripts, CI jobs, or ad hoc commands to run.

## Core Principles

### 1. One public interface

- Prefer `just` unless the project already has a strong standard.
- Public developer/operator workflows should be exposed through the primary task runner.
- Scripts may exist, but should be treated as implementation details.
- Preserve bootstrap/install entrypoints when they are needed to install the task runner or support platform-specific setup.
- Preserve CI behavior intentionally: migrate CI to the primary interface or document why CI remains an exception.

### 2. Minimal command surface

Prefer short, obvious verbs:

- `up`
- `down`
- `clean`
- `test`
- `lint`
- `plan`
- `deploy`
- `status`
- `logs`

Avoid redundant aliases, verbose two-word commands when one word is clear, and implementation names such as `terraform`, `helm`, `kubectl`, `flyway`, or `ansible` unless they are truly diagnostic/debug commands.

### 3. Convention over configuration

- Config files should contain identity facts and intentional exceptions only.
- Derive conventional names in one shared loader/resolver.
- Do not require users or scripts to manually pass around derived values.
- All wrappers, renderers, and deployers should load config through the same resolver.
- Avoid broad override knobs unless there is a real current need.

### 4. No surprising side effects

- Command names must make side effects clear.
- `plan` must be read-only.
- `deploy` may mutate.
- `clean` may delete local state, but help text must say so plainly.
- Do not add confirmation gates unless required by existing safety policy or demonstrated need.
- Do not add fallback magic. If required config, tooling, or resources are missing, fail clearly.

### 5. Fail closed, not clever

- Missing env file: fail with known envs.
- Disabled env: fail before external commands.
- Missing values/config file: fail.
- Missing required tool: fail with install hint.
- Wrong cluster/context/namespace for known envs: fail before mutation.
- Never silently use dev values for staging/prod.
- Never silently skip important plan/diff steps that setup should provide.

### 6. Containers own runtime behavior where practical

- If scripts are only needed inside runtime/deployment, prefer baking them into purpose-built images.
- Images should include standard entrypoints, flags, and config conventions.
- Local task runners should orchestrate, not duplicate runtime behavior.
- Keep local wrapper scripts thin.

## Workflow

### 1. Inventory current command surfaces

List existing command surfaces:

- `justfile`
- `Makefile`
- package scripts
- shell scripts
- CI jobs
- docs commands
- deployment/operator scripts

Classify each command as one of:

- public UX
- internal implementation
- CI-only
- diagnostic/debug
- obsolete/duplicate

Identify duplicated, conflicting, or undocumented workflows.

### 2. Design the target public surface

Keep only commands a developer/operator should actually type. Prefer a small table like:

```bash
just up
just down
just clean
just lint
just test
just plan <env>
just deploy <env>
just status <env>
just logs
just logs <env>
just logs <env> <app>
```

Each public command should have a short help string in the task runner when supported.

### 3. Centralize config resolution

Create one resolver/loader when config-derived values are repeated. Example:

```text
scripts/<domain>/env-lib.sh
```

Env/config files should define identity facts and intentional exceptions only:

```env
ENV=dev
NAMESPACE=...
KUBE_CONTEXT=...
APPS="..."
DB_INSTANCE=...
```

Derived values belong in the resolver:

```bash
DB_SECRET_NAME="${DB_INSTANCE}-credentials"
EVIDENCE_ROOT=".specs/${ENV}-deploy/evidence"
VALUES_DIR="deploy/values/${ENV}"
```

All renderers, deployers, and wrappers should accept `<env>` and load config themselves. Do not rely on callers sourcing env correctly.

### 4. Simplify public docs

- README normal workflow docs should show only the primary task-runner commands.
- Remove direct shell script, Make, package-manager, or implementation-tool commands from normal user docs.
- Keep advanced implementation docs only when genuinely useful, and label them as internal/diagnostic.
- Prefer one concise command table over long prose.

### 5. Validate

Run validation proportional to the change:

- parser/static checks for scripts
- primary `lint`
- primary `test`
- dry-run/plan commands
- docs search for obsolete public command surfaces
- resolver output compared with rendered/generated artifacts when applicable

Do not claim behavior is verified unless the relevant command or code path was actually run.

## Success Criteria

- README normal workflow section references only the primary task runner.
- `just --list` or equivalent shows the intended public command surface.
- Each public command has a short, accurate help string.
- Old public commands are removed, delegated to the new interface, or clearly marked internal.
- Config-derived values come from one shared resolver.
- `plan` is read-only.
- Mutation commands fail before external mutation when env/config/context is invalid.
- CI/bootstrap exceptions are preserved intentionally and documented when they remain outside the primary interface.

## Output Expectations

When reporting results, include:

1. The chosen primary interface and why.
2. The final public command table.
3. Any intentional exceptions, especially CI or bootstrap.
4. Validation evidence: exact commands run and outcomes.
