# Pi Nix Flake

A Nix flake that packages the Pi coding agent **plus** this dotfiles repo's
configuration layer (extensions, agent personas, skills, settings,
damage-control rules) as a Home Manager module for NixOS users.

The upstream Pi binary (`@mariozechner/pi-coding-agent`) is **not** vendored
here -- this flake delegates that to
[`kissgyorgy/coding-agents`](https://github.com/kissgyorgy/coding-agents),
which already solves the upstream lockfile blocker tracked in
[`badlogic/pi-mono#701`](https://github.com/badlogic/pi-mono/issues/701).

## Scope

| Concern                          | Where it lives                                     |
| -------------------------------- | -------------------------------------------------- |
| `pi` binary                      | `coding-agents` flake (kissgyorgy)                 |
| Extensions, agents, skills, etc. | `pi-config` derivation (this flake)                |
| Optional prompt-routing model    | `prompt-router` derivation (this flake, opt-in)    |
| Writable runtime state           | `~/<stateDir>` (default `~/.pi/agent`), never copied to the store |

Targets `x86_64-linux` only. macOS / WSL / Windows users should keep using
the existing `~/.dotfiles/install` flow.

## Quick start

The module follows the canonical Home Manager pattern: it's a plain module
file, the kissgyorgy `coding-agents` flake is injected via
`extraSpecialArgs`, and the config-layer / prompt-router packages are passed
explicitly through module options.

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager.url = "github:nix-community/home-manager";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    coding-agents.url = "github:kissgyorgy/coding-agents";
    coding-agents.inputs.nixpkgs.follows = "nixpkgs";

    pi-dotfiles = {
      url = "github:TraefikTurkey/dotfiles?dir=pi/nix";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.coding-agents.follows = "coding-agents";
    };
  };

  outputs = { self, nixpkgs, home-manager, coding-agents, pi-dotfiles, ... }:
    let
      system = "x86_64-linux";
      pi = pi-dotfiles.packages.${system};
    in
    {
      homeConfigurations."you@host" = home-manager.lib.homeManagerConfiguration {
        pkgs = import nixpkgs { inherit system; };

        # The module needs the upstream coding-agents flake to import its
        # pi-coding-agent submodule. extraSpecialArgs is the canonical
        # injection point for module-eval-time dependencies.
        extraSpecialArgs = { inherit coding-agents; };

        modules = [
          pi-dotfiles.homeManagerModules.pi-agent
          ({ ... }: {
            programs.pi-agent = {
              enable = true;

              # Required: the static config layer.
              package = pi.pi-config;

              # Optional: enable the Python prompt-routing classifier
              # (~500 MB closure: sklearn + sentence-transformers + lightgbm).
              promptRouter = {
                enable = true;
                package = pi.prompt-router;
              };

              # Optional: relocate writable runtime state.
              # Path is interpreted relative to $HOME.
              # stateDir = ".local/share/pi/agent";
            };
          })
        ];
      };
    };
}
```

After `home-manager switch`:

- `pi` is on `$PATH` (from the `coding-agents` module).
- `~/<stateDir>` (default `~/.pi/agent`) contains:
  - read-only symlinks into the Nix store for `extensions/`, `agents/`,
    `skills/workflow`, `skills/pi-skills`, `lib/`, `multi-team/agents`,
    `multi-team/skills`, `project-templates/`, `settings.json`,
    `AGENTS.md`, `damage-control-rules.yaml`, `justfile`,
    `keybindings.json`, and (if enabled) `prompt-routing/`;
  - writable directories created on activation for `history/`, `sessions/`,
    `multi-team/expertise/`, `multi-team/logs/`, `multi-team/sessions/`.
- `auth.json` is **not** managed -- run `pi` and `/login` (or set
  `ANTHROPIC_API_KEY` / similar) to populate it. It will land in the
  writable `stateDir`.
- If `promptRouter.enable = true`, a `pi-classify-prompt` wrapper is on
  `$PATH` that runs `classify.py` against the bundled Python env.

## Module options

| Option                                          | Type      | Default       | Notes                                                                                              |
| ----------------------------------------------- | --------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `programs.pi-agent.enable`                      | bool      | `false`       |                                                                                                    |
| `programs.pi-agent.package`                     | package   | _(required)_  | The `pi-config` flake output (or a fork/pin).                                                      |
| `programs.pi-agent.stateDir`                    | str       | `.pi/agent`   | Path relative to `$HOME`. Asserted to be relative and free of `..` traversal.                      |
| `programs.pi-agent.promptRouter.enable`         | bool      | `false`       | Pulls in Python + classifier deps (~500 MB).                                                       |
| `programs.pi-agent.promptRouter.package`        | package?  | `null`        | Required when `promptRouter.enable = true`. The `prompt-router` flake output.                      |
| `programs.pi-agent.extraExtensionsDir`          | str?      | `null`        | When non-null, overrides `coding-agents.pi-coding-agent.extensionsDir`. By default, the dotfiles `extensions/` set wins. |

### Special args

The module also expects, via `home-manager.extraSpecialArgs`:

| Arg              | Required | Notes                                                                |
| ---------------- | -------- | -------------------------------------------------------------------- |
| `coding-agents`  | yes      | The kissgyorgy/coding-agents flake; provides the `pi-coding-agent` Home Manager submodule that gets imported. |

## Outputs

```text
packages.x86_64-linux.pi-config       # config-layer derivation (symlinkJoin of fileset-filtered subpaths)
packages.x86_64-linux.prompt-router   # optional python + classifier
packages.x86_64-linux.default         # = pi-config
homeManagerModules.pi-agent           # the module (plain path, requires extraSpecialArgs)
homeManagerModules.default            # = pi-agent
devShells.x86_64-linux.default        # bun + node + just + python
formatter.x86_64-linux                # nixfmt-rfc-style
checks.x86_64-linux.{pi-config,prompt-router}
```

Inspect locally:

```bash
nix flake show  github:TraefikTurkey/dotfiles?dir=pi/nix
nix flake check github:TraefikTurkey/dotfiles?dir=pi/nix
nix build       github:TraefikTurkey/dotfiles?dir=pi/nix#pi-config
nix develop     github:TraefikTurkey/dotfiles?dir=pi/nix
nix fmt         # in a checkout, formats *.nix
```

### First-time setup

This flake intentionally ships **without** a committed `flake.lock`. On
first use, generate one in your consumer flake:

```bash
nix flake lock
# or, to regenerate after upstream bumps:
nix flake update
```

Commit `flake.lock` in **your** consumer repo for reproducibility.

## Caveats

- **Read-only config**: every file under `<stateDir>` that comes from this
  module is a Nix store symlink. Tools that try to *edit* those files in
  place (rather than rewriting via the documented APIs) will fail with
  `EROFS`. The expertise log / mental-model writes use `multi-team/expertise/`
  which is writable, so the normal `append_expertise` / `read_expertise`
  flow is unaffected.
- **`skills/shared/` is omitted**: the `~/.dotfiles/pi/skills/shared/`
  symlinks point at `~/.dotfiles/claude/skills/`, a sibling subtree that
  doesn't translate to a redistribution package. The kissgyorgy
  `coding-agents` flake provides a baseline skill set; this flake adds
  `skills/workflow/` and `skills/pi-skills/` on top.
- **Extensions override**: by default, this module sets the kissgyorgy
  module's `extensionsDir` to the dotfiles set, replacing the upstream
  defaults (tmux-mirror, plan-mode, etc). Use `extraExtensionsDir` or set
  `coding-agents.pi-coding-agent.extensionsDir` directly in your own
  config to opt out.
- **State directory convention**: the upstream `pi` binary auto-discovers
  config under `~/.pi/agent`. Changing `stateDir` works but you'll need to
  point Pi at the new location yourself (e.g. via `PI_PACKAGE_DIR`).
- **No NixOS module**: this flake exposes a Home Manager module only. The
  Pi config layer is per-user state, not system state.

## Sources

- [kissgyorgy/coding-agents](https://github.com/kissgyorgy/coding-agents) -- upstream community flake that packages the Pi binary and exposes the `coding-agents.pi-coding-agent` Home Manager module this flake builds on.
- [badlogic/pi-mono](https://github.com/badlogic/pi-mono) -- upstream Pi monorepo (`@mariozechner/pi-coding-agent`).
- [pi-mono#701: Enable `pi-coding-agent` Nix packaging from npm tarball](https://github.com/badlogic/pi-mono/issues/701) -- tracks the missing-lockfile blocker that prevents direct `buildNpmPackage` use; resolved upstream by the kissgyorgy flake.
