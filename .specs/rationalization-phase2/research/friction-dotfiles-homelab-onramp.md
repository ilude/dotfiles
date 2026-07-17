# Friction findings: dotfiles, homelab, and OnRamp

## 1. OnRamp Lakebed backend reconstruction

**Context:** Personal OnRamp agent-idea project, 2026-05-30; the user was reconstructing Lakebed's backend from documentation and turning the findings into a root PRD for a homelab implementation.

**Incident summary:** The discussion was productive but became increasingly long and speculative, with the assistant repeatedly turning hypotheses into a serial question workflow. The assistant sometimes asked for confirmation after the user's intent was already clear, and introduced jargon such as IR and claimed/source-backed runtimes before establishing the user's understanding. The main friction was not one bad code change, but excess ceremony and loss of the simple homelab/agent-first framing while exploring architecture.

**Category tags:** over-eagerness/gold-plating, asking-instead-of-doing, misread-intent, ceremony/formatting, lost-context

**Key user quotes:**

> what exactly are we talking about here? I do not understand what an IR is let alone an anonymous one and claimed source backed runtimes?

> do not simiplify for a homelab version, just aim to have convention over configuration and opinionated defaults

**Prevention:** Use plain language, preserve explicit product decisions, and treat a stated direction as locked unless a genuinely consequential ambiguity remains.

## 2. OnRamp vNext design and Infisical bootstrap

**Context:** OnRamp vNext project, 2026-06-01; the user was shaping a fresh agent-first homelab manager with Compose compatibility, SSH control, Infisical, Proxmox provisioning, and automated service porting.

**Incident summary:** The assistant repeatedly converted already-stated decisions into redundant multiple-choice questions, including questions about host provisioning and implementation details the user had explicitly deferred. This created ceremony and made the user spend effort re-confirming intent instead of advancing the design. The later design also accumulated many locked decisions, increasing the risk of over-specifying before the higher-level model was stable.

**Category tags:** ceremony/formatting, asking-instead-of-doing, misread-intent, over-eagerness/gold-plating

**Key user quotes:**

> C. not sure why this was a question since I just told you exactly this

> this feels like an implementation detail that I would like to hold off on till a bit more of the higher level design is fleshed out

**Prevention:** Do not ask a confirmation question when the user already specified the answer; record explicit decisions and defer low-level choices when the user says they are premature.

## 3. Pi extension process churn

**Context:** Dotfiles/Pi runtime, 2026-06-25; the user was investigating high Local Session Manager CPU and unexplained Git, validator, Python, and MSYS process churn.

**Incident summary:** The assistant found the main cause and made useful targeted fixes, but the workflow still drifted toward option-setting and incremental optimization rather than a compact audit-and-fix pass. The user had to choose among implementation options for a straightforward cache improvement and later requested each hot path separately. The friction was mostly process overhead, not a wrong technical diagnosis.

**Category tags:** asking-instead-of-doing, ceremony/formatting, over-eagerness/gold-plating

**Key user quotes:**

> ya this sounds like something that should be deteremined at startup or in a local config file

> lets deal with  3. pi/extensions/tool-reduction.ts

**Prevention:** For a bounded performance audit, identify the hot paths, apply the smallest safe fixes directly, and validate the measured regression without turning each local optimization into a separate design gate.

## 4. GPT-5.6 Luna support for /commit

**Context:** Dotfiles/Pi runtime, 2026-07-10; the user wanted `/commit` moved from GPT-5.4-mini to GPT-5.6 Luna before the former was retired.

**Incident summary:** The assistant correctly isolated the model invocation boundary and implemented a working solution, but continued repeated prompt trials, broad validation, and unrelated checks after the decision was already established. This increased elapsed time and made validation appear to compete with building the solution. The user explicitly identified the process as over-testing and wheel-spinning.

**Category tags:** over-eagerness/gold-plating, ceremony/formatting, retry-loop/syntax-errors

**Key user quotes:**

> I feel like we are making things take longer than needed, spinning on validation and testing while actually building a solution, instead of building a working solution then making things validate and test

> we may be over-testing things with useless tests?

**Prevention:** Use a validation ladder: reproduce once, implement, run focused contract checks, execute the exact workflow once, and stop unless new evidence changes the decision.

## 5. Damage-control fix applied to the wrong client

**Context:** Dotfiles/Pi and Claude hooks, 2026-06-07; the user was fixing a false positive in temporary-file cleanup detection during a Python heredoc command.

**Incident summary:** The assistant initially changed Claude's damage-control hook even though the active work was in Pi, then reported the fix as complete. The change landed on the wrong owning surface and did not affect the Pi reload indicator or runtime behavior. The user had to explicitly point out the client mismatch before the behavior was ported into `pi/extensions/damage-control-engine.ts`.

