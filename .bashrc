# Early exit if not running interactively to avoid side-effects!
# https://pve.proxmox.com/pve-docs/pvecm.1.html
case $- in
    *i*) ;;
      *) return;;
esac

# https://stackoverflow.com/a/70999101/1973777
# "$SHLVL" -le "1" restricts this to only the first terminal
# which for some crazy reason vscode will start as a bash shell
# even if you set it to use zsh in your settings
# if [[ "$TERM_PROGRAM" == "vscode" && "$SHLVL" -le "1" && $(which zsh) ]]; then
echo "TERM_PROGRAM: $TERM_PROGRAM"
echo "SHLVL: $SHLVL"

if [[ "$TERM_PROGRAM" == "vscode" && $(which zsh) ]]; then
  # echo "TERM_PROGRAM: $TERM_PROGRAM"
  # echo "SHLVL: $SHLVL"
  exec zsh -l
fi
echo "in ~/.bashrc"
