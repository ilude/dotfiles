# T5 team removal

- Item: T5
- Change: `pi/extensions/agent-team.ts` now exports shared helpers only and its default export intentionally registers no `/team` command.
- Migration guidance: `pi/README.md` documents using the `subagent` tool with `{ "team": "engineering", "task": "..." }`.
- Test: `agent-control-plane.test.ts` asserts `team` command absent and `subagent` tool present.
