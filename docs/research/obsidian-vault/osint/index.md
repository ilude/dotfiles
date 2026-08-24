---
status: research-note
tags: [osint]
source: user-supplied resource list, 2026-08-24
verification: pending source-by-source review
---

# OSINT resource index

This index collects OSINT directories, agent integrations, and reading sources for future investigation and content-gathering work. Descriptions below preserve the supplied research summary and should be verified against each source before they drive implementation or operational decisions.

## Tool directories and link collections

- [OSINT4All on start.me](https://start.me/p/L1rEYQ/osint4all) - the OSINT4All collection identified from the supplied image.
- [osint4all.com](https://osint4all.com/) - an unrelated project with the same name; described as a moderated directory searchable by task, evidence type, pricing, and access model.
- [Bellingcat's Online Investigation Toolkit](https://bellingcat.gitbook.io/toolkit) - volunteer-written and staff-reviewed entries with named maintainers by category and an explicit inclusion disclaimer. Its GitBook content is synchronized to the [Bellingcat toolkit repository](https://github.com/bellingcat/toolkit), making programmatic retrieval and change review possible.
- [The Ultimate OSINT Collection](https://start.me/p/DPYPMz/the-ultimate-osint-collection) by hatless1der - tools, training, guides, podcasts, and discussion boards.
- [OSINT Framework](https://osintframework.com/) - a directory-style resource tree organized by investigation type; use it as a reference guide rather than a scanner.
- [OSINT_Inception-links](https://github.com/C3n7ral051nt4g3ncy/OSINT_Inception-links) - an index of more than 100 start.me pages and a possible source for studying the directory meta-layer.

## AI agents and OSINT

- [awesome-osint-mcp-servers](https://github.com/soxoj/awesome-osint-mcp-servers) - curated MCP server list tagged by open-source, free-tier, and paid access. Maintained by the author of Maigret.
- [osint-mcp-server](https://github.com/badchars/osint-mcp-server) - described as 37 tools across 12 sources, with 21 requiring no API key. Sources include DNS, WHOIS, crt.sh, GeoIP, BGP, Wayback, and Microsoft 365 tenant discovery, with optional commercial integrations.
- [osint-mcp-gateway](https://github.com/bonetrees/osint-mcp-gateway) - a monorepo of independently composable source wrappers with a BM25 gateway for tool discovery. Its gateway and composition model are the main architectural research signal.
- [maltego-mcp](https://github.com/lidless-labs/maltego-mcp) - LLM-authored `.mtgx` graph files and WHOIS, DNS, ASN, and crt.sh pivots, with described integrations for MISP, TheHive, Cortex, and MITRE ATT&CK.
- [shodan-mcp](https://github.com/Vorota-ai/shodan-mcp) - described as 20 passive-query tools, including no-key CVE, CPE, and InternetDB capabilities.
- [OWASP Social OSINT Agent](https://owasp.org/www-project-social-osint-agent/) - an agent using text and vision models through an OpenAI-compatible API to aggregate public signals from X, Reddit, Hacker News, Bluesky, GitHub, and Mastodon into structured reports.

## Reading, newsletters, and research

- [Sector035 - Week in OSINT](https://sector035.nl/) - weekly tools, techniques, and community updates.
- [OSINT Curious](https://www.osintcurio.us/) - articles, instructional video, and live streams.
- [OSINTech](https://osintech.substack.com/) - manually curated weekly sources emphasizing material readers can open and verify.
- [Offensive OSINT](https://www.offensiveosint.io/) - technically oriented OSINT writing from a systems engineering and penetration-testing perspective.
- [OSINT-newsletters](https://github.com/ubikron/OSINT-newsletters) - an index of newsletters and archives; its author also maintains an AI OSINT collection.
- [Agentic and Generative AI for OSINT and Cyber Investigations](https://arxiv.org/html/2607.03233v1) - a 2026 taxonomy and evaluation survey. The supplied summary highlights a gap between capability demonstrations and evaluation practice.
- [AI-Augmented SOC survey](https://www.mdpi.com/2624-800X/5/4/95) - broader security-operations framing with cyber-threat intelligence and OSINT as part of the taxonomy.

## Cross-cutting signals

Across the supplied sources, AI is positioned as assistance for pattern detection, entity resolution, correlation, and report assembly rather than a replacement for investigative judgment.

For any agentic system, collection accountability is a first-class requirement:

- Record the operator purpose and collection scope.
- Preserve source URLs, retrieval times, query parameters, and tool versions.
- Separate observed evidence from model inference.
- Record transformations, entity merges, and confidence judgments.
- Keep human review points for consequential conclusions.
- Define retention, redaction, and access controls before collecting sensitive data.
- Make lawful public-source collection boundaries explicit and do not silently expand into surveillance.

The audit trail is difficult to add after a pipeline already exists, so it should be part of the first executable slice.

## Possible system fit

The immediate architectural question is not which autonomous OSINT agent to install. It is which sources and passive collection adapters are worth evaluating behind a normalized, provenance-preserving retrieval contract.

Potential relationships:

- The [FlareSolverr content-acquisition note](../agent-workflows/workflow-ideas/flaresolverr-content-acquisition.md) covers one optional web retrieval fallback.
- The [X research pipeline](../agent-workflows/workflow-ideas/x-research-pipeline.md) explores a source-specific read-only collection graph.
- [Menos](../agent-workflows/projects/menos.md) is a possible durable storage and search backend.
- [Pipelines and policies](../agent-workflows/workflow-ideas/pipelines-and-policies.md) covers run ledgers, artifacts, and policy gates.

## KISS recommendation

Start by comparing the Bellingcat toolkit repository, the MCP server directory, and one no-key passive MCP implementation. Capture source coverage, license, update cadence, output schema, provenance support, and failure behavior. Do not deploy an autonomous investigator until the audit record and human-review boundary are explicit.
