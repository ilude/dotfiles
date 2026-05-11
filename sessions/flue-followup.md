## Flue: concise findings

### What it is

- **Flue** is a new/experimental **TypeScript “agent harness framework”** from the Astro ecosystem, positioned as “Claude Code / Codex / OpenCode / Pi, but headless and programmable.”
- Core claim: agent quality comes from the **harness**, not just the model: prompts + tools + filesystem + sandbox + sessions + skills + roles + subagents/tasks.
- It can run agents as:
  - CLI jobs: `flue run`
  - local dev server: `flue dev`
  - deployable HTTP services: `flue build`
  - targets currently include **Node.js** and **Cloudflare Workers**.

Links:

- Site: https://flueframework.com/
- GitHub: https://github.com/withastro/flue
- HN discussion: https://news.ycombinator.com/item?id=47988501
- X post found: https://x.com/dok2001/status/2053680582547141006

---

## Architecture / concepts

Flue’s main abstractions:

- **Agent runtime**: initialized via `init({ model, sandbox, tools, role, cwd, providers })`.
- **Sessions**: persistent conversation/message state under an agent ID.
- **Sandbox**:
  - default lightweight virtual sandbox via `just-bash`
  - `local` sandbox for host filesystem/shell, useful in CI
  - remote/container sandbox adapters, e.g. Daytona
- **Skills**: Markdown-based procedures, similar in spirit to Claude/Pi skills.
- **Roles**: call/session/agent-level instruction overlays; precedence is `call role > session role > agent role`.
- **Tasks**: child agents with detached message history but shared sandbox/filesystem.
- **Structured results**: Valibot schemas for typed outputs from prompts/skills.
- **MCP support**: can connect remote MCP servers in trusted code and pass tools to the agent.
- **Deployment model**: agents compile into deployable server artifacts.

Interesting design pattern: Flue treats agent definitions as mostly **TypeScript orchestration + Markdown behavior**, not giant imperative workflows.

---

## Comparison to Pi / multi-agent harness ideas

### Similarities

- Both treat an agent as **model + harness**, not just a chat call.
- Both emphasize:
  - skills / Markdown procedures
  - roles / subagents
  - tool access
  - session state
  - filesystem/context discovery
  - programmable delegation

### Differences

- **Pi** is primarily an interactive terminal coding-agent harness with strong local workflow affordances.
- **Flue** is more like an **agent application framework**: build headless agents, expose them over HTTP, run in CI, deploy to Cloudflare/Node.
- Pi’s multi-agent system has explicit orchestrator/lead/worker personas and expertise compounding. Flue appears more general-purpose and lighter-weight: sessions, roles, tasks, skills.
- Flue’s structured output story is first-class via schemas. Pi has tools and prompts, but could benefit from more consistent typed result contracts between agents/tools.
- Flue makes sandbox choice a core runtime parameter. Pi has tools and local execution, but less of a formal “sandbox adapter” abstraction.

---

## Actionable ideas worth borrowing

1. **Formalize “agent = model + harness” in Pi docs**
   - Pi already behaves this way; Flue’s framing is clean and marketable.
   - Useful for explaining why skills, tools, sessions, expertise, and subagents matter.

2. **Typed task/skill results**
   - Borrow the idea of schema-validated outputs for subagents, skills, and workflow commands.
   - Especially useful for commit planning, code review findings, validation reports, PRD generation.

3. **Stable agent/session IDs**
   - Flue’s distinction between agent runtime state and session/thread state is clean.
   - Pi could make session resumption and multi-conversation state more explicit.

4. **Sandbox abstraction**
   - Worth considering for Pi: local host, disposable container, remote sandbox, virtual/mock shell.
   - This would improve safety for destructive tests and autonomous coding tasks.

5. **Roles as scoped overlays**
   - Flue’s “role instructions are call-scoped system overlays, not persisted user history” is a good design.
   - Pi should preserve that distinction where possible.

6. **CLI + HTTP duality**
   - Pi is terminal-first, but some Pi workflows could eventually expose headless HTTP/CI entrypoints.
   - Example: `/commit`, `/review`, `/war-report`, `/prd-it` as callable automation units.

---

## Caveats

- Flue is explicitly marked **experimental**; APIs may change.
- Documentation is currently README/site-heavy; deeper architecture docs appear limited.
- Security model needs scrutiny. `local` sandbox gives direct host shell/filesystem access; safe in CI only if the runner itself is the isolation boundary.
- TypeScript/npm ecosystem may be a supply-chain concern for highly sensitive environments.
- It is not obviously a Pi replacement. It is closer to a deployable framework for building custom agents, while Pi is an operator-facing coding harness with local workflow depth.

**Bottom line:** Flue validates Pi’s direction. The best borrowable ideas are typed outputs, clearer runtime/session/sandbox abstractions, and packaging agent workflows as headless callable units without losing Markdown skills and role-based orchestration.