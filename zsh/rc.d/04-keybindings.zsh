# Keybindings (interactive shells)

# Home and End move cursor to respective line positions
bindkey "^[[H" beginning-of-line
bindkey "^[[F" end-of-line

# ctrl+b/f or ctrl+left/right: move word by word (backward/forward)
bindkey '^b' backward-word
bindkey '^f' forward-word
bindkey '^[[1;5D' backward-word
bindkey '^[[1;5C' forward-word

# ctrl+backspace: delete word before
bindkey '^H' backward-kill-word

# ctrl+delete: delete word after
bindkey "\e[3;5~" kill-word
