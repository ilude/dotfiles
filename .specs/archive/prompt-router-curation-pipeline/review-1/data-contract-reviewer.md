- severity: high
  evidence: `accepted_route` is required in the candidate schema, but T3 only says router labels leave it unset and T4 can assign `auto_accept_candidate` without defining when, by whom, or in what schema `accepted_route` becomes non-null. This blurs weak prediction vs promotable label.
  required_fix: Define `accepted_route` as nullable until explicit promotion/review, require `auto_accept_candidate` to keep it null or use a separate `proposed_route`, and document the only transition that may populate `accepted_route`.

- severity: high
  evidence: The plan lists four statuses but does not define an allowed state machine. `auto_accept_candidate`, `holdout_candidate`, `needs_review`, and `reject` could be recomputed, overwritten, or moved into promotion outputs without transition history.
  required_fix: Add a status-transition contract with allowed transitions, terminal states, required actor/process, timestamp/run id, and invariants preventing direct movement from weak-label triage to production training.

- severity: medium
  evidence: Schema acceptance requires `id`, but no deterministic ID algorithm is specified. External datasets can reorder, duplicate, or change row indices; retraining dedupe and holdout separation become unsafe if IDs depend on pull order.
  required_fix: Specify stable IDs as a versioned hash over normalized source identifier, source row key, prompt canonical form, and schema version. Tests should prove IDs are stable across reordered bounded pulls and change on material prompt changes.

- severity: medium
  evidence: `source_license` is required, yet the plan only says skipped/gated sources are reported. It does not define allowed license values, unknown-license handling, license URL/revision capture, or whether auto-accept is blocked for unknown/incompatible licenses.
  required_fix: Add source attribution fields (`source_dataset`, `source_url`, `source_revision`, `source_row_id`, `license_name`, `license_url`) and triage rules that reject or `needs_review` rows with unknown/incompatible license before any accepted/holdout export.

- severity: medium
  evidence: Later retraining compatibility is deferred, but the MVP output schema lacks `schema_version`, `pipeline_version`, source snapshot/revision, and weak-labeler version/config. Without these, future training cannot compare runs or reproduce labels.
  required_fix: Add top-level `schema_version` per row plus run manifest fields for pipeline git SHA, router model/version, feature extractor version, source revisions, limits, and config hash. Require summaries to reference the manifest.
