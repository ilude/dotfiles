import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { bindSuccessorSurface } from "../lib/subagents/successor-surface.ts";

export default function closeoutSuccessor(pi: ExtensionAPI): void {
  if (process.env.PI_CLOSEOUT_SUCCESSOR !== "1") return;
  bindSuccessorSurface(pi);
}
