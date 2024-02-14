#!/bin/bash

OS=$(uname -s | tr A-Z a-z)
PACKAGES="linux-headers make zsh zsh-autosuggestions zsh-syntax-highlighting"
case $OS in
  linux)
    source /etc/os-release
    case $ID in
      debian|ubuntu|mint)
        if [[ "$EUID" -ne 0 ]]; then
          sudo apt update
          sudo apt -y install $PACKAGES python3-dev python3-pip python3-setuptools
        else
          apt update
          apt -y install $PACKAGES python3-dev python3-pip python3-setuptools
        fi
        ;;
      alpine)
        if [[ "$EUID" -ne 0 ]]; then
          sudo apk add --update $PACKAGES shadow py3-pip py3-setuptools
          echo "auth        sufficient  pam_rootok.so" | sudo tee /etc/pam.d/chsh
        else
          apk add --update $PACKAGES
        fi
        
        ;;
      fedora|rhel|centos)
        if [[ "$EUID" -ne 0 ]]; then
          sudo yum install $PACKAGES python3-dev python3-pip python3-setuptools
        else
          yum install $PACKAGES python3-dev python3-pip python3-setuptools
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

pip3 install dircolors tldr thefuck

# check if we are in proxmox
if [[ "$EUID" -ne 0 ]]; then
  echo Setting $(whoami) shell to $(which zsh)
  sudo chsh -s $(which zsh) $(whoami)
else
  echo Setting $(whoami) shell to $(which zsh)
  chsh -s $(which zsh) $(whoami)
fi