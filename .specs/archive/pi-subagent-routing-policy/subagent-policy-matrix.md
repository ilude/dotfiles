# Subagent Policy Matrix

## Purpose

This document defines command-specific parent-model policy and subagent role policy for the first agent-spawning workflow commands that should eventually participate in shared routing:
- `/research`
- `/review-it`
- `/do-it`

This document applies the target-architecture rule:

> Slash commands are routed deterministically by command identity, not classified as freeform prompts at entry.

In short: commands are **routed but not classified**.

Classifier signals may be used **later** for **classifier-informed subagent routing**, but only as optional inputs alongside command policy and role policy.

## Global policy rules

### 1. Command-entry rule

For `/research`, `/review-it`, and `/do-it`:
- the command itself is routed by command identity
- the command text is **not** passed through the freeform prompt classifier at entry
- the command handler asks shared routing policy for the parent/workflow model

### 2. Subagent-routing rule

If a command spawns subagents, each subagent route is chosen from:
- command policy
- agent role
- optional classifier signals
- fallback availability

Subagent routes must **not** be decided from classifier output alone.

### 3. Classifier-signal rule

Allowed classifier inputs:
- original freeform user task text embedded in the command payload
- planner-produced subtask text
- explicit complexity hints from the parent workflow

Disallowed classifier usage:
- classifying the slash command token itself (for example `/research foo` as a replacement for command routing)
- bypassing explicit role constraints because classifier confidence is high

### 4. Fallback rule

If the preferred model for a command or role is unavailable:
- fall back within the same provider/model family policy if possible
- otherwise fall back to the command's parent model
- otherwise fall back to a safe default configured for the command class
- every fallback must be surfaced as routing metadata/diagnostics

## Command matrix

## `/research`

### Parent command policy

| Dimension | Policy |
|-----------|--------|
| Command route | Deterministic command route |
| Parent model goal | Strong synthesis/reasoning model |
| Parent role | Orchestrate broad research, compare sources, and synthesize findings |
| Classifier at entry | Not used |
| Allowed classifier inputs later | Yes, for subagent task text only |
| Fallback | Use configured strong default for research workflows |

### Subagent role matrix

| Role | Primary responsibility | Preferred model class | Allowed classifier input | Hard bounds | Fallback |
|------|------------------------|-----------------------|--------------------------|-------------|----------|
| source-gatherer | find primary sources and collect evidence | mini or mid | yes | cannot escalate directly to the strongest model on classifier alone | fall back to parent model or mini default |
| synthesizer | combine evidence into coherent conclusions | mid or strong | yes | must remain at or below command-approved strong tier | fall back to parent model |
| critic | challenge synthesis and surface weak evidence | strong | optional | may use stronger tier than gatherer even if classifier is low | fall back to parent model |
| formatter | turn findings into structured output | mini or mid | no, unless task text is substantially transformed | should not drive model escalation | fall back to parent model |

### Notes

- `/research` benefits from role-aware separation: broad collection does not need the same model strength as synthesis or critique.
- Classifier input is useful when the gathered topic becomes unexpectedly deep, but command policy still constrains the ceiling.

## `/review-it`

### Parent command policy

| Dimension | Policy |
|-----------|--------|
| Command route | Deterministic command route |
| Parent model goal | Strong review/analysis model |
| Parent role | evaluate a plan or proposal for gaps, risks, and failure modes |
| Classifier at entry | Not used |
| Allowed classifier inputs later | Yes, mainly for scoped review tasks |
| Fallback | Use configured strong default for review workflows |

### Subagent role matrix

| Role | Primary responsibility | Preferred model class | Allowed classifier input | Hard bounds | Fallback |
|------|------------------------|-----------------------|--------------------------|-------------|----------|
| structural-reviewer | inspect architecture/plan structure | strong | yes | cannot be downgraded below mid without explicit command policy | fall back to parent model |
| security-reviewer | inspect safety and abuse paths | strong | optional | role policy overrides low classifier results | fall back to parent model |
| implementation-reviewer | inspect feasibility and integration issues | mid or strong | yes | may escalate within review policy bounds | fall back to parent model |
| summary-writer | merge findings into a concise final review | mid | no by default | should not determine review severity | fall back to parent model |

### Notes

- `/review-it` is less classifier-sensitive than `/research`; role is the stronger signal.
- Security and structural review roles should retain strong-model bias even if the local task snippet is short.

## `/do-it`

### Parent command policy

| Dimension | Policy |
|-----------|--------|
| Command route | Deterministic command route |
| Parent model goal | Adaptive orchestration model |
| Parent role | decide whether to implement directly, delegate, or plan first |
| Classifier at entry | Not used |
| Allowed classifier inputs later | Yes, especially for delegated subtasks |
| Fallback | Use configured mid/strong default for orchestration workflows |

### Subagent role matrix

| Role | Primary responsibility | Preferred model class | Allowed classifier input | Hard bounds | Fallback |
|------|------------------------|-----------------------|--------------------------|-------------|----------|
| classifier-helper | lightweight complexity signal generation | mini | yes | advisory only; cannot decide execution path alone | fall back to parent model |
| planner | turn ambiguous work into a plan | mid or strong | yes | may escalate above mini when structural interaction is high | fall back to parent model |
| builder | implement a bounded task | mid by default | yes | escalation depends on subtask complexity and command policy | fall back to parent model |
| reviewer | validate builder output | mid or strong | yes | role may require stronger model than builder | fall back to parent model |

### Notes

- `/do-it` is the command most likely to benefit from classifier signals, but only after command routing has already selected the orchestration path.
- The `classifier-helper` role is explicitly advisory; it must not replace command routing or planner judgment.

## Cross-command policy summary

| Command | Entry classification | Parent model basis | Main subagent signal priority |
|---------|----------------------|--------------------|-------------------------------|
| `/research` | none | command policy | role + optional classifier + fallback |
| `/review-it` | none | command policy | role first, classifier second |
| `/do-it` | none | command policy | role + classifier, but command policy still bounds behavior |

## Required shared-routing metadata

Every command/subagent routing decision should be able to report:
- `commandName`
- `role` (if any)
- `selectedModel`
- `reason[]`
- `classifierTier` (if used)
- `fallbackUsed`
- `policyBoundApplied`

## Open questions carried forward

1. Which exact concrete model ids should be mapped to each role once shared command routing is implemented?
2. Should parent-command policy define both a floor and a ceiling for subagent roles?
3. Should users be allowed to force a command-local override for a subagent role, or should overrides apply only at the parent-command level?
4. Should routing diagnostics be visible in normal interactive mode or only via a status/debug command?
