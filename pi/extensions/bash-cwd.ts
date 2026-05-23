import {
	type AgentToolResult,
	type BashToolDetails,
	createBashToolDefinition,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

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
	theme: ToolTheme,
): string {
	const command = args.command || theme.fg("toolOutput", "...");
	const timeoutSuffix = args.timeout
		? theme.fg("muted", `, timeout ${args.timeout}s`)
		: "";
	return (
		theme.fg("toolTitle", theme.bold(`$ ${command}`)) +
		theme.fg("muted", ` (cwd: ${cwd}${timeoutSuffix})`)
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
			const text =
				context.lastComponent instanceof Text
					? context.lastComponent
					: new Text("", 0, 0);
			text.setText(formatBashCall(args, context.cwd, theme));
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
