## Referenced post

- **Himanshu Anand — “the 90 day disclosure policy is dead”**  
  https://blog.himanshuanand.com/2026/05/the-90-day-disclosure-policy-is-dead/
- Context baseline: **Google Project Zero’s 90+30 disclosure policy**  
  https://projectzero.google/vulnerability-disclosure-policy.html

## Core argument

The post argues that the traditional **90-day responsible disclosure window** assumes a slower world:

1. Vulnerability discovery is rare.
2. Independent rediscovery is unlikely.
3. Vendors have meaningful lead time.
4. Attackers need days/weeks after a patch to build exploits.

The author claims those assumptions are failing because **LLMs compress both discovery and exploitation timelines**:

- Multiple researchers can converge on the same bug within days/weeks.
- Patch diffs can be turned into working PoCs quickly.
- Public patches/advisories may function as exploit roadmaps.
- Monthly or sprint-based patch cycles become attacker grace periods.

The author’s blunt recommendation: **treat critical security issues as P0 emergencies and patch immediately**, not within normal release cadence.

## Implications for AI-accelerated vuln discovery / patch workflows

- **Disclosure clocks may be too slow for critical bugs.** If AI-assisted hunters independently rediscover the same issue, embargoes become fragile.
- **N-day risk increases sharply.** Once a patch lands, defenders should assume attackers can use AI to analyze the diff and generate exploit candidates quickly.
- **Patch latency becomes the main exposure.** The gap between “fix exists upstream” and “deployed everywhere” is now a high-risk window.
- **Defenders need similar automation.** The post argues blue teams should use AI for PR security review, patch-diff analysis, dependency impact tracing, and regression-test generation.

## Practical takeaways for developer tooling

- Add **security checks at PR time**, not only periodic scans.
- Build/enable tooling that watches upstream dependencies and automatically:
  - detects security-relevant diffs,
  - maps affected versions,
  - estimates local exploitability,
  - opens upgrade/remediation PRs.
- Treat critical dependency patches as **urgent deploy events**, not backlog items.
- Use AI defensively to:
  - review risky code paths,
  - generate exploit-style regression tests,
  - search for the same bug pattern elsewhere,
  - validate whether a patch fully closes the issue.
- Track **mean time to patch** as a security SLO, especially for internet-facing or privilege-boundary bugs.

## Caveats

- The post is persuasive but partly anecdotal; some claims need independent verification case-by-case.
- “90-day disclosure is dead” is intentionally provocative. Coordinated disclosure still matters, especially for complex ecosystems.
- Not every vulnerability has the same exploitability, blast radius, or patch urgency.
- AI can speed analysis, but it can also produce false positives or misleading exploitability assessments; human security review remains necessary.