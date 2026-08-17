import {
	type AgentToolResult,
	type BashToolDetails,
	createBashToolDefinition,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatToolTiming } from "../lib/tool-timing.js";

type ToolTheme = {
	bold(text: string): string;
	fg(role: string, text: string): string;
};

function bashToolFor(cwd: string) {
	return createBashToolDefinition(cwd);
}

function formatBashCall(
	args: { command?: string; timeout?: number },
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
		promptGuidelines: initialTool.promptGuidelines,
		parameters: initialTool.parameters,
		renderShell: initialTool.renderShell,
		prepareArguments: initialTool.prepareArguments,
		executionMode: initialTool.executionMode,
		execute(toolCallId, params, signal, onUpdate, ctx) {
			return getTool(ctx.cwd).execute(
				toolCallId,
				params,
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
				formatBashCall(args, context.cwd, context.state.startedAt, theme),
			);
			return text;
		},
		renderResult(result, options, theme, context) {
			return (
				getTool(context.cwd).renderResult?.(
					result as AgentToolResult<BashToolDetails | undefined>,
					options,
					theme,
					context,
				) ?? new Text("", 0, 0)
			);
		},
	});
}
