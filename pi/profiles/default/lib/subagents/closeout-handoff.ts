import type { CloseoutManifest } from "../plan-integration/contracts.ts";

const OPEN = "<pi-closeout-manifest>";
const CLOSE = "</pi-closeout-manifest>";

export interface CloseoutHandoff {
  manifest: CloseoutManifest;
  instructions: string;
}

export function extractCloseoutHandoff(instructions: string): CloseoutHandoff | undefined {
  const start = instructions.indexOf(OPEN);
  const endMarker = instructions.indexOf(CLOSE);
  if (start < 0 && endMarker < 0) return undefined;
  if (start < 0 || endMarker < 0 || endMarker < start || instructions.indexOf(OPEN, start + OPEN.length) >= 0 || instructions.indexOf(CLOSE, endMarker + CLOSE.length) >= 0) {
    throw new Error("Invalid closeout manifest handoff envelope");
  }

  const jsonStart = start + OPEN.length;
  const json = instructions.slice(jsonStart, endMarker).trim();
  let manifest: CloseoutManifest;
  try {
    manifest = JSON.parse(json) as CloseoutManifest;
  } catch {
    throw new Error("Closeout manifest handoff must contain valid JSON");
  }

  const cleanInstructions = `${instructions.slice(0, start)}${instructions.slice(endMarker + CLOSE.length)}`.trim();
  if (!cleanInstructions) throw new Error("Integrator assignment instructions are required outside the manifest envelope");
  return { manifest, instructions: cleanInstructions };
}
