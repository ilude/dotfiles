---
name: repo-setup
description: Bootstrap or align a repository's local setup, agent guidance, skills, configuration examples and checks. Use when creating a project or adopting shared repository conventions.
---

# Repo setup

1. Identify the repo's purpose, stack, consumers and supported operator platforms.
   Inspect existing manifests, entry points and instructions before choosing tools.
   For work repos, read [work conventions](references/work.md). Personal repos use
   the neutral baseline; add a personal reference only for agreed differences.
2. Adapt the [templates](assets/README.md), preserving existing work and local
   configuration. They are starting points, not a required file inventory.
   Keep independent projects independent; use uv for Python, without creating a
   root workspace merely to normalize a monorepo.
3. Make setup rerunnable and limited to actual prerequisites and local dependencies.
   Keep validation-only separate from installs/sync. Preserve caller PATH entries;
   do not add account setup, provider calls, Git synchronization, shell customization
   or infrastructure changes as incidental bootstrap actions.
4. Put repo choices, boundaries and discovery links in root AGENTS.md; commands and
   current usage in README; task-specific procedures in native skills; investigations
   in agent notes; material outcomes in the changelog. Keep one owner per instruction.
   Add a CLAUDE.md pointer only when Claude is a consumer, not a second policy body.
5. Ship credential-free examples/defaults, ignored local overrides and an explicit
   location for generated or sensitive evidence. Use the selected service's existing
   credential mechanism. Do not import another repo's secrets or runtime state.
6. Ask about unresolved behavior or workflow choices; choose equivalent details
   directly. Prune generic advice, unused tools and domain-specific inherited rules.
   Setup permission is not deployment, publishing, commit or push permission.
7. Validate the selected setup and existing relevant checks. Distinguish parser/
   prerequisite checks, an already-provisioned rerun, fresh-machine installation
   and authenticated service use. Record limits rather than adding mandatory
   cloud/VM tests or model calls.

Do not create a framework, generator or extra skill merely to make repos uniform.
