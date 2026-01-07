---
name: llmstxt-workflow
description: Create and maintain llms.txt files following the llmstxt.org specification. Helps LLMs understand websites and documentation. Activate when working with llms.txt, llms-full.txt, LLM-friendly documentation, or when user mentions making docs accessible to AI/LLMs.
---

# llms.txt Workflow

Guidelines for creating and maintaining llms.txt files following the [llmstxt.org](https://llmstxt.org/) specification.

## What is llms.txt?

A markdown file at `/llms.txt` that helps LLMs efficiently understand and navigate website content. Unlike robots.txt (crawling) or sitemap.xml (indexing), llms.txt targets **inference-time usage** - helping AI assistants use your documentation.

---

## File Format Specification

### Required Structure

```markdown
# Project Name

> Brief summary with key information necessary for understanding the project.
> This blockquote provides essential context in 1-3 sentences.

Optional body content with additional context, guidelines, or important notes.
Can include paragraphs, lists, or other markdown (but NOT headings here).

## Section Name

- [Resource Name](https://example.com/path.md): Brief description of the resource
- [Another Resource](https://example.com/other.md): What this covers

## Another Section

- [Link](url): Description

## Optional

- [Less Critical Resource](url): Secondary information
```

### Section Rules

| Section | Required | Purpose |
|---------|----------|---------|
| H1 Title | Yes | Project or site name |
| Blockquote | No | Key summary (highly recommended) |
| Body | No | Additional context, guidelines |
| H2 Sections | No | Categorized resource links |
| "Optional" H2 | Special | Resources for extended context only |

---

## Link Format

Each link in a file list follows this pattern:

```markdown
- [Display Name](url): Optional description
```

Examples:
```markdown
- [API Reference](https://docs.example.com/api.md): Complete API documentation
- [Quick Start](https://docs.example.com/quickstart.md)
- [Examples](https://github.com/org/repo/examples/): Code samples and tutorials
```

---

## The "Optional" Section

The `## Optional` section has special meaning for context management:

- **llms.txt** - Includes everything except Optional section
- **llms-full.txt** - Includes everything including Optional section

Use Optional for:
- Verbose reference documentation
- Third-party library docs
- Deep-dive technical details
- Content useful but not essential

```markdown
## Optional

- [Full API Schema](url): Complete OpenAPI spec (large)
- [Third-Party Lib Docs](url): Dependency documentation
- [Historical Changelog](url): Version history
```

---

## Companion Markdown Files

The spec proposes providing markdown versions of HTML pages:

| Original URL | Markdown URL |
|--------------|--------------|
| `/docs/guide.html` | `/docs/guide.html.md` |
| `/docs/api/` | `/docs/api/index.html.md` |
| `/about` | `/about.md` |

This allows LLMs to fetch clean markdown instead of parsing HTML.

---

## Best Practices

### Content Guidelines

1. **Be concise** - LLM context windows are limited
2. **Front-load important info** - Put critical content in blockquote and early sections
3. **Use clear language** - Avoid jargon without explanation
4. **Describe, don't just link** - Brief descriptions help LLMs understand relevance
5. **Organize logically** - Group related resources (Docs, API, Examples, etc.)

### Section Organization Patterns

**API-focused projects:**
```markdown
## Authentication
## Endpoints
## SDKs
## Examples
## Optional
```

**Documentation sites:**
```markdown
## Getting Started
## Core Concepts
## API Reference
## Tutorials
## Optional
```

**Multi-product companies:**
```markdown
## Product A
## Product B
## Shared Resources
## Optional
```

### Testing

- Test with multiple LLMs (Claude, GPT, etc.)
- Verify LLMs can answer questions using your llms.txt
- Check that links resolve and content is accessible
- Validate markdown renders correctly

---

## Complete Example

```markdown
# Acme API

> Acme API provides RESTful endpoints for widget management.
> Authentication uses Bearer tokens. Base URL: https://api.acme.com/v1

When integrating with Acme API:
- All requests require authentication header
- Rate limit: 1000 requests/hour
- Responses are JSON with ISO 8601 timestamps

## Getting Started

- [Quick Start Guide](https://docs.acme.com/quickstart.md): 5-minute integration tutorial
- [Authentication](https://docs.acme.com/auth.md): API key setup and token refresh

## API Reference

- [Widgets API](https://docs.acme.com/api/widgets.md): CRUD operations for widgets
- [Users API](https://docs.acme.com/api/users.md): User management endpoints
- [Webhooks](https://docs.acme.com/api/webhooks.md): Event subscription setup

## SDKs

- [Python SDK](https://github.com/acme/acme-python): Official Python client
- [Node.js SDK](https://github.com/acme/acme-node): Official Node.js client

## Examples

- [Code Samples](https://github.com/acme/examples): Integration examples
- [Postman Collection](https://docs.acme.com/postman.json): API testing collection

## Optional

- [OpenAPI Spec](https://docs.acme.com/openapi.yaml): Full API schema
- [Changelog](https://docs.acme.com/changelog.md): Version history
- [Migration Guide](https://docs.acme.com/migration.md): v1 to v2 upgrade path
```

---

## Two-File Pattern

Many projects provide both files:

| File | Purpose | Size |
|------|---------|------|
| `llms.txt` | Core documentation, fits smaller contexts | Smaller |
| `llms-full.txt` | Complete documentation including Optional | Larger |

Generate both if your documentation is extensive.

---

## Tools & Ecosystem

### Python CLI

```bash
pip install llms-txt

# Parse and convert to XML context
llms_txt2ctx llms.txt > context.xml

# Python API
from llms_txt import parse_llms_file, create_ctx
parsed = parse_llms_file(content)
context = create_ctx(parsed)
```

### Static Site Generators

- **VitePress**: `vitepress-plugin-llms`
- **Docusaurus**: `docusaurus-plugin-llms`
- **Mintlify**: Built-in support

### Other Tools

- **Firecrawl**: llms.txt Generator for any website
- **VS Code PagePilot**: Loads external llms.txt context
- **llms-txt-php**: PHP library for reading/writing

---

## Creating llms.txt for a Project

### Step-by-Step

1. **Identify your audience** - What will LLMs help users do?
2. **List key resources** - Documentation, API refs, examples
3. **Write the summary** - 1-3 sentences of essential context
4. **Organize sections** - Group by topic or user journey
5. **Add descriptions** - Brief notes for each link
6. **Identify Optional content** - Large/verbose resources
7. **Test with LLMs** - Verify comprehension

### Checklist

- [ ] H1 title matches project name
- [ ] Blockquote summarizes project in 1-3 sentences
- [ ] All links are valid and accessible
- [ ] Descriptions are concise but informative
- [ ] Sections are logically organized
- [ ] Optional section contains non-essential resources
- [ ] File is valid markdown
- [ ] Tested with at least one LLM

---

## Validation

### Manual Check

```bash
# Verify file exists and is readable
curl -s https://yoursite.com/llms.txt | head -20

# Check all links resolve
grep -oP '\[.*?\]\(\K[^)]+' llms.txt | xargs -I {} curl -sI {} | grep HTTP
```

### Structure Validation

The file must have:
1. Exactly one H1 (first line after optional frontmatter)
2. Optional blockquote immediately after H1
3. No H2+ headings before file list sections
4. Each file list item starts with `- [`

---

## Directory Listings

### directory.llmstxt.cloud

Curated directory of products and companies with llms.txt files.

**Features:**
- Browse by category: AI, Developer tools, Finance, Products, Websites
- Shows token counts for each llms.txt file
- Indicates if llms-full.txt variant exists
- Paginated (12+ pages)
- Submit new entries via "Submit" button

**Browsing & Search:**
- Search: `https://directory.llmstxt.cloud/?search=anthropic`
- Pagination: `https://directory.llmstxt.cloud/?page=2`
- Combine: `https://directory.llmstxt.cloud/?search=api&page=1`
- Categories: AI, Developer tools, Finance, Products, Websites

**Entry format:**
```
Company Name | Category | /llms.txt (X tokens) | /llms-full.txt (Y tokens)
```

### llmstxt.site

Community directory with hundreds of verified sites.

**Features:**
- Token counts for context size planning
- Verified implementations
- 788+ listed sites

### llms-txt-hub (GitHub)

GitHub repository tracking llms.txt implementations:
- [thedaviddias/llms-txt-hub](https://github.com/thedaviddias/llms-txt-hub)
- Structured data in repository
- Submit via pull request

### Submitting Your Site

1. **directory.llmstxt.cloud**: Click "Submit" button on site
2. **llmstxt.site**: Follow submission process on site
3. **llms-txt-hub**: Open pull request on GitHub

---

## References

- [llmstxt.org](https://llmstxt.org/) - Official specification
- [GitHub: AnswerDotAI/llms-txt](https://github.com/AnswerDotAI/llms-txt) - Reference implementation
- [Answer.AI Announcement](https://www.answer.ai/posts/2024-09-03-llmstxt.html) - Original proposal
