import { spawn } from "node:child_process";
import { isIP } from "node:net";
import { classifyUrl } from "./destinations.js";

export async function curlResponse(url, signal, budgetMs, executable = process.platform === "win32" ? "curl.exe" : "curl") {
	const { parsed, addresses } = await classifyUrl(url);
	signal.throwIfAborted();
	const address = addresses[0].address;
	const host = parsed.hostname.replace(/^\[|\]$/g, "");
	const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
	const resolve = `${host.includes(":") ? `[${host}]` : host}:${port}:${address.includes(":") ? `[${address}]` : address}`;
	const args = ["--disable", "--silent", "--show-error", "--include", "--compressed", "--noproxy", "*",
		"--proto", "=http,https", "--connect-timeout", String(Math.min(3, budgetMs / 1000)),
		"--max-time", String(Math.max(.001, budgetMs / 1000)), "--max-filesize", String(2 * 1024 * 1024),
		...(!isIP(host) ? ["--resolve", resolve] : []), "--user-agent", "Mozilla/5.0 Pi-web-fetch", "--url", parsed.href];
	return new Promise((resolveResult, reject) => {
		const child = spawn(executable, args, { shell: false, windowsHide: true, signal });
		const chunks = []; let bytes = 0; let problem;
		child.stdout.on("data", chunk => {
			bytes += chunk.length;
			if (bytes > 2 * 1024 * 1024 + 65536) { problem = new Error("Curl response exceeded byte limit"); child.kill(); }
			else chunks.push(chunk);
		});
		// Never echo native diagnostics that may contain URLs or machine configuration.
		child.stderr.resume();
		child.on("error", error => reject(new Error(error.code === "ENOENT" ? "Native curl unavailable" : "Native curl cancelled or unavailable")));
		child.on("close", code => {
			if (problem) { reject(problem); return; }
			if (code !== 0) { reject(new Error(code === 63 ? "Curl response exceeded byte limit" : `Native curl failed (${code})`)); return; }
			try {
				let buffer = Buffer.concat(chunks); let status = 0; let headers;
				do {
					const end = buffer.indexOf("\r\n\r\n");
					if (end < 0 || end > 65536) throw new Error("Invalid curl response headers");
					const lines = buffer.subarray(0, end).toString("utf8").split("\r\n");
					status = Number(lines.shift()?.match(/^HTTP\/\S+\s+(\d{3})/)?.[1]);
					if (!status) throw new Error("Invalid curl response status");
					headers = new Headers();
					for (const line of lines) { const colon = line.indexOf(":"); if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim()); }
					buffer = buffer.subarray(end + 4);
				} while (status < 200);
				if (buffer.length > 2 * 1024 * 1024) throw new Error("Curl body exceeded byte limit");
				resolveResult({ status, ok: status >= 200 && status < 300, headers, text: buffer.toString("utf8") });
			} catch (error) { reject(error); }
		});
	});
}
