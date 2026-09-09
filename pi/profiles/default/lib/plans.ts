import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";

export interface PlanRecord {
	stub: string;
	path: string;
	relativePath: string;
	title: string;
	description: string;
	status?: string;
	completed?: string;
	tasks: { total: number; checked: number };
	firstUnchecked?: string;
	handoff?: string;
	modified: Date;
	warnings: string[];
}

export interface PlanDiscovery { plans: PlanRecord[]; errors: string[] }

function section(markdown: string, heading: string): string | undefined {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return markdown.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im"))?.[1]?.trim();
}

function plainSummary(value?: string): string | undefined {
	const line = value?.split(/\r?\n/).map((part) => part.trim()).find((part) => part && !/^[-*]\s+(?:User requirements|Non-goals|Authorization):?$/i.test(part));
	return line?.replace(/^[-*]\s+/, "").replace(/[`*_]/g, "").trim() || undefined;
}

function scalar(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim()) return value.trim();
	if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
	return undefined;
}

export function parsePlan(file: string, stub: string, root: string): PlanRecord {
	const markdown = readFileSync(file, "utf8");
	const warnings: string[] = [];
	let metadata: Record<string, unknown> = {};
	const frontmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
	if (frontmatter) {
		try {
			const parsed = parseYaml(frontmatter[1] ?? "");
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
			else warnings.push("frontmatter is not a mapping");
		} catch { warnings.push("malformed frontmatter"); }
	} else warnings.push("missing frontmatter");
	const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || stub;
	if (title === stub) warnings.push("missing title");
	const description = plainSummary(section(markdown, "Goal and scope")) ?? "Description unavailable";
	if (description === "Description unavailable") warnings.push("missing goal summary");
	const boxes = [...markdown.matchAll(/^\s*-\s+\[([ xX])\]\s+(.+)$/gm)];
	const checked = boxes.filter((match) => match[1]?.toLowerCase() === "x").length;
	const firstUnchecked = boxes.find((match) => match[1] === " ")?.[2]?.trim();
	const status = scalar(metadata.status);
	if (metadata.status !== undefined && !status) warnings.push("invalid status");
	const completed = scalar(metadata.completed);
	if (metadata.completed !== undefined && metadata.completed !== null && !completed) warnings.push("invalid completion date");
	const handoff = plainSummary(section(markdown, "Current handoff"));
	return {
		stub, path: file, relativePath: path.relative(root, file).replace(/\\/g, "/"), title, description,
		status, completed, tasks: { total: boxes.length, checked }, firstUnchecked, handoff,
		modified: statSync(file).mtime, warnings,
	};
}

export function discoverPlans(root: string): PlanDiscovery {
	const specs = path.join(root, ".specs");
	const plans: PlanRecord[] = [];
	const errors: string[] = [];
	let entries;
	try { entries = readdirSync(specs, { withFileTypes: true }); }
	catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { plans, errors };
		return { plans, errors: [`Cannot read .specs: ${error instanceof Error ? error.message : String(error)}`] };
	}
	for (const entry of entries) {
		if (entry.name === "archive" || !entry.isDirectory()) continue;
		const file = path.join(specs, entry.name, "plan.md");
		try {
			if (!lstatSync(file).isFile()) continue;
			plans.push(parsePlan(file, entry.name, root));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") errors.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	plans.sort((a, b) => a.stub.localeCompare(b.stub));
	return { plans, errors };
}

export function containedRealPath(candidate: string, parent: string): boolean {
	const realCandidate = realpathSync.native(candidate);
	const realParent = realpathSync.native(parent);
	const relative = path.relative(realParent, realCandidate);
	return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}
