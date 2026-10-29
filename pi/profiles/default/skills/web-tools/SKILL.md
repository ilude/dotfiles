---
name: web-tools
description: Choose between native web search/fetch, Firecrawl extraction, Browserbase cloud browsers, and local Brave. Load for web research, image discovery, scraping, screenshots, browser automation, or diagnosing which web capability fits a task.
---

# Web tool selection

Choose by the requested output and required browser state, not by which provider was most recently configured. Honor an explicitly requested provider; explain any capability gap before substituting another. This guide routes work; provider skills own setup and execution.

## Availability and delegation

Route only to tools available to the current role. This skill grants no shell, browser, or provider authority. Ordinary subagents do not automatically discover skills; include the relevant skill and task facts when assigning authorized work. Roles without shell tools, such as researcher, can use their native search/fetch tools and return a specific extraction or browser need to the orchestrator. Do not broaden role permissions or ask a restricted role to invoke a shell helper.

## Decision table

| Need | Starting point | When to change |
| --- | --- | --- |
| Find public URLs, facts, or sources | Native `web_search` | Use Firecrawl when requested, when structured image/news results are needed, or when search plus extraction fits the deliverable. |
| Read a known public URL | Native `web_fetch` | Use Firecrawl for explicit structured formats, extraction, URL mapping, or bounded multi-page collection; use a browser if interaction or actual rendered state is required. |
| Find image candidates | Firecrawl `/search` with `sources: ["images"]` | Use a browser only if the user needs the search interface itself or visual interaction. Image-result URLs are not screenshots. |
| Convert pages to Markdown/structured content, discover site URLs, collect a bounded site corpus | [Firecrawl](../firecrawl/SKILL.md) | Use `/scrape`, `/map`, or `/crawl` respectively. A rendering-capable scraper is not proof of an interactive browser workflow. |
| Capture a public page as seen in a hosted browser, navigate/click/fill, reproduce a cloud-browser flow | [Browserbase](../browserbase/SKILL.md) | Use a named remote session. Use Firecrawl screenshot output only when a one-shot page capture, rather than browser control, is the requested deliverable. |
| Use existing local login, inspect the operator's exact tab, test localhost, or reproduce local browser behavior | [browser-tools](../browser-tools/SKILL.md) | Use the native Brave session/page tools with their ownership and identity rules. Cloud browsers do not inherit local cookies or access to localhost. |
| Add automation to an application | Inspect its existing framework first | Retain existing Playwright/Puppeteer/Selenium when appropriate; consider Stagehand for repeatable natural-language steps. For open-ended agents, expose browser capabilities to the existing agent rather than forcing a fixed script. |
| Site-specific supported capability, such as a YouTube transcript | The source-specific skill/tool | Avoid replacing a direct content API with a generic browser without a task reason. |

Native web tools already have their own retrieval backends and recovery behavior. Do not invoke a second provider merely because it is installed, or bypass their screening by switching to a raw scraper.

## Search is not scraping a search page

For “find Project Zomboid zombie walking animations,” use a search query. Firecrawl's image-search form is:

```json
{"query":"Project Zomboid zombie walking animation","sources":["images"],"limit":5}
```

For “open Google Images and screenshot the results,” navigate a browser to the specified Google URL and capture the rendered page. Scraping `google.com/search` is a different operation from using a search API. A failed scrape does not establish that search is unavailable, and Firecrawl search is not established to be Google's index.

Search results are discovery evidence, not verified source claims. Open relevant sources before asserting their contents. A screenshot demonstrates a rendered view, not that all search results or page content were extracted.

## Execute, persist, and report

1. Identify the deliverable: links/snippets, image candidates, source text, structured fields, screenshot, or a completed interaction. Ask only if ambiguity would materially change that deliverable, provider/data exposure, or use of authenticated state.
2. Load the selected provider skill before execution. Check missing prerequisites without reinstalling working tools. Retrieve credentials through the existing BWS setup; never copy local authentication to a cloud provider as an incidental fallback.
3. Keep collection bounded to the task. Avoid broad crawls, paid features, recurring jobs, or extra providers without task authority. Site protection may affect any provider; warn when known, but do not promise that proxies or a vendor will solve it.
4. When the user asks to save results or says “like the previous run,” preserve the established artifact requirement across later steps unless changed. Save search responses as JSON, readable summaries as Markdown when useful, and screenshots as actual image files. Use a verified ignored repository `.tmp/<task>/` or system temp. Do not put transient output in the worktree root or overwrite another task's artifacts.
5. Validate the artifact and requested result: response success plus meaningful content, actual image file saved, correct page/account/target, or completed interaction. Report exact paths and full relevant session links. Do not claim a file was saved merely because the API returned a download URL.
6. State which capability was tested. Successful authentication, search, scrape, screenshot, and browser interaction are separate observations.

## Failure selection

Classify the observed failure before changing tools:
- Authentication/setup: fix the credential or missing prerequisite, not the target site.
- Rate limit/credit limit: report the actual response and use bounded retry or ask about an alternative when cost/scope changes.
- Challenge, login wall, empty content, or all scrape engines failed: report what is known and what remains uncertain. Do not relabel a suspected block as a proven cause.
- Wrong operation: change from scraping a search-results page to search, or from extraction to an actual browser when screenshots/interaction are required.
- Artifact encoding/size failure: retain the working session/result and use a suitable supported format, rather than restarting unrelated work.

Retry only with a concrete reason. If a provider substitution changes private-data exposure, account state, cost, or the requested provider, explain the difference and ask when authority is unresolved. Preserve useful partial results and state what was not saved.

## Verification history

Read [capability observations](references/capability-status.md) when checking what has been live-tested here or diagnosing a related failure. Keep dated test history there rather than treating it as permanent routing policy.
