import { describe, expect, it } from "vitest";
import {
	parseAwsIni,
	resolveBedrockTarget,
	selectBedrockCredentialsProfile,
} from "../lib/bedrock-auth.ts";

describe("Bedrock target resolution", () => {
	it("omits profile arguments for provider-scoped non-profile authentication", () => {
		expect(
			resolveBedrockTarget({
				providerEnv: {
					AWS_PROFILE: "ignored-profile",
					AWS_ACCESS_KEY_ID: "fixture-key",
					AWS_SECRET_ACCESS_KEY: "fixture-secret",
					AWS_REGION: "us-east-2",
				},
				processEnv: { AWS_PROFILE: "process-profile" },
			}),
		).toEqual({
			profile: undefined,
			region: "us-east-2",
			credentialSource: "non-profile",
		});
	});

	it("selects default or one named credential profile but not ambiguous profiles", () => {
		expect(
			selectBedrockCredentialsProfile(
				parseAwsIni("[default]\ncredential_process = default-command\n"),
			),
		).toBe("default");
		expect(
			selectBedrockCredentialsProfile(
				parseAwsIni("[work]\nsso_session = work-session\n"),
			),
		).toBe("work");
		expect(
			selectBedrockCredentialsProfile(
				parseAwsIni(
					"[work]\nsso_session = work-session\n[personal]\ncredential_process = personal-command\n",
				),
			),
		).toBeUndefined();
	});

	it("falls back to the default credential chain and region", () => {
		expect(resolveBedrockTarget({})).toEqual({
			profile: undefined,
			region: "us-east-2",
			credentialSource: "default-chain",
		});
	});
});
