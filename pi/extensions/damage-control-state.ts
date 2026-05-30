export type SequenceAction = "ask" | "block";

type SensitiveCategory =
	| "env"
	| "ssh_key"
	| "aws_creds"
	| "tfstate"
	| "kubeconfig"
	| "secret_config";
type DiscoverySource = "glob" | "grep";
type NetworkSink =
	| "http_upload"
	| "cloud_upload"
	| "remote_copy"
	| "remote_shell"
	| "dns_lookup";

interface BaseSessionEvent {
	toolName: string;
	summary: string;
	timestamp: number;
}

interface SensitiveReadEvent extends BaseSessionEvent {
	kind: "sensitive_read";
	category: SensitiveCategory;
	path: string;
}

interface CredentialDiscoveryEvent extends BaseSessionEvent {
	kind: "credential_discovery";
	source: DiscoverySource;
	pattern: string;
}

interface NetworkSinkEvent extends BaseSessionEvent {
	kind: "network_sink";
	sink: NetworkSink;
}

interface DbDumpEvent extends BaseSessionEvent {
	kind: "db_dump";
}

type SessionEvent =
	| SensitiveReadEvent
	| CredentialDiscoveryEvent
	| NetworkSinkEvent
	| DbDumpEvent;

export interface SequenceEvidenceEvent {
	kind: SessionEvent["kind"];
	category?: string;
	summary: string;
	ageMs: number;
}

export interface SequenceDecision {
	action: SequenceAction;
	reason: string;
	name: string;
	evidence?: {
		priorEvents: SequenceEvidenceEvent[];
		currentEvent: SequenceEvidenceEvent;
	};
}

const HISTORY_LIMIT = 50;
const HISTORY_EXPIRY_MS = 30 * 60 * 1000;

function classifySensitivePath(path: string): SensitiveCategory | undefined {
	if (/\.env(?:$|[./\\])/i.test(path)) return "env";
	if (/id_(?:rsa|ed25519|ecdsa)$|\.(?:pem|key)$/i.test(path)) return "ssh_key";
	if (/\.aws[\\/](?:credentials|config)$/i.test(path)) return "aws_creds";
	if (/\.tfstate$/i.test(path)) return "tfstate";
	if (/(?:\.kube[\\/]config|kubeconfig)$/i.test(path)) return "kubeconfig";
	if (/credentials\.json$|secrets\.ya?ml$|database\.ya?ml$/i.test(path))
		return "secret_config";
	return undefined;
}

function classifyCredentialDiscovery(
	toolName: string,
	summary: string,
): CredentialDiscoveryEvent["source"] | undefined {
	if (!/credentials|secret|\.aws|\.ssh|\.env|password|token/i.test(summary))
		return undefined;
	if (toolName === "glob") return "glob";
	if (toolName === "grep") return "grep";
	return undefined;
}

