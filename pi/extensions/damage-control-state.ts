export type SequenceAction = "ask" | "block";

export interface DamageControlHistoryEntry {
	toolName: string;
	summary: string;
	timestamp: number;
}

export interface SequenceDecision {
	action: SequenceAction;
	reason: string;
	name: string;
}

const HISTORY_LIMIT = 50;
const HISTORY_EXPIRY_MS = 30 * 60 * 1000;
const SENSITIVE_PATH =
	/\.(?:env|pem|key|tfstate|credentials)$|id_(?:rsa|ed25519|ecdsa)$|\.aws[\\/](?:credentials|config)$|\.kube[\\/]config$|credentials\.json$|secrets\.ya?ml$|database\.ya?ml$/i;
const CREDENTIAL_SEARCH =
	/credentials|secret|\.aws|\.ssh|\.env|password|token/i;
const NETWORK_COMMAND =
	/\b(?:curl|wget|nc|ncat|netcat|dig|nslookup|host|ssh|scp|rsync)\b|\/dev\/(?:tcp|udp)\//i;
const CLOUD_UPLOAD = /\b(?:aws\s+s3|gsutil|az\s+storage|rclone)\b/i;
const DATABASE_DUMP = /\b(?:pg_dump|mysqldump|mongodump)\b/i;
const ENV_PATH = /\.env/i;
const AWS_CREDS = /\.aws[\\/](?:credentials|config)/i;
const SSH_KEY = /id_(?:rsa|ed25519|ecdsa)$/i;
const TFSTATE = /\.tfstate$/i;
const KUBECONFIG = /(?:\.kube[\\/]config|kubeconfig)/i;

export class DamageControlSessionState {
	private readonly history: DamageControlHistoryEntry[] = [];

	record(toolName: string, summary: string): void {
		this.prune();
		this.history.push({ toolName, summary, timestamp: Date.now() });
		while (this.history.length > HISTORY_LIMIT) this.history.shift();
	}

	check(toolName: string, summary: string): SequenceDecision | undefined {
		this.prune();
		if (toolName !== "bash") return undefined;
		if (
			NETWORK_COMMAND.test(summary) &&
			this.has("glob", ENV_PATH) &&
			this.has("read", ENV_PATH)
		) {
			return {
				action: "block",
				name: "env_enumeration_to_exfil",
				reason:
					"Environment file enumeration and read followed by network command.",
			};
		}
		if (NETWORK_COMMAND.test(summary)) {
			if (this.has("read", SENSITIVE_PATH)) {
				return {
					action: "ask",
					name: "sensitive_file_to_network",
					reason:
						"Sensitive file was recently read. Network command could exfiltrate data.",
				};
			}
			if (this.has("read", SSH_KEY)) {
				return {
					action: "ask",
					name: "ssh_key_to_network",
					reason:
						"SSH private key was recently read. Verify network command intent.",
				};
			}
			if (this.has("read", TFSTATE)) {
				return {
					action: "ask",
					name: "tfstate_to_network",
					reason: "Terraform state may contain secrets and was recently read.",
				};
			}
			if (this.has("read", KUBECONFIG)) {
				return {
					action: "ask",
					name: "kubeconfig_to_network",
					reason:
						"Kubernetes config was recently read. Verify network command intent.",
				};
			}
			if (this.has("glob", CREDENTIAL_SEARCH)) {
				return {
					action: "ask",
					name: "credential_search_to_network",
					reason:
						"Credential search followed by network command - verify intent.",
				};
			}
		}
		if (/\baws\s+s3\b/i.test(summary) && this.has("read", AWS_CREDS)) {
			return {
				action: "ask",
				name: "aws_creds_to_s3",
				reason:
					"AWS credentials were recently read. Verify S3 destination is authorized.",
			};
		}
		if (CLOUD_UPLOAD.test(summary) && this.has("bash", DATABASE_DUMP)) {
			return {
				action: "ask",
				name: "db_dump_to_cloud",
				reason:
					"Database dump followed by cloud upload - verify destination is authorized.",
			};
		}
		return undefined;
	}

	private has(toolName: string, pattern: RegExp): boolean {
		return this.history.some(
			(entry) => entry.toolName === toolName && pattern.test(entry.summary),
		);
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
