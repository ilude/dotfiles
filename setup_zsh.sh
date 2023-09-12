#!/bin/bash

OS=$(uname -s | tr A-Z a-z)
PACKAGES="make zsh zsh-autosuggestions zsh-syntax-highlighting"
case $OS in
  linux)
    source /etc/os-release
    case $ID in
      debian|ubuntu|mint)
        if [[ "$EUID" -ne 0 ]]; then
          sudo apt -y install $PACKAGES
        else
          apt -y install $PACKAGES
        fi
        ;;
      alpine)
        if [[ "$EUID" -ne 0 ]]; then
          sudo apk add $PACKAGES shadow
          echo "auth        sufficient  pam_rootok.so" | sudo tee /etc/pam.d/chsh
        else
          apk add $PACKAGES
        fi
        ;;
      fedora|rhel|centos)
        if [[ "$EUID" -ne 0 ]]; then
          sudo yum install $PACKAGES
        else
          yum install $PACKAGES
        fi
        ;;
      *)
        echo -n "unsupported linux distro"
        ;;
    esac
  ;;

  *)
    echo -n "unsupported OS"
    ;;
esac

# check if we are in proxmox
if [[ "$EUID" -ne 0 ]]; then
  echo Setting $(whoami) shell to $(which zsh)
  sudo chsh -s $(which zsh) $(whoami)
else
  echo Setting $(whoami) shell to $(which zsh)
  chsh -s $(which zsh) $(whoami)
fi
