# MSYS2/Git Bash argument conversion defaults
#
# MSYS rewrites POSIX-looking command arguments (for example /tmp, /foo, or
# colon-separated lists) when launching native Windows programs. That is useful
# for some classic Unix-on-Windows workflows, but it surprises modern CLI tools
# that intentionally accept POSIX-style paths or protocol-like arguments.
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    export MSYS_NO_PATHCONV="${MSYS_NO_PATHCONV:-1}"
fi
