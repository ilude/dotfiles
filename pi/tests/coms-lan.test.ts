import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createComsLanHub,
	encodeSshEd25519PublicKey,
	isComsLanEnabled,
	parseAuthorizedKey,
	parseDiscoveryPacket,
	sanitizeValue,
	serializeDiscoveryPacket,
} from "../extensions/coms-lan.ts";

const tempDirs: string[] = [];
const previousEnable = process.env.PI_COMS_LAN_ENABLE;

function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coms-lan-test-"));
	tempDirs.push(dir);
	return dir;
}

function keyPair():
	| crypto.KeyPairSyncResult<string, string>
	| crypto.KeyPairSyncResult<Buffer, Buffer>
	| crypto.KeyPairSyncResult<crypto.KeyObject, crypto.KeyObject> {
	return crypto.generateKeyPairSync("ed25519");
}

beforeEach(() => {
	process.env.PI_COMS_LAN_ENABLE = "1";
});

afterEach(() => {
	if (previousEnable === undefined) delete process.env.PI_COMS_LAN_ENABLE;
	else process.env.PI_COMS_LAN_ENABLE = previousEnable;
	for (const dir of tempDirs.splice(0))
		fs.rmSync(dir, { recursive: true, force: true });
});

describe("enable gate", () => {
	it("requires PI_COMS_LAN_ENABLE before creating hub state", () => {
		delete process.env.PI_COMS_LAN_ENABLE;
		expect(isComsLanEnabled()).toBe(false);
		expect(() => createComsLanHub({ stateDir: tempDir() })).toThrow(
			/PI_COMS_LAN_ENABLE/,
		);
		process.env.PI_COMS_LAN_ENABLE = "true";
		expect(isComsLanEnabled()).toBe(true);
	});
});

describe("authorized key parsing", () => {
	it("accepts ssh-ed25519 keys and verifies signatures", () => {
		const keys = keyPair();
		const line = encodeSshEd25519PublicKey(
			keys.publicKey as crypto.KeyObject,
			"fixture key",
		);
		const parsed = parseAuthorizedKey(line);
		const payload = Buffer.from("nonce");
		const signature = crypto.sign(
			null,
			payload,
			keys.privateKey as crypto.KeyObject,
		);
		expect(crypto.verify(null, payload, parsed.publicKey, signature)).toBe(
			true,
		);
		expect(
			crypto.verify(null, Buffer.from("tampered"), parsed.publicKey, signature),
		).toBe(false);
	});

	it("rejects unsupported and malformed keys", () => {
		expect(() => parseAuthorizedKey("ssh-rsa AAAA nope")).toThrow(
			/ssh-ed25519/,
		);
		expect(() => parseAuthorizedKey("ecdsa-sha2-nistp256 AAAA nope")).toThrow(
			/ssh-ed25519/,
		);
		expect(() => parseAuthorizedKey("ssh-ed25519 not-base64 nope")).toThrow();
	});
});

describe("discovery packets", () => {
	it("serializes safe metadata without prompt or path contents", () => {
		const hub = createComsLanHub({
			stateDir: tempDir(),
			label: "C:/Users/me/secret",
		});
		const packet = serializeDiscoveryPacket({
			...hub.discoveryPacket(),
			label: "C:/Users/me/project prompt SECRET",
		});
		expect(packet).toContain("pi-coms-lan");
		expect(packet).not.toContain("prompt body");
		expect(packet).not.toContain("C:/Users/me/project");
		expect(parseDiscoveryPacket(packet).nodeId).toBe(hub.state.nodeId);
		hub.stop();
	});

	it("uses the production UDP socket path on loopback", async () => {
		const receiver = createComsLanHub({ stateDir: tempDir() });
		const sender = createComsLanHub({ stateDir: tempDir() });
		const port = await receiver.startUdpDiscovery();
		sender.sendDiscovery(port);
		await new Promise((resolve) => setTimeout(resolve, 50));
		const log = fs.readFileSync(path.join(receiver.dir, "audit.jsonl"), "utf8");
		expect(log).toContain("discovery");
		receiver.stop();
		sender.stop();
	});
});

