# Tool Visibility and Discovery

- Availability bias: keep general and specialized callable tools active so the model knows they exist. Defer only tools whose invocation is valid inside an owning workflow state, advanced mode tools with a compact active replacement and searchable explicit names, or control tools whose managed resource does not yet exist.
- State gates: commit execution, feature-memory recording, goal completion, improvement decisions, workflow-change tracking, and review-artifact writing remain inactive until their owning workflow activates them deterministically.
- Advanced subagents: keep common single and parallel execution on `subagent`. Register `subagent_chain`, `subagent_continue`, and `subagent_fanout` but deactivate them at session start; `tool_search` activates them on demand. Preserve legacy advanced arguments on `subagent` for resumed sessions without advertising those branches in its provider schema.
- Search behavior: keep `tool_search` active as a fallback. A non-empty query activates all matching inactive tools by default; list mode never activates tools.
- Catalog: `tool_search` guidance names the deferred capability categories so hidden schemas do not make those capabilities undiscoverable.
- Telemetry: record metadata-only toolset exposure, hashed search decisions, activation results, and tool use. Do not record raw queries, arguments, descriptions, or output.
- Review boundary: telemetry supports later policy review but does not change activation policy automatically.
