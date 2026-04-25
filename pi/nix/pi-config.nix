{ lib
, symlinkJoin
, src
}:

let
  # Each contribution is its own fileset-filtered store path, so:
  #   * the build sandbox never sees user runtime data (auth.json,
  #     multi-team/expertise/, history/, sessions/, node_modules/);
  #   * each subpath rebuilds independently of the others;
  #   * the source closure is content-addressed by the allowlist, not by
  #     whatever happens to live next to it on disk.
  cleanFile = name: lib.fileset.toSource {
    root = src;
    fileset = src + "/${name}";
  };

  cleanDir = subpath: extraExcludes: lib.fileset.toSource {
    root = src;
    fileset =
      if extraExcludes == [ ]
      then src + "/${subpath}"
      else lib.fileset.difference
        (src + "/${subpath}")
        (lib.fileset.unions extraExcludes);
  };
in
symlinkJoin {
  name = "pi-agent-config";

  paths = [
    (cleanFile "AGENTS.md")
    (cleanFile "README.md")
    (cleanFile "damage-control-rules.yaml")
    (cleanFile "justfile")
    (cleanFile "keybindings.json")
    (cleanFile "settings.json")

    (cleanDir "agents" [ ])
    (cleanDir "docs" [ ])
    (cleanDir "extensions" [
      # web-fetch ships a vendored package.json; node_modules may exist in
      # a dev checkout but must not enter the closure.
      (lib.fileset.maybeMissing (src + "/extensions/web-fetch/node_modules"))
    ])
    (cleanDir "lib" [ ])
    (cleanDir "multi-team/agents" [ ])
    (cleanDir "multi-team/skills" [ ])
    (cleanDir "project-templates" [ ])
    (cleanDir "skills/workflow" [ ])
    (cleanDir "skills/pi-skills" [ ])
  ];

  meta = with lib; {
    description = "Pi coding agent configuration layer (mglenn/dotfiles)";
    homepage = "https://github.com/TraefikTurkey/dotfiles";
    license = licenses.bsd2;
    platforms = platforms.linux;
  };
}