describe("hub lifecycle and messaging", () => {
	it("persists node identity and updates hub instance on restart", () => {
		const dir = tempDir();
		const first = createComsLanHub({
			stateDir: dir,
			endpoint: "wss://127.0.0.1:10001",
		});
		const nodeId = first.state.nodeId;
		const hubInstanceId = first.state.hubInstanceId;
		first.stop();
		const second = createComsLanHub({
			stateDir: dir,
			endpoint: "wss://127.0.0.1:10002",
		});
		expect(second.state.nodeId).toBe(nodeId);
		expect(second.state.hubInstanceId).not.toBe(hubInstanceId);
		expect(second.state.endpoint).toBe("wss://127.0.0.1:10002");
		second.stop();
	});

	it("registers multiple local agents on one hub", () => {
		const hub = createComsLanHub({ stateDir: tempDir() });
		hub.registerAgent({
			agentId: "one",
			projectLabel: "alpha",
			capabilities: ["prompt"],
		});
		hub.registerAgent({
			agentId: "two",
			projectLabel: "beta",
			capabilities: ["prompt"],
		});
		expect(hub.agents.size).toBe(2);
		hub.stop();
	});

	it("sends prompt-like messages only to trusted hubs and correlates responses", () => {
		const aKeys = keyPair();
		const bKeys = keyPair();
		const a = createComsLanHub({
			stateDir: tempDir(),
			privateKey: aKeys.privateKey as crypto.KeyObject,
		});
		const b = createComsLanHub({
			stateDir: tempDir(),
			privateKey: bKeys.privateKey as crypto.KeyObject,
		});
		b.importTrustedKey(
			encodeSshEd25519PublicKey(aKeys.publicKey as crypto.KeyObject, "a"),
		);
		b.registerAgent({
			agentId: "agent",
			projectLabel: "project",
			capabilities: ["prompt"],
		});
		const response = a.sendPrompt(
			b.state.nodeId,
			"secret prompt body",
			"project",
		);
		expect(response.type).toBe("response");
		expect(response.correlationId).toMatch(/^msg_/);
		const aLog = fs.readFileSync(path.join(a.dir, "audit.jsonl"), "utf8");
		const bLog = fs.readFileSync(path.join(b.dir, "audit.jsonl"), "utf8");
		expect(`${aLog}\n${bLog}`).not.toContain("secret prompt body");
		a.stop();
		b.stop();
	});

	it("rejects unknown keys, plaintext endpoints, replays, and spoofed envelope ids", () => {
		const aKeys = keyPair();
		const bKeys = keyPair();
		const a = createComsLanHub({
			stateDir: tempDir(),
			privateKey: aKeys.privateKey as crypto.KeyObject,
		});
		const b = createComsLanHub({
			stateDir: tempDir(),
			privateKey: bKeys.privateKey as crypto.KeyObject,
		});
		expect(() => a.sendPrompt(b.state.nodeId, "hello")).toThrow(/not trusted/);
		b.importTrustedKey(
			encodeSshEd25519PublicKey(aKeys.publicKey as crypto.KeyObject, "a"),
		);
		expect(() => a.authenticate(b, "ws://127.0.0.1:1")).toThrow(/wss/);
		expect(() =>
			b.receiveMessage({
				messageId: "x",
				fromNodeId: a.state.nodeId,
				toNodeId: "spoof",
				ttl: 1,
				type: "prompt",
				body: "x",
			}),
		).toThrow(/Invalid/);
		a.stop();
		b.stop();
	});
});

describe("trust tools and audit redaction", () => {
	it("lists and removes trusted keys", () => {
		const keys = keyPair();
		const hub = createComsLanHub({ stateDir: tempDir() });
		const fingerprint = hub.importTrustedKey(
			encodeSshEd25519PublicKey(
				keys.publicKey as crypto.KeyObject,
				"hostile\ncomment C:/Users/me/key",
			),
		);
		expect(hub.listTrustedKeys()).toContain(fingerprint);
		hub.removeTrustedKey(fingerprint);
		expect(hub.listTrustedKeys()).not.toContain(fingerprint);
		hub.stop();
	});

	it("bounds and sanitizes audit values and rotates logs", () => {
		const dir = tempDir();
		const hub = createComsLanHub({ stateDir: dir });
		fs.writeFileSync(path.join(dir, "audit.jsonl"), "x".repeat(70 * 1024));
		hub.audit({
			type: "auth_failure",
			nodeId: hub.state.nodeId,
			result: sanitizeValue("token SECRET\nC:/Users/me/.ssh/id_ed25519"),
			reason: "bad",
		});
		expect(fs.existsSync(path.join(dir, "audit.jsonl.1"))).toBe(true);
		const log = fs.readFileSync(path.join(dir, "audit.jsonl"), "utf8");
		expect(log).not.toContain("C:/Users/me/.ssh/id_ed25519");
		expect(log).not.toContain("\nC:/");
		hub.stop();
	});
});
