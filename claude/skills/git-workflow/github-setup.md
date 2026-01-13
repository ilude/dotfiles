# GitHub Repository Setup

Guidelines for GitHub repository configuration and community files.

## Essential Files

| File | Purpose | Required |
|------|---------|----------|
| README.md | Project overview | MUST |
| LICENSE | Legal terms | MUST for open source |
| CONTRIBUTING.md | Contribution guidelines | SHOULD |
| CODE_OF_CONDUCT.md | Community standards | SHOULD |
| SECURITY.md | Vulnerability reporting | MUST for public repos |
| CODEOWNERS | Review assignments | RECOMMENDED |
| .github/copilot-instructions.md | AI coding assistant context | RECOMMENDED |

## Issue Templates

Place in `.github/ISSUE_TEMPLATE/`. Use YAML form format for structured input.

**bug_report.yml:** Description, steps to reproduce, expected/actual behavior (required); version, OS dropdown, logs (optional).

**feature_request.yml:** Problem statement, proposed solution (required); alternatives, context (optional).

Add `config.yml` to disable blank issues and add contact links.

## Pull Request Template

Place at `.github/pull_request_template.md`:

```markdown
## Summary
<!-- Brief description of changes -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
<!-- How was this tested? -->

## Checklist
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

## CODEOWNERS

Place at `.github/CODEOWNERS`:

```gitignore
# Default owners
*       @org/team-leads

# Directory ownership
/src/   @org/developers
/docs/  @org/tech-writers

# File patterns
*.js    @org/frontend-team
*.py    @org/backend-team
```

Rules: Later rules override earlier. Use teams over individuals. Review groups need write access.

## Branch Protection (main/master)

1. **Require pull request reviews** - 1+ approval, dismiss stale reviews, require CODEOWNERS
2. **Require status checks** - Branches up to date, select required CI checks
3. **Restrict pushes** - Limit to maintainers/admins
4. **Additional** - Signed commits, no force pushes, no deletions

## GitHub Actions

Place workflows in `.github/workflows/`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
```

Common triggers: `push`, `pull_request`, `schedule` (cron), `workflow_dispatch` (manual).

## Copilot Instructions

Place at `.github/copilot-instructions.md` for workspace-level AI context.

Key sections: project overview, tech stack, coding standards, naming conventions, preferred patterns, domain terminology.

## Dependabot

Place at `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      dev-dependencies:
        dependency-type: "development"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

## .gitattributes

```gitattributes
* text=auto
*.sh text eol=lf
*.bat text eol=crlf
*.png binary
*.jpg binary
*.pdf binary
package-lock.json -diff
yarn.lock -diff
```

## Quick Setup Checklist

1. [ ] README.md with project overview
2. [ ] LICENSE file
3. [ ] .gitignore appropriate for stack
4. [ ] .gitattributes for line endings
5. [ ] CONTRIBUTING.md
6. [ ] SECURITY.md for public repos
7. [ ] Issue templates in `.github/ISSUE_TEMPLATE/`
8. [ ] PR template at `.github/pull_request_template.md`
9. [ ] CODEOWNERS
10. [ ] Branch protection on main
11. [ ] CI workflow in `.github/workflows/`
12. [ ] Dependabot configuration

## Templates

See `assets/` directory for templates:
- `CONTRIBUTING.md.template`
- `SECURITY.md.template`
- `CODEOWNERS.template`
- `pull_request_template.md.template`
- `bug_report.yml.template`
- `copilot-instructions.md.template`
