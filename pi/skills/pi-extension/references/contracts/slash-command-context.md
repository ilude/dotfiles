# Slash Command Context

- Extension commands are handled before model input and remain TUI-only by default. The shared echo wrapper requires an explicit command-name allowlist.
- Add an invocation to model context only when its semantic content or result is needed by the current conversation.
- Keep control-plane, diagnostic, configuration, terminal, and process launch commands TUI-only. In particular, do not echo `/branch`, `/new-instance`, or `/new-terminal` through a custom message.
- Do not use a raw invocation echo as a substitute for persisting command output that the model needs. Persist a bounded result or faithful summary instead.
