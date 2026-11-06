# Herdr desktop configuration

Dotbot links this directory to `~/.config/herdr-app/` on Windows, macOS, Linux
and WSL. It is separate from `../herdr/`, which configures the original TUI.

Keep `settings.json`, `keys.json`, optional `programs.json`, themes and personal
layouts/mods in Git. Existing local files were moved here without changing their
contents. Runtime state, telemetry, IPC, generated API types/guide and shipped
layouts/mods are ignored, not deleted. Herdr recreates its support files on start.

Herdr replaces its built-in layouts and mods on every start. Duplicate one in
the app before customizing it, or use these commands while the app is running:

```sh
herdr-app do layout.clone '{"name":"main","as":"my-layout"}'
herdr-app do mod.clone '{"name":"tabs","as":"my-tabs"}'
```

A cloned layout still references the original mods. Update its mod references
when using a personal mod. Custom names are not ignored. If a future app release
adds shipped layouts or mods, add those names to `.gitignore` rather than tracking
regenerated upstream files. Theme edits are preserved by Herdr and stay tracked.

Read the locally generated `AGENTS.md` and type declarations for the installed
version's customization API. Keep credentials and machine-specific values out of
tracked settings and custom code.
