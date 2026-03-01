#!/bin/bash
# Clean up orphaned team directories older than 24 hours
teams_dir="$HOME/.claude/teams"
tasks_dir="$HOME/.claude/tasks"

if [[ -d "$teams_dir" ]]; then
    find "$teams_dir" -maxdepth 1 -mindepth 1 -type d -mtime +0 -exec rm -rf {} + 2>/dev/null
fi

if [[ -d "$tasks_dir" ]]; then
    find "$tasks_dir" -maxdepth 1 -mindepth 1 -type d -mtime +0 -exec rm -rf {} + 2>/dev/null
fi

# Clean up stale damage-control session files older than 24 hours
dc_sessions="$HOME/.claude/damage-control-sessions"
if [[ -d "$dc_sessions" ]]; then
    find "$dc_sessions" -maxdepth 1 -name "*.json" -mtime +0 -delete 2>/dev/null
fi
