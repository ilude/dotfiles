# GitLab CLI (glab) Workflow

Guidelines for using GitLab CLI (glab) across multiple GitLab instances.

## Command Compatibility Gate

Treat the installed `glab` help as the authority. CLI examples from memory, another tool, or another `glab` version are not evidence that a flag is supported.

Before the first use of each subcommand path in a session:

1. Run `glab <subcommand> --help` with a short timeout.
2. Use only flags shown by that installed help.
3. Verify the repository and host target before mutation.
4. For a SHA-guarded mutation, obtain and use the full 40-character source SHA.

If local help hangs or fails, do not guess syntax. Diagnose the executable first or use a previously verified command surface. For machine-readable GitLab state, prefer a bounded `glab api` request rather than assuming a porcelain subcommand supports `--output`, `--json`, or equivalent flags.

### Failure handling

| Failure | Required response |
| --- | --- |
| Unknown flag or command | Read that exact subcommand's installed help; do not substitute a guessed flag. |
| SHA mismatch | Fetch current remote state and compare the full source SHA before deciding whether to retry. |
| Timeout during a mutation | Query remote state first; the mutation may have succeeded. Never repeat it blindly. |
| Timeout during a read | Check connectivity and use one bounded alternate query; do not issue equivalent retries. |
| Server conflict | Inspect MR, pipeline, branch, and approval state before another mutation. |

Do not combine MR creation, pipeline interpretation, and merge into one unverified command chain. Confirm the result of each mutation before proceeding.

## Critical: Multiple Instance Management

**MUST always use explicit `--hostname` flag** when multiple GitLab instances are configured.

```bash
# Good - explicit hostname
glab api version --hostname gitlab.example.com
glab project view myproject --hostname gitlab.example.com

# Bad - ambiguous
glab api version
glab project view myproject
```

## Authentication

```bash
# Check authentication status
glab auth status

# Add GitLab instance
glab auth login --hostname gitlab.example.com

# Switch between instances
glab auth switch
```

### Token Requirements

Required scopes for typical work:
- `api` - Full API access
- `read_repository` / `write_repository` - Repository access
- `read_registry` / `write_registry` - Container registry access

### Targeting Specific Instances

1. **Explicit flag (RECOMMENDED):** `--hostname gitlab.example.com`
2. **Set default:** `glab config set host gitlab.example.com`
3. **Interactive:** `glab auth switch`

**MUST use method 1 in scripts and automation.**

## Branches and External Artifacts

- Name issue branches with the issue number when there is one, for example `123-fix-login-timeout` or `issue-123-fix-login-timeout` if the project uses that convention.
- Match the project's existing branch prefix and slug style when it is visible.
- Do not mention local tooling, internal workflow details, or provenance in issues, merge requests, commit messages intended for the project, or other external project artifacts unless the user explicitly requests it.

## Common Operations

```bash
# CI Pipeline
glab ci view --hostname <hostname>
glab ci trace <job-id> --hostname <hostname>
glab ci list --hostname <hostname> -R project/path

# Projects
glab project view project/path --hostname <hostname>
glab project list --hostname <hostname>
glab project create project/path --hostname <hostname>

# CI/CD Variables
glab variable list --hostname <hostname> -R project/path
glab variable export --hostname <hostname> -R project/path
glab variable set MY_VAR "value" --hostname <hostname> -R project/path

# API Access
glab api version --hostname <hostname>
glab api projects/project%2Fpath --hostname <hostname>
```

## Validation Before Mutating Operations

**MUST validate target instance and repository** before:
- Creating/deleting projects
- Pushing code
- Modifying CI/CD variables
- Creating or merging issues/MRs
- Retrying pipelines or jobs

```
This will create the project on gitlab.example.com:
  glab project create myproject --hostname gitlab.example.com

Proceeding...
```

## Verification Commands

```bash
# Check executable resolution before diagnosing version or startup problems
command -V glab

# Check default host
glab config get host

# Check auth status
glab auth status

# Test API access
glab api version --hostname <hostname>

# Capture a full SHA for a guarded mutation
git rev-parse HEAD
```

Run each command with a bounded timeout in automation. A hanging `glab --version` or `--help` is an executable/runtime problem, not permission to infer syntax.

## Integration with Git

1. **Before git push:** Verify remote points to correct instance
2. **After git push:** Monitor CI: `glab ci view --hostname <hostname>`
3. **For MRs:** Create on correct instance: `glab mr create --hostname <hostname>`
4. **For issues:** `glab issue create --hostname <hostname>`

## Troubleshooting

**"Project not found":** Check hostname, URL-encode project path for API calls, verify auth.

**"401 Unauthorized":** Check token validity and scopes with `glab auth status`.

**Wrong instance:** Always use explicit `--hostname`, check default with `glab config get host`.

## Quick Reference

```bash
# Authentication
glab auth login --hostname <hostname>
glab auth status
glab auth switch

# Projects
glab project view <path> --hostname <hostname>
glab project list --hostname <hostname>

# CI/CD
glab ci view --hostname <hostname>
glab ci trace <job-id> --hostname <hostname>
glab variable list --hostname <hostname> -R <project>

# API
glab api <endpoint> --hostname <hostname>
glab api version --hostname <hostname>

# Configuration
glab config get host
glab config set host <hostname>
```
