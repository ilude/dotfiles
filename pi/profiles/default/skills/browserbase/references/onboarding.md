# Browserbase onboarding

Read this only when the user requests first-time setup, a starter demo, or onboarding help. Routine browser work follows the main skill without repeating this sequence.

Explain Browserbase in one sentence: it runs Chrome in the cloud so code or an agent can browse without running a browser locally. Define unfamiliar terms before using them. Echo the user's choice before acting.

1. Check prerequisites, ask before missing-package installs, retrieve the key, and verify access using the main skill's setup steps. Do not require a Browserbase project ID.
2. Ask whether to try a template, integrate into an existing project, or build from scratch. For an existing project, inspect and confirm its path, conventions, and requested task before editing it.
3. For a template, offer product scraping, form filling, SEC filings, or a custom task. Confirm current slugs with `browse templates list`. Clone into a fresh system-temp sandbox without deleting pre-existing work. Inspect its configuration, leave optional model-provider keys blank, and ask before installing dependencies. Do not persist the Browserbase key in the clone unless the user explicitly wants that configuration.
4. Explain what the run will do, run it, and surface its full session link and meaningful progress. Verify the requested result using the main skill. Diagnose errors rather than leaving a stalled demo running.
5. Ask whether to keep the sandbox, then offer to build the user's own automation. Do not make a feedback discussion a prerequisite for continuing.

Optional feedback: offer help preparing a report if an issue arises or after the first successful run, without repeatedly prompting. Show the exact report and obtain approval before sending it; project and session identifiers are opt-in separately for every report. Never include keys, private page contents, logs, or transcripts. Read current submission documentation before sending; this reference does not establish a feedback endpoint or authorize submission. If asked to remember a preference, use only supported memory or a user-approved context file, not an incidental shared-repository edit. A saved preference never authorizes a future report.
