# Architecture Review

Use this review when a concrete structural friction is present.

- Identify responsibilities that change for different reasons.
- Trace dependencies across module boundaries and find unstable direction.
- Check whether callers can test the behavior through a stable seam.
- Prefer moving ownership or narrowing an interface over adding indirection.
- Verify the proposed boundary with the callers and one representative test.

Report the current boundary, the demonstrated coupling, the smallest structural change, and the evidence that the seam remains usable.
