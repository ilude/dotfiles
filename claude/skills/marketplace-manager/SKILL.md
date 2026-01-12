---
name: marketplace-manager
description: |
  Add and manage Claude Code plugin marketplaces.
  Trigger: /add-marketplace <github-user/repo>
invocation: add-marketplace
---

# Marketplace Manager

Add third-party plugin marketplaces to your Claude Code setup.

## Usage

```
/add-marketplace <github-user/repo> [name]
```

Examples:
- `/add-marketplace NikiforovAll/claude-code-rules` - adds as "claude-code-rules"
- `/add-marketplace zxkane/aws-skills aws-skills` - adds with custom name

## What it does

1. Adds the marketplace to `~/.claude/plugins/known_marketplaces.json`
2. Clones the repository to `~/.claude/plugins/marketplaces/<name>/`
3. Makes plugins from that marketplace available for installation

## Files Modified

- `~/.claude/plugins/known_marketplaces.json` - marketplace registry
- `~/.claude/plugins/marketplaces/<name>/` - cloned marketplace repo

## List Marketplaces

To see installed marketplaces:
```bash
cat ~/.claude/plugins/known_marketplaces.json | jq 'keys'
```

## Remove Marketplace

To remove a marketplace, delete its entry from `known_marketplaces.json` and remove the directory:
```bash
rm -rf ~/.claude/plugins/marketplaces/<name>
```
