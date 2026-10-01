// Actual installed Pi native tool-search and codemode, including the QuickJS worker. No model or
// external service is used; only nested application tools are offline fixtures.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createJiti } from "jiti";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageRoot = path.join(root, "node_modules/@earendil-works/pi-coding-agent");
const piVersion = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")).version;
const { createToolSearchExtension } = await import(pathToFileURL(path.join(packageRoot, "dist/extensions/tool-search/index.js")));
const { createCodemodeExtension } = await import(pathToFileURL(path.join(packageRoot, "dist/extensions/codemode/index.js")));
const { readCodemodeStore } = await import(pathToFileURL(path.join(packageRoot, "dist/extensions/codemode/execute.js")));
const { SessionManager } = await import(pathToFileURL(path.join(packageRoot, "dist/core/session-manager.js")));
const { ExtensionRunner } = await import(pathToFileURL(path.join(packageRoot, "dist/bundle/index.js")));
const { AgentSession } = await import(pathToFileURL(path.join(packageRoot, "dist/core/agent-session.js")));
const jiti = createJiti(import.meta.url);
const { default: scopedInstructions } = await jiti.import(path.join(root, "extensions/scoped-instructions.ts"));
const { default: schedulerExtension } = await jiti.import(path.join(root, "extensions/scheduler.ts"));

const project = mkdtempSync(path.join(tmpdir(), "pi-native-composition-"));
mkdirSync(path.join(project, ".pi/instructions"), { recursive: true });
writeFileSync(path.join(project, ".pi/instructions", "fixture.md"), "Guidance from the native scoped-instructions extension.");
const manager = SessionManager.inMemory(project);
const hookRunner = new ExtensionRunner([], {}, project, manager, {});
const extensionHooks = new Map([["tool_call", [event => event.toolName === "blocked_fixture" ? { block: true, reason: "blocked by permission hook" } : undefined]]]);
hookRunner.setUIContext({ notify() {} }, "json");
const rootEntry = manager.appendMessage({ role: "user", content: "session root", timestamp: Date.now() });
const active = ["codemode", "tool_search", "direct_fixture"];
const toolSpecs = [];
const nestedCalls = [];
const executedCalls = [];
const outputs = [];
let activeController;
const extensionHandlers = new Map();
const extensionApi = {
  on(event, handler) { extensionHandlers.set(event, [...(extensionHandlers.get(event) ?? []), handler]); },
  registerTool(spec) { toolSpecs.push(spec); },
  sendUserMessage() {},
};
scopedInstructions(extensionApi);
schedulerExtension(extensionApi);
for (const [event, handlers] of extensionHandlers) extensionHooks.set(event, [...(extensionHooks.get(event) ?? []), ...handlers]);
Object.assign(hookRunner, { extensions: [{ path: "native-composition-smoke", handlers: extensionHooks }] });
const parameters = { type: "object", properties: {}, additionalProperties: false };
const schema = { type: "object", properties: { rows: { type: "array", items: { type: "object" } }, screened: { type: "boolean" } }, required: ["rows", "screened"], additionalProperties: false };
const projected = { rows: [{ title: "approved", excerpt: "screened bounded text" }], screened: true };
const toolApi = {
  registerTool(spec) { toolSpecs.push(spec); },
  getSettings() { return { codemode: { mode: "on" } }; },
  getAllTools() { return toolSpecs; },
  getActiveTools() { return [...active]; },
  setActiveTools(names) { active.splice(0, active.length, ...names); },
  appendEntry(type, data) { manager.appendCustomEntry(type, data); },
};
createToolSearchExtension()(toolApi);
createCodemodeExtension({ models: false })(toolApi);

