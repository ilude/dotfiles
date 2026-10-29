import { describe, expect, it } from "vitest";
import { curCopyArgs, curObjectUri, parseCurSnapshot } from "../lib/bedrock/cur-snapshot.ts";

const valid = {
	schema_version: 1,
	source: "payer-cur2",
	billing_month: "2026-10",
	currency: "USD",
	generated_at: "2026-10-29T12:00:00.000Z",
	username: "mike.glenn",
	month_to_date: 58.82,
};

describe("personal Bedrock CUR snapshot", () => {
	it("validates the posted schema and builds the selected-profile S3 copy command", () => {
		expect(parseCurSnapshot(valid)).toEqual(valid);
		expect(parseCurSnapshot({ ...valid, generated_at: "2026-10-28T20:38:51.537836+00:00", month_to_date: 309.87 })).toMatchObject({ generated_at: "2026-10-28T20:38:51.537836+00:00", month_to_date: 309.87 });
		expect(curObjectUri()).toBe("s3://ccb-bedrock-billing-058264305403/snapshots/mike.glenn/current.json");
		expect(curCopyArgs("billing")).toEqual(["s3", "cp", curObjectUri(), "-", "--region", "us-east-2", "--profile", "billing"]);
		expect(curCopyArgs()).not.toContain("--profile");
	});

	it.each([
		{ ...valid, schema_version: 2 },
		{ ...valid, source: "cloudwatch" },
		{ ...valid, billing_month: "2026-13" },
		{ ...valid, currency: "EUR" },
		{ ...valid, generated_at: "2026-10-29T12:00:00" },
		{ ...valid, generated_at: "2026-10-29T12:00:00+01:00" },
		{ ...valid, username: "someone-else" },
		{ ...valid, month_to_date: -1 },
	])("rejects invalid payload %#", payload => expect(() => parseCurSnapshot(payload)).toThrow());
});
