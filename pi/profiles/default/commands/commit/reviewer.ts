import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent, Usage } from "@earendil-works/pi-ai";
import { createBashTool, createReadTool, type ExtensionAPI, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createProfileModelRuntime } from "../../lib/model-runtime.ts";
import { Container, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { formatStatus, gitReviewTool, page } from "./tools.ts";

const PROVIDER = "openai-codex";
const MODEL = "gpt-5.6-luna";
const WORKFLOW_TIMEOUT_MS = 180_000;

export function isBroadDiscoveryCommand(command: string): boolean {
	return /(^|(?:&&|\|\||[;|])\s*)(?:command\s+)?find(?:\.exe)?\s/i.test(command)
		|| /(^|(?:&&|\|\||[;|])\s*)rg\s+--files\b/i.test(command)
		|| /(^|(?:&&|\|\||[;|])\s*)ls\s+[^;&|]*-[^;&|]*R/i.test(command);
}

export function describeCommitTool(name: string, args: unknown): string {
	const input = args && typeof args === "object" ? args as Record<string, unknown> : {};
	if (name === "bash") {
		const command = String(input.command ?? "").replace(/\s+/g, " ").trim();
		return `shell command${command ? `: ${command.slice(0, 300)}${command.length > 300 ? "…" : ""}` : ""}`;
	}
	if (name === "commit_git_review") return `Git review action=${String(input.action ?? "unknown")} repo=${String(input.repo ?? ".")}`;
	if (name === "read") return `file read: ${String(input.path ?? "unknown")}`;
	if (name === "ask_ignore") return `ignore decision: ${String(input.path ?? "unknown")}`;
	return `tool ${name}`;
}

export function commitReviewerTool(pi: ExtensionAPI, pushRequested: () => boolean): ToolDefinition {
	return {
		name: "commit_run",
		label: "Commit",
		description: "Let Luna quietly review, stage, and commit using ordinary Git. Handles ignore-file questions directly. Returns actual commit hashes/messages and status. Call once for /commit; do not perform Git work again afterward. Push permission comes from the slash invocation.",
		parameters: Type.Object({}),
		async execute(_id, _params, signal, onUpdate, ctx) {
			const push = pushRequested();
			const deadline = new AbortController();
			const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
			let remaining = WORKFLOW_TIMEOUT_MS;
			let activeSince = Date.now();
			let timer: ReturnType<typeof setTimeout>;
			const resumeTimer = () => { activeSince = Date.now(); timer = setTimeout(() => deadline.abort(), Math.max(0, remaining)); };
			const pauseTimer = () => { clearTimeout(timer); remaining -= Date.now() - activeSince; };
			resumeTimer();
			let agent: Agent | undefined;
			let unsubscribe: (() => void) | undefined;
			const abort = () => agent?.abort();
			combined.addEventListener("abort", abort, { once: true });
			const progress = (text: string) => onUpdate?.({ content: [{ type: "text", text }], details: {} });
			let root: string | undefined;
			const baselines = new Map<string, string>();
			let failure: string | undefined;
			let outcome = "";
			const activeTools = new Map<string, { description: string; startedAt: number }>();
			const leftOut: string[] = [];
			const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
			const git = async (args: string[], requestSignal?: AbortSignal, cwd?: string) => {
				const result = await pi.exec("git", ["-C", cwd ?? root ?? ctx.cwd, ...args], { signal: requestSignal, timeout: 15000 });
				if (result.killed || result.code !== 0) throw new Error(`Git ${args[0]} failed: ${result.killed ? "cancelled or timed out" : result.stderr.trim()}`);
				return result.stdout.trimEnd();
			};
			// A repository with no commits legitimately has no HEAD yet.
			const head = async (requestSignal?: AbortSignal, cwd?: string) => {
				const result = await pi.exec("git", ["-C", cwd ?? root ?? ctx.cwd, "rev-parse", "--verify", "--quiet", "HEAD"], { signal: requestSignal, timeout: 15000 });
				if (!result.killed && result.code === 1) return "";
				if (result.killed || result.code !== 0) throw new Error(`Git HEAD lookup failed: ${result.stderr.trim()}`);
				return result.stdout.trim();
			};
			progress("Committing…");
			try {
				combined.throwIfAborted();
				root = realpathSync(await git(["rev-parse", "--show-toplevel"], combined));
				const discovered = await git(["submodule", "foreach", "--recursive", "--quiet", "printf '%s\\0' \"$toplevel/$sm_path\""], combined);
				const repositories = [root, ...discovered.split("\0").filter(Boolean).map((path) => realpathSync(path))]
					.filter((path, index, all) => all.indexOf(path) === index);
				const inventory: string[] = [];
				for (const repository of repositories) {
					baselines.set(repository, await head(combined, repository));
					const status = formatStatus(await git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], combined, repository));
					const instructions = (await git(["ls-files", "--", "AGENTS.md", ":(glob)**/AGENTS.md"], combined, repository)).split("\n").filter(Boolean);
					inventory.push(`Repository: ${relative(root, repository) || "."}\nInstruction files: ${instructions.length ? instructions.join(", ") : "none"}\n${status}`);
				}
				const runtime = await createProfileModelRuntime(combined);
				const model = runtime.getModel(PROVIDER, MODEL);
				if (!model) throw new Error(`${PROVIDER}/${MODEL} is unavailable. No fallback model was used.`);
				const review = gitReviewTool(pi, repositories);
				const read = createReadTool(root);
				const shell = createBashTool(root);
				agent = new Agent({
					initialState: {
						model, thinkingLevel: "low",
						systemPrompt: readFileSync(join(dirname(fileURLToPath(import.meta.url)), "reviewer.md"), "utf8"),
						tools: [
							{ ...review, execute: (id, args, toolSignal, update) => review.execute(id, args as Parameters<typeof review.execute>[1], toolSignal, update, { cwd: root! }) },
							{ ...shell, execute: (id, args, toolSignal, update) => shell.execute(id, { ...(args as Parameters<typeof shell.execute>[1]), timeout: 15 }, toolSignal, update) },
							{ ...read, execute: async (id, input, toolSignal, update) => {
								const args = input as Parameters<typeof read.execute>[1];
								try { return await read.execute(id, args, toolSignal, update); }
								catch (error) {
									if ((error as NodeJS.ErrnoException).code === "ENOENT" && /^(AGENTS(?:\.override)?\.md|CLAUDE\.md)$/i.test(basename(args.path))) {
										return { content: [{ type: "text" as const, text: "No optional instructions file here; continue." }], details: {} };
									}
									throw error;
								}
							} },
							{
								name: "ask_ignore", label: "Ignore decision",
								description: "Ask whether a new file likely to belong in .gitignore should be included or left out. Only use for those files, before staging them.",
								parameters: Type.Object({ path: Type.String(), reason: Type.String() }),
								execute: async (_id, input) => {
									const { path, reason } = input as { path: string; reason: string };
									if (!ctx.hasUI) throw new Error(`User input required for ${path}: ${reason}. Run /commit interactively.`);
									pauseTimer();
									progress("Waiting for ignore-file decision…");
									try {
										const answer = await ctx.ui.select(`${path}\n${reason}`, ["Include", "Leave out"], { signal: combined });
										if (!answer) throw new Error("Ignore-file decision cancelled.");
										if (answer === "Leave out") leftOut.push(path);
										return { content: [{ type: "text" as const, text: `${answer}: ${path}` }], details: {} };
									} finally { resumeTimer(); progress("Committing…"); }
								},
							},
						],
					},
					streamFn: runtime.streamSimple.bind(runtime),
					toolExecution: "sequential",
					beforeToolCall: async ({ toolCall, args }) => {
						if (failure) return { block: true, reason: failure, terminate: true };
						if (toolCall.name === "bash" && isBroadDiscoveryCommand(String((args as { command?: unknown }).command ?? "")))
							return { block: true, reason: "Broad recursive discovery is disabled. Use the supplied repository and instruction inventory.", terminate: true };
						return undefined;
					},
					shouldStopAfterTurn: () => !!failure,
				});
				unsubscribe = agent.subscribe((event) => {
					if (event.type === "tool_execution_start") {
						activeTools.set(event.toolCallId, { description: describeCommitTool(event.toolName, event.args), startedAt: Date.now() });
					}
					if (event.type === "tool_execution_end") {
						const active = activeTools.get(event.toolCallId);
						activeTools.delete(event.toolCallId);
						if (event.isError && !failure) {
							const text = (event.result.content as (TextContent | ImageContent)[]).filter((part) => part.type === "text").map((part) => part.text).join("\n");
							failure = `${active?.description ?? `tool ${event.toolName}`} failed after ${active ? Date.now() - active.startedAt : "unknown"}ms\n${text}`;
						}
					}
					if (event.type === "message_end" && event.message.role === "assistant") {
						const item = event.message.usage;
						for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) usage[key] += item[key];
						for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) usage.cost[key] += item.cost[key];
					}
				});
				combined.throwIfAborted();
				await agent.prompt(`Execute the commit workflow now. ${push ? "Push the current branch to origin afterward using an explicit HEAD:refs/heads/<current-branch> refspec, including existing outgoing commits. No force-push, tags, other branches, recursive submodule pushes, or automatic merge/rebase." : "Push was NOT requested. Do not push."}\n\nRepository inventory (already collected; commit dirty initialized submodules deepest-first, then commit parent gitlinks; continue pagination if needed):\n${inventory.join("\n\n")}`);
				combined.throwIfAborted();
				if (failure) throw new Error(failure);
				const last = [...agent.state.messages].reverse().find((message) => message.role === "assistant");
				if (!last || last.stopReason === "error" || last.stopReason === "aborted") throw new Error(last?.errorMessage || "Luna returned no response.");
				outcome = last.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
			} catch (error) {
				failure = signal?.aborted ? "Cancelled" : deadline.signal.aborted ? "Timed out" : error instanceof Error ? error.message : String(error);
			} finally {
				pauseTimer();
				combined.removeEventListener("abort", abort);
				agent?.abort();
				if (agent) await agent.waitForIdle();
				unsubscribe?.();
			}
			// Report Git's actual state even after cancellation/failure: a commit may already
			// have completed. These read-only queries do not reuse the cancelled signal.
			let summary = "";
			if (root && baselines.size) {
				try {
					const commits: string[] = [];
					const remaining: string[] = [];
					for (const [repository, base] of [...baselines].sort(([a], [b]) => b.length - a.length)) {
						const label = relative(root, repository) || ".";
						const current = await head(undefined, repository);
						if (current && current !== base) {
							const log = await git(["log", "--reverse", "--format=%h %s", ...(base ? [`${base}..${current}`] : [current])], undefined, repository);
							commits.push(...log.split("\n").filter(Boolean).map((line) => label === "." ? line : `${line} (${label})`));
						}
						const status = await git(["status", "-s", "--untracked-files=all"], undefined, repository);
						if (status) remaining.push(`${label}:\n${status}`);
					}
					summary = [commits.join("\n") || "No commits created.", remaining.length ? `Remaining changes:\n${remaining.join("\n")}` : ""].filter(Boolean).join("\n");
				} catch (error) { failure = [failure, `Status reporting failed: ${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join("\n"); }
			}
			const publication = push ? (/^Pushed\.?$/i.test(outcome) ? "Pushed." : "Push completion not confirmed.") : "";
			const report = [summary, leftOut.length ? `Left out: ${leftOut.join(", ")}` : "", publication].filter(Boolean).join("\n");
			if (failure) throw new Error(`${failure}\n${report}\nStopped; existing commits and changes were not undone.`);
			return { content: [{ type: "text", text: report }], details: { elapsedMs: WORKFLOW_TIMEOUT_MS - remaining, model: `${PROVIDER}/${MODEL}:low` }, usage };
		},
		renderCall: () => new Container(),
		renderResult(result, { isPartial }, theme, context) {
			const text = result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
			if (context.isError) return new Text(theme.fg("error", text), 0, 0);
			// The final reply owns successful completion output, even with tools expanded.
			return isPartial ? new Text(text, 0, 0) : new Container();
		},
	};
}
