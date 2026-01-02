---
description: "Guidance for crafting Copilot instruction files in this repo."
applyTo: ".github/{copilot-instructions.md,instructions/*.instructions.md}"
---
# Merged: use canonical instructions file

This file was consolidated into `.github/instructions/copilot-instructions.instructions.md` to standardize on `*.instructions.md` filenames. Please add or update guidance in the canonical file.

## Refer to these resources first
- [Customize chat to your workflow](https://code.visualstudio.com/docs/copilot/customization/overview)
- [Customize Copilot in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Set up a context engineering flow in VS Code](https://code.visualstudio.com/docs/copilot/guides/context-engineering-guide)
- [Community examples of Copilot instruction files](https://github.com/github/awesome-copilot/tree/main/instructions)

> Note: this file is a redirect. See `.github/instructions/copilot-instructions.instructions.md` for the full guidance, checklist, and naming conventions.

## Use a `.github/copilot-instructions.md` file (short)

`.github/copilot-instructions.md` is the workspace-wide instructions file VS Code will apply to all chat requests. Use it for global guardrails that apply across the repository; keep it short and general. For examples and scope-specific guidance, keep `*.instructions.md` files in `.github/instructions/`.

Tip: Use VS Code Chat > Configure Chat > Generate Chat Instructions to create a starter file.

## Maintenance reminders
- Update this guidance if Microsoft revises the linked documentation or if our workflow changes.
- Remove obsolete or conflicting advice immediately to prevent drift across instruction files.
