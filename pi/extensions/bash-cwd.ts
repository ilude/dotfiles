import {
	type AgentToolResult,
	type BashToolDetails,
	createBashToolDefinition,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import path from "node:path";
import { formatToolTiming, formatTranscriptTiming } from "../lib/tool-timing.js";

type BashParams = {
	command: string;
	cwd?: string;
	timeout?: number;
};

type ToolTheme = {
	bold(text: string): string;
	fg(role: string, text: string): string;
};

function bashToolFor(cwd: string) {
	return createBashToolDefinition(cwd);
}

function effectiveCwd(args: { cwd?: string }, sessionCwd: string): string {
	return path.resolve(sessionCwd, args.cwd || sessionCwd);
}

function formatBashCall(
	args: { command?: string; cwd?: string; timeout?: number },
	cwd: string,
	startedAt: number | undefined,
	theme: ToolTheme,
): string {
	const command = args.command || theme.fg("toolOutput", "...");
	const timing = formatToolTiming(startedAt, args.timeout);
	const metadata = [
		`cwd: ${cwd}`,
		timing ?? (args.timeout ? `timeout ${args.timeout}s` : undefined),
	].filter(Boolean);
	return (
		theme.fg("toolTitle", theme.bold(`$ ${command}`)) +
		theme.fg("muted", ` (${metadata.join(", ")})`)
	);
}

export default function (pi: ExtensionAPI) {
	const initialCwd = process.cwd();
	const initialTool = bashToolFor(initialCwd);
	const toolsByCwd = new Map<string, ReturnType<typeof bashToolFor>>([
		[initialCwd, initialTool],
	]);
	const getTool = (cwd: string) => {
		let tool = toolsByCwd.get(cwd);
		if (!tool) {
			tool = bashToolFor(cwd);
			toolsByCwd.set(cwd, tool);
		}
		return tool;
	};

	pi.registerTool({
		name: initialTool.name,
		label: initialTool.label,
		description: initialTool.description,
		promptSnippet: initialTool.promptSnippet,
		promptGuidelines: [
			...(initialTool.promptGuidelines ?? []),
			"For repository-scoped commands, pass the owning repository as cwd; do not assume the session cwd or rely on a previous command changing directories.",
		],
		parameters: Type.Object({
			...(initialTool.parameters as { properties: Record<string, unknown> }).properties,
			cwd: Type.Optional(
				Type.String({
					description:
						"Working directory for this command. Relative paths resolve from the session cwd.",
				}),
			),
		}),
		renderShell: initialTool.renderShell,
		prepareArguments(args): BashParams {
			const original = args as Record<string, unknown>;
			const prepared = initialTool.prepareArguments
				? (initialTool.prepareArguments(args) as Record<string, unknown>)
				: original;
			const cwd = original.cwd;
			return {
				...original,
				...prepared,
				...(typeof cwd === "string" ? { cwd } : {}),
			} as BashParams;
		},
		executionMode: initialTool.executionMode,
		execute(toolCallId, params: BashParams, signal, onUpdate, ctx) {
			const cwd = effectiveCwd(params, ctx.cwd);
			const { cwd: _cwd, ...toolParams } = params;
			return getTool(cwd).execute(
				toolCallId,
				toolParams,
				signal,
				onUpdate,
				ctx,
			);
		},
		renderCall(args, theme, context) {
			if (context.executionStarted && context.state.startedAt === undefined) {
				context.state.startedAt = Date.now();
				context.state.endedAt = undefined;
			}
			const text =
				context.lastComponent instanceof Text
					? context.lastComponent
					: new Text("", 0, 0);
			text.setText(
				formatBashCall(
					args,
					effectiveCwd(args, context.cwd),
					context.state.startedAt,
					theme,
				),
			);
			return text;
		},
		renderResult(result, options, theme, context) {
			const rendered =
				getTool(
					effectiveCwd(
						(result.details ?? {}) as { cwd?: string },
						context.cwd,
					),
				).renderResult?.(
					result as AgentToolResult<BashToolDetails | undefined>,
					options,
					theme,
					context as any,
				) ?? new Text("", 0, 0);
			const details = (result.details ?? {}) as { elapsed?: string };
			const durationMs = options.isPartial ? undefined : Number(details.elapsed) * 1000;
			const timing = formatTranscriptTiming(context.state.startedAt, Number.isFinite(durationMs) ? durationMs : undefined);
			if (!timing) return rendered;
			return new Text(`${rendered.render(1000).join("\n")}\n${theme.fg("dim", timing)}`, 0, 0);
		},
	});
}
