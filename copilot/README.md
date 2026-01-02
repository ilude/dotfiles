# GitHub Copilot Instructions Template

A comprehensive, battle-tested template for GitHub Copilot workspace instructions and prompts. This template consolidates best practices from multiple production projects to help you get started quickly with well-structured Copilot customization.

## What's Included

### Main Orchestration File
- `.github/copilot-instructions.md` - Main instructions file that applies project-wide

### Instruction Files (`.github/instructions/`)
- `python.instructions.md` - Python coding standards (uv, type hints, testing)
- `dockerfile.instructions.md` - Docker and containerization best practices
- `devcontainer.instructions.md` - Development container configuration
- `testing.instructions.md` - Testing strategies and execution
- `makefile.instructions.md` - Makefile targets and conventions
- `ignore-files.instructions.md` - .gitignore and .dockerignore management
- `self-explanatory-code-commenting.instructions.md` - Code commenting philosophy
- `copilot_customization.instructions.md` - Guidelines for maintaining these files
- `mcp_services.instructions.md` - MCP (Model Context Protocol) integration reference (optional)

### Prompt Files (`.github/prompts/`)
- `commit.prompt.md` - Automated commit workflow with Conventional Commits
- `check.prompt.md` - Comprehensive quality checks (tests, lint, types)
- `test.prompt.md` - Run tests and fix failures
- `lint.prompt.md` - Code linting and style checking

## Quick Start

### 1. Use This Template

Click "Use this template" on GitHub, or clone directly:

```bash
git clone https://github.com/yourusername/copilot-instructions-template.git my-project
cd my-project
rm -rf .git  # Remove template git history
git init     # Start fresh
```

### 2. Customize for Your Project

**Essential customizations:**

1. **Review `.github/copilot-instructions.md`**
   - Update project philosophy to match your team's approach
   - Adjust communication style preferences
   - Modify operational guidelines

2. **Choose your tooling in `python.instructions.md`**
   - Keep UV section OR traditional pip/venv (delete the unused one)
   - Update Python version (3.9, 3.10, 3.12, 3.14)
   - Add framework-specific sections (Flask, FastAPI, Django)

3. **Update `applyTo` patterns in all instruction files**
   - Match your project structure
   - Adjust glob patterns for your file organization

4. **Customize prompts in `.github/prompts/`**
   - Update test commands for your framework
   - Adjust commit message format for team conventions
   - Modify quality gates to match your CI/CD

5. **Remove irrelevant files**
   - Delete `mcp_services.instructions.md` if not using MCP
   - Remove language-specific files if not applicable

### 3. Test Your Configuration

1. **Open a file** matching an `applyTo` pattern (e.g., `*.py`)
2. **Ask Copilot** to generate or modify code
3. **Verify** it follows your instructions
4. **Iterate** on instructions if needed

### 4. Use the Prompts

**In VS Code Copilot Chat:**

```
/commit  # Run tests, then commit with Conventional Commits
/check   # Run all quality checks (tests, lint, types)
/test    # Run tests only
/lint    # Run linter only
```

Prompts are executed as autonomous agents that complete the entire workflow.

## How It Works

### Instruction Files

Instruction files use YAML frontmatter to specify when they apply:

```markdown
---
description: "Brief description of what this file instructs"
applyTo: "**/*.py"  # Glob pattern for when to apply
---

# Content of instructions...
```

**When Copilot sees a matching file, it automatically applies these instructions.**

### Prompt Files

Prompt files define reusable workflows:

```markdown
---
mode: "agent"  # Autonomous execution
model: "gpt-5-mini"  # Optional model specification
description: "What this prompt does"
---

# Prompt instructions...
```

**Invoke with `/prompt-name` in Copilot Chat.**

## Customization Guide

### For Different Languages

**Python:** Already included - customize `python.instructions.md`

**JavaScript/TypeScript:**
```markdown
---
description: "TypeScript coding standards"
applyTo: "**/*.{ts,tsx,js,jsx}"
---
# Add TypeScript-specific guidelines
```

**Go:**
```markdown
---
description: "Go coding standards"
applyTo: "**/*.go"
---
# Add Go-specific guidelines
```

### For Different Frameworks

**Flask/FastAPI:** Add to `python.instructions.md`
**React/Next.js:** Create `react.instructions.md`
**Django:** Create `django.instructions.md`

### For Different Build Tools

**Poetry:** Update `python.instructions.md` to use poetry commands
**npm/yarn/pnpm:** Create `nodejs.instructions.md`
**Gradle/Maven:** Create `java.instructions.md`

## Best Practices

### Instruction Files

1. **Be specific but flexible** - Give clear guidance without over-constraining
2. **Include examples** - Show what good looks like
3. **Organize logically** - Use clear sections and headings
4. **Test regularly** - Verify Copilot follows your instructions
5. **Keep updated** - Review and refine based on usage

### Prompt Files

