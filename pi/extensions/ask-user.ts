/**
 * AskUser Tool -- Structured mid-turn user prompts
 *
 * Lets the LLM pause and ask the user a question during tool execution.
 * Supports three modes:
 *   - text:    free-form text input
 *   - select:  pick from a list of options
 *   - multi_select: pick multiple options, then Done
 *   - confirm: yes/no question
 */
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { formatToolError } from "../lib/extension-utils.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description:
      "Ask the user a question mid-turn and get their response. " +
      "Use when you need clarification, a decision, or confirmation before proceeding. " +
      'Modes: "text" for free-form input, "select" for one option, "multi_select" for multiple options, "confirm" for yes/no.',
    promptSnippet: "Ask the user a question mid-turn (text input, selection, or confirmation)",
    promptGuidelines: [
      "Use ask_user when you need user input to proceed -- don't guess at ambiguous requirements.",
      "Prefer 'select' mode when there are 2-6 concrete options to choose from.",
      "Prefer 'confirm' mode for yes/no decisions.",
      "Use 'text' mode for open-ended questions.",
      "Keep questions concise. Provide context in the question, not in a separate message.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "The question to ask the user" }),
      mode: Type.Optional(
        Type.Union(
          [Type.Literal("text"), Type.Literal("select"), Type.Literal("multi_select"), Type.Literal("confirm")],
          { description: 'Input mode: "text" (default), "select", "multi_select", or "confirm"', default: "text" }
        )
      ),
      options: Type.Optional(
        Type.Array(Type.String(), { description: 'Options for "select" or "multi_select" mode' })
      ),
      placeholder: Type.Optional(
        Type.String({ description: 'Placeholder text for "text" mode' })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const mode = params.mode ?? "text";

      if (!ctx.hasUI) {
        return formatToolError("(no UI available -- cannot prompt user)");
      }

      let answer: string | boolean | undefined;

      switch (mode) {
        case "confirm":
          answer = await ctx.ui.confirm("Question", params.question);
          break;

        case "select":
          if (!params.options || params.options.length === 0) {
            return formatToolError('Error: "select" mode requires a non-empty options array.');
          }
          answer = await ctx.ui.select(params.question, [...params.options, "Other (custom answer)"]);
          if (answer === "Other (custom answer)") {
            answer = await ctx.ui.input(`${params.question}\nOther:`, params.placeholder);
          }
          break;

        case "multi_select": {
          if (!params.options || params.options.length === 0) {
            return formatToolError('Error: "multi_select" mode requires a non-empty options array.');
          }
          const selected: string[] = [];
          while (true) {
            const remaining = params.options.filter((option) => !selected.includes(option));
            const choices = [
              ...remaining.map((option) => `+ ${option}`),
              "Other (custom answer)",
              "Done",
            ];
            const suffix = selected.length ? `\nSelected: ${selected.join(", ")}` : "";
            const choice = await ctx.ui.select(`${params.question}${suffix}`, choices);
            if (choice === undefined) {
              answer = undefined;
              break;
            }
            if (choice === "Done") {
              answer = selected.join("\n");
              break;
            }
            if (choice === "Other (custom answer)") {
              const custom = await ctx.ui.input("Other:", params.placeholder);
              if (custom) selected.push(custom);
              continue;
            }
            selected.push(choice.replace(/^\+ /, ""));
            if (selected.length === params.options.length) {
              const addMore = await ctx.ui.confirm("Question", "All listed options selected. Add a custom answer?");
              if (!addMore) {
                answer = selected.join("\n");
                break;
              }
            }
          }
          break;
        }

        case "text":
        default:
          answer = await ctx.ui.input(params.question, params.placeholder);
          break;
      }

      if (answer === undefined) {
        return {
          content: [{ type: "text", text: "(user dismissed the prompt without answering)" }],
          details: { mode, dismissed: true },
        };
      }

      const text = typeof answer === "boolean" ? (answer ? "yes" : "no") : answer;

      return {
        content: [{ type: "text", text }],
        details: { mode, dismissed: false },
      };
    },

    renderCall(args, theme, _context) {
      const mode = args.mode ?? "text";
      const icon = mode === "confirm" ? "?" : mode === "multi_select" ? "M" : mode === "select" ? "S" : "T";
      const preview = args.question.length > 60 ? args.question.slice(0, 60) + "..." : args.question;
      let text = theme.fg("accent", `${icon} `) + theme.fg("toolTitle", preview);
      if ((mode === "select" || mode === "multi_select") && args.options?.length) {
        text += theme.fg("dim", ` [${args.options.length} options]`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as { dismissed?: boolean } | undefined;
      const firstContent = result.content[0] as { text?: string } | undefined;
      const text = details?.dismissed
        ? theme.fg("warning", "(dismissed)")
        : theme.fg("success", firstContent?.text ?? "");
      return new Text(text, 0, 0);
    },
  });
}
