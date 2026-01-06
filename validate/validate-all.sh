#!/usr/bin/env bash
# validate-all.sh - Master orchestrator for all validation scripts
# Runs environment, tools, config, and platform-specific validators in sequence

set -e

# Get script directory and setup logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTFILES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOGS_DIR="$DOTFILES_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOGS_DIR"

# Generate timestamp for log file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOGS_DIR/validation_${TIMESTAMP}.log"

# Source common validation utilities
source "$SCRIPT_DIR/validate-common.sh"

# Function to run validation
run_validation() {
    # Print header
    echo "Shell Environment Validation"
    echo "============================="

    # Run all validators in sequence
    "$SCRIPT_DIR/validate-environment.sh"
    "$SCRIPT_DIR/validate-tools.sh"
    "$SCRIPT_DIR/validate-config.sh"
    "$SCRIPT_DIR/validate-wsl.sh"
    "$SCRIPT_DIR/validate-msys2.sh"
    "$SCRIPT_DIR/validate-linux.sh"

    # Print summary and return exit code
    summary
}

# Run validation with tee to both display and log
# Strip ANSI color codes from log file using sed
run_validation 2>&1 | tee >(sed 's/\x1b\[[0-9;]*m//g' > "$LOG_FILE")
exit_code=${PIPESTATUS[0]}

echo ""
echo "Validation log saved to: $LOG_FILE"

exit $exit_code
