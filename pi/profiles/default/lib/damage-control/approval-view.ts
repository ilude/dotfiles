import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, SelectList, truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { Approval, ApprovalLine } from "./approval.ts";

export function createApprovalView(
  approval: Approval,
  theme: Pick<Theme, "fg" | "bold">,
  keys: Pick<KeybindingsManager, "matches" | "getKeys">,
  done: (answer: "allow" | "review" | "deny") => void,
  rows: () => number,
  allowReview = false,
): Component {
  let expanded = false;
  let scroll = 0;
  let focusTrigger = false;
  let total = 0;
  let page = 1;
  let selected = 0;
  let detailCache: { width: number; lines: string[]; trigger: number } | undefined;
  const scope = approval.summary.find(line => line.emphasis === "scope")?.text ?? "Approves this entire tool call once.";
  const callDescription = scope.includes("shell call") ? "shell call" : "tool call";
  const choices = new SelectList([
    { value: "allow", label: "Allow once", description: scope.replace(/^Approves /, "Run ") },
    ...(allowReview ? [{ value: "review" as const, label: "Allow once and review for future use", description: `Run this ${callDescription} and review it for future use.` }] : []),
    { value: "deny", label: "Deny", description: "Do not run this call." },
    { value: "details", label: "Details", description: "Show the full command, matched rules, and review." },
  ], allowReview ? 4 : 3, {
    selectedPrefix: text => theme.fg("accent", text),
    selectedText: text => theme.fg("accent", text),
    description: text => theme.fg("muted", text),
    scrollInfo: text => theme.fg("muted", text),
    noMatch: text => theme.fg("muted", text),
  });
  const hint = (action: Parameters<KeybindingsManager["getKeys"]>[0]) => keys.getKeys(action).join("/");
  const styled = (line: ApprovalLine) => {
    if (line.emphasis === "reason") return theme.fg("warning", line.text);
    if (line.emphasis === "scope") return theme.fg("warning", theme.bold(line.text));
    if (line.emphasis === "muted") return theme.fg("muted", line.text);
    if (line.emphasis === "command") return theme.fg("text", line.text.replace(/(^|\s)(--?[^\s]+)/g, (_match, gap: string, flag: string) => `${gap}${theme.fg("warning", theme.bold(flag))}`));
    return theme.fg("text", line.text);
  };
  const wrap = (line: ApprovalLine, width: number) => wrapTextWithAnsi(styled(line), width);
  return {
    render(width) {
      width = Math.max(1, width);
      const height = Math.max(8, Math.min(24, rows() - 2));
      const border = theme.fg("border", "─".repeat(width));
      const header = truncateToWidth(theme.fg("warning", theme.bold(expanded ? "Approval details" : approval.title)), width);
      let body: string[];
      let footer: string[];
      if (expanded) {
        if (!detailCache || detailCache.width !== width) {
          const lines: string[] = [];
          let trigger = -1;
          for (const line of approval.details) {
            if (line.trigger && trigger < 0) trigger = lines.length;
            lines.push(...wrap(line, width));
          }
          detailCache = { width, lines, trigger: Math.max(0, trigger) };
        }
        page = Math.max(1, height - 6);
        total = detailCache.lines.length;
        if (focusTrigger) { scroll = Math.max(0, detailCache.trigger - 1); focusTrigger = false; }
        scroll = Math.min(Math.max(0, scroll), Math.max(0, total - page));
        body = detailCache.lines.slice(scroll, scroll + page);
        footer = [
          theme.fg("muted", `Lines ${scroll + 1}-${Math.min(total, scroll + page)} of ${total}`),
          theme.fg("muted", `D / ${hint("tui.select.confirm")} back · ${hint("tui.select.up")}/${hint("tui.select.down")} scroll`),
          theme.fg("muted", `Home/End · ${hint("tui.select.pageUp")}/${hint("tui.select.pageDown")} page · Esc denies`),
        ];
      } else {
        const lines = approval.summary.filter(line => line.emphasis !== "scope").flatMap(line => wrap(line, width));
        footer = [...choices.render(width), theme.fg("muted", `D details · ${hint("tui.select.confirm")} select · Esc denies`)];
        const available = Math.max(1, height - footer.length - 3);
        body = lines.length <= available ? lines : [...lines.slice(0, Math.max(0, available - 1)), theme.fg("muted", `… ${lines.length - available + 1} more lines in Details`)];
      }
      return [border, header, ...body, ...footer.map(line => truncateToWidth(line, width)), border];
    },
    handleInput(data) {
      // Escape always denies, including inside Details. Opening/closing Details
      // never completes the approval or changes its selected answer.
      if (matchesKey(data, "escape") || keys.matches(data, "tui.select.cancel")) { done("deny"); return; }
      if (data === "d" || data === "D") { expanded = !expanded; focusTrigger = expanded; return; }
      if (expanded) {
        if (keys.matches(data, "tui.select.confirm")) expanded = false;
        else if (keys.matches(data, "tui.select.up")) scroll = Math.max(0, scroll - 1);
        else if (keys.matches(data, "tui.select.down")) scroll = Math.min(Math.max(0, total - page), scroll + 1);
        else if (keys.matches(data, "tui.select.pageUp")) scroll = Math.max(0, scroll - page);
        else if (keys.matches(data, "tui.select.pageDown")) scroll = Math.min(Math.max(0, total - page), scroll + page);
        else if (matchesKey(data, "home")) scroll = 0;
        else if (matchesKey(data, "end")) scroll = Math.max(0, total - page);
      } else if (keys.matches(data, "tui.select.confirm")) {
        const detailsIndex = allowReview ? 3 : 2;
        if (selected === detailsIndex) { expanded = true; focusTrigger = true; }
        else done(selected === 0 ? "allow" : allowReview && selected === 1 ? "review" : "deny");
      } else if (keys.matches(data, "tui.select.up")) { selected = Math.max(0, selected - 1); choices.setSelectedIndex(selected); }
      else if (keys.matches(data, "tui.select.down")) { selected = Math.min(allowReview ? 3 : 2, selected + 1); choices.setSelectedIndex(selected); }
    },
    invalidate() { detailCache = undefined; choices.invalidate(); },
  };
}
