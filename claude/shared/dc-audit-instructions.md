# Damage Control Audit — CLI Tool Discovery and Pattern Gap Analysis

Automated workflow to discover CLI tools used across conversation history, project configurations, and session logs — then identify gaps in damage-control hook patterns and generate the missing patterns.

## Parameters

```
/dc-audit [--history-only] [--projects-only] [--apply]
```

- `--history-only`: Only scan conversation history and debug logs (skip project configs)
- `--projects-only`: Only scan project configuration files (skip history)
- `--apply`: Automatically add discovered patterns to patterns.yaml (default: report only)

## Architecture

```
User runs /dc-audit
         │
         ▼
    Main agent reads current patterns.yaml coverage
         │
         ├── Extracts all tool names already covered
         └── Builds "covered tools" set
         │
         ▼
    Launch 2 parallel discovery agents (background)
         │
         ├── Agent A: History Miner — scans ~/.claude/debug/ and history.jsonl
         │   for Bash tool invocations, extracts CLI tool names + commands
         │
         └── Agent B: Project Scanner — scans ~/.claude/projects/ dirs
             for config files (Makefile, Cargo.toml, go.mod, etc.)
         │
         ▼
    Collect results, deduplicate, filter out already-covered tools
         │
         ▼
    Launch research agents (1 per uncovered tool category, parallel)
         │
         ├── Each agent researches destructive commands for its assigned tools
         └── Returns: tool, command, risk level, block/ask, reason
         │
         ▼
    Generate gap report with recommended patterns
         │
         ├── If --apply: Edit patterns.yaml directly
         └── If no --apply: Print report for user review
```

---

## Step 1: Read Current Coverage

**You (the main agent) do this directly.**

Read `~/.dotfiles/claude/hooks/damage-control/patterns.yaml` and extract all CLI tool names currently covered in `bashToolPatterns`. Build a set of covered tools.

Use grep to extract tool names from pattern entries:
```bash
grep -oP "\\\\b(\\w+)\\\\s" ~/.dotfiles/claude/hooks/damage-control/patterns.yaml | sort -u
```

Also manually note the major tool categories from section headers (AWS, GCP, Helm, Terraform, etc.).

---

## Step 2: Launch Discovery Agents

Launch **2 parallel Task agents** using the Task tool:

### Agent A: History Miner (model: sonnet)

Scan conversation history for CLI tool invocations:

1. **Debug logs** (`~/.claude/debug/*.txt`): grep for Bash tool command patterns
   - Look for `"command":"` followed by the actual command
   - Extract the first word (tool name) from each command
   - Build frequency count per tool

2. **History file** (`~/.claude/history.jsonl`): scan for tool references

3. **Session history logs** (`~/.claude/logs/damage-control/*.log`): parse JSONL audit logs for commands that were allowed/blocked

4. **Approach**: Use `grep -roh` with patterns to efficiently scan without reading full files:
   ```bash
   grep -roh '"command":"[a-zA-Z0-9_-]*' ~/.claude/debug/ | sort | uniq -c | sort -rn | head -50
   ```

5. **Output**: Deduplicated list of tool names with usage counts and example commands

### Agent B: Project Scanner (model: haiku)

Scan project directories for tool configuration files:

1. Check all directories under `~/.claude/projects/` for their corresponding filesystem paths
2. For each project, check for presence of config files that indicate tool usage:
   - Build tools: `Makefile`, `justfile`, `Taskfile.yml`
   - Language packages: `Cargo.toml`, `go.mod`, `Gemfile`, `*.csproj`, `pyproject.toml`, `package.json`, `composer.json`
   - Containers: `Dockerfile`, `docker-compose.yml`, `Containerfile`
   - IaC: `*.tf`, `Pulumi.yaml`, `serverless.yml`, `cdk.json`, `sam.yaml`
   - CI/CD: `.github/workflows/`, `.gitlab-ci.yml`
   - K8s: `Chart.yaml`, `helmfile.yaml`, `kustomization.yaml`, `skaffold.yaml`
   - Config mgmt: `ansible.cfg`, `playbook.yml`, `Vagrantfile`
   - Cloud: `fly.toml`, `wrangler.toml`, `vercel.json`, `netlify.toml`, `firebase.json`
   - Package managers: `Brewfile`, `bun.lockb`, `pnpm-lock.yaml`, `yarn.lock`

