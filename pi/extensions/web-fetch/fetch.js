#!/usr/bin/env node

import dns from "node:dns/promises";
import net from "node:net";
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
const MIN_USEFUL_CONTENT = 500;

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

function parseHttpUrl(targetUrl) {
	let parsed;
	try {
		parsed = new URL(targetUrl);
	} catch {
		throw new Error("URL must be valid");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("Only http and https URLs are supported");
	}
	return parsed;
}

function isIpv4InCidr(address, prefix, bits) {
	const toInt = (value) => value.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
	const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
	return (toInt(address) & mask) === (toInt(prefix) & mask);
}

const PRIVATE_IPV4_RANGES = [
	["10.0.0.0", 8],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.168.0.0", 16],
];

function isPrivateOrLocalIpv6(address) {
	const lower = address.toLowerCase();
	return lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

function isPrivateOrLocalAddress(address) {
	if (net.isIPv4(address))
		return address === "0.0.0.0" || PRIVATE_IPV4_RANGES.some(([prefix, bits]) => isIpv4InCidr(address, prefix, bits));
	if (net.isIPv6(address)) return isPrivateOrLocalIpv6(address);
	return false;
}

function isMetadataAddress(address) {
	return address === "169.254.169.254" || address.toLowerCase() === "fd00:ec2::254";
}

function isMetadataHostname(hostname) {
	const lower = hostname.toLowerCase();
	return lower === "metadata.google.internal" || lower === "metadata";
}

async function classifyHost(parsed) {
	const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
	if (hostname === "localhost" || hostname.endsWith(".localhost")) {
		return { metadata: false, privateOrLocal: true };
	}
	if (isMetadataHostname(hostname)) return { metadata: true, privateOrLocal: true };
	if (net.isIP(hostname)) {
		return {
			metadata: isMetadataAddress(hostname),
			privateOrLocal: isPrivateOrLocalAddress(hostname),
		};
	}
	const records = await dns.lookup(hostname, { all: true });
	return {
		metadata: records.some((record) => isMetadataAddress(record.address)),
		privateOrLocal: records.some((record) => isPrivateOrLocalAddress(record.address)),
	};
}

async function assertFetchUrl(targetUrl) {
	const parsed = parseHttpUrl(targetUrl);
	const classification = await classifyHost(parsed);
	if (classification.metadata) throw new Error("Cloud metadata endpoints are not allowed");
	return { parsed, classification };
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

async function fetchText(targetUrl) {
	let currentUrl = targetUrl;
	for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
		await assertFetchUrl(currentUrl);
		const response = await fetch(currentUrl, {
			redirect: "manual",
			headers: {
				"User-Agent": USER_AGENT,
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
			},
			signal: AbortSignal.timeout(15000),
		});
		const nextUrl = redirectTarget(currentUrl, response);
		if (nextUrl) {
			currentUrl = nextUrl;
			continue;
		}
		if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		return responseTextWithLimit(response);
	}
	throw new Error(`Too many redirects; limit is ${MAX_REDIRECTS}`);
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
	return fetchText(readerUrl);
}

try {
	await assertFetchUrl(url);
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
