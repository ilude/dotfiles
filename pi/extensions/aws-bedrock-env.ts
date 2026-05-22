import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_PROFILE = "default";
const DEFAULT_REGION = "us-east-2";

type IniSections = Map<string, Record<string, string>>;

function resolveHomePath(filePath: string): string {
	if (filePath === "~") return os.homedir();
	if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
		return path.join(os.homedir(), filePath.slice(2));
	}
	return filePath;
}

function awsCredentialsPath(): string {
	return resolveHomePath(
		process.env.AWS_SHARED_CREDENTIALS_FILE ??
			path.join(os.homedir(), ".aws", "credentials"),
	);
}

function awsConfigPath(): string {
	return resolveHomePath(
		process.env.AWS_CONFIG_FILE ?? path.join(os.homedir(), ".aws", "config"),
	);
}

function parseIni(content: string): IniSections {
	const sections: IniSections = new Map();
	let current: Record<string, string> | undefined;

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith(";")) continue;

		const sectionMatch = /^\[([^\]]+)]$/.exec(line);
		if (sectionMatch) {
			const sectionName = sectionMatch[1];
			if (!sectionName) continue;
			current = {};
			sections.set(sectionName.trim(), current);
			continue;
		}

		if (!current) continue;
		const delimiter = line.indexOf("=");
		if (delimiter < 0) continue;
		const key = line.slice(0, delimiter).trim();
		const value = line.slice(delimiter + 1).trim();
		if (key) current[key] = value;
	}

	return sections;
}

function readIni(filePath: string): IniSections {
	if (!fs.existsSync(filePath)) return new Map();
	return parseIni(fs.readFileSync(filePath, "utf-8"));
}

function hasBedrockAuthEnv(): boolean {
	return Boolean(
		process.env.AWS_PROFILE ||
			(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
			process.env.AWS_BEARER_TOKEN_BEDROCK ||
			process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
			process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
			process.env.AWS_WEB_IDENTITY_TOKEN_FILE,
	);
}

function profileHasCredentialValues(
	profile: Record<string, string> | undefined,
): boolean {
	if (!profile) return false;
	return Boolean(
		(profile.aws_access_key_id && profile.aws_secret_access_key) ||
			profile.aws_session_token ||
			profile.sso_session ||
			profile.sso_start_url ||
			profile.credential_process ||
			profile.role_arn ||
			profile.web_identity_token_file,
	);
}

function selectCredentialsProfile(
	credentials: IniSections,
): string | undefined {
	if (profileHasCredentialValues(credentials.get(DEFAULT_PROFILE))) {
		return DEFAULT_PROFILE;
	}

	const credentialProfiles = [...credentials.entries()]
		.filter(([, values]) => profileHasCredentialValues(values))
		.map(([name]) => name);

	return credentialProfiles.length === 1 ? credentialProfiles[0] : undefined;
}

function configSectionName(profile: string): string {
	return profile === DEFAULT_PROFILE ? DEFAULT_PROFILE : `profile ${profile}`;
}

function readRegion(profile: string): string | undefined {
	const config = readIni(awsConfigPath());
	return (
		config.get(configSectionName(profile))?.region ??
		config.get(DEFAULT_PROFILE)?.region
	);
}

function configureAwsBedrockEnvironment(): void {
	let profile = process.env.AWS_PROFILE;

	if (!profile && !hasBedrockAuthEnv()) {
		profile = selectCredentialsProfile(readIni(awsCredentialsPath()));
		if (profile) process.env.AWS_PROFILE = profile;
	}

	if (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION) return;

	const region = readRegion(profile ?? DEFAULT_PROFILE) ?? DEFAULT_REGION;
	process.env.AWS_REGION = region;
}

export default function awsBedrockEnv(_pi: ExtensionAPI): void {
	configureAwsBedrockEnvironment();
}
