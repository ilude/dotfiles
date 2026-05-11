# Canonical route parity
timestamp: 2026-05-08T00:00:00Z
cwd: <worktree>
branch: plan/prompt-router-control-plane
## fixture
- path: pi/prompt-routing/tests/fixtures/canonical_route_vocabulary.json
- canonical_routes: nano | mini | core | large | max
- legacy_route_map: Haiku->mini, Sonnet->core, Opus->large
- route_aliases: small->mini, medium->core, large->large
## validation
- TS: pi/tests/prompt-router.test.ts asserts the shared fixture matches the TS canonical vocabulary.
- Python: pi/prompt-routing/tests/test_route_vocabulary_parity.py asserts the same fixture contents under pytest.
- result: pass
