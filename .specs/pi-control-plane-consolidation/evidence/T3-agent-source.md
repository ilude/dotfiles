# T3 agent source

- Item: T3
- Active source: `pi/agents/`.
- Removed from active discovery: `pi/multi-team/agents/` is not loaded by `discoverAgents`/`loadAgentsFromDir` tests.
- Test: `agent-role-semantics.test.ts` asserts loaded active files are under `pi/agents/` and not `pi/multi-team/agents/`.
