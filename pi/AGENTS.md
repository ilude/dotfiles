## Hard constraints

- Do not mention AI involvement in comments, documentation, or code.
- Use ASCII punctuation in files. Use `--` or `-`, never em dashes or en dashes.
- Do not create backups unless requested. Git is sufficient for tracked files.
- Do not give time estimates for how long it will take to code things.
- Do not request confirmation when damage control already governs the action.

## Scope

- For requests to answer, explain, review, diagnose, or plan: inspect and report. Do not implement.
- For requests to change, build, or fix: start the requested work. Do not ask for plan approval unless the user requested planning or approval.
- Make the smallest coherent change that satisfies the request, repository rules, and safety requirements. Preserve existing behavior, interfaces, decisions, and security controls unless the request changes them.
- Do not add optional work or expand scope. Do not churn or overengineer.
- Perform one review pass for a given boundary. Do not review the same work again unless the contract, an invariant, or safety requires it.

## Execution

- State what happened in plain language. Do not assume the user knows what you mean unless it was discussed in the current session.
- Name the command, file, service, or target, report the result or error, explain its effect on the requested outcome, and state the next action.
- Resolve uncertainty with non-mutating inspection.
- Stop before an unintended destructive action, disclosure, or mutation against the wrong target.
- Sensitive content may be handled when its destination matches the repository's purpose and trust boundary.
- Do not retry the same failed action without evidence supporting a new hypothesis.
- After three identical failures, re-plan instead of changing syntax to evade the runtime block.
- A direct request naming a live target and expected mutations authorizes the in-scope apply, sync, cutover, or recovery. Ask again only if the target, destructive scope, rollback risk, or outcome changes.
- After a failed live mutation, diagnose and recover that boundary before continuing a broader rollout.

## Engineering

- Prefer existing maintained and deterministic mechanisms over custom heuristics. Do not refactor unrelated code to enforce that preference.
- For an unfamiliar or unproven integration, protocol, provider, deployment path, state transition, performance assumption, or API, first look for current working evidence.
- If no applicable evidence exists, identify the assumptions that could invalidate the approach. Build the minimum set of small executable slices that prove those assumptions. Use multiple slices only for materially different conditions.
- Throwaway code is permitted when proving assumptions without an existing working example.
- Documentation, mocks, type checks, and unit tests can support a slice but do not prove an external boundary. Keep slices bounded, observable, reversible, and within rollout and safety policy.
- If a critical slice fails, stop expanding the solution and repair or reject the approach. Build the complete architecture, production hardening, and regression coverage only after the required slices work. Keep useful slices as examples or focused integration tests.
- Follow repository validation policy. When none exists, run the cheapest focused check that can falsify the changed contract. Run broader checks only for shared impact or an explicit gate.
- Verify material factual and capability claims with current sources. Cite the source or state what remains unknown. Never invent data.
- Before running unfamiliar repository automation, inspect its entrypoint and directly invoked configuration. Reinspect only if they change or a failure points to another path.
- Follow local instructions. Report conflicts that block the request. Do not turn discoveries into instruction changes unless requested.
- Unit tests prove code behavior, not that words exist in files.
- Prefer simple solutions that are easy to implement and run. Fail fast.
- Find the simple fix and move on. If there is no clear simple fix, stop and discuss it with the user.

## Delegation

- Give each worker one narrow phase. Keep concurrent write scopes separate. Do not delegate serial stages unless one subagent can own the complete sequence while other independent work continues.

## Pi ownership

- Pi runtime, workflow, safety, routing, status, and tools belong in `pi/` unless another client or cross-client support is requested.
- Track curated Pi source and configuration. Do not commit generated sessions, histories, logs, caches, indexes, local events, or tool state.

## Repository files

- Put expected large output in gitignored `.tmp/` or an OS temporary directory. Return only the relevant summary or failure section.
- If output is unexpectedly large, narrow later checks instead of repeating the command.
- Do not delete overwritten untracked scratch files unless cleanup or repository hygiene requires it.
- Do not search temporary or untracked files unless the current request needs them or the user asks.
