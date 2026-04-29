import * as os from "node:os";
import * as path from "node:path";
import { readMergedSettings } from "../settings-loader.js";

export const PROMPT_ROUTING_DIR = path.join(os.homedir(), ".dotfiles/pi/prompt-routing");
export const CLASSIFY_SCRIPT = path.join(PROMPT_ROUTING_DIR, "classify.py");
export const SETTINGS_PATH = path.join(os.homedir(), ".dotfiles/pi/settings.json");

export interface RouterPolicy {
  N_HOLD: number;
  DOWNGRADE_THRESHOLD: number;
  K_CONSEC: number;
  COOLDOWN_TURNS: number;
  UNCERTAIN_THRESHOLD: number;
  UNCERTAIN_FALLBACK_ENABLED: boolean;
  maxEffortLevel: string;
}

export const POLICY_DEFAULTS: RouterPolicy = {
  N_HOLD: 3,
  DOWNGRADE_THRESHOLD: 0.85,
  K_CONSEC: 2,
  COOLDOWN_TURNS: 2,
  UNCERTAIN_THRESHOLD: 0.55,
  UNCERTAIN_FALLBACK_ENABLED: false,
  maxEffortLevel: "high",
};

function readNumber(source: Record<string, unknown>, key: keyof RouterPolicy): number {
  const value = source[key];
  const fallback = POLICY_DEFAULTS[key];
  return typeof value === "number" && typeof fallback === "number" ? value : Number(fallback);
}

function readBoolean(source: Record<string, unknown>, key: keyof RouterPolicy): boolean {
  const value = source[key];
  const fallback = POLICY_DEFAULTS[key];
  return typeof value === "boolean" && typeof fallback === "boolean" ? value : Boolean(fallback);
}

function readMaxEffortLevel(source: Record<string, unknown>, effortOrder: Record<string, number>): string {
  return typeof source.maxLevel === "string" && effortOrder[source.maxLevel] !== undefined
    ? source.maxLevel
    : POLICY_DEFAULTS.maxEffortLevel;
}

export function loadRouterPolicy(effortOrder: Record<string, number>): RouterPolicy {
  try {
    // Router settings live in ~/.dotfiles/pi/settings.json today (a non-default
    // user location); use the userPath override so the cascade reads it as the
    // user layer. skipProject + skipLocal preserves the pre-cascade scope --
    // router thresholds are not project-overridable in MVP.
    const s = readMergedSettings({
      userPath: SETTINGS_PATH,
      skipProject: true,
      skipLocal: true,
    });
    const p = (s?.router as Record<string, unknown>)?.policy as Record<string, unknown> | undefined ?? {};
    const e = (s?.router as Record<string, unknown>)?.effort as Record<string, unknown> | undefined ?? {};
    return {
      N_HOLD: readNumber(p, "N_HOLD"),
      DOWNGRADE_THRESHOLD: readNumber(p, "DOWNGRADE_THRESHOLD"),
      K_CONSEC: readNumber(p, "K_CONSEC"),
      COOLDOWN_TURNS: readNumber(p, "COOLDOWN_TURNS"),
      UNCERTAIN_THRESHOLD: readNumber(p, "UNCERTAIN_THRESHOLD"),
      UNCERTAIN_FALLBACK_ENABLED: readBoolean(p, "UNCERTAIN_FALLBACK_ENABLED"),
      maxEffortLevel: readMaxEffortLevel(e, effortOrder),
    };
  } catch {
    return { ...POLICY_DEFAULTS };
  }
}

export function readPromptRouterSettings(): Record<string, unknown> | null {
  try {
    return readMergedSettings({ userPath: SETTINGS_PATH, skipProject: true, skipLocal: true }) as Record<string, unknown>;
  } catch {
    return null;
  }
}