3. **Output**: Table of projects with tools detected, plus deduplicated tool list with project counts

---

## Step 3: Analyze Gaps

After both discovery agents complete:

1. Merge their tool lists
2. Filter out tools already covered in patterns.yaml (from Step 1)
3. Filter out tools with no meaningful destructive operations (read-only tools like `rg`, `fd`, `bat`, `eza`, `fzf`, `jq`, `yq`)
4. Group remaining tools by category:
   - Package managers (publishing, uninstall)
   - Build tools (clean, purge)
   - Infrastructure (destroy, delete)
   - Database CLIs (drop, delete, truncate)
   - Cloud CLIs (delete, terminate)
   - Container tools (rm, prune, down)
   - System package managers (remove, purge)

---

## Step 4: Research Missing Patterns

For each category with gaps, launch a research agent (Task tool, model: sonnet):

Each agent receives:
- The list of tools in its category
- Instructions to find ALL destructive subcommands/flags
- The pattern format from patterns.yaml:
  ```yaml
  - pattern: '\btool\s+subcommand\b'
    reason: "tool subcommand (brief description of destructive effect)"
    ask: true  # or omit for hard block
  ```

Each agent returns:
- YAML-formatted pattern entries ready to paste into patterns.yaml
- Risk assessment per pattern (critical = hard block, high/medium = ask)

---

## Step 5: Generate Report

Present findings as a structured report:

```markdown
## Damage Control Audit Report

### Discovery Summary
- **Sessions scanned**: N debug files
- **Projects scanned**: N project directories
- **Unique CLI tools found**: N
- **Already covered**: N
- **Gaps identified**: N tools with destructive commands

### Coverage Gaps

#### [Category]: [Tool Name]
- **Found in**: history (N uses) / projects (project1, project2)
- **Missing patterns**:
  - `tool subcommand` — risk: HIGH — reason
  - `tool other-subcommand` — risk: MEDIUM — reason

### Recommended Patterns (YAML)

[Ready-to-paste YAML blocks organized by section]

### Summary Table

| Tool | Commands | Risk | Source |
|------|----------|------|--------|
| ... | ... | ... | history/projects/both |
```

---

## Step 6: Apply (if --apply flag)

If `--apply` is set:

1. Read patterns.yaml to find correct insertion points for each category
2. Use Edit tool to insert new patterns in the appropriate sections
3. Run the existing test suite: `cd ~/.dotfiles && make test`
4. Create a test script to validate new patterns (same approach as manual additions)
5. Report results

If `--apply` is NOT set:

1. Print the report
2. Show the YAML blocks that would be added
3. Ask user if they want to apply

---

## Edge Cases

1. **No debug files**: Skip history mining, proceed with project scanning only
2. **No new gaps found**: Report "All discovered tools are covered" — this is a success
3. **Tool found in history but not in any skill**: Still research it — the user clearly uses it
4. **Ambiguous tool names**: e.g., `python` is a tool but not a destructive CLI. Filter by checking if the tool has known destructive subcommands
5. **Very large debug directory**: Use grep with `--max-count=1` per file to limit scan time
6. **Permission errors on project dirs**: Skip inaccessible directories, note in report

## Success Criteria

- Discovers tools from real usage patterns (not just theoretical coverage)
- Cross-references history + project configs for comprehensive view
- Generates valid, tested YAML patterns ready for patterns.yaml
- Portable: works on any machine with Claude Code installed
- Incremental: only adds patterns for tools not already covered
