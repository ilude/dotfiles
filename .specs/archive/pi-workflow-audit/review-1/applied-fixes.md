# Applied Fix Plan

| Finding | Category | Plan section(s) to edit | Edit intent | Checklist impact |
|---|---|---|---|---|
| Undefined discovery scope and completeness rules | Bug | Data Sources; Task Breakdown; Validation Contract | Add exact roots, availability checks, completeness gates, unavailable-path logging | Add unchecked inventory/checkpoint items |
| No deterministic sampling protocol | Bug | Task Breakdown; Sampling Protocol; Validation Contract | Add candidate-index freeze, deterministic seed/sort, strata, overlap handling, stop rules | Add unchecked sampling item |
| Subjective labels lack operational definitions and reliability controls | Bug | Coding Schema; Measurement Data Dictionary; Task Breakdown | Add operational definitions, evidence rules, confidence, calibration/recode process | Add unchecked coding-schema and calibration items |
| Sensitive log/privacy handling missing | Bug | Privacy and Security Protocol; Risk & Manual Gate Decision; Validation Contract | Add redaction, local-only storage, no external upload, incident cleanup | Add unchecked privacy gate and redaction validation items |
| No executable artifact/run contract | Bug | Execution Contract; Artifact Layout; Execution Waves | Define run-id artifacts, allowed commands/writes, atomic writes, resume rules, schemas | Add unchecked runner/artifact items |
| Automation readiness sections missing | Bug | Whole plan | Restructure into /do-it-ready headings and checklist | Add full execution checklist |
| MVP stop rule | Hardening | Scope; Execution Waves; Success Criteria | Add staged MVP report and expansion criteria | Add unchecked MVP report gate |
| Equivalent workflow false positives | Hardening | Episode Detection Criteria | Require at least two structural signals | Add candidate-index validation item |
| Incomplete-context bias | Hardening | Episode Detection Criteria; Sampling Protocol | Add incomplete-context stratum instead of default exclusion | Add sampling item |
| Conditional era claims | Hardening | Git-Based Era Timeline; Success Criteria | Require timeline but mark era claims exploratory when counts are insufficient | Add timeline item |
| Human burden metrics | Hardening | Measurement Data Dictionary; Coding Schema | Separate operator burden from token/tool cost | Add coding item |
| Path and scan performance controls | Hardening | Execution Contract; Performance Controls | Add path normalization, file-size limits, streaming/two-pass scan, timeouts | Add inventory item |
