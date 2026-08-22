# Pi defaults

# Prefer extended provider prompt caching in pi when supported.
export PI_CACHE_RETENTION="${PI_CACHE_RETENTION:-long}"

# Hide pi startup version update notifications.
export PI_SKIP_VERSION_CHECK="${PI_SKIP_VERSION_CHECK:-1}"

# Root shell capability. The Pi subagent launcher removes it from child environments.
if [[ -z "${PI_ONCLAVE_ROOT_CAPABILITY:-}" ]] && (( $+commands[node] )); then
  export PI_ONCLAVE_ROOT_CAPABILITY="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
fi
