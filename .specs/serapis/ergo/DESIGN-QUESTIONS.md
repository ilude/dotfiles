# Ergo Open Design Questions

Questions to resolve before/during PRD writing.

## Resolved

- [x] **Relationship to Serapis**: Standalone binary, shared Go packages (B)
- [x] **Task file format**: Justfile-inspired DSL (A)
- [x] **v0 scope**: Task runner + dotenv loading + variable interpolation (B)
- [x] **DSL philosophy**: Shell default + shebang override, declaration-only DSL, not Turing-complete

## Open

### 1. Task File Name

What should the task definition file be called?
- `Ergofile` (matches Makefile/Justfile convention)
- `ergo.toml` / `ergo.yaml` (config-file style — but we chose DSL, not YAML)
- `.ergo` (hidden file)

**Leaning toward**: `Ergofile`

### 2. Serapis Integration Syntax

How does a recipe declare it needs secrets from Serapis?

Option A — recipe-level declaration:
```
deploy:
    serapis: vault.example.com/v1/myapp/production/.env
    docker compose up -d
```

Option B — global environment block:
```
set serapis "vault.example.com"

env production:
    serapis: /v1/myapp/production/.env

deploy: env=production
    docker compose up -d
```

Option C — inline with dotenv:
```
set dotenv-serapis ".env"  # reads shebang from .env, pulls from Serapis
```

### 3. Fallback Behavior

What happens when the Serapis server is unreachable?
- Fail hard (secure default)?
- Fall back to local `.env` file (last-pulled state)?
- Configurable per-recipe?

### 4. Fingerprint Scope

What should be fingerprinted?
- Source files only (like go-task)?
- Source files + env vars (rebuild if secrets change)?
- Source files + env vars + tool versions?

### 5. Recipe Iteration / Loops

OnRamp's #1 problem is 30 copy-paste service configs. Should ergo support:
- No loops (keep it simple, use shell for-loops in recipe body)
- Matrix/foreach in declaration syntax (like GitHub Actions matrix)
- Template recipes with parameters (covers the OnRamp case)

### 6. Default Shell

- `sh` (POSIX, maximum compatibility)
- `bash` (practical default, available everywhere ergo would run)
- Platform-aware: `bash` on Unix, `pwsh` on Windows?
- Configurable via `set shell`?

### 7. Ergo + Docker

Should ergo have first-class Docker Compose integration?
- `docker compose` as a built-in recipe type?
- Or just run `docker compose` as a regular shell command?
- OnRamp wraps every compose call — is there a pattern worth extracting?

### 8. Named Pipe Secret Injection

Doppler's `--mount` uses ephemeral named pipes instead of env vars (avoids LD_PRELOAD RCE risk). Should ergo support this in v0 or defer?

### 9. Watch Mode

Should ergo support `--watch` (re-run recipe on file change)?
- v0 or later?
- If yes, does it watch sources only, or also Serapis secrets?

### 10. Monorepo Discovery

Should ergo discover `Ergofile`s in subdirectories?
- Simple: single Ergofile per project root
- Advanced: recursive discovery with namespacing (like mise)
