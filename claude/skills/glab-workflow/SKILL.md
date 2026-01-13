---
name: glab-workflow
description: GitLab CLI (glab) workflow for managing multiple GitLab instances. Trigger keywords: glab, gitlab, gl, gitlab cli. MUST be activated when using glab commands to interact with GitLab instances. Ensures correct instance targeting using explicit --hostname flags and validates operations before destructive actions. Critical for environments with multiple GitLab instances (production vs new deployment).
---

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

# GitLab CLI (glab) Workflow Guidelines

**Auto-activate when:** User mentions glab, GitLab API, GitLab instances, or when bash commands contain `glab`.

Comprehensive guidelines for using GitLab CLI (glab) across multiple GitLab instances.

## Critical Rules

### Multiple Instance Management

**MUST always use explicit `--hostname` flag** to avoid ambiguity when multiple GitLab instances are configured.

**Current GitLab Instances:**
- **Production (old):** `repo.teams-sddc-dev.com` - Active production system used by developers
- **New deployment:** `gitlab.prod.teams-sddc-dev.com` - New GitLab instance for migration

### Hostname Flag Requirement

**MUST NOT use glab commands without `--hostname` flag** when operating in an environment with multiple GitLab instances.

**Good examples:**
```bash
glab api version --hostname gitlab.prod.teams-sddc-dev.com
glab project view teams/ui/eisa --hostname gitlab.prod.teams-sddc-dev.com
glab ci view --hostname gitlab.prod.teams-sddc-dev.com
```

**Bad examples (AVOID):**
```bash
glab api version  # Ambiguous - which instance?
glab project view teams/ui/eisa  # Could target wrong instance
```

### Validation Before Destructive Operations

**MUST validate target instance** before any write/destructive operation:
- Creating projects
- Pushing code
- Modifying CI/CD variables
- Creating issues/MRs
- Deleting resources

**Validation steps:**
1. Explicitly state which instance the operation will target
2. Show the command with `--hostname` flag
3. Confirm it matches user intent before execution

**Example:**
```
This will create the project on gitlab.prod.teams-sddc-dev.com (new instance):
  glab project create teams/ui/eisa --hostname gitlab.prod.teams-sddc-dev.com

Proceeding...
```

### Read-Only Operations

For read-only operations (viewing status, checking pipelines, reading data), **SHOULD still use `--hostname`** for clarity, but validation is less critical.

## Authentication Management

### Multi-Instance Authentication Setup

**Configure both instances:**
```bash
# Check current authentication status
glab auth status

# Add new GitLab instance (if not already configured)
glab auth login --hostname gitlab.prod.teams-sddc-dev.com

# Verify both instances are configured
glab auth status
```

### Token Requirements

**Required scopes for migration work:**
- `api` - Full API access
- `read_repository` - Read repository data
- `write_repository` - Push/modify repositories
- `read_registry` - Read container registry
- `write_registry` - Push container images

### Switching Between Instances

**Three methods to target specific instances:**

1. **Explicit --hostname flag (RECOMMENDED):**
   ```bash
   glab api version --hostname gitlab.prod.teams-sddc-dev.com
   ```

2. **Set default host:**
   ```bash
   glab config set host gitlab.prod.teams-sddc-dev.com
   ```

3. **Interactive switch:**
   ```bash
   glab auth switch
   ```

**MUST use method 1 (explicit flag) in automation and scripts.**

## Common Operations

### Checking CI Pipeline Status

```bash
# View pipeline status on new instance
glab ci view --hostname gitlab.prod.teams-sddc-dev.com

# View pipeline logs
glab ci trace <job-id> --hostname gitlab.prod.teams-sddc-dev.com

# List pipelines for a project
glab ci list --hostname gitlab.prod.teams-sddc-dev.com -R teams/ui/eisa
```

### Project Operations

```bash
# View project details
glab project view teams/ui/eisa --hostname gitlab.prod.teams-sddc-dev.com

# List projects
glab project list --hostname gitlab.prod.teams-sddc-dev.com

# Create project (REQUIRES VALIDATION)
glab project create teams/ui/newproject --hostname gitlab.prod.teams-sddc-dev.com
```

### CI/CD Variables

