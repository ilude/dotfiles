import * as crypto from "node:crypto";
import * as dgram from "node:dgram";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const PROTOCOL = "pi-coms-lan";
const VERSION = 1;
const MAX_AUDIT_VALUE = 160;
const MAX_LOG_BYTES = 64 * 1024;
const DEFAULT_TTL = 1;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const ENABLE_ENV_VAR = "PI_COMS_LAN_ENABLE";
const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export type DiscoveryPacket = {
	protocol: typeof PROTOCOL;
	version: typeof VERSION;
	nodeId: string;
	hubInstanceId: string;
	endpoint: string;
	label: string;
};

export type AgentCard = {
	agentId: string;
	instanceId: string;
	projectLabel: string;
	capabilities: string[];
};

export type MessageEnvelope = {
	messageId: string;
	fromNodeId: string;
	toNodeId: string;
	ttl: number;
	type: "prompt" | "response";
	body: string;
	correlationId?: string;
};

type TrustedKey = {
	fingerprint: string;
	comment: string;
	publicKey: crypto.KeyObject;
};

type HubState = {
	nodeId: string;
	hubInstanceId: string;
	pid: number;
	endpoint: string;
	updatedAt: string;
};

type AuditEvent = {
	type: string;
	nodeId: string;
	remoteNodeId?: string;
	messageId?: string;
	result?: string;
	reason?: string;
};

export type ComsLanHubOptions = {
	stateDir?: string;
	label?: string;
	endpoint?: string;
	privateKey?: crypto.KeyObject;
};

const hubs = new Map<string, ComsLanHub>();

export function isComsLanEnabled(): boolean {
	return ENABLED_VALUES.has((process.env[ENABLE_ENV_VAR] ?? "").toLowerCase());
}

function requireComsLanEnabled(): void {
	if (!isComsLanEnabled()) {
		throw new Error(`${ENABLE_ENV_VAR} must be set to enable coms-lan`);
	}
}

function stateRoot(explicit?: string): string {
	return (
		explicit ??
		process.env.PI_COMS_LAN_DIR ??
		path.join(os.homedir(), ".pi", "coms-lan")
	);
}

function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string): T {
	return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
	fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {
		mode: 0o600,
	});
}

function randomId(prefix: string): string {
	return `${prefix}_${crypto.randomUUID()}`;
}

function publicKeyFromRaw(raw: Buffer): crypto.KeyObject {
	return crypto.createPublicKey({
		key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
		format: "der",
		type: "spki",
	});
}

function rawPublicKeyFromDer(publicKey: crypto.KeyObject): Buffer {
	const der = publicKey.export({ format: "der", type: "spki" }) as Buffer;
	return der.subarray(der.length - 32);
}

function readSshString(
	buffer: Buffer,
	offset: number,
): { value: Buffer; next: number } {
	if (offset + 4 > buffer.length)
		throw new Error("Malformed SSH key wire value");
	const len = buffer.readUInt32BE(offset);
	const start = offset + 4;
	const end = start + len;
	if (end > buffer.length) throw new Error("Malformed SSH key wire value");
	return { value: buffer.subarray(start, end), next: end };
}

export function encodeSshEd25519PublicKey(
	publicKey: crypto.KeyObject,
	comment = "",
): string {
	const type = Buffer.from("ssh-ed25519");
	const raw = rawPublicKeyFromDer(publicKey);
	const wire = Buffer.concat([Buffer.alloc(4), type, Buffer.alloc(4), raw]);
	wire.writeUInt32BE(type.length, 0);
	wire.writeUInt32BE(raw.length, 4 + type.length);
	return `ssh-ed25519 ${wire.toString("base64")}${comment ? ` ${comment}` : ""}`;
}

export function parseAuthorizedKey(line: string): TrustedKey {
	const parts = line.trim().split(/\s+/);
	if (parts.length < 2 || parts[0] !== "ssh-ed25519")
		throw new Error("Only ssh-ed25519 authorized keys are supported");
	const wire = Buffer.from(parts[1], "base64");
	const first = readSshString(wire, 0);
	if (first.value.toString("utf8") !== "ssh-ed25519")
		throw new Error("SSH key wire type mismatch");
	const second = readSshString(wire, first.next);
	if (second.next !== wire.length || second.value.length !== 32)
		throw new Error("Malformed ssh-ed25519 public key");
	const publicKey = publicKeyFromRaw(second.value);
	const fingerprint = crypto
		.createHash("sha256")
		.update(second.value)
		.digest("base64url");
	return {
		fingerprint,
		publicKey,
		comment: sanitizeValue(parts.slice(2).join(" ")),
	};
}

