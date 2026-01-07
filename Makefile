.PHONY: validate validate-env validate-tools validate-config validate-bash validate-pwsh validate-all test test-quick test-parallel test-docker test-powershell test-damage-control test-damage-control-unit test-damage-control-integration preflight help lint format check install-hooks

# Shell scripts to check (excludes dotbot submodule and plugins)
SHELL_SCRIPTS := .bashrc .zshrc install install-wsl git-ssh-setup claude-link-setup claude-mcp-setup copilot-link-setup zsh-setup zsh-plugins wsl-packages

# Default target
help:
	@echo "Available targets:"
	@echo "  make validate      - Validate shell environment (bash)"
	@echo "  make validate-all  - Validate all shells (bash + PowerShell)"
	@echo "  make validate-pwsh - Validate PowerShell environment"
	@echo "  make test          - Run tests locally (requires bats)"
	@echo "  make test-docker   - Run tests in Ubuntu 24.04 container (recommended)"
	@echo "  make test-powershell - Run Pester tests for PowerShell code (Windows)"
	@echo "  make test-quick    - Run only core tests locally"
	@echo "  make test-parallel - Run tests in parallel (faster but noisier output)"
	@echo "  make test-damage-control - Run damage-control tests (smoke + unit + integration)"
	@echo "  make test-damage-control-unit - Run damage-control unit tests (pytest)"
	@echo "  make test-damage-control-integration - Run damage-control integration tests"
	@echo "  make preflight     - Check environment (CRLF, dependencies)"
	@echo "  make lint          - Run shellcheck on shell scripts"
	@echo "  make format        - Format shell scripts with shfmt"
	@echo "  make check         - Run all checks (lint + test)"
	@echo "  make install-hooks - Install git pre-commit hook for testing"

# Shell environment validation (diagnostic)
validate: validate-bash
	@echo "Validation complete."

validate-bash:
	@bash validate/validate-all.sh

validate-pwsh:
	@pwsh -NoProfile -ExecutionPolicy Bypass -File validate.ps1

validate-all: validate-bash validate-pwsh
	@echo "Full validation complete (bash + PowerShell)."

# Component-specific validation
validate-env:
	@bash validate/validate-environment.sh

validate-tools:
	@bash validate/validate-tools.sh

validate-config:
	@bash validate/validate-config.sh

# Pre-flight environment checks
preflight:
	@echo "Running pre-flight checks..."
	@# Check for CRLF corruption in shell scripts
	@if command -v file >/dev/null 2>&1; then \
		if file .bashrc .zshrc install install-wsl git-ssh-setup claude-link-setup copilot-link-setup 2>/dev/null | grep -q CRLF; then \
			echo "ERROR: CRLF line endings detected. Run: dos2unix <file>"; \
			exit 1; \
		fi; \
	fi
	@# Check Bats installed
	@if ! command -v bats >/dev/null 2>&1; then \
		echo "ERROR: Bats not found."; \
		echo "Install: brew install bats-core (macOS)"; \
		echo "         apt install bats (Ubuntu)"; \
		echo "         npm install -g bats (Windows)"; \
		exit 1; \
	fi
	@echo "Pre-flight checks passed."

# Run all tests locally
test: preflight
	bats test/

# Damage Control test targets
test-damage-control-unit:
	@echo "Running damage control unit tests..."
	@cd "$(CURDIR)" && uv run pytest claude/hooks/damage-control/tests/test_semantic_analysis.py -v --tb=short

test-damage-control-integration:
	@echo "Running damage control integration tests..."
	@cd "$(CURDIR)" && uv run claude/hooks/damage-control/test-damage-control.py --test-suite all

test-damage-control: preflight test-damage-control-unit test-damage-control-integration
	@echo "Running damage control smoke tests..."
	@bats test/damage-control.bats
	@echo "All damage control tests passed."

# Run only core tests (faster)
test-quick: preflight
	bats test/git_ssh_setup.bats

# Run tests in parallel (faster but noisier output)
test-parallel: preflight
	bats test/aliases.bats test/cli-completions.bats test/editor.bats \
	     test/env-modules.bats test/helpers.bats test/rc-modules.bats & \
	bats test/git_ssh_setup.bats test/idempotency.bats & \
	bats test/prompt.bats test/shell-setup.bats & \
	wait

# Run tests in Ubuntu 24.04 Docker container (matches CI environment)
test-docker:
	@echo "Running tests in Ubuntu 24.04 container..."
	docker run --rm -v "$(CURDIR):/dotfiles:ro" -w /dotfiles ubuntu:24.04 bash -c '\
		apt-get update -qq && \
		apt-get install -y -qq bats git >/dev/null 2>&1 && \
		echo "Running tests..." && \
		bats test/'

# Run PowerShell Pester tests (Windows only)
test-powershell:
	@echo "Running Pester tests..."
	@powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Pester test/*.tests.ps1"

# Lint shell scripts with shellcheck
lint:
	@echo "Running shellcheck..."
	@if ! command -v shellcheck >/dev/null 2>&1; then \
		echo "ERROR: shellcheck not found."; \
		echo "Install: brew install shellcheck (macOS)"; \
		echo "         apt install shellcheck (Ubuntu)"; \
		exit 1; \
	fi
	shellcheck $(SHELL_SCRIPTS)
	@# Optional: bashate style check
	@if command -v bashate >/dev/null 2>&1; then \
		echo "Running bashate..."; \
		bashate $(SHELL_SCRIPTS) || true; \
	fi
	@# Optional: shellharden security check
	@if command -v shellharden >/dev/null 2>&1; then \
		echo "Running shellharden..."; \
		shellharden --check $(SHELL_SCRIPTS) || true; \
	fi
	@echo "Lint passed."

# Format shell scripts with shfmt
format:
	@echo "Formatting shell scripts..."
	@if ! command -v shfmt >/dev/null 2>&1; then \
		echo "ERROR: shfmt not found."; \
		echo "Install: brew install shfmt (macOS)"; \
		echo "         apt install shfmt (Ubuntu)"; \
		exit 1; \
	fi
	shfmt -w -i 4 -ci $(SHELL_SCRIPTS)
	@echo "Format complete."

# Run all checks
check: lint test
	@echo "All checks passed."

# Install git hooks (enables pre-commit testing)
install-hooks:
	@echo "Installing git hooks..."
	git config core.hooksPath hooks
	chmod +x hooks/*
	@echo "Git hooks installed. Commits will now run tests first."
