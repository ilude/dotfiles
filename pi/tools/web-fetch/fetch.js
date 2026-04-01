#!/usr/bin/env node

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const args = process.argv.slice(2);

const url = args[0];
if (!url || url.startsWith("-")) {
	console.error("Usage: fetch.js <url> [--max-chars N]");
	process.exit(1);
}

let maxChars = 8000;
const maxCharsIndex = args.indexOf("--max-chars");
if (maxCharsIndex !== -1 && args[maxCharsIndex + 1]) {
	maxChars = parseInt(args[maxCharsIndex + 1], 10);
}

function htmlToMarkdown(html) {
	const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
	turndown.use(gfm);
	turndown.addRule("removeEmptyLinks", {
		filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
		replacement: () => "",
	});
	return turndown
		.turndown(html)
		.replace(/\[\\?\[\s*\\?\]\]\([^)]*\)/g, "")
		.replace(/ +/g, " ")
		.replace(/\s+,/g, ",")
		.replace(/\s+\./g, ".")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

try {
	const response = await fetch(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
		},
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		console.error(`HTTP ${response.status}: ${response.statusText}`);
		process.exit(1);
	}

	const html = await response.text();
	const dom = new JSDOM(html, { url });
	const reader = new Readability(dom.window.document);
	const article = reader.parse();

	let output = "";

	if (article && article.content) {
		if (article.title) {
			output += `# ${article.title}\n\n`;
		}
		output += htmlToMarkdown(article.content);
	} else {
		// Fallback: strip scripts/styles, extract main content
		const fallback = new JSDOM(html, { url });
		const body = fallback.window.document;
		body.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => el.remove());

		const title = body.querySelector("title")?.textContent?.trim();
		const main = body.querySelector("main, article, [role='main'], .content, #content") || body.body;

		if (title) output += `# ${title}\n\n`;

		const text = main?.innerHTML || "";
		if (text.trim().length > 100) {
			output += htmlToMarkdown(text);
		} else {
			console.error("Could not extract readable content from this page.");
			process.exit(1);
		}
	}

	if (output.length > maxChars) {
		output = output.slice(0, maxChars) + `\n\n[Truncated at ${maxChars} chars]`;
	}

	console.log(output);
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
