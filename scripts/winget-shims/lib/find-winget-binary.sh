#!/bin/bash

find_winget_binary() {
    local package_id="$1"
    local target_exe="$2"
    local relative_path="$3"

    command -v cygpath &>/dev/null || return 0

    local winget_pkgs
    winget_pkgs=$(cygpath -u "$LOCALAPPDATA")/Microsoft/WinGet/Packages

    if [[ ! -d "$winget_pkgs" ]]; then
        return 0
    fi

    local package_dirs
    package_dirs=$(ls -d "$winget_pkgs/${package_id}_"* 2>/dev/null)

    if [[ -z "$package_dirs" ]]; then
        return 0
    fi

    local package_dir
    package_dir=$(echo "$package_dirs" | xargs ls -td | head -1)

    local match_count
    match_count=$(echo "$package_dirs" | wc -l)
    if [[ $match_count -gt 1 ]]; then
        echo "Found multiple package directories for ${package_id}; using newest" >&2
    fi

    if [[ -n "$relative_path" ]]; then
        if [[ -f "$package_dir/$relative_path/$target_exe" ]]; then
            echo "$package_dir/$relative_path/$target_exe"
        fi
        return 0
    fi

    local exe
    exe=$(find "$package_dir" -name "$target_exe" -type f 2>/dev/null | head -1)
    if [[ -n "$exe" ]]; then
        echo "$exe"
    fi

    return 0
}
