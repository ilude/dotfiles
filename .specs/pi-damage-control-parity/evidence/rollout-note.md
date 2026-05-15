# Rollout Note

Active Pi sessions must be restarted or reloaded after these extension and policy loader changes. Damage-control reads and normalizes the Claude policy at extension startup; existing sessions keep their already-loaded module state.