export function loadAuthorizedKeys(file: string): TrustedKey[] {
	if (!fs.existsSync(file)) return [];
	return fs
		.readFileSync(file, "utf8")
		.split(/\r?\n/)
		.filter((line) => line.trim() && !line.trim().startsWith("#"))
		.map(parseAuthorizedKey);
}

export function sanitizeValue(value: string): string {
	const cleaned = Array.from(value, (char) => {
		const code = char.charCodeAt(0);
		return code < 32 || char === "\\" ? "_" : char;
	}).join("");
	return cleaned
		.replace(/[A-Za-z]:\/[A-Za-z0-9_./-]+/g, "[path]")
		.replace(/\/[A-Za-z0-9_./-]{8,}/g, "[path]")
		.slice(0, MAX_AUDIT_VALUE);
}

export function serializeDiscoveryPacket(packet: DiscoveryPacket): string {
	return JSON.stringify({
		protocol: packet.protocol,
		version: packet.version,
		nodeId: packet.nodeId,
		hubInstanceId: packet.hubInstanceId,
		endpoint: packet.endpoint,
		label: sanitizeValue(packet.label),
	});
}

export function parseDiscoveryPacket(text: string): DiscoveryPacket {
	const parsed = JSON.parse(text) as DiscoveryPacket;
	if (parsed.protocol !== PROTOCOL || parsed.version !== VERSION)
		throw new Error("Unsupported discovery packet");
	if (!parsed.nodeId || !parsed.hubInstanceId || !parsed.endpoint)
		throw new Error("Incomplete discovery packet");
	return {
		protocol: PROTOCOL,
		version: VERSION,
		nodeId: parsed.nodeId,
		hubInstanceId: parsed.hubInstanceId,
		endpoint: parsed.endpoint,
		label: sanitizeValue(parsed.label ?? "unknown"),
	};
}

function projectLabel(cwd = process.cwd()): string {
	return sanitizeValue(path.basename(cwd) || "workspace");
}

function createState(dir: string, endpoint: string): HubState {
	const identityFile = path.join(dir, "identity.json");
	const nodeId = fs.existsSync(identityFile)
		? readJson<{ nodeId: string }>(identityFile).nodeId
		: randomId("node");
	if (!fs.existsSync(identityFile)) writeJson(identityFile, { nodeId });
	return {
		nodeId,
		hubInstanceId: randomId("hub"),
		pid: process.pid,
		endpoint,
		updatedAt: new Date().toISOString(),
	};
}

export class ComsLanHub {
	readonly dir: string;
	readonly state: HubState;
	readonly privateKey: crypto.KeyObject;
	readonly publicKey: crypto.KeyObject;
	readonly agents = new Map<string, AgentCard>();
	readonly trusted = new Map<string, TrustedKey>();
	readonly seenNonces = new Set<string>();
	private stopped = false;
	private udp?: dgram.Socket;

	constructor(options: ComsLanHubOptions = {}) {
		this.dir = stateRoot(options.stateDir);
		ensureDir(this.dir);
		const keys = options.privateKey
			? {
					privateKey: options.privateKey,
					publicKey: crypto.createPublicKey(options.privateKey),
				}
			: crypto.generateKeyPairSync("ed25519");
		this.privateKey = keys.privateKey;
		this.publicKey = keys.publicKey;
		this.state = createState(
			this.dir,
			options.endpoint ??
				`wss://127.0.0.1:${10000 + Math.floor(Math.random() * 50000)}`,
		);
		writeJson(path.join(this.dir, "hub-state.json"), this.state);
		for (const key of loadAuthorizedKeys(
			path.join(this.dir, "authorized_keys"),
		))
			this.trusted.set(key.fingerprint, key);
		hubs.set(this.state.nodeId, this);
	}

	registerAgent(
		card: Omit<AgentCard, "instanceId"> & { instanceId?: string },
	): AgentCard {
		const agent = {
			...card,
			instanceId: card.instanceId ?? randomId("inst"),
			projectLabel: sanitizeValue(card.projectLabel || projectLabel()),
		};
		this.agents.set(agent.agentId, agent);
		return agent;
	}

