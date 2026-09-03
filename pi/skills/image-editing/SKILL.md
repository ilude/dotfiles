---
name: image-editing
description: "Inspect and safely crop, resize, rotate, auto-orient, convert, or compress local images."
---

# Image editing

Use `tool_search` with image terms before using the deferred image tools.

1. Before any crop or pixel-coordinate transform, call `image_inspect` and use its dimensions, orientation, and metadata.
2. Use `image_transform` for bounded crop, resize, rotate, auto-orient, conversion, or compression.
3. Use explicit local paths and a new destination. Never overwrite the source or an existing destination.
4. Reopen and verify every output's path, dimensions, format, and metadata before reporting success.

This skill does not cover screenshots, OCR, image generation, drawing, or annotation.
