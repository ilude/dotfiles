const STATUS_KEY = "damage-control-recovery";
const STATUS_TEXT = "damage-control: recovery";
const LOCKED_REASON =
  "Damage-control recovery is locked. Model tools remain disabled until the operator confirms this explicit interactive recovery launch. Exit Pi and relaunch pp normally after repair.";

function boundedError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]+/g, " ").trim().slice(0, 300);
}

function defaultInteractiveProcessCheck() {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export function createRecoveryExtension(isInteractiveProcess = defaultInteractiveProcessCheck) {
  return function damageControlRecovery(pi) {
    let released = false;
    let lockReason = LOCKED_REASON;

    // This guard must be the first registration. It remains installed if any
    // later recovery initialization or UI operation fails.
    pi.on("tool_call", () => {
      if (released) return undefined;
      return { block: true, reason: lockReason };
    });

    try {
      pi.on("session_start", async (_event, ctx) => {
        released = false;
        lockReason = LOCKED_REASON;

        try {
          const activeTools = pi.getActiveTools();
          pi.setActiveTools([]);
          ctx.ui.setStatus(STATUS_KEY, STATUS_TEXT);

          if (ctx.mode !== "tui" || !ctx.hasUI || !isInteractiveProcess()) {
            lockReason =
              "Damage-control recovery requires TUI mode with this process attached to interactive stdin and stdout. Model tools remain disabled; exit and rerun pp --dc-recovery in a terminal.";
            return;
          }

          const confirmed = await ctx.ui.confirm(
            "DAMAGE-CONTROL RECOVERY",
            "This explicit mode temporarily releases model tools so you and Pi can repair damage-control. It does not persist. Confirm only in this terminal. Exit with Ctrl+D (or /quit), then relaunch pp normally to restore protection.",
            { signal: ctx.signal },
          );
          if (confirmed !== true || ctx.signal?.aborted) {
            lockReason =
              "Damage-control recovery was denied or cancelled. Model tools remain disabled; exit and rerun pp --dc-recovery to try again.";
            return;
          }

          // Restore the exact tool selection that Pi established for this run.
          // Set released only after restoration succeeds.
          pi.setActiveTools(activeTools);
          released = true;
        } catch (error) {
          released = false;
          lockReason = `Damage-control recovery initialization failed; model tools remain disabled: ${boundedError(error)}. Exit and repair or rerun pp --dc-recovery.`;
        }
      });

      pi.on("session_shutdown", () => {
        released = false;
        lockReason = LOCKED_REASON;
      });
    } catch (error) {
      lockReason = `Damage-control recovery helper failed after installing its guard; model tools remain disabled: ${boundedError(error)}. Exit and repair the helper.`;
    }
  };
}

export default createRecoveryExtension();
