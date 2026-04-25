{
  description = "Pi coding agent + dotfiles configuration layer (extensions, agents, skills, settings, optional prompt router).";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    # Upstream Pi binary is not in nixpkgs (blocked by pi-mono#701: missing
    # lockfile in the published npm tarball). The kissgyorgy/coding-agents
    # flake already builds it correctly; reuse it instead of vendoring.
    coding-agents = {
      url = "github:kissgyorgy/coding-agents";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { self
    , nixpkgs
    , coding-agents
    , ...
    }:
    let
      systems = [ "x86_64-linux" ];

      forAllSystems = nixpkgs.lib.genAttrs systems;

      pkgsFor = forAllSystems (system: import nixpkgs { inherit system; });

      # Path literal `./..` evaluates to the pi/ directory regardless of how
      # the flake is consumed (remote via `?dir=pi/nix` or local). Avoids the
      # `self.outPath` ambiguity around `?dir=` flakes.
      piSrc = ./..;
    in
    {
      packages = forAllSystems (system:
        let pkgs = pkgsFor.${system}; in
        rec {
          # Static config layer (extensions, agents, skills, settings,
          # damage-control rules, justfile). Built as a symlinkJoin of
          # per-subpath fileset-filtered sources so each subpath rebuilds
          # independently when its files change, and only the listed files
          # ever enter the build sandbox.
          pi-config = pkgs.callPackage ./pi-config.nix { src = piSrc; };

          # Optional prompt-routing classifier (python + sklearn + lgbm +
          # sentence-transformers). Adds ~500 MB to the closure.
          prompt-router = pkgs.callPackage ./prompt-router.nix { src = piSrc; };

          default = pi-config;
        });

      devShells = forAllSystems (system:
        let pkgs = pkgsFor.${system}; in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              bun
              nodejs_22
              just
              (python3.withPackages (ps: with ps; [
                scikit-learn
                numpy
                sentence-transformers
                lightgbm
                joblib
              ]))
            ];
          };
        });

      formatter = forAllSystems (system: pkgsFor.${system}.nixfmt-rfc-style);

      # `nix flake check` will build these. Catches drift in the upstream
      # coding-agents flake or nixpkgs that breaks the source filter.
      checks = forAllSystems (system: {
        pi-config = self.packages.${system}.pi-config;
        prompt-router = self.packages.${system}.prompt-router;
      });

      homeManagerModules = {
        # Plain module path. Consumer must wire up extraSpecialArgs:
        #   home-manager.extraSpecialArgs = { inherit (inputs) coding-agents; };
        # See README for the full pattern.
        pi-agent = ./home-manager-module.nix;
        default = self.homeManagerModules.pi-agent;
      };
    };
}