const fixture = {
  name: "projected_fixture", description: "Return screened, projected structured search rows",
  parameters, outputSchema: schema, exposure: "deferred",
};
const direct = { name: "direct_fixture", description: "Direct fixture", parameters, outputSchema: schema, exposure: "direct" };
const inactiveDirect = { name: "inactive_direct_fixture", description: "Not found by native deferred search", parameters, outputSchema: schema, exposure: "direct" };
const lifecycle = { name: "subagent", description: "Delegate lifecycle", parameters, outputSchema: schema, exposure: "model-only" };
const readFixture = { name: "read_fixture", description: "Read a scoped-instruction fixture", parameters, outputSchema: schema, exposure: "deferred" };
active.push("schedule");
const hostSession = {
  getActiveToolNames: () => active,
  _getToolExposure: name => toolSpecs.find(tool => tool.name === name)?.exposure ?? "direct",
  _toolRegistry: new Map(),
};
toolSpecs.push(fixture, direct, inactiveDirect, lifecycle, readFixture);
for (const tool of toolSpecs) hostSession._toolRegistry.set(tool.name, tool);
const hostCallable = AgentSession.prototype._getCallableTools.call(hostSession);
assert(hostCallable.some(tool => tool.name === "read_fixture"));
assert(!hostCallable.some(tool => tool.name === "subagent"));
assert(!hostCallable.some(tool => tool.name === "codemode"));
const search = toolSpecs.find(tool => tool.name === "tool_search");
const codemode = toolSpecs.find(tool => tool.name === "codemode");
assert.equal(codemode.exposure, "model-only");
assert.equal(search.exposure, "model-only");

const loaded = await search.execute("search", { query: "screened projected search rows" });
assert.deepEqual(loaded.details.loaded, ["projected_fixture"]);
assert(active.includes("projected_fixture"));
assert(!active.includes("subagent"));
assert(!active.includes("inactive_direct_fixture"));

const blockedFixture = { name: "blocked_fixture", description: "Blocked fixture", parameters, outputSchema: schema, exposure: "direct" };
const slowFixture = { name: "slow_fixture", description: "Cancellable fixture", parameters, outputSchema: schema, exposure: "direct" };
const callable = [...hostCallable, blockedFixture, slowFixture];
const schedulerTool = toolSpecs.find(tool => tool.name === "schedule");
assert(schedulerTool, "real schedule extension tool registered");
const ctx = {
  tools: callable,
  cwd: project,
  sessionManager: manager,
  executeTool: async (name, args, { signal } = {}) => {
    signal?.throwIfAborted();
    nestedCalls.push(name);
    const toolCallId = `smoke/${nestedCalls.length}`;
    // Exercise Pi's real extension runner and its tool_call/tool_result contracts.
    const hookResult = await hookRunner.emitToolCall({ type: "tool_call", toolCallId, ...(outerCallId ? { parentToolCallId: outerCallId } : {}), toolName: name, input: args });
    if (hookResult?.block) throw new Error(hookResult.reason);
    executedCalls.push(name);
    if (name === "slow_fixture") return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ toolCall: { id: "slow" }, isError: false, result: { content: [{ type: "text", text: "late" }] } }), 1000);
      setTimeout(() => activeController?.abort(new Error("smoke cancellation")), 50);
      signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
    const result = name === "schedule"
      ? await schedulerTool.execute(`${name}/call`, args, signal)
      : name === "read_fixture"
        ? { structuredContent: { rows: [{ title: "fixture-read" }], screened: true }, content: [{ type: "text", text: "fixture content" }] }
        : { structuredContent: projected, content: [{ type: "text", text: "display only" }] };
    const afterHook = await hookRunner.emitToolResult({ type: "tool_result", toolCallId, ...(outerCallId ? { parentToolCallId: outerCallId } : {}), toolName: name, input: args, content: result.content, ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}) });
    return { toolCall: { id: `${name}/call` }, isError: false, result: afterHook ? { ...result, ...afterHook } : result };
  },
};
let outerCallId;
async function run(code, signal) {
  outerCallId = `outer/${outputs.length + 1}`;
  await hookRunner.emitToolCall({ type: "tool_call", toolCallId: outerCallId, toolName: "codemode", input: { code } });
  const result = await codemode.execute("native-smoke", { code }, signal, undefined, ctx);
  const outerEvent = { type: "tool_result", toolCallId: outerCallId, toolName: "codemode", input: { code }, content: result.content, ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}), isError: result.isError };
  const resultHook = await hookRunner.emitToolResult(outerEvent);
  const persisted = resultHook ?? outerEvent;
  manager.appendMessage({ role: "toolResult", toolCallId: outerCallId, toolName: "codemode", content: persisted.content, isError: persisted.isError ?? false });
  outputs.push(persisted);
  return persisted;
}

