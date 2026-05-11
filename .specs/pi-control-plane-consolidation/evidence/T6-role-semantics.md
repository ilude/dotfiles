# T6 role semantics

- Item: T6
- Change: subagent discovery parses `roleType`; `ml-research-lead` tools restricted to coordination tools.
- Recovery path: `pi/README.md` documents `pi --no-extensions`, editing `pi/agents/`, and running focused role tests.
- Tests: `agent-role-semantics.test.ts` covers role parsing, lead/orchestrator coordination-only tools, worker/specialist no-subagent default, and recovery-path docs.
