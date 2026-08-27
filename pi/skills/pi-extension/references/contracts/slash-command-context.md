# Slash Command Context

- Every custom TUI command registered under `pi/extensions` records its submitted invocation through the shared acknowledgement wrapper before its handler runs. This applies to control-plane, diagnostic, configuration, terminal, process-launch, and session-lifecycle commands; clear, replace, and end-session commands acknowledge before performing the transition.
- Extension commands are handled before model input. TUI transcript acknowledgements are applied by the shared command registration wrapper; they do not enter model context or trigger a turn.
- Add an invocation to model context only when its semantic content or result is needed by the current conversation.
- Keep control-plane, diagnostic, configuration, terminal, and process launch commands TUI-only by default. Do not echo these commands as model-visible messages; use bounded notifications or results instead.
- Do not use a raw invocation echo as a substitute for persisting command output that the model needs. Persist a bounded result or faithful summary instead.
- Preserve interactive dashboards, selectors, confirmations, and cancellable loaders when user input or in-component cancellation is required.
- RPC, JSON, and print modes retain their existing result and error behavior and do not receive the TUI-only acknowledgement row.
