# Disposable calibration repositories

These directories are copied into temporary Git repositories by the calibration protocol. They are outside Pi's configured test discovery. The fixture sources state contracts and executable inputs only; the root keeps expected findings, counterfactual verdicts, and calibration answers separately.

- `case-01` through `case-06` contain independent JavaScript/TypeScript review material.
- `runners` contains version-pinned runner configuration examples.
- `controls` contains bounded safety demonstrations. The hanging child is local, the external target is a fake URL, and the missing dependency is intentionally unavailable.

No fixture command is a production or external target.
