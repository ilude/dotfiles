# V1 control-plane evidence

## pi/tests pnpm install --frozen-lockfile
exit code: 0
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 760ms using pnpm v10.33.2

## pi/tests pnpm test prompt-router.test.ts
exit code: 0

> pi-extension-tests@ test C:\Users\mglenn\.dotfiles\pi\tests
> vitest run "prompt-router.test.ts"


 RUN  v4.1.5 C:/Users/mglenn/.dotfiles/pi

 ✓ tests/prompt-router.test.ts (70 tests) 91ms

 Test Files  1 passed (1)
      Tests  70 passed (70)
   Start at  13:04:46
   Duration  1.81s (transform 258ms, setup 0ms, import 1.40s, tests 91ms, environment 0ms)


## pi/extensions pnpm install --frozen-lockfile
exit code: 0
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 708ms using pnpm v10.33.2

## pi/extensions pnpm run typecheck
exit code: 0

> pi-extensions-typecheck@ typecheck C:\Users\mglenn\.dotfiles\pi\extensions
> tsc --noEmit


## classify invalid
exit code: 2
usage: classify.py [-h] [--classifier {t2,ensemble,lgbm,confgate}]
                   [--prompt-file PROMPT_FILE] [--artifact-inventory]
                   [prompt ...]
classify.py: error: argument --classifier: invalid choice: 'invalid' (choose from t2, ensemble, lgbm, confgate)

## classify t2 inventory
exit code: 0
{"schema_version": "1.0.0", "classifier": "t2", "artifacts": [{"model": "router_v3.joblib", "sha256": "router_v3.sha256", "hash": "1da4d8c292b0e77f48bbbcda1c68fd4f7f1130d01d553fdbfe479c348545c457"}]}

