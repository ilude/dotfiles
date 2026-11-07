---
name: issue-research
description: Research upstream issues, pull requests, and feature discussions with dates, comment counts, and evidence of substantive activity. Use when checking whether a bug or feature is tracked, progressing, stalled, closed, or available upstream.
---

# Issue research

Use [web-tools](../web-tools/SKILL.md) for retrieval selection. This skill owns evidence and reporting, not a separate browser or API workflow.

## Establish status and chronology

For each issue, PR, or discussion used in the answer, retrieve the original thread and report:

- Linked title/number and current state. Distinguish open, closed without merging, merged, and released; link a replacement or duplicate target when relevant.
- Created date, last updated date, and total comment count. Include closure or merge dates when they explain the outcome. State when a field is unavailable rather than guessing.
- A short activity assessment grounded in dated comments, reviews, commits, or maintainer decisions, not just the last-updated timestamp.

Use absolute dates (`YYYY-MM-DD`) and give the research's as-of date once. Relative ages may supplement dates. Keep metadata compact enough that it does not bury the answer. Distinguish discussion comments from PR review comments when the source counts them separately; do not silently combine counts or present retrieved-page length as the total.

## Read activity, not just timestamps

An updated timestamp can reflect labels, bot activity, edits, or a user bump. It is not proof of renewed development. Inspect the latest comments and enough earlier context to identify the last substantive activity and any long quiet interval. For PRs, check recent commits and reviews when needed to assess progress.

- **Substantive progress:** a concrete maintainer decision, implementation work, linked active replacement, useful reproduction, review, or release evidence. Say which kind and who supplied it; a user workaround is not maintainer commitment.
- **Recent bump only:** after older discussion, the newest comment merely asks “any news?”, “any progress?”, or “thoughts?”. Report the bump's date separately from the last substantive activity, with a brief quote or paraphrase. A large historical comment count does not make the thread currently active.
- **Administrative or automated activity:** identify it as such when it explains apparent freshness. Do not count bot comments as human engagement; an actual merge or release event still matters regardless of who posted it.
- **Unclear:** if the relevant history cannot be retrieved, say activity is unverified. Do not label the thread active, abandoned, or stalled from metadata alone. Silence does not establish abandonment or an ETA.

Fetch a bounded recent comment page and relevant earlier context, expanding only when the activity assessment depends on missing history. Follow pagination where needed; disclose partial coverage rather than claiming to have reviewed every comment. Separate the latest meaningful discussion from the latest development or maintainer response when that distinction matters.

## Present the result

Prefer a short entry per relevant result:

> **[Title #N](url)** · Open · Created YYYY-MM-DD · Updated YYYY-MM-DD · N comments. **Activity:** last substantive maintainer response YYYY-MM-DD; the latest comment on YYYY-MM-DD only asks “any progress?” after a long quiet interval.

Adapt the activity sentence to the evidence, not a fixed label or age cutoff. Include a direct comment, review, or commit link for consequential activity claims when available. If no open match is found, say so and distinguish related closed work or discussions. An old unmerged proposal is not an upcoming feature, and a merged change is not proof the user's installed version includes it.