	importTrustedKey(line: string): string {
		const key = parseAuthorizedKey(line);
		this.trusted.set(key.fingerprint, key);
		const parts = line.trim().split(/\s+/);
		const safeLine = `${parts[0]} ${parts[1]} ${key.comment}`.trim();
		fs.appendFileSync(path.join(this.dir, "authorized_keys"), `${safeLine}\n`, {
			mode: 0o600,
		});
		this.audit({
			type: "trust_change",
			nodeId: this.state.nodeId,
			result: "imported",
		});
		return key.fingerprint;
	}

	removeTrustedKey(fingerprint: string): void {
		this.trusted.delete(fingerprint);
		const file = path.join(this.dir, "authorized_keys");
		const lines = fs.existsSync(file)
			? fs.readFileSync(file, "utf8").split(/\r?\n/)
			: [];
		fs.writeFileSync(
			file,
			`${lines.filter((line) => line && parseAuthorizedKey(line).fingerprint !== fingerprint).join("\n")}\n`,
			{ mode: 0o600 },
		);
		this.audit({
			type: "trust_change",
			nodeId: this.state.nodeId,
			result: "removed",
		});
	}

	listTrustedKeys(): string[] {
		return [...this.trusted.keys()];
	}

	discoveryPacket(): DiscoveryPacket {
		return {
			protocol: PROTOCOL,
			version: VERSION,
			nodeId: this.state.nodeId,
			hubInstanceId: this.state.hubInstanceId,
			endpoint: this.state.endpoint,
			label: projectLabel(),
		};
	}

	async startUdpDiscovery(port = 0): Promise<number> {
		this.udp = dgram.createSocket("udp4");
		await new Promise<void>((resolve) =>
			this.udp?.bind(port, "127.0.0.1", resolve),
		);
		this.udp.on("message", (message) => {
			const packet = parseDiscoveryPacket(message.toString("utf8"));
			this.audit({
				type: "discovery",
				nodeId: this.state.nodeId,
				remoteNodeId: packet.nodeId,
				result: "seen",
			});
		});
		const address = this.udp.address();
		return typeof address === "string" ? 0 : address.port;
	}

	sendDiscovery(port: number): void {
		const socket = dgram.createSocket("udp4");
		socket.send(
			Buffer.from(serializeDiscoveryPacket(this.discoveryPacket())),
			port,
			"127.0.0.1",
			() => socket.close(),
		);
	}

	authenticate(remote: ComsLanHub, endpoint = remote.state.endpoint): void {
		if (!endpoint.startsWith("wss://"))
			throw new Error("Hub transport must use wss://");
		const nonce = crypto.randomBytes(24).toString("base64url");
		const transcript = [
			PROTOCOL,
			VERSION,
			this.state.nodeId,
			this.state.hubInstanceId,
			remote.state.nodeId,
			remote.state.hubInstanceId,
			endpoint,
			nonce,
			remote.tlsFingerprint(),
		].join("|");
		const signature = crypto.sign(
			null,
			Buffer.from(transcript),
			this.privateKey,
		);
		remote.verifyAuth(
			this.publicKey,
			signature,
			transcript,
			nonce,
			this.state.nodeId,
		);
		this.audit({
			type: "auth_success",
			nodeId: this.state.nodeId,
			remoteNodeId: remote.state.nodeId,
			result: "ok",
		});
	}

	verifyAuth(
		publicKey: crypto.KeyObject,
		signature: Buffer,
		transcript: string,
		nonce: string,
		remoteNodeId: string,
	): void {
		const fingerprint = crypto
			.createHash("sha256")
			.update(rawPublicKeyFromDer(publicKey))
			.digest("base64url");
		if (!this.trusted.has(fingerprint)) {
			this.audit({
				type: "auth_failure",
				nodeId: this.state.nodeId,
				remoteNodeId,
				result: "denied",
				reason: "unknown_key",
			});
			throw new Error("Remote hub key is not trusted");
		}
		if (this.seenNonces.has(nonce)) throw new Error("Replay nonce rejected");
		if (!crypto.verify(null, Buffer.from(transcript), publicKey, signature))
			throw new Error("Invalid hub signature");
		if (!transcript.includes(this.tlsFingerprint()))
			throw new Error("TLS channel binding mismatch");
		this.seenNonces.add(nonce);
		this.audit({
			type: "auth_success",
			nodeId: this.state.nodeId,
			remoteNodeId,
			result: "ok",
		});
	}

