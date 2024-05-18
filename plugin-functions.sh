#!/bin/bash

# Function to download plugins from GitHub
function plugin() {
  local repo=$1
  local plugin_dir="${HOME}/.dotfiles/plugins/${repo##*/}"

  if [ ! -d "$plugin_dir" ]; then
    echo "Installing plugin: $repo"
    git clone "https://github.com/$repo.git" "$plugin_dir"
  fi

  #echo "loading $plugin_dir/${repo##*/}.plugin.zsh..."
  source "$plugin_dir/${repo##*/}.plugin.zsh"
}

# Create the plugins directory if it doesn't exist
mkdir -p "${HOME}/.dotfiles/plugins"