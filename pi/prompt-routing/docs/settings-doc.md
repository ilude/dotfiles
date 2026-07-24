# Router Settings Reference

Location: `pi/settings.json` under the `router.*` key. JSON does not allow
comments, so this document is the canonical reference for active router
settings.

## Ship configuration

```json
"router": {
  "classifier": {
    "mode": "confgate"
  },
  "effort": {
    "defaultLevel": "high"
  }
}
```

## Active settings

### `router.classifier.mode`

Selects the classifier implementation. Allowed values are `t2`, `lgbm`,
`ensemble`, and `confgate`. The default is `t2` when the setting is absent.

### `router.effort.defaultLevel`

Sets startup/reset thinking effort and the routine-effort bias for premium
Codex models. Allowed values are `off`, `minimal`, `low`, `medium`, `high`, and
`xhigh`. The default is `high`.

## Runtime routing contract

The authoritative provider route applies:

- explicit request and session overrides;
- a one-turn hold for dependent continuation prompts;
- explicit cheap, fast, brief, or similar downgrade intent as a hold bypass;
- a `core` floor when the context window is high; and
- provider-family trust boundaries.

Legacy `router.policy.*` settings and `router.effort.maxLevel` are retired. They
were parsed and displayed but were not applied by the authoritative provider
route. Remove them from local settings if present.

## Runtime operations

- `/router-status` -- show the current route, model, classifier, overrides, and fallback state.
- `/router-explain` -- show the decision trail for the last turn.
- `/router-reset` -- clear session routing state.
- `/router-off` / `/router-on` -- disable or enable routing.

Audit log: `pi/prompt-routing/logs/routing_log.jsonl`.
