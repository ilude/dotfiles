import { describe, expect, it } from "vitest";
// The setup-owned host is JavaScript outside this profile's TypeScript project.
// @ts-expect-error exercised as its real ESM module
import { createHostDiagnosticCapture, hostStartupDiagnostic, sanitizeHostDiagnostic } from "../../../scripts/pi-subagent-host.mjs";
import { safeDiagnostic } from "../lib/subagents/visible.ts";

describe("visible subagent host diagnostics", () => {
  it("captures split stderr, mirrors the original bytes, and redacts only after close", () => {
    const mirrored: Buffer[] = [];
    const capture = createHostDiagnosticCapture((chunk: Uint8Array) => mirrored.push(Buffer.from(chunk)), 8192);
    capture.append(Buffer.from("startup failed token=sec"));
    capture.append(Buffer.from("ret-value\n\u001b[31mboom\u001b[0m"));
    expect(Buffer.concat(mirrored).toString()).toBe("startup failed token=secret-value\n\u001b[31mboom\u001b[0m");
    expect(capture.close()).toBe("startup failed token=[redacted]\nboom");
  });

  it("labels and sanitizes failures before child stderr capture is available", () => {
    expect(hostStartupDiagnostic("requesting bootstrap", new Error("token=secret failed")))
      .toBe("Visible host startup failed during requesting bootstrap: token=[redacted] failed");
  });

  it("never publishes an incomplete field when bounded capture truncates a secret", () => {
    const capture = createHostDiagnosticCapture(() => {}, 24);
    capture.append(Buffer.from("failure password=split-super-secret-value"));
    expect(capture.close()).toBe("failure [truncated]");
  });

  it("includes the truncation marker within the publication byte limit", () => {
    const diagnostic = sanitizeHostDiagnostic([Buffer.from("word ".repeat(2000))]);
    expect(Buffer.byteLength(diagnostic)).toBeLessThanOrEqual(4096);
    expect(diagnostic.endsWith(" [truncated]")).toBe(true);
  });

  it("caps on UTF-8 boundaries and defensively sanitizes parent payloads", () => {
    const diagnostic = sanitizeHostDiagnostic([Buffer.from(`${"界".repeat(1400)} token=hidden`)]);
    expect(Buffer.byteLength(diagnostic)).toBeLessThanOrEqual(4096);
    expect(diagnostic).not.toContain("�");
    expect(safeDiagnostic("authorization: bearer abc\u0000")).toBe("authorization: bearer [redacted]");
  });
});
