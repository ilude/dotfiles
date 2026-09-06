import * as fs from "node:fs";
import * as path from "node:path";
import { readLinkedPlan } from "./plan-state.js";

export type ArchivedPlan = {
	sourcePlan: string;
	archivedPlan: string;
	archivedDirectory: string;
};

function portable(value: string): string {
	return value.replaceAll("\\", "/");
}

function isContained(root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

function relativeDisplay(root: string, candidate: string): string {
	return portable(path.relative(root, candidate));
}

function parseCanonicalPlanPath(value: string): {
	normalized: string;
	slug: string;
} {
	const raw = portable(value.trim().replace(/^@/, ""));
	if (!raw) throw new Error("plan path is required");
	if (path.posix.isAbsolute(raw) || /^[A-Za-z]:\//.test(raw))
		throw new Error("plan path must be repository-relative");
	const normalized = path.posix.normalize(raw).replace(/^\.\//, "");
	const parts = normalized.split("/");
	if (
		parts.length !== 3 ||
		parts[0] !== ".specs" ||
		parts[1] === "archive" ||
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[1]) ||
		parts[2] !== "plan.md"
	)
		throw new Error(
			"automatic archival requires .specs/{slug}/plan.md outside .specs/archive",
		);
	return { normalized, slug: parts[1] };
}

function assertCompletePlan(planPath: string): void {
	const content = fs.readFileSync(planPath, "utf8");
	const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!frontmatter)
		throw new Error("plan must contain frontmatter before archival");
	if (!/^status:\s*(?:complete|completed)\s*$/im.test(frontmatter[1]))
		throw new Error("plan frontmatter status must be complete before archival");
	if (!/^completed:\s*\S.*$/im.test(frontmatter[1]))
		throw new Error("plan frontmatter completed date is required before archival");

	const state = readLinkedPlan(planPath);
	if (state.tasks.length === 0)
		throw new Error("plan must contain an executable task checklist");
	if (!state.complete)
		throw new Error(`plan is not complete: ${state.blockers.join("; ")}`);

	const validation = content.match(
		/^## Validation\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m,
	);
	if (!validation)
		throw new Error("plan must contain a validation checklist before archival");
	if (/^\s*- \[ \]/m.test(validation[1]))
		throw new Error("plan validation checklist is incomplete");

	const executionStatus = content.match(
		/^## Execution Status\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m,
	);
	if (
		!executionStatus ||
		!/^\s*- State:\s*(?:complete|completed)\s*$/im.test(executionStatus[1])
	)
		throw new Error("plan execution status must be complete before archival");
}

export function archiveCompletedPlan(
	cwd: string,
	requestedPlanPath: string,
): ArchivedPlan {
	const root = fs.realpathSync(cwd);
	const { normalized, slug } = parseCanonicalPlanPath(requestedPlanPath);
	const lexicalPlan = path.resolve(root, ...normalized.split("/"));
	if (!fs.existsSync(lexicalPlan) || !fs.lstatSync(lexicalPlan).isFile())
		throw new Error(`plan file not found or not a regular file: ${normalized}`);
	const canonicalPlan = fs.realpathSync(lexicalPlan);
	if (!isContained(root, canonicalPlan) || canonicalPlan !== lexicalPlan)
		throw new Error("plan path cannot traverse a symlink or junction");

	const specsRoot = path.join(root, ".specs");
	const canonicalSpecsRoot = fs.realpathSync(specsRoot);
	const sourceDirectory = path.dirname(canonicalPlan);
	if (
		!isContained(root, canonicalSpecsRoot) ||
		path.dirname(sourceDirectory) !== canonicalSpecsRoot
	)
		throw new Error("plan directory is not a direct child of the workspace .specs directory");

	assertCompletePlan(canonicalPlan);

	const archiveRoot = path.join(specsRoot, "archive");
	if (!fs.existsSync(archiveRoot)) fs.mkdirSync(archiveRoot, { recursive: true });
	if (!fs.lstatSync(archiveRoot).isDirectory())
		throw new Error(".specs/archive must be a directory");
	const canonicalArchiveRoot = fs.realpathSync(archiveRoot);
	if (!isContained(root, canonicalArchiveRoot) || canonicalArchiveRoot !== archiveRoot)
		throw new Error(".specs/archive cannot traverse a symlink or junction");

	const targetDirectory = path.join(canonicalArchiveRoot, slug);
	if (fs.existsSync(targetDirectory))
		throw new Error(`archive target already exists: ${relativeDisplay(root, targetDirectory)}`);
	fs.renameSync(sourceDirectory, targetDirectory);

	const archivedPlan = path.join(targetDirectory, "plan.md");
	return {
		sourcePlan: normalized,
		archivedPlan: relativeDisplay(root, archivedPlan),
		archivedDirectory: relativeDisplay(root, targetDirectory),
	};
}