```bash
# List CI/CD variables
glab variable list --hostname gitlab.prod.teams-sddc-dev.com -R teams/ui/eisa

# Export variables (read-only)
glab variable export --hostname gitlab.prod.teams-sddc-dev.com -R teams/ui/eisa

# Set variable (REQUIRES VALIDATION)
glab variable set MY_VAR "value" --hostname gitlab.prod.teams-sddc-dev.com -R teams/ui/eisa
```

### API Access

```bash
# Check GitLab version
glab api version --hostname gitlab.prod.teams-sddc-dev.com

# Raw API calls
glab api projects/teams%2Fui%2Feisa --hostname gitlab.prod.teams-sddc-dev.com
```

## Safety Guidelines

### Production Protection

**MUST NOT perform write operations on production** (`repo.teams-sddc-dev.com`) during migration unless explicitly requested.

**Protected operations on production:**
- Creating/deleting projects
- Modifying CI/CD variables
- Force pushing
- Deleting branches
- Archive/unarchive projects

### Verification Commands

**Before any destructive operation, SHOULD verify:**
```bash
# Verify which host is default
glab config get host

# Verify authentication status
glab auth status

# Test API access to both instances
glab api version --hostname repo.teams-sddc-dev.com
glab api version --hostname gitlab.prod.teams-sddc-dev.com
```

## Migration-Specific Patterns

### Pushing to New Instance

**When pushing repos to new GitLab:**
```bash
# MUST explicitly verify remote configuration first
cd /c/Projects/Work/Gitlab/Migration/teams/ui/eisa
git remote -v  # Verify origin points to gitlab.prod.teams-sddc-dev.com

# Push to new instance (origin should be gitlab.prod.teams-sddc-dev.com)
git push origin main

# Monitor CI pipeline on new instance
glab ci view --hostname gitlab.prod.teams-sddc-dev.com -R teams/ui/eisa
```

### Comparing Instances

**When comparing data between old and new:**
```bash
# Get project info from production
glab project view teams/ui/eisa --hostname repo.teams-sddc-dev.com

# Get project info from new instance
glab project view teams/ui/eisa --hostname gitlab.prod.teams-sddc-dev.com

# Compare CI/CD variables
glab variable list --hostname repo.teams-sddc-dev.com -R teams/ui/eisa > old.txt
glab variable list --hostname gitlab.prod.teams-sddc-dev.com -R teams/ui/eisa > new.txt
diff old.txt new.txt
```

## Troubleshooting

### Common Issues

**"Project not found" error:**
- Verify correct --hostname flag
- Check project path is URL-encoded for API calls
- Verify authentication for that instance

**"401 Unauthorized" error:**
- Check token is valid: `glab auth status`
- Verify token has required scopes
- Token may have expired - create new token

**Wrong instance targeted:**
- Always use explicit --hostname flag
- Check default host: `glab config get host`
- Use `glab auth switch` to change default

### Testing Connectivity

```bash
# Test both instances are reachable
glab api version --hostname repo.teams-sddc-dev.com
glab api version --hostname gitlab.prod.teams-sddc-dev.com

# Test authentication works
glab api personal_access_tokens/self --hostname repo.teams-sddc-dev.com
glab api personal_access_tokens/self --hostname gitlab.prod.teams-sddc-dev.com
```

## Best Practices

1. **ALWAYS use --hostname flag** in scripts and automation
2. **Validate instance before destructive operations**
3. **Document which instance** in commit messages when using glab for automation
4. **Test on new instance first** before touching production
5. **Use read-only operations to verify** before write operations
6. **Keep tokens secure** - never commit or log them
7. **Regularly verify auth status** with `glab auth status`

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

## Integration with Git Workflow

When using glab alongside git operations:

1. **Before git push:** Verify remote points to correct instance
2. **After git push:** Use glab to monitor CI: `glab ci view --hostname <hostname>`
3. **For MRs:** Create on correct instance: `glab mr create --hostname <hostname>`
4. **For issues:** File on correct instance: `glab issue create --hostname <hostname>`

## Environment-Specific Notes

**Current migration environment:**
- Production repos cloned from `repo.teams-sddc-dev.com` (upstream remote)
- New repos push to `gitlab.prod.teams-sddc-dev.com` (origin remote)
- Both instances accessible simultaneously via VPN/network
- Production must remain operational during migration

**Default assumption:** Unless explicitly stated, migration work targets the **new instance** (`gitlab.prod.teams-sddc-dev.com`), not production.
