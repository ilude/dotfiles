export interface BedrockAuthEnvironment {
	AWS_PROFILE?: string;
	AWS_DEFAULT_PROFILE?: string;
	AWS_REGION?: string;
	AWS_DEFAULT_REGION?: string;
	AWS_ACCESS_KEY_ID?: string;
	AWS_SECRET_ACCESS_KEY?: string;
	AWS_BEARER_TOKEN_BEDROCK?: string;
	AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?: string;
	AWS_CONTAINER_CREDENTIALS_FULL_URI?: string;
	AWS_WEB_IDENTITY_TOKEN_FILE?: string;
}

export interface BedrockTargetInput {
	explicitProfile?: string;
	explicitRegion?: string;
	providerEnv?: BedrockAuthEnvironment;
	processEnv?: BedrockAuthEnvironment;
	inferredProfile?: string;
	profileRegions?: Readonly<Record<string, string>>;
	fallbackRegion?: string;
}

export interface BedrockTarget {
	profile?: string;
	region: string;
	credentialSource: "profile" | "non-profile" | "default-chain";
}

export type IniSections = Map<string, Record<string, string>>;

export function parseAwsIni(content: string): IniSections {
	const sections: IniSections = new Map();
	let current: Record<string, string> | undefined;

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith(";")) continue;
		const sectionMatch = /^\[([^\]]+)]$/.exec(line);
		if (sectionMatch?.[1]) {
			current = {};
			sections.set(sectionMatch[1].trim(), current);
			continue;
		}
		if (!current) continue;
		const delimiter = line.indexOf("=");
		if (delimiter < 0) continue;
		const key = line.slice(0, delimiter).trim();
		if (key) current[key] = line.slice(delimiter + 1).trim();
	}

	return sections;
}

export function awsProfileRegions(
	sections: IniSections,
): Record<string, string> {
	const regions: Record<string, string> = {};
	for (const [section, values] of sections) {
		if (section !== "default" && !section.startsWith("profile ")) continue;
		const profile =
			section === "default" ? "default" : section.replace(/^profile\s+/, "");
		if (values.region) regions[profile] = values.region;
	}
	return regions;
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

export function selectBedrockCredentialsProfile(
	credentials: IniSections,
): string | undefined {
	if (profileHasCredentialValues(credentials.get("default"))) return "default";
	const profiles = [...credentials.entries()]
		.filter(([, values]) => profileHasCredentialValues(values))
		.map(([name]) => name);
	return profiles.length === 1 ? profiles[0] : undefined;
}

export function hasNonProfileBedrockAuth(
	env: BedrockAuthEnvironment | undefined,
): boolean {
	if (!env) return false;
	return Boolean(
		(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) ||
			env.AWS_BEARER_TOKEN_BEDROCK ||
			env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
			env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
			env.AWS_WEB_IDENTITY_TOKEN_FILE,
	);
}

function selectedProfile(
	env: BedrockAuthEnvironment | undefined,
): string | undefined {
	return env?.AWS_PROFILE || env?.AWS_DEFAULT_PROFILE;
}

function selectedRegion(
	env: BedrockAuthEnvironment | undefined,
): string | undefined {
	return env?.AWS_REGION || env?.AWS_DEFAULT_REGION;
}

export function resolveBedrockTarget(input: BedrockTargetInput): BedrockTarget {
	const providerHasNonProfileAuth = hasNonProfileBedrockAuth(input.providerEnv);
	const processHasNonProfileAuth = hasNonProfileBedrockAuth(input.processEnv);
	const providerProfile = selectedProfile(input.providerEnv);
	const processProfile = selectedProfile(input.processEnv);

	const providerHasAuth = Boolean(providerProfile || providerHasNonProfileAuth);
	const processHasAuth = Boolean(processProfile || processHasNonProfileAuth);
	const profile =
		input.explicitProfile ||
		(providerHasNonProfileAuth ? undefined : providerProfile) ||
		(providerHasAuth || processHasNonProfileAuth
			? undefined
			: processProfile) ||
		(providerHasAuth || processHasAuth ? undefined : input.inferredProfile);
	const region =
		input.explicitRegion ||
		selectedRegion(input.providerEnv) ||
		selectedRegion(input.processEnv) ||
		(profile ? input.profileRegions?.[profile] : undefined) ||
		input.profileRegions?.default ||
		input.fallbackRegion ||
		"us-east-2";

	return {
		profile,
		region,
		credentialSource: profile
			? "profile"
			: providerHasNonProfileAuth || processHasNonProfileAuth
				? "non-profile"
				: "default-chain",
	};
}
