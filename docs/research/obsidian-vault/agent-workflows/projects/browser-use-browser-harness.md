# browser-use/browser-harness

Repo: https://github.com/browser-use/browser-harness

## What it is

A minimal browser automation harness for LLM agents. It connects directly to Chrome through CDP and exposes a thin editable layer that an agent can extend during work.

## Concrete implementation details

- Uses Chrome DevTools Protocol rather than a heavy browser automation abstraction.
- Core package is protected; the agent edits workspace files instead.
- `agent-workspace/agent_helpers.py` is the writable helper surface.
- `agent-workspace/domain-skills/` stores reusable site/task knowledge.
- Missing capability flow: task fails or helper missing → agent writes helper → task proceeds → helper persists.

## Source video

- ../videos/browser-harness-video.md

## Patterns

- ../patterns/self-healing-harnesses.md
- ../patterns/markdown-skills-memory.md

## KISS takeaways for Pi

- Do not build a full browser framework first.
- Expose one tiny helper file and one domain-skills directory.
- Let Pi propose helper additions, but require review for risky operations.
- Prefer reusable site notes over generic browser-prompt bloat.
