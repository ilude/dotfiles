/**
 * Todo Tool — Persistent task list with dependency tracking
 *
 * File-backed todo list for managing multi-step work. Supports:
 *   - Dependencies between tasks (task B blocked by task A)
 *   - Status tracking: pending → in_progress → done / blocked
 *   - Parallel work identification (tasks with no unmet dependencies)
 *
 * State persisted to .pi/todo.json in the project root.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ── Types ───────────────────────────────────────────────────────────────────

export type TodoStatus = "pending" | "in_progress" | "done" | "blocked";

export interface TodoItem {
  id: string;
  title: string;
  status: TodoStatus;
  depends_on: string[];
  created: string;
  updated: string;
  notes?: string;
}

export interface TodoState {
  items: TodoItem[];
}

// ── Pure functions (exported for testing) ───────────────────────────────────

let nextSeq = 1;

export function generateId(): string {
  return `t${Date.now().toString(36)}-${(nextSeq++).toString(36)}`;
}

/** Resolve effective status: "blocked" if any dependency is not done. */
export function resolveStatus(item: TodoItem, items: TodoItem[]): TodoStatus {
  if (item.status === "done") return "done";
  const hasUnmetDeps = item.depends_on.some((depId) => {
    const dep = items.find((i) => i.id === depId);
    return dep && dep.status !== "done";
  });
  if (hasUnmetDeps) return "blocked";
  return item.status === "blocked" ? "pending" : item.status;
}

/** Find tasks ready for parallel execution (pending/in_progress with all deps done). */
export function findReady(items: TodoItem[]): TodoItem[] {
  return items.filter((item) => {
    if (item.status === "done") return false;
    const effective = resolveStatus(item, items);
    return effective === "pending" || effective === "in_progress";
  });
}

/** Detect circular dependencies. Returns cycle path or null. */
export function detectCycle(items: TodoItem[], fromId: string, toId: string): string[] | null {
  // Would adding fromId → toId create a cycle?
  // Check if toId can reach fromId via dependencies
  const visited = new Set<string>();
  const stack = [toId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromId) {
      return [fromId, "→", toId, "→ ... →", fromId];
    }
    if (visited.has(current)) continue;
    visited.add(current);
    const item = items.find((i) => i.id === current);
    if (item) {
      for (const depId of item.depends_on) {
        stack.push(depId);
      }
    }
  }
  return null;
}

/** Format a single todo for display. */
export function formatTodo(item: TodoItem, items: TodoItem[]): string {
  const effective = resolveStatus(item, items);
  const icon = effective === "done" ? "✓" : effective === "in_progress" ? "▶" : effective === "blocked" ? "⊘" : "○";
  const deps = item.depends_on.length > 0
    ? ` [deps: ${item.depends_on.join(", ")}]`
    : "";
  const notes = item.notes ? `\n   ${item.notes}` : "";
  return `${icon} ${item.id}: ${item.title} (${effective})${deps}${notes}`;
}

/** Format the full todo list with sections. */
export function formatTodoList(items: TodoItem[]): string {
  if (items.length === 0) return "No todos.";

  const ready = findReady(items);
  const blocked = items.filter((i) => resolveStatus(i, items) === "blocked");
  const done = items.filter((i) => i.status === "done");
  const sections: string[] = [];

  if (ready.length > 0) {
    sections.push(`── Ready (${ready.length}) ──`);
    sections.push(...ready.map((i) => formatTodo(i, items)));
  }
  if (blocked.length > 0) {
    sections.push(`\n── Blocked (${blocked.length}) ──`);
    sections.push(...blocked.map((i) => formatTodo(i, items)));
  }
  if (done.length > 0) {
    sections.push(`\n── Done (${done.length}) ──`);
    sections.push(...done.map((i) => formatTodo(i, items)));
  }

  const summary = `${done.length}/${items.length} done, ${ready.length} ready, ${blocked.length} blocked`;
  sections.push(`\n${summary}`);

  return sections.join("\n");
}

// ── File I/O ────────────────────────────────────────────────────────────────

function getTodoPath(cwd: string): string {
  return path.join(cwd, ".pi", "todo.json");
}

function loadTodos(cwd: string): TodoState {
  const filePath = getTodoPath(cwd);
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as TodoState;
  } catch {
    return { items: [] };
  }
}

