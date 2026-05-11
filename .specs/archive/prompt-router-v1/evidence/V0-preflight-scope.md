# V0 preflight scope validation
- P0 evidence exists: yes
- Secret scan command: grep -EIn "(AKIA|BEGIN (RSA|OPENSSH|EC|DSA)? ?PRIVATE KEY|PASSWORD|api[_-]?key)" .specs/prompt-router-v1/evidence/P0-preflight.md
- Secret scan result: no matches (generic TOKEN/SECRET terms were not used as failure because repository symbol names may include non-secret text)
- PRD scope: .specs/prompt-router-roadmap/PRD.md contains prompt-router canonical vocabulary/classifier/status-explain/Codex scope.
- Not using .specs/pi-control-plane-consolidation/plan.md.