## Files changed
 M .gitignore
 D .specs/agent-browser-pi-tooling/plan.md
 D .specs/agent-browser-pi-tooling/review-1/applied-fixes.md
 D .specs/agent-browser-pi-tooling/review-1/devops-pro.md
 D .specs/agent-browser-pi-tooling/review-1/devops-pro.out
 D .specs/agent-browser-pi-tooling/review-1/product-manager.md
 D .specs/agent-browser-pi-tooling/review-1/product-manager.out
 D .specs/agent-browser-pi-tooling/review-1/qa-engineer.md
 D .specs/agent-browser-pi-tooling/review-1/qa-engineer.out
 D .specs/agent-browser-pi-tooling/review-1/reviewer-recovery.out
 D .specs/agent-browser-pi-tooling/review-1/reviewer.md
 D .specs/agent-browser-pi-tooling/review-1/reviewer.out
 D .specs/agent-browser-pi-tooling/review-1/security-reviewer-recovery.out
 D .specs/agent-browser-pi-tooling/review-1/security-reviewer.md
 D .specs/agent-browser-pi-tooling/review-1/security-reviewer.out
 D .specs/agent-browser-pi-tooling/review-1/synthesis.md
 D .specs/agent-browser-pi-tooling/review-1/typescript-pro.md
 D .specs/agent-browser-pi-tooling/review-1/typescript-pro.out
 D .specs/agent-browser-pi-tooling/review-1/ux-researcher.md
 D .specs/agent-browser-pi-tooling/review-1/ux-researcher.out
 D .specs/pi-agent-team-cleanup/PRD.md
 D .specs/pi-branch-tab/plan.md
 D .specs/pi-branch-tab/review-2/synthesis.md
 D .specs/pi-tasks-control-plane/PRD.md
 D .specs/pi-tasks-control-plane/plan.md
 D .specs/pi-tasks-control-plane/review-1/applied-fixes.md
 D .specs/pi-tasks-control-plane/review-1/backend-dev-state.md
 D .specs/pi-tasks-control-plane/review-1/product-manager.md
 D .specs/pi-tasks-control-plane/review-1/qa-engineer.md
 D .specs/pi-tasks-control-plane/review-1/reviewer.md
 D .specs/pi-tasks-control-plane/review-1/security-reviewer.md
 D .specs/pi-tasks-control-plane/review-1/standalone-readiness.md
 D .specs/pi-tasks-control-plane/review-1/synthesis.md
 D .specs/pi-tasks-control-plane/review-1/typescript-pro.md
 D .specs/pi-tasks-control-plane/review-1/ux-researcher.md
 D .specs/pi-tasks-control-plane/review-2/applied-fixes.md
 D .specs/pi-tasks-control-plane/review-2/backend-dev-state.md
 D .specs/pi-tasks-control-plane/review-2/product-manager.md
 D .specs/pi-tasks-control-plane/review-2/qa-engineer.md
 D .specs/pi-tasks-control-plane/review-2/reviewer.md
 D .specs/pi-tasks-control-plane/review-2/security-reviewer.md
 D .specs/pi-tasks-control-plane/review-2/standalone-readiness-2.md
 D .specs/pi-tasks-control-plane/review-2/standalone-readiness.md
 D .specs/pi-tasks-control-plane/review-2/synthesis.md
 D .specs/pi-tasks-control-plane/review-2/typescript-pro.md
 D .specs/pi-tasks-control-plane/review-2/ux-researcher.md
 D .specs/prompt-router-control-plane-v2/plan.md
 D .specs/prompt-router-control-plane-v2/review-1/applied-fixes.md
 D .specs/prompt-router-control-plane-v2/review-1/devops-automation-readiness-reviewer.md
 D .specs/prompt-router-control-plane-v2/review-1/product-manager.md
 D .specs/prompt-router-control-plane-v2/review-1/python-classifier-eval-reviewer.md
 D .specs/prompt-router-control-plane-v2/review-1/qa-validation-realism-reviewer.md
 D .specs/prompt-router-control-plane-v2/review-1/reviewer.md
 D .specs/prompt-router-control-plane-v2/review-1/security-reviewer.md
 D .specs/prompt-router-control-plane-v2/review-1/synthesis.md
 D .specs/prompt-router-control-plane-v2/review-1/typescript-route-decision-reviewer.md
 D .specs/prompt-router-control-plane/plan.md
 D .specs/prompt-router-control-plane/review-1/applied-fixes.md
 D .specs/prompt-router-control-plane/review-1/prd-plan-comparison.md
 D .specs/prompt-router-control-plane/review-1/product-manager-output.txt
 D .specs/prompt-router-control-plane/review-1/product-manager.md
 D .specs/prompt-router-control-plane/review-1/python-pro-output.txt
 D .specs/prompt-router-control-plane/review-1/python-pro.md
 D .specs/prompt-router-control-plane/review-1/qa-engineer-output.txt
 D .specs/prompt-router-control-plane/review-1/qa-engineer.md
 D .specs/prompt-router-control-plane/review-1/reviewer-output.txt
 D .specs/prompt-router-control-plane/review-1/reviewer-recovery-output.txt
 D .specs/prompt-router-control-plane/review-1/reviewer.md
 D .specs/prompt-router-control-plane/review-1/security-reviewer-output.txt
 D .specs/prompt-router-control-plane/review-1/security-reviewer-recovery-output.txt
 D .specs/prompt-router-control-plane/review-1/security-reviewer.md
 D .specs/prompt-router-control-plane/review-1/standalone-readiness-result.md
 D .specs/prompt-router-control-plane/review-1/synthesis.md
 D .specs/prompt-router-control-plane/review-1/typescript-pro-output.txt
 D .specs/prompt-router-control-plane/review-1/typescript-pro.md
 D .specs/x-research-pipeline/plan.md
 M pi/README.md
 M pi/agents/ml-research-lead.md
 M pi/extensions/agent-team.ts
 M pi/extensions/operator-status.ts
 M pi/extensions/prompt-router.ts
 M pi/extensions/subagent/agents.ts
 M pi/extensions/subagent/index.ts
 M pi/extensions/tasks.ts
 M pi/lib/operator-state.ts
 M pi/lib/prompt-router/route-decision.ts
 M pi/lib/task-registry.ts
 M pi/prompt-routing/router.py
 M pi/skills/pi-command/SKILL.md
 M pi/skills/workflow/do-it.md
 M pi/skills/workflow/plan-it.md
 M pi/skills/workflow/review-it.md
 M pi/skills/workflow/templates/do-it-report-template.md
 M pi/skills/workflow/templates/plan-template.md
 M pi/tests/branch-command.test.ts
 M pi/tests/operator-state.test.ts
 M pi/tests/prompt-router.test.ts
 M pi/tests/subagent.test.ts
 M pyproject.toml