	sendPrompt(
		remoteNodeId: string,
		body: string,
		agentLabel = "all-agents",
	): MessageEnvelope {
		const remote = hubs.get(remoteNodeId);
		if (!remote) throw new Error("Unknown remote hub");
		this.authenticate(remote);
		if (
			agentLabel !== "all-agents" &&
			![...remote.agents.values()].some(
				(agent) => agent.projectLabel === agentLabel,
			)
		)
			throw new Error("No authorized matching remote agent label");
		const message: MessageEnvelope = {
			messageId: randomId("msg"),
			fromNodeId: this.state.nodeId,
			toNodeId: remoteNodeId,
			ttl: DEFAULT_TTL,
			type: "prompt",
			body,
		};
		this.audit({
			type: "outbound_message",
			nodeId: this.state.nodeId,
			remoteNodeId,
			messageId: message.messageId,
			result: "sent",
		});
		return remote.receiveMessage(message);
	}

	receiveMessage(message: MessageEnvelope): MessageEnvelope {
		if (message.toNodeId !== this.state.nodeId || message.ttl < 1)
			throw new Error("Invalid message envelope");
		this.audit({
			type: "inbound_message",
			nodeId: this.state.nodeId,
			remoteNodeId: message.fromNodeId,
			messageId: message.messageId,
			result: "received",
		});
		return {
			messageId: randomId("msg"),
			fromNodeId: this.state.nodeId,
			toNodeId: message.fromNodeId,
			ttl: DEFAULT_TTL,
			type: "response",
			body: "ok",
			correlationId: message.messageId,
		};
	}

	tlsFingerprint(): string {
		return crypto
			.createHash("sha256")
			.update(this.state.nodeId)
			.digest("base64url");
	}

	audit(event: AuditEvent): void {
		const file = path.join(this.dir, "audit.jsonl");
		if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES)
			fs.renameSync(file, path.join(this.dir, "audit.jsonl.1"));
		const clean: Record<string, string> = {
			ts: new Date().toISOString(),
			type: sanitizeValue(event.type),
			nodeId: sanitizeValue(event.nodeId),
		};
		for (const key of [
			"remoteNodeId",
			"messageId",
			"result",
			"reason",
		] as const)
			if (event[key]) clean[key] = sanitizeValue(event[key]);
		fs.appendFileSync(file, `${JSON.stringify(clean)}\n`, { mode: 0o600 });
	}

	stop(): void {
		if (this.stopped) return;
		this.stopped = true;
		this.udp?.close();
		hubs.delete(this.state.nodeId);
	}
}

export function createComsLanHub(options: ComsLanHubOptions = {}): ComsLanHub {
	requireComsLanEnabled();
	return new ComsLanHub(options);
}

export default function (pi: ExtensionAPI) {
	if (!isComsLanEnabled()) return;

	pi.registerTool({
		name: "coms_lan_trust_import",
		label: "Coms LAN Trust Import",
		description:
			"Import an ssh-ed25519 public key into the local coms-lan authorized_keys file.",
		parameters: Type.Object({ authorizedKey: Type.String() }),
		async execute(_id, params) {
			const hub = createComsLanHub();
			const fingerprint = hub.importTrustedKey(params.authorizedKey);
			return {
				content: [{ type: "text", text: fingerprint }],
				details: { source: "coms-lan" },
			};
		},
	});
	pi.registerTool({
		name: "coms_lan_trust_list",
		label: "Coms LAN Trust List",
		description: "List trusted coms-lan public key fingerprints.",
		parameters: Type.Object({}),
		async execute() {
			const hub = createComsLanHub();
			return {
				content: [{ type: "text", text: hub.listTrustedKeys().join("\n") }],
				details: { source: "coms-lan" },
			};
		},
	});
	pi.registerTool({
		name: "coms_lan_trust_remove",
		label: "Coms LAN Trust Remove",
		description: "Remove a trusted coms-lan public key fingerprint.",
		parameters: Type.Object({ fingerprint: Type.String() }),
		async execute(_id, params) {
			const hub = createComsLanHub();
			hub.removeTrustedKey(params.fingerprint);
			return {
				content: [{ type: "text", text: "removed" }],
				details: { source: "coms-lan" },
			};
		},
	});
}
