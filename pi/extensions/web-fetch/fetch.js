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

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MIN_USEFUL_CONTENT = 500;

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

function truncate(output) {
	return output.length > maxChars ? output.slice(0, maxChars) + `\n\n[Truncated at ${maxChars} chars]` : output;
}

function decodeRscString(value) {
	try {
		return JSON.parse(`"${value}"`);
	} catch {
		return value.replace(/\\n/g, "\n").replace(/\\"/g, '"');
	}
}

function extractRscContent(html) {
	if (!html.includes("self.__next_f.push")) return null;
	const chunks = [];
	const regex = /<script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g;
	for (const match of html.matchAll(regex)) {
		const decoded = decodeRscString(match[1]);
		const text = decoded
			.replace(/\\u003c/g, "<")
			.replace(/\\u003e/g, ">")
			.replace(/\\u0026/g, "&")
			.replace(/<[^>]+>/g, " ")
			.replace(/[{}[\]",:]+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (text.length > 80) chunks.push(text);
	}
	const unique = [...new Set(chunks)];
	const content = unique.join("\n\n").trim();
	return content.length >= MIN_USEFUL_CONTENT ? content : null;
}

async function fetchText(targetUrl) {
	const response = await fetch(targetUrl, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
		},
		signal: AbortSignal.timeout(15000),
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	return response.text();
}

async function extractWithReadability(targetUrl) {
	const html = await fetchText(targetUrl);
	const rsc = extractRscContent(html);
	const dom = new JSDOM(html, { url: targetUrl });
	const reader = new Readability(dom.window.document);
	const article = reader.parse();
	let output = "";
	if (article?.content) {
		if (article.title) output += `# ${article.title}\n\n`;
		output += htmlToMarkdown(article.content);
	} else {
		const fallback = new JSDOM(html, { url: targetUrl });
		const body = fallback.window.document;
		body.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => el.remove());
		const title = body.querySelector("title")?.textContent?.trim();
		const main = body.querySelector("main, article, [role='main'], .content, #content") || body.body;
		if (title) output += `# ${title}\n\n`;
		output += htmlToMarkdown(main?.innerHTML || "");
	}
	if (rsc && rsc.length > output.length) output = `${output}\n\n---\n\n## Dynamic page data\n\n${rsc}`.trim();
	if (output.trim().length < MIN_USEFUL_CONTENT) throw new Error("Could not extract enough readable content from this page.");
	return output;
}

async function extractWithJina(targetUrl) {
	const parsed = new URL(targetUrl);
	const readerUrl = `https://r.jina.ai/${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
	return fetchText(readerUrl);
}

try {
	let output;
	try {
		output = await extractWithReadability(url);
	} catch (primaryError) {
		try {
			output = await extractWithJina(url);
			output = `<!-- Fetched via Jina Reader fallback after primary extraction failed: ${primaryError.message} -->\n\n${output}`;
		} catch (fallbackError) {
			throw new Error(`${primaryError.message}; Jina fallback failed: ${fallbackError.message}`);
		}
	}
	console.log(truncate(output));
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
