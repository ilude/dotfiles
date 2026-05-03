# Pi Observability Test Commands

OBSERVABILITY_TEST_COMMAND=(cd pi/tests && bun vitest run observability.test.ts)
REVIEW_IT_TEST_COMMAND=(cd pi/tests && bun vitest run workflow-prompts.test.ts)

Manual validation remains required by the plan because automated tests do not fully simulate a six-reviewer `/review-it` fan-out plus recovery path.

Note: broader `workflow-commands.test.ts` and `subagent.test.ts` were attempted during implementation but are currently blocked in this environment by missing global Pi package nested modules (`@mariozechner/pi-ai` / `@mariozechner/pi-tui` dist imports). Repo-wide `make check`, extension typecheck, and the targeted commands above passed.
