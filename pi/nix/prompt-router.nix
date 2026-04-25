{ lib
, runCommandLocal
, makeWrapper
, python3
, src
}:

let
  pythonEnv = python3.withPackages (ps: with ps; [
    scikit-learn
    numpy
    sentence-transformers
    lightgbm
    joblib
  ]);

  # Filtered source: only the prompt-routing/ subtree, minus runtime/test
  # artifacts. Build hash depends on the actual classifier files, not on
  # whatever `prompt-routing/logs/*.jsonl` happens to contain at build time.
  promptRoutingSrc = lib.fileset.toSource {
    root = src;
    fileset = lib.fileset.difference
      (src + "/prompt-routing")
      (lib.fileset.unions [
        (lib.fileset.maybeMissing (src + "/prompt-routing/logs"))
        (lib.fileset.maybeMissing (src + "/prompt-routing/__pycache__"))
        (lib.fileset.maybeMissing (src + "/prompt-routing/experiments"))
        (lib.fileset.maybeMissing (src + "/prompt-routing/.pytest_cache"))
        (lib.fileset.maybeMissing (src + "/prompt-routing/tests"))
      ]);
  };
in
runCommandLocal "pi-prompt-router"
{
  nativeBuildInputs = [ makeWrapper ];

  meta = with lib; {
    description = "Pi prompt-routing classifier (LGBM + sklearn ensemble)";
    homepage = "https://github.com/TraefikTurkey/dotfiles";
    license = licenses.bsd2;
    platforms = platforms.linux;
    mainProgram = "pi-classify-prompt";
  };
} ''
  mkdir -p $out/share $out/bin

  cp -rL --no-preserve=mode,ownership \
    ${promptRoutingSrc}/prompt-routing $out/share/prompt-routing

  # CLI entry point that the prompt-router.ts extension can shell out to.
  # Mirrors `python ~/.dotfiles/pi/prompt-routing/classify.py ...` in the
  # repo's pi/README.md.
  makeWrapper ${pythonEnv}/bin/python $out/bin/pi-classify-prompt \
    --add-flags "$out/share/prompt-routing/classify.py"
''
