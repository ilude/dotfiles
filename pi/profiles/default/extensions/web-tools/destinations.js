import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";

export async function classifyUrl(value) {
	let parsed;
	try { parsed = new URL(value); } catch { throw new Error("URL must be valid"); }
	if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
		throw new Error("Use HTTP(S) without embedded credentials");
	const host = parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
	if (["metadata", "metadata.google.internal"].includes(host)) throw new Error("Cloud metadata endpoints are not allowed");
	const records = ipaddr.isValid(host)
		? [{ address: host, family: ipaddr.parse(host).kind() === "ipv4" ? 4 : 6 }]
		: await dns.lookup(host, { all: true });
	if (!records.length) throw new Error("Hostname has no addresses");
	const addresses = records.map(record => ({ ...record, parsed: ipaddr.process(record.address) }));
	if (addresses.some(record => ["169.254.169.254", "fd00:ec2::254"].includes(record.parsed.toString())))
		throw new Error("Cloud metadata endpoints are not allowed");
	return { parsed, privateOrLocal: host === "localhost" || host.endsWith(".localhost") || addresses.some(record => record.parsed.range() !== "unicast"),
		addresses: records };
}
