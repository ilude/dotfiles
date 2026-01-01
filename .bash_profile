# Source .bashrc for interactive shells
if [[ -f ~/.bashrc ]]; then
    source ~/.bashrc
fi

# Nix installer
if [[ -e /home/Mike/.nix-profile/etc/profile.d/nix.sh ]]; then
    source /home/Mike/.nix-profile/etc/profile.d/nix.sh
fi
