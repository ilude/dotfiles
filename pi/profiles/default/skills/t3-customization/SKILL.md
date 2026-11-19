---
name: t3-customization
description: Develop, validate, and package the T3 Code customization fork. Use for user-owned UI and workflow hooks, upstream sync, and disposable Hatchery builds or transfers of Windows previews.
---

# T3 Code customization

Read the customization checkout's `AGENTS.md` and [the build and promotion runbook](references/build-and-promotion.md). Use [t3code](../t3code/SKILL.md) for running or inspecting a T3 instance. This skill owns the customization fork workflow, not the installed app or Hatchery infrastructure.

- Keep `ilude/t3code:main` an upstream mirror and customization on its own branch. Work from the requested checkout. Verify its base, branch and diff before building; never substitute the dotfiles submodule pin for a newer prototype worktree.
- Put a small, versioned extension surface in T3 and keep user customizations outside the fork. Start with host-rendered data and reuse existing actions and permissions. A UI visibility switch is not a disclosure control. Keep account-level data separate from transient thread state when it must survive provider shutdown.
- Offload installs, builds, and automated browser tests to disposable Hatchery compute on Proxmox. Windows is for transfer only unless the user explicitly chooses a different execution target. Do not change Defender or copy live T3 state or credentials into workers.
- Automate verification with fixtures before involving the user. Distinguish a web build, Windows packaging, an actual Windows smoke test, and installation. Deployment, signing, publication, feed changes and moving the dotfiles pin are separate steps, not side effects of a green build.

## Keep the workflow current

At the start of each build, read version pins and packaging tasks from the exact source revision, and query Hatchery's live target/template catalog rather than trusting old names. After a meaningful failure or verified improvement, compare the evidence with the runbook. Update the narrowest owning recipe or reference, replacing stale guidance rather than adding another competing path. Record what was checked, the source revision, conditions that affected the result, and what remains unverified. Keep private hosts, credentials, job logs and machine-specific paths out of tracked guidance. Stop at the requested delivery boundary; learning does not authorize broader permissions, long-running automation, pushes, or installs.
