---
name: pdf-reader
description: Read and comprehend PDF files, especially math lecture notes, papers, scanned-ish pages, diagrams, and page-specific questions. Use when the user asks to read, parse, analyze, search, render, or extract content from a PDF file.
---

# PDF Reader

Read and comprehend PDF files with a hybrid text extraction + rendered-page vision workflow. This is especially useful for math-heavy documents where text extraction mangles equations, or PDFs with diagrams/figures.

## Runtime

Use `uv`; do not create or rely on a persistent virtualenv.

From the skill directory, run scripts like:

```bash
uv run --with pymupdf SKILL_DIR/scripts/pdf_info.py <path>
uv run --with pymupdf SKILL_DIR/scripts/pdf_extract.py <path> --pages 1-5
uv run --with pymupdf SKILL_DIR/scripts/pdf_render.py <path> --pages 3 --dpi 150
uv run --with pymupdf SKILL_DIR/scripts/pdf_search.py <path> "theorem 3.2" --context 3
```

When resolving `SKILL_DIR`, use the directory containing this `SKILL.md`.

## Scripts

| Script | Purpose | Key args |
|---|---|---|
| `pdf_info.py <path>` | Metadata + per-page analysis: page count, TOC, text density, math density, image count | — |
| `pdf_extract.py <path> [--pages SPEC]` | Extract text by page | `--pages all\|1-5\|1,3,7\|3` |
| `pdf_render.py <path> [--pages SPEC] [--dpi N]` | Render pages to PNG images in `/tmp/pi-pdf-*/` | `--pages`, `--dpi` default 150 |
| `pdf_search.py <path> <query> [--context N] [--literal]` | Search text content by regex or literal | `--context` default 3, `--literal` |

Page specs are 1-indexed: `all`, `1-5`, `1,3,7`, or `3`.

## Strategy

1. **Always triage first** with `pdf_info.py`.
2. **Short PDFs (≤15 pages)**: extract all text and render all pages for full visual comprehension.
3. **Medium PDFs (15–60 pages)**: extract all text, then render pages with high math density, image count, or low text length.
4. **Long PDFs (60+ pages)**: use TOC/search to target sections; render only relevant pages. Warn the user before attempting full-document analysis.
5. **Specific questions**: search first, render the exact page(s), then extract neighboring text if needed.

## Visual Reading Guidelines

- Use 150 DPI by default; 200 DPI for dense equations; 100 DPI for quick scans.
- Read rendered images with the `read` tool when equations, diagrams, layout, or figures matter.
- State equations in LaTeX when explaining math.
- Cite page numbers in answers.
