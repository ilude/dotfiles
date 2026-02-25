# Ergo Research Notes

## Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Relationship to Serapis | **B: Standalone binary, shared Go packages** | Single install per tool. `ergo` imports from Serapis monorepo `internal/`. No subprocess overhead |
| Task file format | **A: Justfile-inspired DSL** | Muscle memory compatibility with Make/Just. Serapis integration is the novel part, not the file format |
| v0 scope | **B: Task runner + dotenv loading + variable interpolation** | Useful standalone (local `.env` files) AND with Serapis. Killer differentiator is native vault injection |

## Competitive Landscape

### Doppler (`doppler run`)

- Fetches secrets from Doppler's cloud platform, injects as env vars into child process
- `doppler run -- your-command` — universal, works with any tool
- Stays as PID 1, forwards signals (SIGINT, SIGTERM) for graceful shutdown
- `--watch` flag: auto-restart on secret change (team plan only)
- `--mount` flag: inject via ephemeral named pipes (more secure than env vars — avoids LD_PRELOAD/NODE_OPTIONS RCE)
- `--name-transformer`: convert var names to framework conventions (dotnet-env, tf-var)
- `--mount-template`: Go templates for structured config generation
- Shell detection via `$SHELL` env var
- **Key insight**: Doppler is cloud-only SaaS. Ergo + Serapis is self-hosted with zero-knowledge encryption

### Just (casey/just)

- Command runner, NOT a build system — no file dependency tracking
- Justfile syntax: recipes with parameters, dependencies, variable interpolation
- Built-in dotenv loading (`set dotenv-load`)
- Shebang recipes: `#!/usr/bin/env python3` per-recipe interpreter override
- Mechanic: recipe body saved to temp file, marked executable, OS runs with shebang interpreter
- Windows: Just manually parses shebang (no native support)
- Cross-platform: `os()`, `os_family()`, `arch()`, `num_cpus()` functions
- Rich built-in functions: string manipulation, path ops, hashing, datetime, uuid
- ~45k GitHub stars, Rust binary, CC0 license
- **Limitation**: No secret manager integration, no fingerprint caching

### go-task (taskfile.dev)

- YAML-based task runner, single Go binary
- Fingerprint-based caching via `.task/` directory (see Fingerprinting section below)
- Go template engine with slim-sprig functions
- Parallel execution by default for dependencies
- ~45k GitHub stars
- **Limitation**: YAML verbosity, no shebang polyglot recipes, no native secret manager integration, YAML footguns (Norway problem)

### mise-en-place (mise)

- Polyglot version manager + environment manager + task runner (3-in-1)
- Replaces asdf, nvm, pyenv, rbenv
- TOML config, Rust binary
- Monorepo support with unified task discovery
- **Limitation**: Large scope (3-in-1 tool), growing adoption, learning curve

### Earthly

- Dockerfile + Makefile hybrid syntax
- Container-based builds with remote execution (Satellites)
- Designed for CI/CD, not local task automation
- Now largely unmaintained

### xc

- Tasks defined as Markdown code blocks in README.md
- Documentation-first, low-friction
- Very early stage, limited ecosystem

## Fingerprinting (go-task model)

### How It Works

1. Declare `sources:` (input files) on a task
2. Before running, hash all source files → single checksum
3. Compare to stored checksum in `.task/` directory
4. Match → skip ("up to date"). Mismatch → run and update checksum

### Storage

```
.task/
├── checksum/
│   ├── build       # Hash of all sources for "build" task
│   ├── test        # Hash of all sources for "test" task
│   └── ...
```

- Machine-local state, added to `.gitignore`
- NOT portable between machines (correct design — each machine has its own state)
- Custom location via `TASK_TEMP_DIR` env var

### Methods

| Method | Mechanism | Speed | Reliability |
|--------|-----------|-------|-------------|
| `checksum` (default) | File content hashes | Slower | High — detects actual changes |
| `timestamp` | File modification times | Faster | Medium — can miss same-content rewrites |
| `none` | Always runs | Fastest | N/A |

### Design Notes for Ergo

- Adopt `.ergo/` directory for fingerprint storage
- Default to checksum method (correctness over speed)
- `sources` and `generates` declarations on recipes
- Special variables: `{{.CHECKSUM}}`, `{{.TIMESTAMP}}` available in recipe bodies

## DSL Design Philosophy

### The Spectrum

| Approach | Example | Result |
|----------|---------|--------|
| Too little | Raw shell scripts | No discovery, no deps, no cross-platform |
| Sweet spot | Just (shell + shebang) | Recipes in any language, tool handles deps/args/discovery |
| Too much | CMake, Gradle | Turing-complete build language nobody wants to learn |

### Lessons from Over-Engineered Build Languages

- **CMake**: String-based type system, confusing scoping, Turing-complete as a "Con" not a feature
- **Gradle**: Multiple ways to do everything, hidden plugin complexity, learning curve rivals a new language
- **Rake**: DSL method scope pollution, implicit behavior
- **Bazel/Starlark**: Restricted Python subset — proof that *limiting* a DSL is a feature