function classifyNetworkSink(command: string): NetworkSink | undefined {
	if (
		/\bcurl\b/i.test(command) &&
		/(?:\s|^)(?:-d|--data|--data-raw|--data-binary|--form|-F|-T|--upload-file)\b/i.test(
			command,
		)
	) {
		return "http_upload";
	}
	if (
		/\bwget\b/i.test(command) &&
		/(?:--post-data|--post-file|--body-file)/i.test(command)
	) {
		return "http_upload";
	}
	if (/\b(?:nc|ncat|netcat)\b|\/dev\/(?:tcp|udp)\//i.test(command))
		return "http_upload";
	if (
		/\b(?:aws\s+s3\s+cp|aws\s+s3\s+sync|gsutil\s+cp|az\s+storage\b|rclone\s+(?:copy|sync|move))\b/i.test(
			command,
		)
	) {
		return "cloud_upload";
	}
	if (/\bscp\b/i.test(command) || /\brsync\b.*\S+:/i.test(command))
		return "remote_copy";
	if (
		/\bssh\b/i.test(command) &&
		/(?:<<|\s(?:bash|sh|zsh)\b|\s\S+@?\S+\s+['"]?\w)/i.test(command)
	)
		return "remote_shell";
	if (/\b(?:dig|nslookup|host)\b/i.test(command)) return "dns_lookup";
	return undefined;
}

function classifyEvent(
	toolName: string,
	summary: string,
	timestamp = Date.now(),
): SessionEvent | undefined {
	if (toolName === "read") {
		const category = classifySensitivePath(summary);
		if (category) {
			return {
				kind: "sensitive_read",
				toolName,
				summary,
				timestamp,
				category,
				path: summary,
			};
		}
	}
	const source = classifyCredentialDiscovery(toolName, summary);
	if (source) {
		return {
			kind: "credential_discovery",
			toolName,
			summary,
			timestamp,
			source,
			pattern: summary,
		};
	}
	if (toolName === "bash") {
		if (/\b(?:pg_dump|mysqldump|mongodump)\b/i.test(summary)) {
			return { kind: "db_dump", toolName, summary, timestamp };
		}
		const sink = classifyNetworkSink(summary);
		if (sink)
			return { kind: "network_sink", toolName, summary, timestamp, sink };
	}
	return undefined;
}

function eventCategory(event: SessionEvent): string | undefined {
	if (event.kind === "sensitive_read") return event.category;
	if (event.kind === "credential_discovery") return event.source;
	if (event.kind === "network_sink") return event.sink;
	return undefined;
}

function evidenceEvent(
	event: SessionEvent,
	now: number,
): SequenceEvidenceEvent {
	return {
		kind: event.kind,
		category: eventCategory(event),
		summary: event.summary,
		ageMs: Math.max(0, now - event.timestamp),
	};
}

function makeDecision(input: {
	action: SequenceAction;
	name: string;
	reason: string;
	priorEvents: SessionEvent[];
	currentEvent: SessionEvent;
	now: number;
}): SequenceDecision {
	const priorSummary = input.priorEvents
		.map(
			(event) =>
				`${event.kind}${eventCategory(event) ? `:${eventCategory(event)}` : ""} (${event.summary})`,
		)
		.join("; ");
	const currentCategory = eventCategory(input.currentEvent);
	const currentSummary = `${input.currentEvent.kind}${currentCategory ? `:${currentCategory}` : ""} (${input.currentEvent.summary})`;
	return {
		action: input.action,
		name: input.name,
		reason: `${input.reason} Prior: ${priorSummary}. Current: ${currentSummary}.`,
		evidence: {
			priorEvents: input.priorEvents.map((event) =>
				evidenceEvent(event, input.now),
			),
			currentEvent: evidenceEvent(input.currentEvent, input.now),
		},
	};
}

export class DamageControlSessionState {
	private readonly history: SessionEvent[] = [];

	record(toolName: string, summary: string): void {
		this.prune();
		const event = classifyEvent(toolName, summary);
		if (!event) return;
		this.history.push(event);
		while (this.history.length > HISTORY_LIMIT) this.history.shift();
	}

	check(toolName: string, summary: string): SequenceDecision | undefined {
		this.prune();
		if (toolName !== "bash") return undefined;
		const currentEvent = classifyEvent(toolName, summary);
		if (currentEvent?.kind !== "network_sink") return undefined;
		if (currentEvent.sink === "dns_lookup") return undefined;
		const now = Date.now();
		const envRead = this.findSensitive("env");
		const envDiscovery = this.findDiscovery("glob");
		if (
			envRead &&
			envDiscovery &&
			["http_upload", "cloud_upload", "remote_copy"].includes(currentEvent.sink)
		) {
			return makeDecision({
				action: "block",
				name: "env_enumeration_to_exfil",
				reason:
					"Environment file discovery and read followed by an upload-capable command.",
				priorEvents: [envDiscovery, envRead],
				currentEvent,
				now,
			});
		}
		const sensitive = this.findLast(
			(event): event is SensitiveReadEvent => event.kind === "sensitive_read",
		);
		if (
			sensitive &&
			["http_upload", "cloud_upload", "remote_copy"].includes(currentEvent.sink)
		) {
			return makeDecision({
				action: "ask",
				name: "sensitive_file_to_upload",
				reason:
					"Sensitive file was recently read and the current command can upload data.",
				priorEvents: [sensitive],
				currentEvent,
				now,
			});
		}
		const discovery = this.findLast(
			(event): event is CredentialDiscoveryEvent =>
				event.kind === "credential_discovery",
		);
		if (
			discovery &&
			["http_upload", "cloud_upload", "remote_copy"].includes(currentEvent.sink)
		) {
			return makeDecision({
				action: "ask",
				name: "credential_search_to_upload",
				reason: "Credential search followed by an upload-capable command.",
				priorEvents: [discovery],
				currentEvent,
				now,
			});
		}
		const dbDump = this.findLast(
			(event): event is DbDumpEvent => event.kind === "db_dump",
		);
		if (dbDump && currentEvent.sink === "cloud_upload") {
			return makeDecision({
				action: "ask",
				name: "db_dump_to_cloud",
				reason: "Database dump followed by cloud upload.",
				priorEvents: [dbDump],
				currentEvent,
				now,
			});
		}
		return undefined;
	}

	private findSensitive(
		category: SensitiveCategory,
	): SensitiveReadEvent | undefined {
		return this.findLast(
			(event): event is SensitiveReadEvent =>
				event.kind === "sensitive_read" && event.category === category,
		);
	}

	private findDiscovery(
		source: DiscoverySource,
	): CredentialDiscoveryEvent | undefined {
		return this.findLast(
			(event): event is CredentialDiscoveryEvent =>
				event.kind === "credential_discovery" && event.source === source,
		);
	}

	private findLast<T extends SessionEvent>(
		predicate: (event: SessionEvent) => event is T,
	): T | undefined {
		for (let i = this.history.length - 1; i >= 0; i -= 1) {
			const event = this.history[i];
			if (predicate(event)) return event;
		}
		return undefined;
	}

	private prune(): void {
		const cutoff = Date.now() - HISTORY_EXPIRY_MS;
		while (this.history.length > 0 && this.history[0].timestamp < cutoff) {
			this.history.shift();
		}
	}
}

export function outputContainsSecret(content: unknown): boolean {
	const text = JSON.stringify(content ?? "");
	return /-----BEGIN [A-Z ]*PRIVATE KEY-----|AWS_SECRET_ACCESS_KEY\s*=|api[_-]?key\s*[:=]|password\s*[:=]|token\s*[:=]/i.test(
		text,
	);
}

export default function damageControlStateModule(): void {
	// No-op default keeps Pi top-level extension auto-discovery from failing.
}
