import { describe, expect, it } from "vitest";
import { SECRET_REDACTION, scanSecrets } from "../lib/secret-scan.js";

describe("scanSecrets", () => {
	it("returns ordered, redacted findings for supported synthetic forms", () => {
		const findings = scanSecrets(
			[
				"AKIAABCDEFGHIJKLMNOP",
				"Bearer synthetic.token.value",
				"ghp_abcdefghijklmnopqrstuvwxyz123456",
				"sk-synthetic1234567890",
				"api_key=synthetic-value",
				"-----BEGIN RSA PRIVATE KEY-----",
			].join("\n"),
		);

		expect(findings.map(({ kind }) => kind)).toEqual([
			"aws-access-key",
			"bearer-token",
			"github-token",
			"openai-token",
			"secret-assignment",
			"private-key",
		]);
		expect(
			findings.every(({ redacted }) => redacted === SECRET_REDACTION),
		).toBe(true);
		expect(findings[0]).toEqual({
			kind: "aws-access-key",
			line: 1,
			column: 1,
			offset: 0,
			length: 20,
			redacted: SECRET_REDACTION,
		});
		expect(JSON.stringify(findings)).not.toContain("synthetic1234567890");
	});

	it("preserves commit detection for private keys and certificates", () => {
		expect(
			scanSecrets(
				[
					"-----BEGIN PRIVATE KEY-----",
					"-----BEGIN RSA PRIVATE KEY-----",
					"-----BEGIN CERTIFICATE-----",
				].join("\n"),
			).map(({ kind }) => kind),
		).toEqual(["private-key", "private-key", "private-key"]);
	});

	it("does not treat task and risk labels as secrets", () => {
		expect(
			scanSecrets(
				[
					"task-sk-synthetic1234567890",
					"risk-ghp_abcdefghijklmnopqrstuvwxyz123456",
					"task-api_key=synthetic-value",
					"risk-Bearer synthetic.token.value",
					"task------BEGIN PRIVATE KEY-----",
					"risk------BEGIN CERTIFICATE-----",
				].join("\n"),
			),
		).toEqual([]);
	});
});
