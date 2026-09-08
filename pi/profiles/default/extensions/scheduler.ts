import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { formatScheduleFooterStatus, getProcessScheduler, type ScheduledPrompt } from "../lib/process-scheduler.ts";

function describe(job: ScheduledPrompt): string {
  const prompt = job.prompt.replace(/\s+/g, " ");
  const preview = prompt.length > 80 ? `${prompt.slice(0, 79)}…` : prompt;
  const time = new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(job.runAt));
  const peers = getProcessScheduler().list();
  let length = 8;
  while (peers.some(peer => peer.id !== job.id && peer.id.startsWith(job.id.slice(0, length)))) length++;
  return `${time} [${job.id.slice(0, length)}]\n  ${preview}${job.error ? `\n  Delivery failed: ${job.error}` : ""}`;
}

export default function schedulerExtension(pi: ExtensionAPI): void {
  let delivery: ((prompt: string) => void) | undefined;

  pi.on("session_start", (_event, ctx) => {
    const scheduler = getProcessScheduler();
    delivery = prompt => pi.sendUserMessage(prompt, { deliverAs: "followUp" });
    scheduler.bind(delivery, () => ctx.ui.setStatus("schedule", formatScheduleFooterStatus(scheduler.list())));
  });

  pi.on("session_shutdown", (event, ctx) => {
    const scheduler = getProcessScheduler();
    if (delivery) scheduler.unbind(delivery);
    delivery = undefined;
    ctx.ui.setStatus("schedule", undefined);
    if (event.reason === "quit") scheduler.stopAll();
  });

  pi.registerTool({
    name: "schedule",
    label: "Schedule",
    description: "Create, list, or cancel one-shot process-local prompts for genuine wall-clock reminders. Not for continuing ordinary agent work. No recurrence or persistence. List shows up to 64 jobs with 80-character prompt previews.",
    promptSnippet: "Schedule a one-shot prompt only when the task requires a genuine wall-clock delay",
    promptGuidelines: [
      "Use schedule only when the user explicitly requests a future reminder or the requested outcome requires waiting for a real external event until a known future time.",
      "Never schedule prompts to continue implementation, advance a plan, extend the current turn, wait for normal tool or agent work, retry ordinary work, or compensate for stopping early. Continue that work directly instead.",
      "Before creating a schedule, list existing jobs and do not create a duplicate or overlapping reminder. Ask when required timing is missing or ambiguous.",
      "Schedule prompts follow the active conversation across session changes and reloads; include enough context to identify the external event. They run as follow-ups, never steering, and disappear when Pi exits.",
      "After using schedule, continue any work that does not depend on the future event. Cancel unneeded schedules; to change one, cancel and reschedule.",
    ],
    parameters: Type.Object({
      action: StringEnum(["create_at", "list", "cancel"] as const),
      when: Type.Optional(Type.String({ description: "Positive duration (30s, 15m, 2h, 1d) or future ISO timestamp; timestamps without an offset use local time." })),
      prompt: Type.Optional(Type.String({ maxLength: 4000, description: "Follow-up prompt, not a slash command." })),
      id: Type.Optional(Type.String({ description: "Schedule id or unique prefix, for cancel." })),
    }),
    async execute(_id, params, signal) {
      signal?.throwIfAborted();
      const scheduler = getProcessScheduler();
      let text: string;
      if (params.action === "create_at") {
        if (!params.when || !params.prompt) throw new Error("create_at requires when and prompt");
        const job = scheduler.create(params.when, params.prompt);
        text = `Scheduled for ${describe(job)}\nRequires Pi to stay open.`;
      } else if (params.action === "cancel") {
        if (!params.id) throw new Error("cancel requires id");
        text = `Cancelled: ${describe(scheduler.cancel(params.id))}`;
      } else if (params.action === "list") {
        text = scheduler.list().map(describe).join("\n") || "No scheduled reminders.";
      } else {
        throw new Error(`Unknown schedule action: ${params.action}`);
      }
      return { content: [{ type: "text", text }], details: {} };
    },
  });
}
