.PHONY: validate validate-env validate-tools validate-config validate-bash validate-pwsh validate-all test test-quick test-parallel test-docker test-powershell test-pytest test-bats preflight help lint format check install-hooks

# Shell scripts to check (excludes dotbot submodule and plugins)
SHELL_SCRIPTS := home/.bashrc home/.zshrc install install-wsl scripts/git-ssh-setup scripts/claude-link-setup scripts/claude-mcp-setup scripts/copilot-link-setup scripts/zsh-setup scripts/zsh-plugins scripts/wsl-packages

# Default target
help:
	@echo "Available targets:"
	@echo "  make validate      - Validate shell environment (bash)"
	@echo "  make validate-all  - Validate all shells (bash + PowerShell)"
	@echo "  make validate-pwsh - Validate PowerShell environment"
	@echo "  make test          - Run all tests (pytest + bats)"
	@echo "  make test-pytest   - Run pytest tests only"
	@echo "  make test-bats     - Run bats tests only (prompt, git_ssh_setup)"
	@echo "  make test-docker   - Run tests in Ubuntu 24.04 container (recommended)"
	@echo "  make test-powershell - Run Pester tests for PowerShell code (Windows)"
	@echo "  make test-quick    - Run only core tests locally"
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

# Run all tests (pytest + bats) with timing
test: preflight
	@echo "=== Test Suite ==="
	@start_time=$$(date +%s); \
	echo ""; \
	echo "--- pytest: test/ ---"; \
	file_start=$$(date +%s); \
	uv run pytest test/ -v --tb=short --durations=5 && \
	echo "  Time: $$(($$(date +%s) - file_start))s"; \
	echo ""; \
	echo "--- pytest: damage-control hooks ---"; \
	file_start=$$(date +%s); \
	uv run pytest claude/hooks/damage-control/tests/ -v --tb=short --durations=5 && \
	echo "  Time: $$(($$(date +%s) - file_start))s"; \
	echo ""; \
	echo "--- pytest: path-normalization hooks ---"; \
	file_start=$$(date +%s); \
	uv run pytest claude/hooks/path-normalization/tests/ -v --tb=short --durations=5 && \
	echo "  Time: $$(($$(date +%s) - file_start))s"; \
	echo ""; \
	echo "--- pytest: session-history hooks ---"; \
	file_start=$$(date +%s); \
	uv run pytest claude/hooks/session-history/tests/ -v --tb=short --durations=5 && \
	echo "  Time: $$(($$(date +%s) - file_start))s"; \
	echo ""; \
	echo "--- bats: prompt.bats ---"; \
	file_start=$$(date +%s); \
	bats test/prompt.bats && \
	echo "  Time: $$(($$(date +%s) - file_start))s"; \
	echo ""; \
	echo "--- bats: git_ssh_setup.bats ---"; \
	file_start=$$(date +%s); \
	bats test/git_ssh_setup.bats && \
	echo "  Time: $$(($$(date +%s) - file_start))s"; \
	echo ""; \
	echo "=== All tests passed in $$(($$(date +%s) - start_time))s ==="

# Run pytest tests (config patterns, idempotency, hooks)
test-pytest:
	@echo "Running pytest..."
	uv run pytest test/ claude/hooks/*/tests/ -v --tb=short --durations=10

# Run bats tests (bash-dependent tests only)
test-bats: preflight
	@echo "Running bats..."
	bats test/prompt.bats test/git_ssh_setup.bats

# Run only core tests (faster)
test-quick: preflight
	uv run pytest test/test_config_patterns.py -v --tb=short -x
	bats test/git_ssh_setup.bats

# Run tests in parallel
test-parallel: preflight
	uv run pytest test/ claude/hooks/*/tests/ -v --tb=short -n auto &
	bats test/prompt.bats test/git_ssh_setup.bats &
	wait

# Run tests in Ubuntu 24.04 Docker container (matches CI environment)
test-docker:
	@echo "Running tests in Ubuntu 24.04 container..."
	docker run --rm -v "$(CURDIR):/dotfiles:ro" -w /dotfiles ubuntu:24.04 bash -c '\
		apt-get update -qq && \
		apt-get install -y -qq bats git python3 python3-pip pipx zsh >/dev/null 2>&1 && \
		pipx install uv >/dev/null 2>&1 && \
		export PATH="$$HOME/.local/bin:$$PATH" && \
		echo "Running pytest..." && \
		uv run pytest test/ claude/hooks/*/tests/ -v --tb=short && \
		echo "Running bats..." && \
		bats test/prompt.bats test/git_ssh_setup.bats'

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
	shellcheck --severity=warning $(SHELL_SCRIPTS)
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
