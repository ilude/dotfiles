import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export const PROMPT_TEMPLATE_COMMAND_TYPE = "prompt-template-command";

interface PromptTemplateCommandDetails {
	invocation: string;
	startedAt: number;
}

export function parseCommandArgs(argsString: string): string[] {
	const args: string[] = [];
	let current = "";
	let quote: string | undefined;
	for (const character of argsString) {
		if (quote) {
			if (character === quote) quote = undefined;
			else current += character;
		} else if (character === "\"" || character === "'") quote = character;
		else if (/\s/.test(character)) {
			if (current) { args.push(current); current = ""; }
		} else current += character;
	}
	if (current) args.push(current);
	return args;
}

export function substitutePromptArguments(content: string, args: string[]): string {
	const allArgs = args.join(" ");
	return content.replace(
		/\$\{(\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
		(_match, defaultTarget, defaultValue, sliceStart, sliceLength, simple) => {
			if (defaultTarget) {
				const value = defaultTarget === "@" || defaultTarget === "ARGUMENTS" ? allArgs : args[Number(defaultTarget) - 1];
				return value || defaultValue;
			}
			if (sliceStart) {
				const start = Math.max(0, Number(sliceStart) - 1);
				return args.slice(start, sliceLength ? start + Number(sliceLength) : undefined).join(" ");
			}
			if (simple === "@" || simple === "ARGUMENTS") return allArgs;
			return args[Number(simple) - 1] ?? "";
		},
	);
}

export function formatPromptTemplateCommand(details: PromptTemplateCommandDetails): string {
	return `${details.invocation} · ${new Date(details.startedAt).toLocaleString()}`;
}

function parseTemplate(raw: string): { description?: string; body: string } {
	if (!raw.startsWith("---\n")) return { body: raw };
	const end = raw.indexOf("\n---\n", 4);
	if (end < 0) return { body: raw };
	const header = raw.slice(4, end);
	const description = header.match(/^description:\s*(.*)$/m)?.[1]?.trim();
	return { description, body: raw.slice(end + 5) };
}

export function registerPromptTemplateCommands(pi: ExtensionAPI, promptsDirectory: string): void {
	pi.registerMessageRenderer(PROMPT_TEMPLATE_COMMAND_TYPE, (message, { outputPad }) => {
		const details = message.details as PromptTemplateCommandDetails | undefined;
		return new Text(details ? formatPromptTemplateCommand(details) : "", outputPad, 0);
	});

	for (const file of readdirSync(promptsDirectory, { withFileTypes: true })) {
		if (!file.isFile() || !file.name.endsWith(".md")) continue;
		const name = basename(file.name, ".md");
		const raw = readFileSync(join(promptsDirectory, file.name), "utf8");
		const { description, body } = parseTemplate(raw);
		pi.registerCommand(name, {
			description: description || body.split("\n").find((line) => line.trim()) || name,
			handler: async (rawArgs) => {
				const args = rawArgs.trim();
				const invocation = args ? `/${name} ${args}` : `/${name}`;
				pi.sendMessage({
					customType: PROMPT_TEMPLATE_COMMAND_TYPE,
					content: substitutePromptArguments(body, parseCommandArgs(args)),
					display: true,
					details: { invocation, startedAt: Date.now() } satisfies PromptTemplateCommandDetails,
				}, { triggerTurn: true });
			},
		});
	}
}
