# GitLab CLI (glab) Workflow

Guidelines for using GitLab CLI (glab) across multiple GitLab instances.

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

## Validation Before Destructive Operations

**MUST validate target instance** before:
- Creating/deleting projects
- Pushing code
- Modifying CI/CD variables
- Creating issues/MRs

```
This will create the project on gitlab.example.com:
  glab project create myproject --hostname gitlab.example.com

Proceeding...
```

## Verification Commands

```bash
# Check default host
glab config get host

# Check auth status
glab auth status

# Test API access
glab api version --hostname <hostname>
```

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
