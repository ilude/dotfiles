import {
	DynamicBorder,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	type SelectItem,
	SelectList,
	Text,
} from "@earendil-works/pi-tui";
import type {
	DamageControlPromptCategory,
	DamageControlPromptSeverity,
} from "../../lib/damage-control-eval.js";
import { emitTerminalBell } from "../../lib/extension-utils.js";

export type {
	DamageControlPromptCategory,
	DamageControlPromptSeverity,
} from "../../lib/damage-control-eval.js";

export const DAMAGE_CONTROL_PROMPT_CATEGORIES = [
	"local-state",
	"version-control",
	"sensitive-data",
	"infrastructure",
	"system-execution",
	"remote-state",
] as const satisfies readonly DamageControlPromptCategory[];

export interface DamageControlPromptRequest {
	category: DamageControlPromptCategory;
	title: string;
	message: string;
	reason: string;
}

interface DamageControlPromptPresentation {
	categoryLabel: string;
	severity: DamageControlPromptSeverity;
	severityLabel: string;
	color: "error" | "warning" | "accent";
}

const PRESENTATION: Record<
	DamageControlPromptCategory,
	DamageControlPromptPresentation
> = {
	"local-state": {
		categoryLabel: "Local state",
		severity: "critical",
		severityLabel: "CRITICAL",
		color: "error",
	},
	"version-control": {
		categoryLabel: "Version control",
		severity: "critical",
		severityLabel: "CRITICAL",
		color: "error",
	},
	"sensitive-data": {
		categoryLabel: "Sensitive data",
		severity: "review",
		severityLabel: "REVIEW",
		color: "accent",
	},
	infrastructure: {
		categoryLabel: "Infrastructure",
		severity: "high",
		severityLabel: "HIGH",
		color: "warning",
	},
	"system-execution": {
		categoryLabel: "System execution",
		severity: "high",
		severityLabel: "HIGH",
		color: "warning",
	},
	"remote-state": {
		categoryLabel: "Remote state",
		severity: "critical",
		severityLabel: "CRITICAL",
		color: "error",
	},
};

const SENSITIVE_DATA_PATTERN =
	/(?:\.env(?:\.|\b)|tfvars\b|secret|credential|private[ _-]?key|sensitive[_ -]?file|\.pem\b|\.pfx\b|\.p12\b)/i;
const VERSION_CONTROL_PATTERN =
	/(?:^|[;&|]\s*|\b(?:sudo|env)\s+)(?:git|jj)\s/i;
const INFRASTRUCTURE_PATTERN =
	/(?:^|[;&|]\s*|\b(?:sudo|env)\s+)(?:docker|podman|kubectl|helm|terraform|tofu|pulumi|ansible-playbook)\s/i;
const REMOTE_STATE_PATTERN =
	/(?:^|[;&|]\s*|\b(?:sudo|env)\s+)(?:aws|az|gcloud|gh|glab|doctl|flyctl|heroku|vercel|netlify|wrangler|supabase)\s/i;
const SYSTEM_EXECUTION_PATTERN =
	/(?:ast analysis|bun stdin script|systemctl|systemd-run|service\s|crontab|schtasks|invoke-expression|set-mppreference|reg(?:\.exe)?\s+(?:add|delete)|(?:apt|dnf|yum|pacman|winget|choco)\s)/i;

export function classifyDamageControlPrompt(input: {
	action: string;
	rule?: string;
	category?: DamageControlPromptCategory;
}): DamageControlPromptCategory {
	if (input.category) return input.category;
	const evidence = `${input.action}\n${input.rule ?? ""}`;
	if (SENSITIVE_DATA_PATTERN.test(evidence)) return "sensitive-data";
	if (VERSION_CONTROL_PATTERN.test(input.action) || input.rule === "semantic_git")
		return "version-control";
	if (INFRASTRUCTURE_PATTERN.test(input.action)) return "infrastructure";
	if (REMOTE_STATE_PATTERN.test(input.action)) return "remote-state";
	if (SYSTEM_EXECUTION_PATTERN.test(evidence)) return "system-execution";
	return "local-state";
}

export function damageControlPromptPresentation(
	category: DamageControlPromptCategory,
): DamageControlPromptPresentation {
	return PRESENTATION[category];
}

function highlightPromptReason(
	message: string,
	reason: string,
	text: (value: string) => string,
	highlight: (value: string) => string,
): string {
	const reasonLine = `Reason: ${reason}`;
	const lineParts = message.split(reasonLine);
	if (lineParts.length > 1)
		return lineParts.map(text).join(highlight(reasonLine));
	const reasonParts = message.split(reason);
	if (reasonParts.length > 1)
		return reasonParts.map(text).join(highlight(reason));
	return `${text(message)}\n\n${highlight(reasonLine)}`;
}

export async function showDamageControlPrompt(
	ctx: Pick<ExtensionContext, "mode" | "ui">,
	request: DamageControlPromptRequest,
): Promise<boolean> {
	const presentation = PRESENTATION[request.category];
	const heading = `[${presentation.severityLabel}] ${presentation.categoryLabel}`;
	emitTerminalBell();

	if (ctx.mode !== "tui") {
		return ctx.ui.confirm(`${heading} - ${request.title}`, request.message);
	}

	const outcome = await ctx.ui.custom<"allow" | "deny">(
		(tui, theme, _keybindings, done) => {
			const container = new Container();
			const color = (text: string) => theme.fg(presentation.color, text);
			const message = highlightPromptReason(
				request.message,
				request.reason,
				(text) => theme.fg("text", text),
				(text) => theme.fg("accent", text),
			);
			container.addChild(new DynamicBorder(color));
			container.addChild(new Text(color(theme.bold(heading)), 1, 0));
			container.addChild(
				new Text(theme.fg("muted", request.title), 1, 0),
			);
			container.addChild(new Text(message, 1, 1));

			const items: SelectItem[] = [
				{
					value: "allow",
					label: "Allow once",
					description: "Run this action one time",
				},
				{
					value: "deny",
					label: "Deny",
					description: "Keep the action blocked",
				},
			];
			const selectList = new SelectList(items, items.length, {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			});
			selectList.onSelect = (item) => done(item.value as "allow" | "deny");
			selectList.onCancel = () => done("deny");
			container.addChild(selectList);
			container.addChild(
				new Text(
					theme.fg("dim", "up/down navigate - enter select - esc deny"),
					1,
					0,
				),
			);
			container.addChild(new DynamicBorder(color));

			return {
				render: (width) => container.render(width),
				invalidate: () => container.invalidate(),
				handleInput: (data) => {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		},
	);
	return outcome === "allow";
}
