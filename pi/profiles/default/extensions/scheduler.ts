import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { formatScheduleFooterStatus, getProcessScheduler, type ScheduledPrompt } from "../lib/process-scheduler.ts";

function describe(job: ScheduledPrompt): string {
  const preview = job.prompt.replace(/\s+/g, " ").slice(0, 80);
  return `${job.id} at ${job.runAt} ${preview}${job.error ? ` — delivery failed: ${job.error}` : ""}`;
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
    description: "Create, list, or cancel one-shot process-local prompts. No recurrence or persistence. List shows up to 64 jobs with 80-character prompt previews.",
    promptSnippet: "Schedule a one-shot follow-up instead of shell waits or polling",
    promptGuidelines: [
      "Use schedule for delayed continuation or waits of 60 seconds or longer without extra confirmation; ask only if timing is missing or ambiguous.",
      "Schedule prompts follow the active conversation across session changes and reloads; include enough context to identify the work. They run as follow-ups, never steering, and disappear when Pi exits.",
      "After using schedule, continue useful work or end the turn if the scheduled follow-up is the intended next step. Cancel unneeded schedules; to change one, cancel and reschedule.",
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
        text = `Scheduled ${describe(job)}. At that time the prompt is handed to Pi as a follow-up in the active conversation, waiting behind current work. Survives session changes and reloads; stops when Pi exits.`;
      } else if (params.action === "cancel") {
        if (!params.id) throw new Error("cancel requires id");
        text = `Cancelled ${describe(scheduler.cancel(params.id))}.`;
      } else if (params.action === "list") {
        text = scheduler.list().map(describe).join("\n") || "No process-local schedules.";
      } else {
        throw new Error(`Unknown schedule action: ${params.action}`);
      }
      return { content: [{ type: "text", text }], details: {} };
    },
  });
}
