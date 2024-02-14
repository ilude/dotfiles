#!/bin/bash
BASE_PACKAGES="make zsh zsh-autosuggestions zsh-syntax-highlighting"
PYTHON_PACKAGES="python3-dev python3-pip python3-setuptools"
HEADER_PACKAGES="linux-headers"

# https://www.jeffgeerling.com/blog/2023/how-solve-error-externally-managed-environment-when-installing-pip3
PYTHON_EXTERNAL_MANAGED_FILE="/usr/lib/python3.11/EXTERNALLY-MANAGED"

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
        if [[ "$EUID" -ne 0 ]]; then
          sudo apt update
          sudo apt -y install $PACKAGES
          sudo rm -rf $PYTHON_EXTERNAL_MANAGED_FILE
        else
          apt update
          apt -y install $PACKAGES
          rm -rf $PYTHON_EXTERNAL_MANAGED_FILE
        fi
        ;;
      alpine)
        if [[ "$EUID" -ne 0 ]]; then
          sudo apk add --update $BASE_PACKAGES $HEADER_PACKAGES shadow py3-pip py3-setuptools
          sudo rm -rf $PYTHON_EXTERNAL_MANAGED_FILE
          echo "auth        sufficient  pam_rootok.so" | sudo tee /etc/pam.d/chsh
        else
          apk add --update $BASE_PACKAGES $HEADER_PACKAGES shadow py3-pip py3-setuptools
          rm -rf $PYTHON_EXTERNAL_MANAGED_FILE
        fi
        
        ;;
      fedora|rhel|centos)
        if [[ "$EUID" -ne 0 ]]; then
          sudo yum install $PACKAGES
          sudo rm -rf $PYTHON_EXTERNAL_MANAGED_FILE
        else
          yum install $PACKAGES
          rm -rf $PYTHON_EXTERNAL_MANAGED_FILE
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
    rm -rf 
  ;;
  *)
    echo -n "unsupported OS"
  ;;
esac

# https://stackoverflow.com/questions/68673221/warning-running-pip-as-the-root-user
export PIP_ROOT_USER_ACTION=ignore
pip3 install dircolors tldr thefuck

# check if we are in proxmox
if [[ "$EUID" -ne 0 ]]; then
  echo Setting $(whoami) shell to $(which zsh)
  sudo chsh -s $(which zsh) $(whoami)
else
  echo Setting $(whoami) shell to $(which zsh)
  chsh -s $(which zsh) $(whoami)
fi