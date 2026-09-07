#!/usr/bin/env node

import { classifyUrl } from "./destinations.js";
import { curlResponse } from "./curl.js";
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

const DEFAULT_MAX_CHARS = 8000;
const MAX_CHARS_LIMIT = 50000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MIN_USEFUL_CONTENT = 500; // Used only for optional dynamic-page data.
const backendIndex = args.indexOf("--backend");
const selectedBackend = backendIndex < 0 ? "auto" : args[backendIndex + 1];
const budgetIndex = args.indexOf("--budget-ms");
const budgetMs = budgetIndex < 0 ? 60000 : Number(args[budgetIndex + 1]);
if (!Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > 60000) throw new Error("Invalid fetch budget");
const deadline = performance.now() + budgetMs;
const controller = new AbortController();
const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.ceil(budgetMs))]);
for (const event of ["SIGTERM", "SIGINT"]) process.once(event, () => controller.abort());
const remaining = () => Math.max(1, Math.floor(deadline - performance.now()));

let maxChars = DEFAULT_MAX_CHARS;
const maxCharsIndex = args.indexOf("--max-chars");
if (maxCharsIndex !== -1 && args[maxCharsIndex + 1]) {
	const parsed = Number(args[maxCharsIndex + 1]);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		console.error("Error: --max-chars must be a positive number");
		process.exit(1);
	}
	maxChars = Math.min(Math.floor(parsed), MAX_CHARS_LIMIT);
}

async function assertFetchUrl(targetUrl) {
	const classification = await classifyUrl(targetUrl);
	return { parsed: classification.parsed, classification };
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

function redirectTarget(currentUrl, response) {
	if (![301, 302, 303, 307, 308].includes(response.status)) return null;
	const location = response.headers.get("location");
	return location ? new URL(location, currentUrl).toString() : null;
}

async function responseTextWithLimit(response) {
	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
		throw new Error(`Response too large: ${contentLength} bytes`);
	}
	const reader = response.body?.getReader();
	if (!reader) return response.text();
	const chunks = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_RESPONSE_BYTES) {
			await reader.cancel();
			throw new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes`);
		}
		chunks.push(value);
	}
	const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
	return new TextDecoder().decode(buffer);
}

async function fetchText(targetUrl, allowCurl = true) {
	let currentUrl = targetUrl;
	let nativeCurl = false;
	for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
		signal.throwIfAborted();
		await assertFetchUrl(currentUrl);
		let response;
		let nodeText;
		if (!nativeCurl) {
			try {
				response = await fetch(currentUrl, {
					redirect: "manual", headers: { "User-Agent": USER_AGENT,
						"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
					signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(15000, remaining()))]),
				});
				if (response.ok) nodeText = await responseTextWithLimit(response);
			} catch (error) {
				signal.throwIfAborted();
				if (!allowCurl || !["TypeError", "AbortError", "TimeoutError"].includes(error.name)) throw error;
				nativeCurl = true;
			}
		}
		if (nativeCurl) response = await curlResponse(currentUrl, signal, Math.min(10000, remaining()));
		const nextUrl = redirectTarget(currentUrl, response);
		if (nextUrl) {
			await response.body?.cancel();
			currentUrl = nextUrl;
			continue;
		}
		if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText ?? "target error"}`);
		return { text: nativeCurl ? response.text : nodeText, url: currentUrl,
			contentType: response.headers.get("content-type") ?? "", nativeCurl };
	}
	throw new Error(`Too many redirects; limit is ${MAX_REDIRECTS}`);
}

async function extractWithReadability(targetUrl) {
	const response = await fetchText(targetUrl);
	const html = response.text;
	const provenance = `Source: ${response.url}${response.nativeCurl ? "\nTransport: native curl after Node transport failure" : ""}`;
	if (/^(text\/(plain|markdown|csv)|application\/(json|[^;]+\+json|xml))/i.test(response.contentType)) {
		if (!html.trim()) throw new Error("Empty response");
		return `${provenance}\n\n${html}`;
	}
	const rsc = extractRscContent(html);
	const dom = new JSDOM(html, { url: response.url });
	const reader = new Readability(dom.window.document);
	const article = reader.parse();
	let output = "";
	if (article?.content) {
		if (article.title) output += `# ${article.title}\n\n`;
		output += htmlToMarkdown(article.content);
	} else {
		const fallback = new JSDOM(html, { url: response.url });
		const body = fallback.window.document;
		body.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => {
			el.remove();
		});
		const title = body.querySelector("title")?.textContent?.trim();
		const main = body.querySelector("main, article, [role='main'], .content, #content") || body.body;
		if (title) output += `# ${title}\n\n`;
		output += htmlToMarkdown(main?.innerHTML || "");
		fallback.window.close();
	}
	dom.window.close();
	if (rsc && rsc.length > output.length) output = `${output}\n\n---\n\n## Dynamic page data\n\n${rsc}`.trim();
	if (!output.trim()) throw new Error("Could not extract readable content from this page.");
	return `${provenance}\n\n${output}`;
}

async function allowJinaFallback(targetUrl) {
	const { classification } = await assertFetchUrl(targetUrl);
	return !classification.privateOrLocal;
}

async function extractWithJina(targetUrl) {
	if (!(await allowJinaFallback(targetUrl))) {
		throw new Error("Jina fallback is disabled for local or private URLs.");
	}
	const parsed = new URL(targetUrl);
	const readerUrl = `https://r.jina.ai/${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
	return (await fetchText(readerUrl, false)).text;
}

try {
	await assertFetchUrl(url);
	if (!["auto", "direct", "jina"].includes(selectedBackend)) throw new Error("Backend requires a configured gateway");
	let output;
	try {
		output = selectedBackend === "jina" ? await extractWithJina(url) : await extractWithReadability(url);
	} catch (primaryError) {
		signal.throwIfAborted();
		if (selectedBackend !== "auto") throw primaryError;
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