?? .specs/archive/agent-browser-pi-tooling/
?? .specs/archive/pi-agent-team-cleanup/
?? .specs/archive/pi-branch-tab/
?? .specs/archive/pi-tasks-control-plane/
?? .specs/archive/prompt-router-control-plane-v2/
?? .specs/archive/prompt-router-control-plane/plan.md
?? .specs/archive/prompt-router-control-plane/review-1/
?? .specs/archive/x-research-pipeline/
?? .specs/pi-control-plane-consolidation/
?? .specs/prompt-router-v1/
?? config/age/
?? false
?? pi/lib/prompt-router/route-profile.ts
?? pi/lib/task-renderer.ts
?? pi/lib/task-security.ts
?? pi/lib/task-settings.ts
?? pi/prompt-routing/tests/test_router_logging_privacy.py
?? pi/skills/x-twitter/
?? pi/tests/agent-control-plane.test.ts
?? pi/tests/agent-role-semantics.test.ts
?? pi/tests/task-dependencies.test.ts
?? pi/tests/task-renderer.test.ts
?? pi/tests/task-security.test.ts
?? pi/tests/task-tools.test.ts
?? scripts/git-hooks/
?? scripts/install-x-private-hook
?? scripts/x-private-decrypt
?? scripts/x-private-encrypt
?? scripts/x-private-scan
?? src/
?? tests/
# Additional Wave 1 grep evidence
route fields grep exit code: 0
pi/extensions/prompt-router.ts:330:		raw_route: "core",
pi/extensions/prompt-router.ts:331:		applied_route: "core",
pi/extensions/prompt-router.ts:428:		raw_route: rawRoute,
pi/extensions/prompt-router.ts:429:		applied_route: appliedRoute,
pi/extensions/prompt-router.ts:858:		applied_route: applied ? `${applied.tier}:${applied.effort}` : null,
pi/extensions/prompt-router.ts:859:		selected_model_size:
pi/extensions/prompt-router.ts:870:				applied_route: applied ? `${applied.tier}:${applied.effort}` : null,
pi/extensions/prompt-router.ts:871:				selected_model_size:
pi/extensions/prompt-router.ts:879:			applied_route: applied ? `${applied.tier}:${applied.effort}` : null,
pi/extensions/prompt-router.ts:880:			selected_model_size:
pi/extensions/prompt-router.ts:906:				applied_route: payload.applied_route,
pi/extensions/prompt-router.ts:907:				selected_model_size: payload.selected_model_size,
pi/extensions/prompt-router.ts:1116:					? { previousAppliedRoute: state.lastRouteDecision.applied_route }
pi/extensions/prompt-router.ts:1134:			`same_turn_applied: true route_decision_id=${decision.route_decision_id} route=${decision.applied_route}`,
pi/extensions/prompt-router.ts:1142:				raw_route: decision.raw_route,
pi/extensions/prompt-router.ts:1143:				applied_route: decision.applied_route,
pi/extensions/prompt-router.ts:1208:				`  Raw/applied:      ${decision ? `${decision.raw_route} -> ${decision.applied_route}` : "--"}`,
pi/extensions/prompt-router.ts:1212:				`  Operator summary: ${decision ? `${decision.applied_route}/${decision.thinking_level} via ${trace?.rule ?? decision.route_resolution_reason}` : "no dispatch decision yet"}`,
pi/extensions/prompt-router.ts:1249:				decision?.applied_route ?? state.lastEffective ?? "--";
pi/extensions/prompt-router.ts:1273:				`  Raw/applied route: ${decision ? `${decision.raw_route} -> ${decision.applied_route}` : "--"}`,
pi/tests/prompt-router.test.ts:1398:    expect(decision.raw_route).toBe("nano");
pi/tests/prompt-router.test.ts:1399:    expect(decision.applied_route).toBe("mini");
pi/tests/prompt-router.test.ts:1410:    expect(decision.raw_route).toBe("max");
pi/tests/prompt-router.test.ts:1411:    expect(decision.applied_route).toBe("max");
pi/tests/prompt-router.test.ts:1431:    expect(decision.raw_route).toBe("mini");
pi/tests/prompt-router.test.ts:1432:    expect(decision.applied_route).toBe("large");
pi/tests/prompt-router.test.ts:1443:    expect(decision.raw_route).toBe("core");
pi/tests/prompt-router.test.ts:1444:    expect(decision.applied_route).toBe("large");
pi/tests/prompt-router.test.ts:1455:    expect(decision.raw_route).toBe("mini");
pi/tests/prompt-router.test.ts:1456:    expect(decision.applied_route).toBe("core");

