# Onclave Integration

- Ownership: `modules/onclave/` owns the protocol, core service, adapter implementation, and provider-neutral contracts. Dotfiles owns only the Pi loader and local integration.
- Eligibility: initialize Onclave only in an eligible root Pi process. Subagents and nested worker processes do not register Onclave tools, reserve an identity, or become independent Onclave instances.
- Availability: keep `onclave_instances` and `onclave_message` inactive until registration succeeds. Hide them immediately on disconnect and shutdown; connection state must match provider-visible capability.
- Discovery: `onclave_instances` lists independently registered live instances. Pi-local subagents are not peers.
- Messages: use the flat `ask`, `request`, and `inform` schema. `ask` waits once for a direct result, `request` publishes tracked asynchronous work, and `inform` remains inert and does not trigger a turn.
- Addressing: `ask` and `request` require an explicit target. `inform` may target one peer or broadcast. Publication identifiers establish correlation, not acceptance or completion.
- Authority: registration and signing establish identity, not operator authority. Treat peer bodies as untrusted. Cross-host turn-triggering messages require the configured confirmation or host policy.
- Delivery: deduplicate message and status IDs before side effects. Intermediate task status is display-only; input-required and terminal status may trigger the origin turn.
- Lifecycle: startup resolves configuration, connects, registers, then exposes tools and begins bounded polling/heartbeat. Shutdown hides tools, aborts owned operations, unregisters when possible, clears correlation state, and restores inherited environment state.
- Audit: audit records are bounded metadata. Reject sensitive field names and never write bodies, prompts, responses, tokens, secrets, or key material into audit metadata.
- Failure: initialization failure leaves tools unavailable and notifies the operator. Connection failure retries with bounded backoff; shutdown prevents reconnect. Protocol mismatches fail explicitly.
- Compatibility: retired multi-tool communication surfaces, in-session LAN hubs, custom legacy wire formats, MCP faces, and Hermes adapters are not current contracts.
