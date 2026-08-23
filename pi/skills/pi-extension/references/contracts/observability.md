# Observability, Transcripts, and Usage

- Separation: content-bearing transcripts and metadata-only operational metrics are different trust boundaries. Never treat one as interchangeable with the other.
- Transcripts: tracing is off by default and enabled only in per-user runtime settings. It may capture provider payloads, visible assistant content and thinking, tool inputs/results, errors, and selected headers. Hidden provider reasoning is never captured.
- Transcript safety: clone and redact before persistence, restrict local permissions, reject configured cloud-sync paths, spill oversized redacted fields to bounded companion files, and correlate records without emitting per-token events.
- Transcript retention: apply configured retention at session start and support explicit purge. A bare `/transcript-purge` age is measured in days; explicit `ms`, `s`, `m`, `h`, and `d` suffixes remain supported. Purge only the inspected trace and spill boundary.
- Metrics: metrics are best-effort, append-only operational metadata. Producers must not include prompts, tool arguments, terminal output, response content, secrets, or unbounded free text.
- Failure: disabled or failed observability must not break the primary tool, workflow, or session operation. Record gaps rather than inventing missing evidence.
- Interpretation: metrics and traces are observational. They do not by themselves prove correctness, completion, quality, causality, or savings. Missing pricing is unknown cost, not zero cost.
- Diagnostics: usage, extension, skill, routing, and orchestration reports are read-only bounded views over local data and must not start an unnecessary provider turn.
- Retention boundary: metrics currently have no built-in retention guarantee. Do not promise automatic deletion, permanent retention, or cross-machine synchronization without an explicit policy.
- Storage: generated sessions, histories, traces, metrics, workflow-friction records, caches, and indexes remain local runtime state and are not tracked repository source.
