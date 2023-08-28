#!/bin/bash

# check if we are in proxmox
if [[ "$EUID" -ne 0 ]]; then
  sudo apt -y install make zsh zsh-autosuggestions zsh-syntax-highlighting
  echo Setting $(whoami) shell to $(which zsh)
  sudo chsh -s $(which zsh) $(whoami)
else
  apt -y install make zsh zsh-autosuggestions zsh-syntax-highlighting
  echo Setting $(whoami) shell to $(which zsh)
  chsh -s $(which zsh) $(whoami)
fi