1. **Define clear objectives** - What should the prompt accomplish?
2. **Provide context** - Help the agent understand the environment
3. **Set constraints** - What should it NOT do?
4. **Include examples** - Show expected workflows
5. **Iterate based on results** - Refine prompts that don't work well

### Maintenance

1. **Review quarterly** - Update for new tools, practices, or team changes
2. **Test after Copilot updates** - Verify compatibility with new versions
3. **Gather team feedback** - What works? What doesn't?
4. **Document changes** - Update VERSION file with significant changes

## Project Structure

```
copilot-instructions-template/
├── .github/
│   ├── copilot-instructions.md          # Main orchestration file
│   ├── instructions/                     # Instruction files
│   │   ├── python.instructions.md
│   │   ├── dockerfile.instructions.md
│   │   ├── devcontainer.instructions.md
│   │   ├── testing.instructions.md
│   │   ├── makefile.instructions.md
│   │   ├── ignore-files.instructions.md
│   │   ├── self-explanatory-code-commenting.instructions.md
│   │   ├── copilot_customization.instructions.md
│   │   └── mcp_services.instructions.md  # Optional
│   ├── prompts/                          # Prompt files
│   │   ├── commit.prompt.md
│   │   ├── check.prompt.md
│   │   ├── test.prompt.md
│   │   └── lint.prompt.md
│   └── VERSION                           # Version tracking
├── README.md                             # This file
└── .gitignore                            # Git ignore rules
```

## Version History

See `.github/VERSION` for detailed version history and changes.

## Source Projects

This template consolidates best practices from these production projects:

- **agent-spike** - Python 3.14, uv package manager, self-explanatory code philosophy
- **mentat-cli** - CQRS patterns, speckit workflow, IoC architecture
- **joyride-python** - Docker, 12-Factor apps, brevity in communication
- **onboard/attempt-one** - Modular structure, MCP services integration
- **onramp** - Service-oriented architecture, meta-instructions

Each project contributed proven patterns that work in real development workflows.

## Philosophy

This template embodies several core principles:

1. **Execute, don't ask** - Copilot should complete tasks autonomously
2. **Make minimal changes** - Only modify what's explicitly requested
3. **Always verify** - Run tests and checks before considering work complete
4. **Be direct and concise** - No unnecessary explanations or permission-seeking
5. **Self-documenting code** - Comments explain WHY, not WHAT

## Common Workflows

### Committing Changes

```
You: /commit
Copilot:
  - Runs tests (if source files changed)
  - Fixes any failures
  - Stages changes
  - Creates Conventional Commit message
  - Commits (does not push)
```

### Quality Checks

```
You: /check
Copilot:
  - Runs tests
  - Runs linter
  - Runs type checker
  - Fixes all issues
  - Reports results
```

### Quick Test Run

```
You: /test
Copilot:
  - Runs test suite
  - Reports failures
  - Fixes issues
  - Re-runs until green
```

## Troubleshooting

### Copilot not following instructions

1. **Check `applyTo` pattern** - Does it match your file?
2. **Simplify instructions** - Too complex may confuse Copilot
3. **Check for conflicts** - Multiple instruction files may contradict
4. **Test with minimal example** - Isolate what's not working

### Prompts not working

1. **Check frontmatter syntax** - YAML must be valid
2. **Verify mode is supported** - "agent" and "chat" are standard
3. **Simplify and test** - Start minimal, add complexity gradually
4. **Check Copilot version** - Some features require newer versions

### Instructions ignored

1. **Check file location** - Must be in `.github/instructions/`
2. **Verify extension** - Must be `.instructions.md`
3. **Test applyTo pattern** - Use glob pattern tester
4. **Check for errors** - Invalid YAML will be ignored

## Contributing

This is a template repository. Contributions to improve the template are welcome:

1. **Fork this repository**
2. **Make improvements**
3. **Test thoroughly** in real projects
4. **Submit pull request** with clear description

## License

MIT License - Use freely in your projects, commercial or otherwise.

## Additional Resources

### Official Documentation
- [VS Code Copilot Documentation](https://code.visualstudio.com/docs/copilot)
- [GitHub Copilot Documentation](https://docs.github.com/copilot)
- [Model Context Protocol](https://modelcontextprotocol.io/)

### Related Tools
- [uv - Fast Python package manager](https://github.com/astral-sh/uv)
- [Ruff - Fast Python linter](https://github.com/astral-sh/ruff)
- [Conventional Commits](https://www.conventionalcommits.org/)

### Community
- GitHub Copilot Discussions
- VS Code Copilot Issues
- Stack Overflow (tag: github-copilot)

## Support

For issues with this template, please open an issue on GitHub.

For Copilot-specific issues, refer to [GitHub Copilot Support](https://support.github.com/copilot).

---

**Made with ❤️ by consolidating best practices from multiple production projects.**

**Last updated:** 2025-11-10
