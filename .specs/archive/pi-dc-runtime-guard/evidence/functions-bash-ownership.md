# functions.bash ownership evidence
Command: rg -n "functions\\.bash|developer tool|tool adapter" "C:/Projects/Personal/pi-mono/packages" pi --glob '!pi/sessions/**'
Cwd: /c/Users/mglenn/.dotfiles
PI_MONO_DIR: C:/Projects/Personal/pi-mono

No concrete local owner for `functions.bash` was found in dotfiles `pi/` source or `PI_MONO_DIR/packages` with session logs excluded.

Exit code: 0
Conclusion: not found locally. Limitation: absence of these literal strings in dotfiles/pi and PI_MONO_DIR/packages does not prove global absence or identify the API/developer-tool implementation. Treat observed functions.bash bypass as an external/direct API developer-tool surface unless separate harness source is provided.