profile grep exit code: 0
pi/lib/prompt-router/route-decision.ts:18:	routeState: RouteState;
pi/lib/prompt-router/route-profile.ts:13:	routeState: RouteState;
pi/lib/prompt-router/route-profile.ts:30:		routeState: "disabled",
pi/lib/prompt-router/route-profile.ts:41:		preferredModels: ["gpt-5.4-mini"],
pi/lib/prompt-router/route-profile.ts:42:		routeState: "available",
pi/lib/prompt-router/route-profile.ts:51:		preferredModels: ["gpt-5.5", "gpt-5.3-codex"],
pi/lib/prompt-router/route-profile.ts:52:		routeState: "available",
pi/lib/prompt-router/route-profile.ts:61:		preferredModels: ["gpt-5.5", "gpt-5.3-codex"],
pi/lib/prompt-router/route-profile.ts:62:		routeState: "available",
pi/lib/prompt-router/route-profile.ts:71:		preferredModels: ["gpt-5.5", "gpt-5.3-codex"],
pi/lib/prompt-router/route-profile.ts:72:		routeState: "policy-only",
pi/extensions/prompt-router.ts:261:	return resolveDefaultCodexProfile(appliedRoute).routeState;
pi/extensions/prompt-router.ts:287:		routeState: resolveRouteState(
pi/extensions/prompt-router.ts:571:const CODEX_GPT55_MODEL = "gpt-5.5";
pi/extensions/prompt-router.ts:1210:				`  Route state:      ${trace?.routeState ?? "--"}`,
pi/tests/prompt-router.test.ts:253:    expect(buildStatusLabel("low", "low", "gpt-5.4-mini", "minimal")).toBe("route: small");
pi/tests/prompt-router.test.ts:277:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:332:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:384:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:540:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:601:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:700:          { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:743:          { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:1015:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:1063:        getAvailable: vi.fn(() => [{ provider: "openai-codex", id: "gpt-5.4-mini" }]),
pi/tests/prompt-router.test.ts:1064:        find: vi.fn(() => ({ provider: "openai-codex", id: "gpt-5.4-mini" })),
pi/tests/prompt-router.test.ts:1089:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:1168:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:1224:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:1284:  function routeCtx(current = { provider: "openai-codex", id: "gpt-5.4-mini" }) {
pi/tests/prompt-router.test.ts:1286:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:1343:    expect(decision.model_label).toBe("gpt-5.4-mini");
pi/tests/prompt-router.test.ts:1386:    expect(profile.routeState).toBe("available");
pi/tests/prompt-router.test.ts:1402:    expect(decision.decisionTrace.routeState).toBe("fallback");
pi/tests/prompt-router.test.ts:1412:    expect(decision.decisionTrace.routeState).toBe("policy-only");
pi/tests/prompt-router.test.ts:1413:    expect(["available", "fallback", "policy-only", "disabled"]).toContain(decision.decisionTrace.routeState);
pi/tests/prompt-router.test.ts:1451:    const ctx = routeCtx({ provider: "openai-codex", id: "gpt-5.4-mini", contextWindow: 1000 } as any);
pi/tests/prompt-router.test.ts:1495:      { provider: "openai-codex", id: "gpt-5.4-mini" },
pi/tests/prompt-router.test.ts:1500:      model: { provider: "openai-codex", id: "gpt-5.4-mini" },

# V1 rerun after canonical telemetry route fields
## pi/tests pnpm test prompt-router.test.ts
exit code: 0

> pi-extension-tests@ test C:\Users\mglenn\.dotfiles\pi\tests
> vitest run "prompt-router.test.ts"


 RUN  v4.1.5 C:/Users/mglenn/.dotfiles/pi

 ✓ tests/prompt-router.test.ts (70 tests) 88ms

 Test Files  1 passed (1)
      Tests  70 passed (70)
   Start at  13:06:34
   Duration  2.07s (transform 275ms, setup 0ms, import 1.64s, tests 88ms, environment 0ms)


## pi/extensions pnpm run typecheck
exit code: 0

> pi-extensions-typecheck@ typecheck C:\Users\mglenn\.dotfiles\pi\extensions
> tsc --noEmit


# V1 final rerun after command canonical route display
## pi/tests pnpm test prompt-router.test.ts
exit code: 0

> pi-extension-tests@ test C:\Users\mglenn\.dotfiles\pi\tests
> vitest run "prompt-router.test.ts"


 RUN  v4.1.5 C:/Users/mglenn/.dotfiles/pi

 ✓ tests/prompt-router.test.ts (70 tests) 95ms

 Test Files  1 passed (1)
      Tests  70 passed (70)
   Start at  13:07:10
   Duration  2.16s (transform 280ms, setup 0ms, import 1.75s, tests 95ms, environment 0ms)


## pi/extensions pnpm run typecheck
exit code: 0

> pi-extensions-typecheck@ typecheck C:\Users\mglenn\.dotfiles\pi\extensions
> tsc --noEmit

