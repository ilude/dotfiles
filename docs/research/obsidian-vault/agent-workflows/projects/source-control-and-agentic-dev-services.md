---
status: research-note
source: https://www.youtube.com/watch?v=HuE7OvOckfE
---

# Source-control and agentic-dev services from the GitHub alternatives video

## Why this matters

The video frames GitHub alternatives as a generational shift: classic GitHub-style hosting is under strain from AI/agent-driven code volume, while newer tools are exploring better primitives for code hosting, review, CI, and agent context.

These notes capture the services the speaker discussed positively. They are research signals from the video, not endorsements or implementation commitments.

## Services and useful signals

| Service | URL | What it is | What makes it different / good | Shortcomings / cautions |
|---|---|---|---|---|
| Forgejo | https://forgejo.org/ | Free-software, self-hostable Git forge forked from Gitea. | Lightweight Go codebase, nonprofit-aligned governance, practical GitHub-like workflows, GitHub Actions-compatible-ish Forgejo Actions, good self-hosting story. | Smaller ecosystem than GitHub; UI is functional but rough; hosted performance depends on the instance. |
| Codeberg | https://codeberg.org/ | Nonprofit-hosted Forgejo instance/community. | Lets people use Forgejo without operating it; transparent status/comms; aligned with democratic nonprofit free-software values. | Free hosted service has capacity limits; UI/loading can be janky; smaller community graph than GitHub. |
| Pierre | https://pierre.co/ | Experimental GitHub-alternative company/project; original product paused while primitives continue. | Took a first-principles swing at rethinking code hosting. | Main GitHub-alternative app is paused; not a current replacement by itself. |
| Code Storage | https://code.storage/ | API-first Git infrastructure from Pierre for applications/agents. | Built for high-throughput machine/agent workflows; programmatic repo creation and Git operations instead of slow human CLI/web flows. | Waitlist/limited access; infrastructure primitive, not a full GitHub replacement. |
| diffs.com | https://diffs.com/ | Open-source diff rendering library from Pierre. | High-quality embeddable diff viewer; useful primitive for agentic code tools and review UIs. | Only solves diff rendering; needs a host/product around it. |
| Trees | https://trees.software/ | Open-source file-tree rendering library from Pierre. | Fast, customizable file tree primitive for code browsers and agent/code-review UIs. | UI primitive only; not source control or review workflow by itself. |
| Graphite | https://graphite.dev/ | Code review workflow/tooling, especially stacked diffs, built around GitHub. | Better review UX than GitHub: navigation, feeds, hotkeys, stacked changes, faster diffs when repos are mirrored. | Historically dependent on GitHub APIs; future direction changed after Cursor acquisition. |
| Cursor | https://cursor.com/ | AI-first coding editor/platform. | Potential home for next-gen code review/source-control workflows after Graphite; already part of the AI coding generation shift. | Not a GitHub replacement today; direction is speculative. |
| Entire | https://entire.io/ | Developer platform from former GitHub CEO Thomas Dohmke; starts with CLI checkpoints for agent context. | Captures the why/context around agent-generated changes, not just Git diffs; aims to make agent work auditable and collaborative. | Very early; product direction unproven; speaker disclosed investor bias. |
| Zed | https://zed.dev/ | Agentic editor exploring collaboration protocols and Git-adjacent change tracking. | ACP and DeltaDB point toward richer, real-time, operation-based agent/editor workflows beyond Git snapshots. | Exploratory; not a source-control platform replacement; leaving Git could worsen fragmentation. |
| Depot | https://depot.dev/ | Faster CI/build infrastructure. | Faster and often cheaper alternative to running CI directly on GitHub/Bitbucket; strong Docker/build cache story. | Does not replace code hosting; another external CI dependency to integrate. |
| Blacksmith | https://www.blacksmith.sh/ | Fast GitHub Actions-compatible CI runners. | Speeds up GitHub Actions-style workloads, reduces queue/build time, and can complement alternative Git hosts. | Does not replace source control; value depends on CI integration support. |
| T3 Code | https://t3.codes/ | AI coding product from the T3 ecosystem. | Example of a new-generation coding UX that makes VS Code feel less central. | Early-generation product; speaker notes it can be worse than older editors for reading code. |
| VS Code | https://code.visualstudio.com/ | Mainstream extensible code editor. | Cited as the winning refinement of the Sublime/Atom generation: strong extension ecosystem and broad adoption. | Belongs to the previous editor generation in the video's framing; not itself a solution to agentic source-control pressure. |

## Possible Pi fit

- Track **Forgejo/Codeberg** as the practical open/self-hostable GitHub alternative.
- Track **Code Storage, diffs.com, Trees, Entire, Graphite, Cursor, and Zed** as signals for agent-native code hosting, review, and context capture.
- Track **Depot/Blacksmith** as CI accelerators if GitHub Actions or Forgejo Actions become bottlenecks.

## Risks / reasons not to build yet

- The ecosystem is in flux; many tools are primitives or early products, not stable platform replacements.
- Moving away from GitHub loses community/profile/network effects that no tool fully replaces yet.
- Pi should avoid building a generalized code-hosting abstraction until there is repeated local pain.

## KISS recommendation

Do not migrate anything by default. If GitHub reliability or agent throughput becomes recurring pain, first test **Forgejo/Codeberg** with one low-risk repo and keep watching the Pierre/Entire/Graphite/Zed primitives for ideas Pi can borrow later.

## Related notes

- [agent-friendly-platforms](../patterns/agent-friendly-platforms.md)
