# https://stackoverflow.com/a/70999101/1973777
# "$SHLVL" -le "1" restricts this to only the first terminal
# which for some crazy reason vscode will start as a bash shell
# even if you set it to use zsh in your settings
if [[ "$TERM_PROGRAM" == "vscode" && "$SHLVL" -le "1" ]]; then
  # echo "TERM_PROGRAM: $TERM_PROGRAM"
  # echo "SHLVL: $SHLVL"
  exec zsh -l
fi
