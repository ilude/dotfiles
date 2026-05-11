# T4 subagent team dispatch

- Item: T4
- Public surface: registered `subagent` tool.
- Inputs: direct `{agent, task}`, team `{team, task}`, parallel `{tasks:[...]}`, chain `{chain:[...]}`.
- Team resolution: `team` accepts team key or lead name from `pi/agents/teams.yaml`; unknown teams return a non-spawn validation message.
- Output modes: team dispatch runs the resolved lead as a normal single subagent task with a dispatch prompt listing workers; too-simple/needs-other-team remain prompt-level lead behavior, not Wave 2 runtime branching.
- Max delegation depth: unchanged from existing subagent process invocation; no recursive auto-cascade added.
- Test: `subagent.test.ts` invokes registered `subagent` with `{team:"engineering", task:"..."}`.
