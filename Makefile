.PHONY: test test-quick test-docker preflight help lint format check

# Shell scripts to check (excludes dotbot submodule and plugins)
SHELL_SCRIPTS := .bashrc .zshrc install install-wsl git-ssh-setup claude-link-setup claude-mcp-setup zsh-setup zsh-plugins wsl-packages

# Default target
help:
	@echo "Available targets:"
	@echo "  make test        - Run tests locally (requires bats)"
	@echo "  make test-docker - Run tests in Ubuntu 24.04 container (recommended)"
	@echo "  make test-quick  - Run only core tests locally"
	@echo "  make preflight   - Check environment (CRLF, dependencies)"
	@echo "  make lint        - Run shellcheck on shell scripts"
	@echo "  make format      - Format shell scripts with shfmt"
	@echo "  make check       - Run all checks (lint + test)"

# Pre-flight environment checks
preflight:
	@echo "Running pre-flight checks..."
	@# Check for CRLF corruption in shell scripts
	@if command -v file >/dev/null 2>&1; then \
		if file .bashrc .zshrc install install-wsl git-ssh-setup claude-link-setup 2>/dev/null | grep -q CRLF; then \
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

# Run only core tests (faster)
test-quick: preflight
	bats test/git_ssh_setup.bats

# Run tests in Ubuntu 24.04 Docker container (matches CI environment)
test-docker:
	@echo "Running tests in Ubuntu 24.04 container..."
	docker run --rm -v "$(CURDIR):/dotfiles:ro" -w /dotfiles ubuntu:24.04 bash -c '\
		apt-get update -qq && \
		apt-get install -y -qq bats git >/dev/null 2>&1 && \
		echo "Running tests..." && \
		bats test/'

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
