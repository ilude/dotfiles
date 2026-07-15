import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	awsProfileRegions,
	type BedrockAuthEnvironment,
	type IniSections,
	parseAwsIni,
	resolveBedrockTarget,
	selectBedrockCredentialsProfile,
} from "../lib/bedrock-auth.js";

const DEFAULT_REGION = "us-east-2";

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

function readIni(filePath: string): IniSections {
	if (!fs.existsSync(filePath)) return new Map();
	return parseAwsIni(fs.readFileSync(filePath, "utf-8"));
}

function configureAwsBedrockEnvironment(): void {
	const processEnv = process.env as BedrockAuthEnvironment;
	const target = resolveBedrockTarget({
		processEnv,
		inferredProfile: selectBedrockCredentialsProfile(
			readIni(awsCredentialsPath()),
		),
		profileRegions: awsProfileRegions(readIni(awsConfigPath())),
		fallbackRegion: DEFAULT_REGION,
	});

	if (!process.env.AWS_PROFILE && target.profile)
		process.env.AWS_PROFILE = target.profile;
	if (!process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION)
		process.env.AWS_REGION = target.region;
}

export default function awsBedrockEnv(_pi: ExtensionAPI): void {
	configureAwsBedrockEnvironment();
}