// Native QuickJS composes real structured nested results and batches calls in parallel.
const composed = await run('const found = await searchTools("screened projected search rows"); const [a,b] = await Promise.all([tools.projected_fixture({}), tools.direct_fixture({})]); return { names: found.map(x => x.name), rows: a.rows, parallel: b.screened };');
assert.equal(composed.isError, undefined);
assert.match(composed.content.map(part => part.text ?? "").join("\n"), /screened bounded text/);
assert.deepEqual(nestedCalls.slice(-2), ["projected_fixture", "direct_fixture"]);
assert(!ctx.tools.some(tool => tool.name === "subagent"));

// Actual tool-call path rejects permission-blocked nested execution; catching it keeps the script successful.
const blocked = await run('try { await tools.blocked_fixture({}); } catch (error) { return String(error); }');
assert.equal(blocked.isError, undefined);
assert.match(blocked.content.map(part => part.text ?? "").join("\n"), /blocked by permission hook/);
assert(!executedCalls.includes("blocked_fixture"));

// A real custom schedule executor runs through QuickJS, and scoped instructions from its nested
// path-bearing read are appended to the outer persisted result without losing structured data.
const scoped = await run('const guidance = await tools.read_fixture({ path: "target.md" }); store("scoped-data", guidance); const listed = await tools.schedule({ action: "list" }); return { rows: guidance.rows, jobs: listed.jobs.length };');
assert.match(scoped.content.map(part => part.text ?? "").join("\n"), /Guidance from the native scoped-instructions extension/);
assert.equal(scoped.isError, undefined);
assert.deepEqual(readCodemodeStore(manager.getBranch())["scoped-data"], { rows: [{ title: "fixture-read" }], screened: true });
const persistedScoped = manager.getBranch().find(entry => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolCallId === "outer/3");
assert(persistedScoped);
assert(persistedScoped.message.content.some(block => block.type === "text" && block.text.includes("Guidance from the native scoped-instructions extension")));

// Successful store writes are persisted and restored from the active native session branch.
await run('store("branch-value", { count: 3 }); return "stored";');
assert.deepEqual(readCodemodeStore(manager.getBranch()), { "scoped-data": { rows: [{ title: "fixture-read" }], screened: true }, "branch-value": { count: 3 } });
const originLeaf = manager.getLeafId();
manager.branch(rootEntry);
assert.deepEqual(readCodemodeStore(manager.getBranch()), {});
await run('store("branch-value", { count: 7 }); return load("branch-value");');
assert.deepEqual(readCodemodeStore(manager.getBranch()), { "branch-value": { count: 7 } });
manager.branch(originLeaf);
assert.deepEqual(readCodemodeStore(manager.getBranch()), { "scoped-data": { rows: [{ title: "fixture-read" }], screened: true }, "branch-value": { count: 3 } });

// AbortSignal reaches nested work. Failed scripts discard their pending store writes.
const controller = new AbortController();
activeController = controller;
const pending = run('text("before cancellation"); store("discard", true); await tools.slow_fixture({}); return "unexpected";', controller.signal);
const cancelled = await pending;
assert.equal(cancelled.isError, true);
assert.match(cancelled.content.map(part => part.text ?? "").join("\n"), /before cancellation/);
assert(nestedCalls.includes("slow_fixture"));
assert.deepEqual(readCodemodeStore(manager.getBranch()), { "scoped-data": { rows: [{ title: "fixture-read" }], screened: true }, "branch-value": { count: 3 } });
assert.equal(outputs.length, 6);
rmSync(project, { recursive: true, force: true });
console.log(`Pi ${piVersion}: native tool_search and QuickJS codemode passed host callable projection, search, structured composition, real schedule execution, scoped-instruction persistence, permission blocking, cancellation, and branch-local store restoration.`);
