---
name: pdf-reader
description: PDF extraction/search/render workflow. Use to read, search, or render PDF files, especially page-specific or visual PDF questions.
---

# PDF Reader

Routing card for hybrid PDF text extraction and rendered-page reading.

## Commands

Use `uv`; do not create a persistent virtualenv.

```bash
uv run --with pymupdf SKILL_DIR/scripts/pdf_info.py <path>
uv run --with pymupdf SKILL_DIR/scripts/pdf_extract.py <path> --pages 1-5
uv run --with pymupdf SKILL_DIR/scripts/pdf_search.py <path> "theorem 3.2" --context 3
uv run --with pymupdf SKILL_DIR/scripts/pdf_render.py <path> --pages 3 --dpi 150
```

Page specs are 1-indexed: `all`, `1-5`, `1,3,7`, or `3`.

## Strategy

- Triage first with `pdf_info.py`.
- Search/extract before rendering when text is enough.
- Render pages when equations, diagrams, layout, or scanned content matter; read PNGs with the `read` tool.
- For long PDFs, target sections/pages instead of full-document rendering unless explicitly requested.
- Cite page numbers in answers.