function saveTodos(cwd: string, state: TodoState): void {
  const filePath = getTodoPath(cwd);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

// ── Extension ───────────────────────────────────────────────────────────────

const ActionSchema = Type.Union([
  Type.Literal("add"),
  Type.Literal("update"),
  Type.Literal("remove"),
  Type.Literal("list"),
  Type.Literal("ready"),
]);

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      "Manage a persistent task list with dependency tracking. " +
      "Actions: add (create task, optional depends_on), update (change status/title/notes/deps), " +
      "remove (delete task), list (show all), ready (show parallelizable tasks). " +
      "Statuses: pending, in_progress, done. Tasks with unmet dependencies show as blocked. " +
      "State saved to .pi/todo.json.",
    promptSnippet: "Manage tasks with dependencies — add, update, remove, list, find ready work",
    promptGuidelines: [
      "Use todo to track multi-step work, especially when tasks have ordering constraints.",
      "Set depends_on when a task can't start until another completes.",
      "Use 'ready' action to find tasks that can be worked in parallel.",
      "Update status to 'in_progress' when starting work, 'done' when complete.",
      "Add notes to tasks for context that helps when resuming later.",
    ],
    parameters: Type.Object({
      action: ActionSchema,
      id: Type.Optional(Type.String({ description: "Task ID (for update/remove)" })),
      title: Type.Optional(Type.String({ description: "Task title (for add, or update to rename)" })),
      status: Type.Optional(
        Type.Union(
          [Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("done")],
          { description: "New status (for update)" }
        )
      ),
      depends_on: Type.Optional(
        Type.Array(Type.String(), { description: "Task IDs this task depends on (for add/update)" })
      ),
      notes: Type.Optional(Type.String({ description: "Notes/context for the task" })),
    }),

    execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = loadTodos(ctx.cwd);
      const now = new Date().toISOString();

      switch (params.action) {
        case "add": {
          if (!params.title) {
            return Promise.resolve({
              content: [{ type: "text" as const, text: 'Error: "add" requires a title.' }],
              isError: true,
            });
          }
          const deps = params.depends_on ?? [];
          // Validate dependency IDs exist
          for (const depId of deps) {
            if (!state.items.find((i) => i.id === depId)) {
              return Promise.resolve({
                content: [{ type: "text" as const, text: `Error: dependency "${depId}" not found.` }],
                isError: true,
              });
            }
          }
          const item: TodoItem = {
            id: generateId(),
            title: params.title,
            status: "pending",
            depends_on: deps,
            created: now,
            updated: now,
            ...(params.notes && { notes: params.notes }),
          };
          state.items.push(item);
          saveTodos(ctx.cwd, state);
          return Promise.resolve({
            content: [{ type: "text" as const, text: `Added: ${formatTodo(item, state.items)}` }],
            details: { action: "add", id: item.id },
          });
        }

        case "update": {
          if (!params.id) {
            return Promise.resolve({
              content: [{ type: "text" as const, text: 'Error: "update" requires an id.' }],
              isError: true,
            });
          }
          const item = state.items.find((i) => i.id === params.id);
          if (!item) {
            return Promise.resolve({
              content: [{ type: "text" as const, text: `Error: task "${params.id}" not found.` }],
              isError: true,
            });
          }
          if (params.title) item.title = params.title;
          if (params.status) item.status = params.status;
          if (params.notes !== undefined) item.notes = params.notes || undefined;
          if (params.depends_on !== undefined) {
            // Validate deps exist and no cycles
            for (const depId of params.depends_on) {
              if (!state.items.find((i) => i.id === depId)) {
                return Promise.resolve({
                  content: [{ type: "text" as const, text: `Error: dependency "${depId}" not found.` }],
                  isError: true,
                });
              }
              if (depId === item.id) {
                return Promise.resolve({
                  content: [{ type: "text" as const, text: "Error: a task cannot depend on itself." }],
                  isError: true,
                });
              }
              const cycle = detectCycle(state.items, item.id, depId);
              if (cycle) {
                return Promise.resolve({
                  content: [{ type: "text" as const, text: `Error: circular dependency: ${cycle.join(" ")}` }],
                  isError: true,
                });
              }
            }
            item.depends_on = params.depends_on;
          }
          item.updated = now;
          saveTodos(ctx.cwd, state);
          return Promise.resolve({
            content: [{ type: "text" as const, text: `Updated: ${formatTodo(item, state.items)}` }],
            details: { action: "update", id: item.id },
          });
        }

        case "remove": {
          if (!params.id) {
            return Promise.resolve({
              content: [{ type: "text" as const, text: 'Error: "remove" requires an id.' }],
              isError: true,
            });
          }
          const idx = state.items.findIndex((i) => i.id === params.id);
          if (idx === -1) {
            return Promise.resolve({
              content: [{ type: "text" as const, text: `Error: task "${params.id}" not found.` }],
              isError: true,
            });
          }
          // Remove from other tasks' dependencies
          const removedId = params.id;
          for (const item of state.items) {
            item.depends_on = item.depends_on.filter((d) => d !== removedId);
          }
          const removed = state.items.splice(idx, 1)[0];
          saveTodos(ctx.cwd, state);
          return Promise.resolve({
            content: [{ type: "text" as const, text: `Removed: ${removed.title} (${removedId})` }],
            details: { action: "remove", id: removedId },
          });
        }

        case "list": {
          return Promise.resolve({
            content: [{ type: "text" as const, text: formatTodoList(state.items) }],
            details: { action: "list", count: state.items.length },
          });
        }

        case "ready": {
          const ready = findReady(state.items);
          if (ready.length === 0) {
            const allDone = state.items.every((i) => i.status === "done");
            const msg = allDone
              ? "All tasks complete!"
              : "No tasks ready — all remaining tasks are blocked by dependencies.";
            return Promise.resolve({
              content: [{ type: "text" as const, text: msg }],
              details: { action: "ready", count: 0 },
            });
          }
          const text = `${ready.length} task(s) ready for parallel work:\n\n` +
            ready.map((i) => formatTodo(i, state.items)).join("\n");
          return Promise.resolve({
            content: [{ type: "text" as const, text }],
            details: { action: "ready", count: ready.length },
          });
        }

        default:
          return Promise.resolve({
            content: [{ type: "text" as const, text: `Unknown action: ${params.action}` }],
            isError: true,
          });
      }
    },

    renderCall(args, theme, _context) {
      const action = args.action;
      const icons: Record<string, string> = {
        add: "+", update: "~", remove: "×", list: "≡", ready: "▶",
      };
      const icon = icons[action] ?? "?";
      let text = theme.fg("accent", `${icon} todo `) + theme.fg("toolTitle", action);
      if (args.title) text += theme.fg("dim", ` "${args.title}"`);
      if (args.id) text += theme.fg("dim", ` [${args.id}]`);
      if (args.status) text += theme.fg("dim", ` → ${args.status}`);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme, _context) {
      const text = result.content[0]?.text ?? "";
      const firstLine = text.split("\n")[0];
      return new Text(result.isError ? theme.fg("error", firstLine) : firstLine, 0, 0);
    },
  });
}
