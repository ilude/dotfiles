#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OWNER = "DietrichGebert";
const REPO = "ponytail";
const TRACKING_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../docs/upstream/ponytail.md",
);
const RELEVANT_PREFIXES = [
	"skills/ponytail",
	"hooks/ponytail-",
	"pi-extension/",
	"benchmarks/",
	"tests/behavior",
	"tests/correctness",
	"tests/hooks",
	"tests/commands",
	"AGENTS.md",
];

function usage() {
	console.log(`Usage: node pi/scripts/ponytail-upstream.mjs

Compare the Ponytail commit recorded in pi/docs/upstream/ponytail.md with the
current upstream default branch. This command is read-only and never updates the
checkpoint or local files.

Environment:
  GITHUB_TOKEN  Optional GitHub token for a higher API rate limit.`);
}

export function parseReviewedCommit(markdown) {
	const match = markdown.match(/^- Reviewed commit: `([0-9a-f]{40})`$/m);
	if (!match) {
		throw new Error(`missing 40-character Reviewed commit in ${TRACKING_PATH}`);
	}
	return match[1];
}

export function isRelevantPath(filePath) {
	return RELEVANT_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

async function github(pathname) {
	const headers = {
		Accept: "application/vnd.github+json",
		"User-Agent": "dotfiles-ponytail-upstream-check",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (process.env.GITHUB_TOKEN) {
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	}

	const response = await fetch(`https://api.github.com${pathname}`, { headers });
	if (!response.ok) {
		const detail = (await response.text()).trim();
		throw new Error(
			`GitHub API ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`,
		);
	}
	return response.json();
}

export async function run() {
	const markdown = await readFile(TRACKING_PATH, "utf8");
	const base = parseReviewedCommit(markdown);
	const repository = await github(`/repos/${OWNER}/${REPO}`);
	const branch = repository.default_branch;
	const headCommit = await github(`/repos/${OWNER}/${REPO}/commits/${encodeURIComponent(branch)}`);
	const head = headCommit.sha;

	console.log(`Ponytail upstream: https://github.com/${OWNER}/${REPO}`);
	console.log(`Reviewed: ${base}`);
	console.log(`Current ${branch}: ${head}`);

	if (base === head) {
		console.log("Status: checkpoint is current; no upstream commits to review.");
		return;
	}

	const comparison = await github(`/repos/${OWNER}/${REPO}/compare/${base}...${head}`);
	if (!["ahead", "identical"].includes(comparison.status)) {
		throw new Error(
			`recorded commit is not an ancestor of ${branch} (comparison status: ${comparison.status})`,
		);
	}

	console.log(`Status: ${comparison.ahead_by} upstream commit(s) to review.`);
	console.log("\nCommits:");
	for (const commit of comparison.commits) {
		const subject = commit.commit.message.split("\n", 1)[0];
		console.log(`- ${commit.sha.slice(0, 12)} ${subject}`);
	}
	if (comparison.commits.length < comparison.ahead_by) {
		console.log(
			`- WARNING: GitHub returned ${comparison.commits.length} of ${comparison.ahead_by} commits; inspect the compare URL for the complete range.`,
		);
	}

	const files = comparison.files ?? [];
	const relevant = files.filter((file) => isRelevantPath(file.filename));
	console.log("\nRelevant changed paths:");
	if (relevant.length === 0) {
		console.log("- none in the configured rule, hook, Pi, benchmark, or test surfaces");
	} else {
		for (const file of relevant) {
			console.log(`- ${file.status.padEnd(8)} ${file.filename} (+${file.additions}/-${file.deletions})`);
		}
	}
	if (files.length >= 300) {
		console.log("- WARNING: GitHub compare file results may be capped; inspect the compare URL.");
	}

	console.log(`\nCompare: https://github.com/${OWNER}/${REPO}/compare/${base}...${head}`);
	console.log("The tracking checkpoint remains unchanged until relevant commits receive a local disposition.");
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
	usage();
} else if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
	run().catch((error) => {
		console.error(`ponytail-upstream: ${error.message}`);
		process.exitCode = 1;
	});
}