### Recommended Approach for Ergo

Follow Just's model:
- **Shell is the default** — recipes are shell commands
- **Shebang overrides per-recipe** — `#!/usr/bin/env python3` to use any interpreter
- **Ergo handles the boring parts** — deps, args, env injection, fingerprinting, discovery
- **Recipe body is opaque** — tool never parses or understands it
- **"DSL" is only the declaration syntax** — name, deps, args, sources, env bindings
- **Not Turing-complete** — complex logic goes in the recipe scripts, not the task file

### Minimum Viable DSL Features

1. Dependencies — task A depends on task B
2. Variable interpolation — `{{var}}` in recipe declarations (not bodies)
3. Parameterization — typed arguments with defaults
4. Conditional execution — platform detection (`os()`, `arch()`)
5. Environment binding — `env: serapis://...` or `dotenv: .env`

### What NOT to Build

- Loops, functions, closures (that's a programming language)
- Arbitrary I/O in the DSL layer
- Multiple ways to accomplish the same thing
- Implicit behavior or convention "magic"

## OnRamp Case Study

### Project Overview

Self-hosted home lab orchestration around Docker Compose + Traefik. 50+ containerized services (Plex, Jellyfin, Unifi, Authelia, etc.). **78.4% of the codebase is Makefile** — 941 lines across 18 `.mk` files.

GitHub: https://github.com/traefikturkey/onramp

### Anti-Patterns Found

| Anti-Pattern | Description | Impact |
|-------------|-------------|--------|
| Magic argument parsing | `$(eval $(EMPTY_TARGETS):;@:)` intercepts args as fake Make targets | Undiscoverable, no tab completion, silent typo failures |
| 30x copy-paste configs | Same `ifneq/wildcard/envsubst` pattern repeated per service in `builders.mk` | DRY violation, adding a service requires editing Makefile |
| 22 `$(shell ...)` calls | String manipulation, case conversion, IP detection all shelled out | Performance hit, escaping nightmares |
| API calls in Makefile | Cloudflare tunnel creation via curl chains in `.ONESHELL` | Mixing concerns, `$$` escaping hell |
| No input validation | `make enable-service doesntexist` fails silently | Poor developer experience |
| No env isolation | Single `.env` with `include .env` + `export` | No staging vs production separation |
| No caching | `envsubst` template rendering runs every time | Wasted work on every invocation |
| Silent error ignoring | `- $(DOCKER_COMPOSE) down` prefix | Hidden failures, hard to debug |

### What Ergo Would Solve

```
# Instead of 30 copy-paste ifneq blocks in builders.mk:
build service:
    envsubst < .templates/{{service}}_configuration.template > ./etc/{{service}}/configuration.yml

# Instead of magic EMPTY_TARGETS argument parsing:
enable name:
    ln -sf ../services-available/{{name}}.yml services-enabled/

# Instead of global .env with no isolation:
#!serapis://vault.home/v1/onramp/staging/.env
#!serapis://vault.home/v1/onramp/production/.env

# Instead of 22 $(shell ...) calls:
# Variable interpolation built into the tool
```

### Key Takeaways for Ergo Design

1. **Argument validation is critical** — silent failures on bad input are the #1 complaint
2. **Service-like patterns need loops/iteration** — 30 copy-paste blocks = missing abstraction
3. **Environment isolation is table stakes** — staging vs production must be first-class
4. **Template rendering should be cached** — fingerprint inputs, skip if unchanged
5. **Help/discovery must be automatic** — `ergo --list` with descriptions from task definitions
6. **Error handling must be explicit** — no silent `-` prefix to swallow failures

## Ergo's Unique Value Proposition

```
Make/Just:     task runner (no secret injection)
Doppler:       secret injection (cloud-only, no task runner)
go-task:       task runner + caching (YAML, no secrets)
mise:          version mgr + task runner (no secrets, large scope)

Ergo:          task runner + native Serapis injection + fingerprint caching
               Self-hosted zero-knowledge secrets, Justfile-like syntax
               Works standalone with .env files OR with vault
```

## Signal Handling (from Doppler)

Ergo must stay as PID 1 and forward signals to child processes:
- Forward SIGINT, SIGTERM from runtime to child process
- Allow graceful shutdown (configurable timeout, default 10s)
- SIGKILL after timeout
- Critical for Docker containers where ergo wraps the entrypoint

## Security Considerations (from Doppler)

Dangerous environment variables that should never be injected:
- **Linux**: `LD_PRELOAD`, `LD_LIBRARY_PATH`, `PROMPT_COMMAND`
- **macOS**: `DYLD_INSERT_LIBRARIES`
- **Language-specific**: `NODE_OPTIONS`, `PHPRC`

Consider Doppler's `--mount` approach: inject secrets via ephemeral named pipes instead of env vars. More secure but less universal. Could be a v1+ feature.
