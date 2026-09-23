import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { formatScheduleFooterStatus, getProcessScheduler } from "../lib/process-scheduler.ts";

function localDateTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(date);
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
    description: "Create, list, or cancel one-shot process-local prompts for reminders and external wall-clock waits, including CI/CD pipeline and deployment monitoring. Not for deferring work that can continue now. No recurrence or persistence. List shows up to 64 job IDs and local run times.",
    promptSnippet: "Schedule a one-shot prompt for a reminder or external wall-clock wait",
    promptGuidelines: [
      "Use schedule when the user requests a future reminder or work must wait for an external event. GitLab/GitHub pipeline completion, deployment rollouts, and cloud operations are intended uses; schedule the next reasonable check even when the event's exact completion time is unknown.",
      "Do not use schedule to postpone implementation, planning, retries, or other work that can continue now. External CI/CD and deployment monitoring is not ordinary continuation: schedule follow-up checks instead of delegating the wait to subagents.",
      "For genuine external waits or user-requested monitoring, do not occupy bash or PowerShell with sleep commands longer than 15 seconds; use schedule instead. Short waits of 15 seconds or less may remain inline.",
      "Before creating a schedule, list existing jobs and do not create a duplicate or overlapping reminder. Ask when required timing is missing or ambiguous.",
      "Schedule prompts follow the active conversation across session changes and reloads; include enough context to identify the external event. They run as follow-ups, never steering, and disappear when Pi exits.",
      "Do available work before scheduling when practical. If wrapping up, make schedule your last tool call. Cancel unneeded schedules; to change one, cancel and reschedule.",
    ],
    parameters: Type.Object({
      action: StringEnum(["create_at", "list", "cancel"] as const),
      when: Type.Optional(Type.String({ description: "Positive duration (30s, 15m, 2h, 1d) or future ISO timestamp; timestamps without an offset use local time." })),
      prompt: Type.Optional(Type.String({ maxLength: 4000, description: "Follow-up prompt, not a slash command." })),
      id: Type.Optional(Type.String({ description: "Schedule id or unique prefix, for cancel." })),
    }),
    renderCall(args, theme) {
      return new Text(args.action === "list" ? theme.fg("toolTitle", theme.bold("schedule list:")) : "", 0, 0);
    },
    renderResult(result, _options, theme, context) {
      const text = result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
      const lines = text.split("\n");
      return new Text(lines.map((line, index) => {
        if (context.args.action === "create_at") {
          if (index === 0) {
            const match = /^Schedule create (\[[a-f0-9]+\]) (.*?) (\d+m)$/.exec(line);
            if (match) return `${theme.fg("toolTitle", theme.bold("schedule create"))} ${theme.fg("muted", match[1])} ${theme.fg("accent", match[2])} ${theme.fg("warning", match[3])}`;
          }
          if (index === 3) return theme.fg("muted", line);
        } else if (index === 0 && context.args.action === "cancel") {
          return theme.fg("toolTitle", theme.bold(`schedule ${line.replace(/^Cancelled:/, "cancel:")}`));
        }
        return theme.fg("toolOutput", line);
      }).join("\n"), 0, 0);
    },
    async execute(_id, params, signal) {
      signal?.throwIfAborted();
      const scheduler = getProcessScheduler();
      let text: string;
      if (params.action === "create_at") {
        if (!params.when || !params.prompt) throw new Error("create_at requires when and prompt");
        const job = scheduler.create(params.when, params.prompt);
        const createdAt = new Date();
        const minutesUntilRun = Math.max(1, Math.ceil((Date.parse(job.runAt) - createdAt.getTime()) / 60_000));
        const prompt = job.prompt.replace(/\s+/g, " ");
        const preview = prompt.length > 80 ? `${prompt.slice(0, 79)}…` : prompt;
        text = `Schedule create [${job.id.slice(0, 8)}] ${localDateTime(new Date(job.runAt))} ${minutesUntilRun}m\n   ${preview}\n\ncreated at ${localDateTime(createdAt)}`;
      } else if (params.action === "cancel") {
        if (!params.id) throw new Error("cancel requires id");
        const cancelled = scheduler.cancel(params.id);
        text = `Cancelled: [${cancelled.id.slice(0, 8)}]`;
      } else if (params.action === "list") {
        text = scheduler.list().map(job => `${localDateTime(new Date(job.runAt))} [${job.id.slice(0, 8)}]`).join("\n") || "No scheduled reminders.";
      } else {
        throw new Error(`Unknown schedule action: ${params.action}`);
      }
      return { content: [{ type: "text", text }], details: {} };
    },
  });
}
