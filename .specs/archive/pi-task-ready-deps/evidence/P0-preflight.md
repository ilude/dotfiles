 M pi/prompt-routing/data/context_sequences_v1.jsonl
?? .specs/pi-task-ready-deps/evidence/
pi/lib/commit/plan.ts:43:	if (entry.x === "D") return { path: entry.path, index, worktree, classification: "staged_deletion", ignored, safeToGitAdd: false, recommendedAction: "keep_staged", reason: ignored ? "Ignored staged deletion must not be re-added." : "Deletion is already staged." };
pi/lib/commit/plan.ts:45:	if (entry.x !== " " && entry.x !== "?") return { path: entry.path, index, worktree, classification: "staged_change", ignored, safeToGitAdd: !ignored, recommendedAction: "keep_staged", reason: "Change is already staged." };
pi/lib/commit/plan.ts:54:	const blocks = [] as string[];
pi/lib/commit/plan.ts:56:		ok: true, blocked: blocks, warnings: [] as string[], detachedHead: branch.code !== 0,
pi/lib/commit/plan.ts:63:	for (const [key, label] of [["mergeInProgress","merge"],["rebaseInProgress","rebase"],["cherryPickInProgress","cherry-pick"],["bisectInProgress","bisect"],["hasUnmergedPaths","unmerged paths"],["detachedHead","detached HEAD"]] as const) if (state[key]) blocks.push(`Blocked during ${label}.`);
pi/lib/commit/plan.ts:64:	state.ok = blocks.length === 0;
pi/lib/commit/plan.ts:75:	const alreadyStagedPaths = entries.filter((entry) => entry.recommendedAction === "keep_staged").map((entry) => entry.path);
pi/lib/commit/plan.ts:76:	const expectedStagedPaths = normalizeCommitPaths([...alreadyStagedPaths, ...safeStagePaths]);
pi/lib/commit/README.md:7:Preflight blocks mutating operations during merge, rebase, cherry-pick, bisect, detached HEAD, and unmerged paths. Submodules, worktrees, sparse checkout, and partial index are surfaced explicitly; V1 treats them as states requiring conservative handling before mutation.
pi/lib/commit/stage.ts:16:	if (!plan.preflight.ok) throw new Error(`Cannot stage while repository is unsafe: ${plan.preflight.blocked.join("; ")}`);
pi/lib/commit/types.ts:28:	blocked: string[];
pi/lib/memory-snapshot-archive.ts:84: * - Throws (with partial-dir cleanup) if archiveDir already exists.
pi/lib/memory-snapshot-archive.ts:96:      `archive_dir already exists and overwrite is refused: ${plan.archiveDir}`
pi/lib/operator-state.ts:16: * surfaces (blocked > failed > running > pending > completed > cancelled).
pi/lib/operator-state.ts:21:	"blocked",
pi/lib/operator-state.ts:40: * - running -> blocked (waiting), completed, failed, cancelled
pi/lib/operator-state.ts:41: * - blocked -> running (resumed), failed, cancelled
pi/lib/operator-state.ts:55:		new Set<TaskState>(["blocked", "completed", "failed", "cancelled"]),
pi/lib/operator-state.ts:58:		"blocked",
pi/lib/permission-rules.ts:58:			// `**` is treated identically to `*` here -- the matcher already
pi/lib/task-registry.ts:56:	blockedBy?: string[];
pi/lib/task-registry.ts:57:	blocks?: string[];
pi/lib/task-registry.ts:71:	blockedBy?: string[];
pi/lib/task-registry.ts:72:	blocks?: string[];
pi/lib/task-registry.ts:81:	blockedBy?: string[];
pi/lib/task-registry.ts:82:	blocks?: string[];
pi/lib/task-registry.ts:148:		blockedBy: normalizeIdList(parsed.blockedBy),
pi/lib/task-registry.ts:149:		blocks: normalizeIdList(parsed.blocks),
pi/lib/task-registry.ts:189:function assertNoCycle(id: string, blockedBy: string[]): void {
pi/lib/task-registry.ts:190:	for (const blocker of blockedBy) {
pi/lib/task-registry.ts:194:		if (record?.blockedBy?.includes(id))
pi/lib/task-registry.ts:200:	for (const blockerId of record.blockedBy ?? []) {
pi/lib/task-registry.ts:203:		const blocks = new Set(blocker.blocks ?? []);
pi/lib/task-registry.ts:204:		blocks.add(record.id);
pi/lib/task-registry.ts:207:			blocks: [...blocks],
pi/lib/task-registry.ts:216:	const blockedBy = normalizeIdList(input.blockedBy);
pi/lib/task-registry.ts:232:		blockedBy,
pi/lib/task-registry.ts:233:		blocks: normalizeIdList(input.blocks),
pi/lib/task-registry.ts:236:	assertNoCycle(record.id, blockedBy);
pi/lib/task-registry.ts:246:		patch.blockedBy !== undefined
pi/lib/task-registry.ts:247:			? normalizeIdList(patch.blockedBy)
pi/lib/task-registry.ts:248:			: existing.blockedBy;
pi/lib/task-registry.ts:257:		...(patch.blockedBy !== undefined ? { blockedBy: nextBlockedBy } : {}),
pi/lib/task-registry.ts:258:		...(patch.blocks !== undefined
pi/lib/task-registry.ts:259:			? { blocks: normalizeIdList(patch.blocks) }
pi/lib/task-registry.ts:278:			`task ${id} already in state ${target}; use updateTask for in-place changes`,
pi/lib/task-registry.ts:303:	if (target === "blocked")
pi/lib/task-renderer.ts:6:	"blocked",
pi/lib/task-renderer.ts:107:		lines.push(`  blocked: ${truncateTaskText(task.blockReason, 200)}`);
pi/lib/task-renderer.ts:112:	if (task.blockedBy?.length)
pi/lib/task-renderer.ts:113:		lines.push(`  blockedBy: ${task.blockedBy.join(", ")}`);
pi/lib/task-renderer.ts:114:	if (task.blocks?.length) lines.push(`  blocks: ${task.blocks.join(", ")}`);
pi/lib/transcript.ts:282:	// PEM private-key blocks. `[\s\S]` avoids the `s` flag for ES2018 compatibility.
pi/lib/transcript.ts:315: * `api_key=...` assignments, and PEM private key blocks.
pi/lib/transcript.ts:364: * bodies, which are already JSON-shaped. Never throws.
pi/lib/transcript.ts:386: * Returns true if `resolvedPath` (already passed through `fs.realpath`)
pi/lib/transcript.ts:556:			// Already counted in appendLine path; suppress final escape.
pi/lib/transcript.ts:780:			// nothing more to do -- caller already has diagnostics on the writer
pi/extensions/codex-status.ts:5:// - Use Pi/Codex OAuth credentials that already exist on disk instead of adding
pi/extensions/context.ts:208:		bucket("Assistant thinking", thinkingTokens, "reasoning blocks in session history"),
pi/extensions/model-visibility.ts:300:			uiNotify(ctx, "info", `Hidden older/blocked models (${messages.join(", ")})`, {
pi/extensions/operator-status.ts:9: *   - "task" -- shown only when non-terminal tasks exist, e.g. `task 3 (1 blocked)`
pi/extensions/operator-status.ts:366:	blocked: number;
pi/extensions/operator-status.ts:372:	urgent: number; // blocked + failed
pi/extensions/operator-status.ts:379:		blocked: 0,
pi/extensions/operator-status.ts:391:		counts.pending + counts.running + counts.blocked + counts.failed;
pi/extensions/operator-status.ts:392:	counts.urgent = counts.blocked + counts.failed;
pi/extensions/operator-status.ts:404:		if (task.state !== "running" && task.state !== "blocked") return false;
pi/extensions/operator-status.ts:411:	const active = counts.running + counts.blocked;
pi/extensions/operator-status.ts:416:	if (counts.blocked > 0) flags.push(`${counts.blocked} blocked`);
pi/extensions/operator-status.ts:597:		// already non-blocking from the producer side.
pi/extensions/prompt-router.ts:5://   like "classifier output invalid" and "router: ready" without an
pi/extensions/prompt-router.ts:13://   report whose `Prompt Router\n  Enabled: ...` heading already self-
pi/extensions/prompt-router.ts:1281:		ctx.ui.setStatus("router", "router: ready");
pi/extensions/provider.ts:10://   command-handler messaging where the user already knows the context.
pi/extensions/pwsh.ts:55: * show staggered blocks and duplicated spinner frames. Treat CR as "return to the
pi/extensions/pwsh.ts:111:    // Process may have already exited
pi/extensions/quality-gates.ts:14://   the file already uses the shared yaml-helpers loader (Phase 1 helper)
pi/extensions/README.md:161:(see below) -- typically when the message is already inside a structured UI
pi/extensions/refresh-models.ts:12://   already knows the source; a `[refresh-models]` prefix on every progress
pi/extensions/refresh-models.ts:14://   already centralizes the call site.
pi/extensions/skill-loader.ts:16: * Collision handling: if a skill name conflicts with a command already
pi/extensions/skill-loader.ts:89:				// Already-registered or invalid command name; skip silently.
pi/extensions/subagent/index.ts:672:		// Aborts already record cancelled above and set taskFinalized; this
pi/extensions/tasks.ts:343:						`Task ${shortTaskId(target.id)} is already ${target.state}.`,
pi/extensions/test-orchestrator.ts:22:type ClassificationStatus = "pass" | "test_failure" | "infra_failure" | "blocked" | "recovery_run";
pi/extensions/test-orchestrator.ts:692:		const blockedAt = nowIso();
pi/extensions/test-orchestrator.ts:702:				startedAt: blockedAt,
pi/extensions/test-orchestrator.ts:703:				endedAt: blockedAt,
pi/extensions/test-orchestrator.ts:708:				status: "blocked",
pi/extensions/test-orchestrator.ts:1295:				return { content: [{ type: "text", text: "No adapter found." }], details: { status: "blocked" } };
pi/extensions/test-orchestrator.ts:1321:				return { content: [{ type: "text", text: "No adapter found." }], details: { status: "blocked" } };
pi/extensions/test-orchestrator.ts:1351:				return { content: [{ type: "text", text: "No adapter found." }], details: { status: "blocked" } };
pi/extensions/todo.ts:5: *   - Dependencies between tasks (task B blocked by task A)
pi/extensions/todo.ts:6: *   - Status tracking: pending → in_progress → done / blocked
pi/extensions/todo.ts:29:export type TodoStatus = "pending" | "in_progress" | "done" | "blocked";
pi/extensions/todo.ts:53:/** Resolve effective status: "blocked" if any dependency is not done. */
pi/extensions/todo.ts:60:  if (hasUnmetDeps) return "blocked";
pi/extensions/todo.ts:61:  return item.status === "blocked" ? "pending" : item.status;
pi/extensions/todo.ts:64:/** Find tasks ready for parallel execution (pending/in_progress with all deps done). */
pi/extensions/todo.ts:99:  const icon = effective === "done" ? "✓" : effective === "in_progress" ? "▶" : effective === "blocked" ? "⊘" : "○";
pi/extensions/todo.ts:111:  const ready = findReady(items);
pi/extensions/todo.ts:112:  const blocked = items.filter((i) => resolveStatus(i, items) === "blocked");
pi/extensions/todo.ts:116:  if (ready.length > 0) {
pi/extensions/todo.ts:117:    sections.push(`── Ready (${ready.length}) ──`);
pi/extensions/todo.ts:118:    sections.push(...ready.map((i) => formatTodo(i, items)));
pi/extensions/todo.ts:120:  if (blocked.length > 0) {
pi/extensions/todo.ts:121:    sections.push(`\n── Blocked (${blocked.length}) ──`);
pi/extensions/todo.ts:122:    sections.push(...blocked.map((i) => formatTodo(i, items)));
pi/extensions/todo.ts:129:  const summary = `${done.length}/${items.length} done, ${ready.length} ready, ${blocked.length} blocked`;
pi/extensions/todo.ts:165:  Type.Literal("ready"),
pi/extensions/todo.ts:175:      "remove (delete task), list (show all), ready (show parallelizable tasks). " +
pi/extensions/todo.ts:176:      "Statuses: pending, in_progress, done. Tasks with unmet dependencies show as blocked. " +
pi/extensions/todo.ts:178:    promptSnippet: "Manage tasks with dependencies — add, update, remove, list, find ready work",
pi/extensions/todo.ts:182:      "Use 'ready' action to find tasks that can be worked in parallel.",
pi/extensions/todo.ts:325:        case "ready": {
pi/extensions/todo.ts:326:          const ready = findReady(state.items);
pi/extensions/todo.ts:327:          if (ready.length === 0) {
pi/extensions/todo.ts:331:              : "No tasks ready — all remaining tasks are blocked by dependencies.";
pi/extensions/todo.ts:334:              details: { action: "ready", count: 0 },
pi/extensions/todo.ts:337:          const text = `${ready.length} task(s) ready for parallel work:\n\n` +
pi/extensions/todo.ts:338:            ready.map((i) => formatTodo(i, state.items)).join("\n");
pi/extensions/todo.ts:341:            details: { action: "ready", count: ready.length },
pi/extensions/todo.ts:356:        add: "+", update: "~", remove: "×", list: "≡", ready: "▶",
pi/extensions/transcript-provider.ts:57: * Extract visible thinking blocks and tool-call requests from an assistant
pi/extensions/transcript-provider.ts:69:	const blocks = Array.isArray(msg.content) ? msg.content : [];
pi/extensions/transcript-provider.ts:70:	for (const block of blocks) {
pi/extensions/transcript-provider.ts:212:			await emitDebug("transcript_provider_assistant_skipped", { reason: "already-emitted-for-turn" });
pi/extensions/transcript-runtime.ts:211: * not bleed across describe blocks. Also called at session_shutdown so a
pi/extensions/transcript-runtime.ts:251: * Never throws -- writer.write() already swallows errors internally.
pi/extensions/workflow-commands.ts:259:2. Include links/paths to any PRD.md or plan.md files created or materially updated in this session, with state: open, ready for review, ready for plan/implementation, completed, or archived. Before reporting a PRD/plan as active or recommending it as next work, validate whether it still exists at the stated path, whether it has moved under .specs/archive/, and whether its frontmatter/status/checklist marks it completed or archived.
pi/extensions/workflow-commands.ts:1209:			`Unsafe runtime/generated paths are already staged. Unstage them before committing:\n${formatExcludedCommitPaths(stagedSafe.excluded)}`,
pi/tests/commit-guard.test.ts:35:	describe("blocks (forbidden patterns)", () => {
pi/tests/commit-guard.test.ts:36:		it("blocks --no-verify with a non-empty reason", async () => {
pi/tests/commit-guard.test.ts:44:		it("blocks commits missing -m with a non-empty reason", async () => {
pi/tests/commit-guard.test.ts:51:		it("blocks non-conventional commit messages with a non-empty reason", async () => {
pi/tests/commit-planning.test.ts:51:	it("blocks detached HEAD before mutation", () => {
pi/tests/commit-planning.test.ts:62:	it("blocks mergeInProgress", () => {
pi/tests/commit-planning.test.ts:83:	it("blocks rebaseInProgress", () => {
pi/tests/commit-planning.test.ts:110:	it("blocks hasUnmergedPaths", () => {
pi/tests/coverage/extensions/prompt-router.ts.html:524: * there. A follow-up "now make it production-ready" won't drop back to a
pi/tests/coverage/extensions/prompt-router.ts.html:648:    ctx.ui.setStatus("router", "router: ready");
pi/tests/coverage/extensions/pwsh.ts.html:710:    // Process may have already exited
pi/tests/coverage/extensions/todo.ts.html:798: *   - Dependencies between tasks (task B blocked by task A)
pi/tests/coverage/extensions/todo.ts.html:799: *   - Status tracking: pending → in_progress → done / blocked
pi/tests/coverage/extensions/todo.ts.html:812:export type TodoStatus = "pending" | "in_progress" | "done" | "blocked";
pi/tests/coverage/extensions/todo.ts.html:836:/** Resolve effective status: "blocked" if any dependency is not done. */
pi/tests/coverage/extensions/todo.ts.html:843:  if (hasUnmetDeps) return "blocked";
pi/tests/coverage/extensions/todo.ts.html:844:  return item.status === "blocked" ? "pending" : item.status;
pi/tests/coverage/extensions/todo.ts.html:847:/** Find tasks ready for parallel execution (pending/in_progress with all deps done). */
pi/tests/coverage/extensions/todo.ts.html:882:  const icon = effective === "done" ? "✓" : effective === "in_progress" ? "▶" : effective === "blocked" ? "⊘" : "○";
pi/tests/coverage/extensions/todo.ts.html:894:  const ready = findReady(items);
pi/tests/coverage/extensions/todo.ts.html:895:  const blocked = items.filter((i) =&gt; resolveStatus(i, items) === "blocked");
pi/tests/coverage/extensions/todo.ts.html:899:  <span class="missing-if-branch" title="else path not taken" >E</span>if (ready.length &gt; 0) {
pi/tests/coverage/extensions/todo.ts.html:900:    sections.push(`── Ready (${ready.length}) ──`);
pi/tests/coverage/extensions/todo.ts.html:901:    sections.push(...ready.map((i) =&gt; formatTodo(i, items)));
pi/tests/coverage/extensions/todo.ts.html:903:  if (blocked.length &gt; 0) {
pi/tests/coverage/extensions/todo.ts.html:904:    sections.push(`\n── Blocked (${blocked.length}) ──`);
pi/tests/coverage/extensions/todo.ts.html:905:    sections.push(...blocked.map((i) =&gt; formatTodo(i, items)));
pi/tests/coverage/extensions/todo.ts.html:912:  const summary = `${done.length}/${items.length} done, ${ready.length} ready, ${blocked.length} blocked`;
pi/tests/coverage/extensions/todo.ts.html:948:  Type.Literal("ready"),
pi/tests/coverage/extensions/todo.ts.html:958:      "remove (delete task), list (show all), ready (show parallelizable tasks). " +
pi/tests/coverage/extensions/todo.ts.html:959:      "Statuses: pending, in_progress, done. Tasks with unmet dependencies show as blocked. " +
pi/tests/coverage/extensions/todo.ts.html:961:    promptSnippet: "Manage tasks with dependencies — add, update, remove, list, find ready work",
pi/tests/coverage/extensions/todo.ts.html:965:      "Use 'ready' action to find tasks that can be worked in parallel.",
pi/tests/coverage/extensions/todo.ts.html:1108:        case "ready": {
pi/tests/coverage/extensions/todo.ts.html:1109:          const ready = findReady(state.items);
pi/tests/coverage/extensions/todo.ts.html:1110:          if (ready.length === 0) {
pi/tests/coverage/extensions/todo.ts.html:1114:              : <span class="branch-1 cbranch-no" title="branch not covered" >"No tasks ready — all remaining tasks are blocked by dependencies.";</span>
pi/tests/coverage/extensions/todo.ts.html:1117:              details: { action: "ready", count: 0 },
pi/tests/coverage/extensions/todo.ts.html:1120:          const text = `${ready.length} task(s) ready for parallel work:\n\n` +
pi/tests/coverage/extensions/todo.ts.html:1121:            ready.map((i) =&gt; formatTodo(i, state.items)).join("\n");
pi/tests/coverage/extensions/todo.ts.html:1124:            details: { action: "ready", count: ready.length },
pi/tests/coverage/extensions/todo.ts.html:1139:        add: "+", update: "~", remove: "×", list: "≡", ready: "▶",
pi/tests/damage-control.test.ts:18:	it("asks for docker compose down on linux and blocks when not confirmed", async () => {
pi/tests/damage-control.test.ts:370:		it("blocks when target matches a no_delete pattern by basename", async () => {
pi/tests/damage-control.test.ts:401:		it("blocks malformed paths (NUL byte) by surfacing a block decision", async () => {
pi/tests/damage-control.test.ts:457:		it("blocks read on ~/.ssh/id_ed25519", async () => {
pi/tests/damage-control.test.ts:468:		it("blocks write on ./aws-key.pem", async () => {
pi/tests/damage-control.test.ts:478:		it("blocks edit on ./aws-key.pem", async () => {
pi/tests/damage-control.test.ts:506:		it("blocks ls on ~/.ssh when user denies", async () => {
pi/tests/damage-control.test.ts:547:		it("blocks ls on ./aws-key.pem when no UI is available", async () => {
pi/tests/damage-control.test.ts:558:		it("blocks read on .env even with confirm available", async () => {
pi/tests/damage-control.test.ts:571:		it("blocks ls on .env (metadata tool but non-ssh pattern still blocks)", async () => {
pi/tests/expertise-layering.test.ts:423:// When sensitive_repo is flagged, project-local writes are blocked entirely.
pi/tests/expertise-layering.test.ts:486:    // Project-local write must be blocked
pi/tests/expertise-layering.test.ts:499:  it("sensitive_repo: no redaction-free path -- blocked entry does not appear in project-local dir at all", async () => {
pi/tests/helpers/transcript-fixtures.ts:9: *   - Assistant message with visible thinking blocks + tool-call requests
pi/tests/memory-promote-scan.privacy.test.ts:77:    // test for formatCandidates([], ...) already covers the empty path;
pi/tests/memory-snapshot-archive.test.ts:144:  it("returns collision=true if archiveDir already exists", () => {
pi/tests/memory-snapshot-archive.test.ts:234:  it("refuses (throws) when archiveDir already exists", () => {
pi/tests/memory-snapshot-archive.test.ts:243:      expect(() => writeArchive(plan, root, [])).toThrow(/already exists/);
pi/tests/model-visibility.test.ts:27:	it("keeps non-blocked modern models", () => {
pi/tests/operator-state.test.ts:81:				"blocked",
pi/tests/operator-state.test.ts:105:		["pending", "blocked", false],
pi/tests/operator-state.test.ts:106:		["running", "blocked", true],
pi/tests/operator-state.test.ts:111:		["blocked", "running", true],
pi/tests/operator-state.test.ts:112:		["blocked", "failed", true],
pi/tests/operator-state.test.ts:113:		["blocked", "cancelled", true],
pi/tests/operator-state.test.ts:114:		["blocked", "completed", false],
pi/tests/operator-status.test.ts:30:	it("filters status bar tasks to running/blocked tasks from current session", async () => {
pi/tests/operator-status.test.ts:38:			{ state: "blocked", createdAt: "2026-01-01T00:02:00.000Z" },
pi/tests/operator-status.test.ts:45:		expect(filtered.map((t) => t.state)).toEqual(["running", "blocked"]);
pi/tests/operator-status.test.ts:70:		transitionTask(b.id, "blocked", { blockReason: "needs creds" });
pi/tests/operator-status.test.ts:82:		expect(counts.blocked).toBe(1);
pi/tests/operator-status.test.ts:90:		expect(label).toContain("1 blocked");
pi/tests/persistent-defaults.test.ts:50:	it("does not rewrite when defaults are already pinned", () => {
pi/tests/prompt-router.test.ts:770:  it("registers a session_start hook that sets ready status", async () => {
pi/tests/prompt-router.test.ts:782:    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "router: ready");
pi/tests/prompt-router.test.ts:799:    expect((ctx.ui as any).setStatus).toHaveBeenCalledWith("router", "router: ready");
pi/tests/prompt-router.test.ts:866:    const state = makeRouterState("mid", policy.N_HOLD); // already past hold window
pi/tests/prompt-router.test.ts:1272:    // (d) confidence already asserted above
pi/tests/snapshot-restore-smoke.test.ts:66:    rebuild_status: "ready",
pi/tests/task-dependencies.test.ts:34:			blockedBy: [blocker.id],
pi/tests/task-dependencies.test.ts:36:		expect(getTask(dependent.id)?.blockedBy).toEqual([blocker.id]);
pi/tests/task-dependencies.test.ts:37:		expect(getTask(blocker.id)?.blocks).toContain(dependent.id);
pi/tests/task-dependencies.test.ts:45:			blockedBy: [first.id],
pi/tests/task-dependencies.test.ts:47:		expect(() => updateTask(first.id, { blockedBy: [second.id] })).toThrow(
pi/tests/task-registry.test.ts:83:		expect(() => transitionTask(task.id, "pending")).toThrow(/already in state/);
pi/tests/task-registry.test.ts:98:	it("captures blockReason when transitioning to blocked", () => {
pi/tests/task-registry.test.ts:100:		const blocked = transitionTask(task.id, "blocked", { blockReason: "needs creds" });
pi/tests/task-registry.test.ts:101:		expect(blocked.state).toBe("blocked");
pi/tests/task-registry.test.ts:102:		expect(blocked.blockReason).toBe("needs creds");
pi/tests/tasks.test.ts:50:	it("orders blocked > failed > running > pending > completed > cancelled", async () => {
pi/tests/tasks.test.ts:64:			fake("blocked", "b1"),
pi/tests/tasks.test.ts:72:			"blocked",
pi/tests/tasks.test.ts:94:		const blocked = createTask({ origin: "subagent", summary: "needs creds", state: "running" });
pi/tests/tasks.test.ts:95:		transitionTask(blocked.id, "blocked", { blockReason: "no creds" });
pi/tests/tasks.test.ts:102:		// blocked must come before running in the output
pi/tests/tasks.test.ts:103:		expect(text.indexOf("blocked")).toBeLessThan(text.indexOf("running"));
pi/tests/tasks.test.ts:160:	it("rejects cancel on already-terminal task", async () => {
pi/tests/tasks.test.ts:171:		expect(notify.mock.calls[0][0]).toContain("already completed");
pi/tests/todo-pure.test.ts:35:  it("returns blocked when dependency is not done", () => {
pi/tests/todo-pure.test.ts:38:    expect(resolveStatus(item, [dep, item])).toBe("blocked");
pi/tests/todo-pure.test.ts:47:  it("returns pending for a blocked item whose deps are now done", () => {
pi/tests/todo-pure.test.ts:49:    const item = makeTodo({ id: "b", title: "B", status: "blocked", depends_on: ["a"] });
pi/tests/todo-pure.test.ts:58:  it("blocks if any single dependency is unmet", () => {
pi/tests/todo-pure.test.ts:62:    expect(resolveStatus(item, [done, notDone, item])).toBe("blocked");
pi/tests/todo-pure.test.ts:83:  it("excludes blocked items", () => {
pi/tests/todo-pure.test.ts:85:    const blocked = makeTodo({ id: "b", title: "B", depends_on: ["a"] });
pi/tests/todo-pure.test.ts:86:    expect(findReady([dep, blocked]).map((i) => i.id)).toEqual(["a"]);
pi/tests/todo-pure.test.ts:94:  it("unblocks when dependencies complete", () => {
pi/tests/todo-pure.test.ts:113:  it("detects cycle when target already depends on source", () => {
pi/tests/todo-pure.test.ts:154:  it("shows ⊘ for blocked items", () => {
pi/tests/todo-pure.test.ts:201:    expect(text).toContain("1 ready");
pi/tests/todo-pure.test.ts:202:    expect(text).toContain("0 blocked");
pi/tests/todo.test.ts:174:  describe("ready", () => {
pi/tests/todo.test.ts:179:      const result = await tool.execute("id", { action: "ready" }, undefined, undefined, ctx);
pi/tests/todo.test.ts:180:      expect(result.content[0].text).toContain("2 task(s) ready");
pi/tests/todo.test.ts:189:      const result = await tool.execute("id", { action: "ready" }, undefined, undefined, ctx);
pi/tests/workflow-commands-pure.test.ts:183:	it("returns all changed files even when some files are already staged", async () => {
pi/tests/workflow-commands.test.ts:351:	it("blocks commit when secret reviewer classifies a finding as likely_secret", async () => {
