# Prompt Router Next Steps

## Recommended sequence

### 1. Keep production artifacts unchanged

The sandbox candidate passed gates, but it has not been promoted through the
canonical production corpus and artifact path.

Do not replace tracked model artifacts until a dedicated production promotion
step passes.

### 2. Evaluate NVIDIA complexity scorer before expanding the subset

The NVIDIA model may help prioritize review rows and avoid weak-label false
positives. Evaluate it as a triage signal, not a ground-truth labeler.

Questions to answer:

- Does it identify high-risk rows that ConfGate auto-accepts?
- Does it separate passing routellm 250-row candidates from failing 1k rows?
- Does it improve review yield for underrepresented routes?
- Does it catch short hard prompts and long easy prompts?

See [NVIDIA complexity scorer](nvidia-complexity-scorer.md).

### 3. Implement user effort override policy

User-selected effort should be authoritative. The router should record its
recommendation but preserve explicit user effort choices unless a hard cap
prevents it.

See [user effort override policy](user-effort-override-policy.md).

### 4. Improve local workflow data collection

Collect privacy-safe telemetry from real Pi usage:

- Router recommendation.
- User-selected route or effort.
- Final applied route.
- Override type.
- Task type.
- Validation result.
- Repair loop count.
- Follow-up correction or escalation signal.

See [workflow data collection](workflow-data-collection.md).

### 5. Build adjudication queue from local signals

Prioritize review for:

- User override disagreements.
- Low route followed by validation failures.
- High route completed trivially.
- Short prompts that needed more effort.
- Long prompts that were easy.
- Safety-sensitive prompts routed too low.

### 6. Production promotion dry run

If the team chooses to proceed with the 60-row reviewed subset:

1. Convert rows to canonical production corpus format.
2. Preserve source, license, provenance, and review notes.
3. Regenerate production model artifacts in a controlled branch.
4. Run production validation and SHA checks.
5. Compare against the current production baseline.
6. Deploy only if production gates pass.

## Decision point

There are two reasonable paths:

1. Promote the reviewed 60-row subset through production dry run now.
2. First evaluate NVIDIA scoring and local override telemetry to improve the
   next reviewed subset.

Recommendation: evaluate NVIDIA and effort-override telemetry before production
promotion unless there is a near-term need to ship the modest sandbox gains.
