import { existsSync, mkdirSync, renameSync } from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, stripTerminalSequences, truncateToWidth } from "@earendil-works/pi-tui";
import { containedRealPath, discoverPlans, parsePlan, type PlanRecord } from "../lib/plans.ts";
import { createHerdrPiTab } from "./session-launch.ts";

type Action = "open" | "do-it" | "archive" | "close";
interface Selection { action: Action; index: number }

function clean(value: string): string { return stripTerminalSequences(value).replace(/\s+/g, " ").trim(); }
function line(value: string, width: number): string { return truncateToWidth(value, Math.max(1, width)); }

export function planSelector(plans: PlanRecord[], initial: number, onDone: (value: Selection) => void) {
	return (tui: { requestRender(): void }, theme: any) => {
		let selected = Math.min(Math.max(initial, 0), Math.max(plans.length - 1, 0));
		let details = false;
		return {
			render(width: number): string[] {
				const output = [line(theme.bold(theme.fg("accent", "Plans")), width)];
				if (!plans.length) output.push(line(theme.fg("muted", "No open plans found under .specs/."), width));
				for (let index = 0; index < plans.length; index++) {
					const plan = plans[index]!;
					const marker = index === selected ? ">" : " ";
					const progress = plan.tasks.total ? `${plan.tasks.checked}/${plan.tasks.total}` : "no tasks";
					const status = clean(plan.status ?? "unknown");
					const text = `${marker} ${clean(plan.title)}  [${status}; ${progress}]`;
					output.push(line(index === selected ? theme.fg("accent", text) : text, width));
					if (index === selected) output.push(line(theme.fg("muted", `  ${clean(plan.description)}`), width));
				}
				const current = plans[selected];
				if (details && current) {
					output.push(line(theme.fg("dim", `Path: ${current.relativePath}`), width));
					output.push(line(theme.fg("dim", `Modified: ${current.modified.toISOString().slice(0, 10)}`), width));
					if (current.firstUnchecked) output.push(line(`Next: ${clean(current.firstUnchecked)}`, width));
					if (current.handoff) output.push(line(`Handoff: ${clean(current.handoff)}`, width));
					if (current.warnings.length) output.push(line(theme.fg("warning", `Warning: ${current.warnings.join("; ")}`), width));
				}
				output.push(line(theme.fg("dim", "↑/↓ navigate · Enter details · o VS Code · d do-it · a archive · Esc/q close"), width));
				return output;
			},
			invalidate() {},
			handleInput(data: string) {
				if (matchesKey(data, Key.escape) || data === "q") return onDone({ action: "close", index: selected });
				if (!plans.length) return;
				if (matchesKey(data, Key.up)) { selected = Math.max(0, selected - 1); details = false; }
				else if (matchesKey(data, Key.down)) { selected = Math.min(plans.length - 1, selected + 1); details = false; }
				else if (matchesKey(data, Key.enter)) details = !details;
				else if (data === "o") return onDone({ action: "open", index: selected });
				else if (data === "d") return onDone({ action: "do-it", index: selected });
				else if (data === "a") return onDone({ action: "archive", index: selected });
				tui.requestRender();
			},
		};
	};
}

export function openPlanInCode(plan: PlanRecord, cwd: string): void {
	const result = spawnSync("code", ["-g", plan.path], { cwd, shell: false, stdio: "ignore", windowsHide: true });
	if (result.error) throw result.error;
	if (typeof result.status === "number" && result.status !== 0) throw new Error(`code exited ${result.status}`);
}

export function archivePlan(plan: PlanRecord, root: string): string {
	const fresh = parsePlan(plan.path, plan.stub, root);
	if (fresh.status !== "completed") throw new Error("Plan status must be completed.");
	if (!fresh.completed || !/^\d{4}-\d{2}-\d{2}$/.test(fresh.completed) || Number.isNaN(Date.parse(`${fresh.completed}T00:00:00Z`))) throw new Error("Plan must have a valid completion date.");
	if (fresh.tasks.total - fresh.tasks.checked > 0) throw new Error("Plan still has unchecked tasks.");
	const specs = path.join(root, ".specs");
	const source = path.dirname(plan.path);
	if (!containedRealPath(source, specs) || path.basename(source) !== plan.stub || path.dirname(source) !== specs) throw new Error("Plan source escapes .specs.");
	const archive = path.join(specs, "archive");
	mkdirSync(archive, { recursive: true });
	const destination = path.join(archive, plan.stub);
	if (existsSync(destination)) throw new Error(`Archive destination already exists: ${path.relative(root, destination)}`);
	renameSync(source, destination);
	return destination;
}

export async function executePlans(ctx: ExtensionCommandContext): Promise<void> {
	const root = path.resolve(ctx.cwd ?? process.cwd());
	let selected = 0;
	while (true) {
		const discovery = discoverPlans(root);
		for (const error of discovery.errors) ctx.ui.notify(error, "warning");
		const result = await ctx.ui.custom<Selection>((tui, theme, _keybindings, done) => planSelector(discovery.plans, selected, done)(tui, theme), {
			overlay: true, overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" },
		});
		if (result.action === "close") return;
		selected = result.index;
		const plan = discovery.plans[selected];
		if (!plan) continue;
		try {
			if (result.action === "open") openPlanInCode(plan, root);
			else if (result.action === "do-it") {
				if (process.env.HERDR_ENV !== "1") throw new Error("Plan execution from /plans requires a Herdr-managed Pi session.");
				createHerdrPiTab(root, `do-it · ${plan.stub}`.slice(0, 80), undefined, plan.relativePath);
				ctx.ui.notify(`Opened /do-it for ${plan.stub} in a Herdr Pi tab.`, "info");
			} else {
				const destination = path.join(root, ".specs", "archive", plan.stub);
				const confirmed = await ctx.ui.confirm("Archive completed plan?", `${plan.relativePath}\n→ ${path.relative(root, destination).replace(/\\/g, "/")}`);
				if (confirmed) { archivePlan(plan, root); ctx.ui.notify(`Archived ${plan.stub}.`, "info"); }
			}
		} catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
	}
}

export default function plansCommand(pi: ExtensionAPI): void {
	pi.registerCommand("plans", { description: "Browse open implementation plans", handler: async (args, ctx) => {
		if (args.trim()) throw new Error("Usage: /plans");
		await executePlans(ctx);
	} });
}
