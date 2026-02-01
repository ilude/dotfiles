#!/usr/bin/env bash
# Bootstrap Claude Code plugins on a new machine
# Run: bash ~/.dotfiles/claude/bootstrap-plugins.sh

set -e

echo "Adding marketplaces..."
claude plugin marketplace add nikiforovall/claude-code-rules 2>/dev/null || echo "cc-handbook already added"
claude plugin marketplace add zxkane/aws-skills 2>/dev/null || echo "aws-skills already added"

echo "Installing plugins..."
plugins=(
  "handbook-git-worktree@cc-handbook"
  "handbook-glab@cc-handbook"
  "aws-cdk@aws-skills"
  "aws-cost-ops@aws-skills"
  "serverless-eda@aws-skills"
  "aws-agentic-ai@aws-skills"
)

for plugin in "${plugins[@]}"; do
  claude plugin install "$plugin" 2>/dev/null || echo "$plugin already installed"
done

echo "Done. Restart Claude Code to apply changes."
