import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBoundedInspection } from "../lib/tool-failure-inspection.ts";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe("bounded tool-failure inspection", () => {
	it("denies protected and out-of-workspace reads before content is loaded", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-inspection-"));
		roots.push(root);
		const secret = path.join(root, ".env");
		const outside = path.join(path.dirname(root), "outside-secret.txt");
		await fs.writeFile(secret, "token=must-not-be-read");
		await fs.writeFile(outside, "secret=must-not-be-read");
		const inspection = createBoundedInspection(root, { protectedPaths: [".env"] });
		await expect(inspection.readRepository(secret)).rejects.toThrow("protected");
		await expect(inspection.readRepository(outside)).rejects.toThrow("outside");
	});

	it("selects transcript coordinates, redacts content, and enforces limits", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "tool-failure-inspection-"));
		roots.push(root);
		const transcript = path.join(root, "session.jsonl");
		await fs.writeFile(transcript, "first\napi_key=abcdefghijklmnopqrstuvwxyz123456\nthird\n");
		const inspection = createBoundedInspection(root, {
			selectedCoordinates: [{ filePath: transcript, line: 2 }],
			limits: { maxItemsPerTurn: 1, maxBytesPerTurn: 100 },
		});
		await expect(inspection.readTranscript({ filePath: transcript, line: 1 })).rejects.toThrow("not selected");
		await expect(inspection.readTranscript({ filePath: transcript, line: 2 })).resolves.toBe("api_key=[REDACTED]");
		await expect(inspection.readRepository(transcript)).rejects.toThrow("item limit");
	});
});
