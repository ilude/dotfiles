import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const profile = dirname(dirname(fileURLToPath(import.meta.url)));
const prompt = readFileSync(join(profile, "prompts", "yt.md"), "utf8");
const skill = readFileSync(join(profile, "skills", "youtube", "SKILL.md"), "utf8");
const composition = `${prompt}\n${skill}`;

describe("/yt guidance composition", () => {
  it("keeps the direct callback, compact projection, and analysis defaults aligned", () => {
    for (const text of [prompt, skill]) {
      expect(text).toContain("onclave.job.terminal.v1");
      expect(text).toContain("onclave_message");
      expect(text).toContain("variant: \"analysis\"");
      expect(text).toContain("fields");
      expect(text).toContain("SponsorBlock");
      expect(text).toContain("legacy");
    }
    expect(composition).toContain("successful empty result has");
    expect(composition).toContain("does not regenerate");
    expect(composition).not.toMatch(/compare(?:d)? (?:ingested )?videos with the current repository/i);
    expect(composition).not.toMatch(/raw (?:whole-)?transcript(?: retrieval)? defaults? to/i);
  });

  it("preserves explicit local-only and operator-requested repository boundaries", () => {
    expect(prompt).toContain("local fetchers as a fallback");
    expect(skill).toContain("Use `/yt-local` only when the operator explicitly\nrequests local fetching");
    expect(composition).toContain("bare ingestion");
    expect(composition).toContain("repository research");
    expect(composition).toContain("only when the operator asks");
  });
});
