{ config
, lib
, pkgs
, coding-agents ? throw ''
    programs.pi-agent: the kissgyorgy `coding-agents` flake must be exposed
    via home-manager.extraSpecialArgs.

    Example:
      home-manager.extraSpecialArgs = {
        inherit (inputs) coding-agents;
      };

    See pi/nix/README.md for the full integration pattern.
  ''
, ...
}:

let
  cfg = config.programs.pi-agent;
in
{
  imports = [ coding-agents.homeManagerModules.pi-coding-agent ];

  options.programs.pi-agent = {
    enable = lib.mkEnableOption ''
      the Pi coding agent with the dotfiles configuration layer
      (extensions, agent personas, skills, settings, damage-control rules).
      The Pi binary itself is provided by the kissgyorgy/coding-agents flake
    '';

    package = lib.mkOption {
      type = lib.types.package;
      example = lib.literalExpression "inputs.pi-dotfiles.packages.\${system}.pi-config";
      description = ''
        Derivation containing the static Pi config layer (the
        `pi-config` output of this flake, or a fork/pin thereof).
        Required when `enable = true`.
      '';
    };

    promptRouter = {
      enable = lib.mkEnableOption ''
        the prompt-routing classifier. When enabled, `package` for the
        router must be set to the `prompt-router` output of this flake. Adds
        Python with scikit-learn, sentence-transformers, and lightgbm to the
        closure (~500 MB) and installs a `pi-classify-prompt` wrapper on PATH
      '';

      package = lib.mkOption {
        type = lib.types.nullOr lib.types.package;
        default = null;
        example = lib.literalExpression
          "inputs.pi-dotfiles.packages.\${system}.prompt-router";
        description = ''
          Derivation containing the prompt-routing classifier and its
          Python dependencies. Required when `promptRouter.enable = true`.
        '';
      };
    };

    stateDir = lib.mkOption {
      type = lib.types.str;
      default = ".pi/agent";
      example = ".local/share/pi/agent";
      description = ''
        Path relative to `$HOME` where Pi keeps its writable runtime state
        (`auth.json`, `multi-team/expertise/`, `multi-team/sessions/`,
        `history/`, `sessions/`).

        Static config is symlinked into this directory from the Nix store;
        only the writable subpaths listed above live in this directory
        directly.

        Defaults to `.pi/agent` to match the upstream Pi convention
        (`~/.pi/agent`). The kissgyorgy/coding-agents module assumes the
        same path; changing this option without a corresponding override on
        `coding-agents.pi-coding-agent` will desynchronize the two.
      '';
    };

    extraExtensionsDir = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = lib.literalExpression "\"\${./extra-extensions}\"";
      description = ''
        Optional override for `coding-agents.pi-coding-agent.extensionsDir`.
        When `null` (the default), this module points it at the dotfiles
        `extensions/` set, replacing the kissgyorgy defaults. Set to a
        directory path to override that decision.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = !lib.hasPrefix "/" cfg.stateDir;
        message = ''
          programs.pi-agent.stateDir must be relative to $HOME (got
          "${cfg.stateDir}"). Strip the leading "/" or pick a path inside
          $HOME.
        '';
      }
      {
        assertion = !lib.hasInfix ".." cfg.stateDir;
        message = ''
          programs.pi-agent.stateDir must not contain ".." path traversal
          (got "${cfg.stateDir}").
        '';
      }
      {
        assertion = !cfg.promptRouter.enable || cfg.promptRouter.package != null;
        message = ''
          programs.pi-agent.promptRouter.enable is true but
          programs.pi-agent.promptRouter.package is null. Set it to the
          `prompt-router` output of the pi-dotfiles flake.
        '';
      }
    ];

    # Delegate the Pi binary install to the upstream community module.
    # Redirects its extensionsDir at the dotfiles set so auto-discovered
    # extensions match what the justfile recipes expect.
    coding-agents.pi-coding-agent = {
      enable = true;
      extensionsDir =
        if cfg.extraExtensionsDir != null
        then cfg.extraExtensionsDir
        else "${cfg.package}/extensions";
    };

    # Static config layer: read-only symlinks into the state dir.
    home.file = lib.mkMerge [
      {
        "${cfg.stateDir}/AGENTS.md".source = "${cfg.package}/AGENTS.md";
        "${cfg.stateDir}/README.md".source = "${cfg.package}/README.md";
        "${cfg.stateDir}/agents".source = "${cfg.package}/agents";
        "${cfg.stateDir}/damage-control-rules.yaml".source =
          "${cfg.package}/damage-control-rules.yaml";
        "${cfg.stateDir}/docs".source = "${cfg.package}/docs";
        "${cfg.stateDir}/extensions".source = "${cfg.package}/extensions";
        "${cfg.stateDir}/justfile".source = "${cfg.package}/justfile";
        "${cfg.stateDir}/keybindings.json".source =
          "${cfg.package}/keybindings.json";
        "${cfg.stateDir}/lib".source = "${cfg.package}/lib";
        "${cfg.stateDir}/multi-team/agents".source =
          "${cfg.package}/multi-team/agents";
        "${cfg.stateDir}/multi-team/skills".source =
          "${cfg.package}/multi-team/skills";
        "${cfg.stateDir}/project-templates".source =
          "${cfg.package}/project-templates";
        "${cfg.stateDir}/settings.json".source = "${cfg.package}/settings.json";
        "${cfg.stateDir}/skills/workflow".source =
          "${cfg.package}/skills/workflow";
        "${cfg.stateDir}/skills/pi-skills".source =
          "${cfg.package}/skills/pi-skills";
      }

      (lib.mkIf cfg.promptRouter.enable {
        "${cfg.stateDir}/prompt-routing".source =
          "${cfg.promptRouter.package}/share/prompt-routing";
      })
    ];

    # Writable runtime directories. Created if missing; never overwritten
    # so existing expertise logs and session history survive activations.
    home.activation.piAgentStateDirs =
      lib.hm.dag.entryAfter [ "writeBoundary" ] ''
        run mkdir -p \
          "$HOME/${cfg.stateDir}/history" \
          "$HOME/${cfg.stateDir}/sessions" \
          "$HOME/${cfg.stateDir}/multi-team/expertise" \
          "$HOME/${cfg.stateDir}/multi-team/logs" \
          "$HOME/${cfg.stateDir}/multi-team/sessions"
      '';

    # Matches the PI_CACHE_RETENTION default that ~/.dotfiles/install
    # writes into shell rc files (see pi/README.md). mkDefault so user can
    # still override.
    home.sessionVariables.PI_CACHE_RETENTION = lib.mkDefault "long";

    home.packages =
      lib.optional cfg.promptRouter.enable cfg.promptRouter.package;
  };
}
