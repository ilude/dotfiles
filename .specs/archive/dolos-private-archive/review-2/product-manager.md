# Product/Simplicity Review

## Finding 1
**Severity:** High  
**Evidence:** MVP promises one safer archive workflow, but the plan expands into a new Go product with manifest schema, index state machine, locking, scratch permissions, malicious tar corpus, linked-worktree refs, Docker build, Python migration, and Pi `/commit` helper preparation. This is too much for proving the user outcome: “explicit pack/unpack without hook surprise.”  
**Required fix:** Split into MVP A: standalone `init/status/pack/unpack/scan` plus hook no-mutate migration. Defer linked-worktree remote freshness, Pi helpers, exhaustive malicious corpus, and generalized index abstractions until the simple workflow is dogfooded.

## Finding 2
**Severity:** High  
**Evidence:** T9 contradicts the plan’s own boundary: “/commit auto-pack integration is Phase 2 and must not be implemented until standalone Dolos behavior and hook safety are validated,” yet Wave 3 includes Phase 2 freshness integration work and TypeScript tests in the MVP execution path.  
**Required fix:** Remove T9 from this plan. Replace it with a short documented Phase 2 backlog item or acceptance note saying `/commit` remains unchanged and Dolos is manually invoked.

## Finding 3
**Severity:** Medium  
**Evidence:** The task breakdown does not map cleanly to the user outcome. T2/T3/T4/T5/T6 are sliced by implementation internals, causing parallel tasks that will collide in `main.go` and `internal/dolos/*.go`. This increases coordination cost and rework for a small CLI.  
**Required fix:** Re-slice by vertical user workflows: build/help, init/status, pack, unpack, scan/hook migration. Keep pure helper tests inside each vertical slice instead of a separate model wave.

## Finding 4
**Severity:** Medium  
**Evidence:** Mandatory Docker build is over-specified. The plan says use Go CLI and reuse existing Docker pattern, but requires Docker validation even when local Go could compile faster and simpler. This adds daemon dependency to a local dotfiles workflow.  
**Required fix:** Make `go test ./...` and local `go build -o ../../bin/dolos(.exe)` the primary path. Keep Docker build as optional parity validation or release packaging, not a blocking MVP gate unless local Go is unavailable.

## Finding 5
**Severity:** Medium  
**Evidence:** The plan requires `.dolos/artifacts/private.tar.gz.age` as a tracked artifact and extensive tests around it, but does not explicitly require checking that binary archive churn is acceptable in normal Git review or that the artifact can be regenerated deterministically enough for conflict resolution. Single-blob archives can make every private change opaque.  
**Required fix:** Add an explicit product decision gate: accept opaque single-artifact churn for MVP, document review/recovery expectations, and add `dolos status` output that explains artifact freshness without requiring binary diff inspection.
