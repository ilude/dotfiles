# Runtime boundary evidence
Command: grep/read upstream Pi source for beforeToolCall, runner emission, block-to-nonexecution, sentinel test
Cwd: /c/Users/mglenn/.dotfiles
PI_MONO_DIR: C:/Projects/Personal/pi-mono

## Grep summary
C:/Projects/Personal/pi-mono/packages/agent/src/agent-loop.ts:571:		if (config.beforeToolCall) {
C:/Projects/Personal/pi-mono/packages/agent/src/agent-loop.ts:572:			const beforeResult = await config.beforeToolCall(
C:/Projects/Personal/pi-mono/packages/agent/src/agent.ts:104:	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
C:/Projects/Personal/pi-mono/packages/agent/src/agent.ts:175:	public beforeToolCall?: (
C:/Projects/Personal/pi-mono/packages/agent/src/agent.ts:206:		this.beforeToolCall = options.beforeToolCall;
C:/Projects/Personal/pi-mono/packages/agent/src/agent.ts:431:			beforeToolCall: this.beforeToolCall,
C:/Projects/Personal/pi-mono/packages/agent/src/harness/agent-harness.ts:376:			beforeToolCall: async ({ toolCall, args }) => {
C:/Projects/Personal/pi-mono/packages/agent/src/types.ts:50: * Result returned from `beforeToolCall`.
C:/Projects/Personal/pi-mono/packages/agent/src/types.ts:83:/** Context passed to `beforeToolCall`. */
C:/Projects/Personal/pi-mono/packages/agent/src/types.ts:262:	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
C:/Projects/Personal/pi-mono/packages/coding-agent/src/core/agent-session.ts:379:		this.agent.beforeToolCall = async ({ toolCall, args }) => {
C:/Projects/Personal/pi-mono/packages/coding-agent/src/core/agent-session.ts:388:				return await runner.emitToolCall({
C:/Projects/Personal/pi-mono/packages/coding-agent/src/core/extensions/runner.ts:806:	async emitToolCall(event: ToolCallEvent): Promise<ToolCallEventResult | undefined> {
C:/Projects/Personal/pi-mono/packages/coding-agent/test/agent-session-concurrent.test.ts:442:				emitToolCall: (event: { type: string; toolCallId: string }) => Promise<undefined>;
C:/Projects/Personal/pi-mono/packages/coding-agent/test/agent-session-concurrent.test.ts:461:			emitToolCall: async () => {
C:/Projects/Personal/pi-mono/packages/coding-agent/test/suite/agent-session-model-extension.test.ts:96:	it("allows extension tool_call handlers to block tool execution", async () => {

## Source findings
- hook registration line evidence: packages/coding-agent/src/core/agent-session.ts registers agent.beforeToolCall to call extensionRunner.emitToolCall before normal tool execution.
379:		this.agent.beforeToolCall = async ({ toolCall, args }) => {
388:				return await runner.emitToolCall({
- runner emission line evidence: packages/coding-agent/src/core/extensions/runner.ts emits tool_call handlers and returns the first { block: true } decision.
93:			// remain blocked by reserved shortcuts regardless of iteration order.
806:	async emitToolCall(event: ToolCallEvent): Promise<ToolCallEventResult | undefined> {
811:			const handlers = ext.handlers.get("tool_call");
819:					if (result.block) {
- nonexecution line evidence: packages/agent/src/agent-loop.ts awaits beforeToolCall and converts a block into an error result before invoking executeTool.
208:				const executedToolBatch = await executeToolCalls(currentContext, message, config, signal, emit);
373:async function executeToolCalls(
385:		return executeToolCallsSequential(currentContext, assistantMessage, toolCalls, config, signal, emit);
387:	return executeToolCallsParallel(currentContext, assistantMessage, toolCalls, config, signal, emit);
395:async function executeToolCallsSequential(
447:async function executeToolCallsParallel(
571:		if (config.beforeToolCall) {
572:			const beforeResult = await config.beforeToolCall(
581:			if (beforeResult?.block) {
584:					result: createErrorToolResult(beforeResult.reason || "Tool execution was blocked"),
- sentinel line evidence: packages/coding-agent/test/suite/agent-session-model-extension.test.ts has a sentinelTool test where blocked tool_call does not execute the tool body.
96:	it("allows extension tool_call handlers to block tool execution", async () => {
110:					pi.on("tool_call", async () => ({ block: true, reason: "Blocked by test" }));

Exit code: 0
Conclusion: normal Pi agent execution has a pre-execution tool_call boundary: AgentSession hook registration -> extension runner emission -> agent loop block result before executeTool. The upstream sentinel test verifies blocked tool_call prevents tool body execution.