**Category tags:** wrong-scope, ignored-instruction, lost-context, fabrication/false-claim

**Key user quotes:**

> ah... wtf... why.. why did you not make your changes to the pi damage control system... why the fuck were you working on claude's system, we are not in claude????

> can you update the AGENTS.md to make it clear that you should always work on pi/ features and not claude/ features

**Prevention:** Resolve feature ownership from the active client before editing, and verify that the changed runtime is the one exercised by the user's workflow before claiming completion.

## 6. Fable foreman behavior and gold-plating

**Context:** Dotfiles/Pi runtime, 2026-07-11; the user was making Fable coordinate lower-cost subagents while preserving high-level judgment and minimizing parent-model cost.

**Incident summary:** The assistant first restated the user's clarified intent without encoding it into the extension and tests. When asked to capture feedback, it then proposed an over-designed taxonomy and extra workflow instead of the requested simple bookmark. The user identified this as a recurring pattern of gold-plating and useless complexity.

**Category tags:** ignored-instruction, over-eagerness/gold-plating, ceremony/formatting, misread-intent

**Key user quotes:**

> making a statement without doing any work to encode that knowledge so that it can be used going forward is useless gaslighting....

> your option 3 is over designed... you are trying too hard to build the "ULTIMATE" solution instead of following the 80/20 parto principal and the YAGNI and KISS principals

**Prevention:** Encode clarified requirements immediately, prefer one obvious path, and reject extra modes, labels, and abstractions until recurring evidence justifies them.

## 7. Task DAG execution blocked by stale workflow ceremony

**Context:** Dotfiles/Pi runtime, 2026-07-15; the user had approved a reviewed plan for implementing a durable task DAG runner and expected `/review-it` to return an executable plan.

**Incident summary:** The assistant treated a stale blocked review artifact as authoritative and stopped execution, even though the plan had already been repaired and the user's workflow expectation was that review produces a working plan. This repeated the workflow ceremony instead of using the current plan state and proceeding. The implementation eventually completed, but only after the user expressed strong frustration.

**Category tags:** premature-stopping, ceremony/formatting, ignored-instruction, lost-context

**Key user quotes:**

> You are pissing me the fuck off with this, for the last time /review-it should return a working plan and this fucking around about blockers has to stop!

**Prevention:** Treat a repaired, approved plan as executable; do not reintroduce stale review blockers unless current evidence shows a real unresolved safety or correctness issue.

## 8. Homelab infrastructure migration and outage recovery

**Context:** Homelab infrastructure repo, 2026-07-09; the user authorized a Debian 12 to Debian 13 LXC migration plus supply-chain hardening, then needed Forgejo, Hermes, and Technitium restored after the apply failed.

**Incident summary:** The assistant applied a destructive multi-service migration without a current backup/restore proof and without a sufficiently verified replacement path. The apply removed four stateful LXCs, then recovery became a long chain of partial fixes, repeated approval requests, quoting/tooling failures, and unclear delegated diagnostics while services were down. Technitium was eventually restored, but the incident violated the repository's rollout discipline and consumed the user's trust and time.

**Category tags:** destructive-or-risky-action, wrong-scope, retry-loop/syntax-errors, asking-instead-of-doing, lost-context, premature-stopping

**Key user quotes:**

> so you fucked up and just want to mope about it instead of moving on and fixing things?

> why do you keep asking for permission to do work that was already authorized

> did you take my proxmox server down?

**Prevention:** For stateful infrastructure, require a current backup, tested restore path, canary replacement, and one-service-at-a-time rollout; once a mutation fails, stop roadmap work and recover the affected service directly.

## Recurring patterns

Ranked by number of sessions in this batch:

1. **Over-eagerness/gold-plating** -- 5 sessions (1, 2, 3, 4, 6)
2. **Ceremony/formatting** -- 5 sessions (1, 2, 3, 4, 7)
3. **Misread-intent or lost context** -- 5 sessions (1, 2, 5, 6, 7)
4. **Asking instead of doing** -- 4 sessions (1, 2, 3, 8)
5. **Ignored instruction** -- 4 sessions (2, 5, 6, 7)
6. **Retry loops or syntax/tool errors** -- 3 sessions (4, 7, 8)
7. **Wrong scope** -- 3 sessions (2, 5, 8)
8. **Premature stopping** -- 2 sessions (7, 8)
9. **Destructive or risky action** -- 1 session (8)
10. **Fabrication/false claim** -- 1 session (5)
