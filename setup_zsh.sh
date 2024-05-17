#!/usr/bin/env bash

if [ -f /etc/NIXOS ]; then
    echo "NixOS found, nothing to be done!"
    exit 0
fi

BASE_PACKAGES="coreutils exa fzf make ssh-import-id zsh zsh-autosuggestions zsh-syntax-highlighting"
PYTHON_PACKAGES="python3-dev python3-pip python3-setuptools"
HEADER_PACKAGES="linux-headers-generic"

OS=$(uname -s | tr A-Z a-z)

if systemctl status pve-cluster | grep -q "running"; then
  OS=proxmox
  HEADER_PACKAGES="pve-headers proxmox-default-headers"
fi

PACKAGES="$BASE_PACKAGES $HEADER_PACKAGES $PYTHON_PACKAGES"

case $OS in
  linux)
    source /etc/os-release
    case $ID in
      debian|ubuntu|mint)  
        PACKAGES += " tldr"
        if [[ "$EUID" -ne 0 ]]; then
          sudo apt update
          sudo apt -y install $PACKAGES
        else
          apt update
          apt -y install $PACKAGES
        fi
        ;;
      alpine)
        PACKAGES="$BASE_PACKAGES linux-headers shadow py3-pip py3-setuptools tldr-python-client"
        if [[ "$EUID" -ne 0 ]]; then
          sudo apk add --update $PACKAGES
          echo "auth        sufficient  pam_rootok.so" | sudo tee /etc/pam.d/chsh
        else
          apk add --update $PACKAGES
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
  proxmox)
    apt update
    apt -y install $PACKAGES
  ;;
  *)
    echo -n "unsupported OS"
  ;;
esac

# https://stackoverflow.com/questions/68673221/warning-running-pip-as-the-root-user
export PIP_ROOT_USER_ACTION=ignore

ssh-import-id gh:ilude

# check if we are in proxmox
if [[ "$EUID" -ne 0 ]]; then
  echo Setting $(whoami) shell to $(which zsh)
  sudo chsh -s $(which zsh) $(whoami)
else
  echo Setting $(whoami) shell to $(which zsh)
  chsh -s $(which zsh) $(whoami)
fi
