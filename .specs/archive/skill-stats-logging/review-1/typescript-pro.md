- severity: high
  evidence: `pi/extensions/README.md` says every top-level `*.ts` file is auto-discovered as an extension and must default-export a factory. T5 allows `pi/extensions/skill-stats.test.ts`, which would be loaded at startup and fail or become a bogus extension.
  required_fix: Put tests under `pi/tests/` or a non-autodiscovered subdirectory, or use a non-`.ts` top-level suffix explicitly skipped by the loader.

- severity: high
  evidence: T4 requires structured skill-load events but only says to add an extension hook “if it can observe skill expansion.” Existing durable local path is `pi/extensions/skill-loader.ts`, whose handlers call `pi.sendUserMessage`; no plan step proves `pi.sendMessage(customType: ...)` inside that handler is persisted without triggering/visible report semantics.
  required_fix: In T1/T2, require identifying the exact emitter API and JSONL shape for hidden custom event persistence before implementation; otherwise mark forward logging unsupported.

- severity: medium
  evidence: `/skill-stats` as a new top-level file will auto-load only if it `export default function (pi: ExtensionAPI)`. T3 verifies only `registerCommand("skill-stats"`, so a named export or helper-only module can typecheck but fail runtime discovery.
  required_fix: Add acceptance/verification for a default extension factory matching `pi/extensions/README.md`, preferably by checking `export default function` and a runtime smoke load if available.

- severity: medium
  evidence: The parser contract says content may be JSON object or string, but session JSONL shapes are unknown until T1. Without discriminated `unknown` narrowing, implementers can parse assistant/tool/custom records unsafely and still satisfy visual grep checks.
  required_fix: Require strict parser tests with representative JSONL records for custom, user, assistant, and tool-call shapes, and forbid `any` in parser/public helper signatures.

- severity: medium
  evidence: Validation lists `cd pi/extensions && pnpm install --frozen-lockfile && pnpm run typecheck`, but tests may live in `pi/tests` per T5. Repo policy says Pi tests are pnpm-managed separately under `pi/tests`.
  required_fix: If any Vitest/unit test is added under `pi/tests`, require `cd pi/tests && pnpm install --frozen-lockfile && pnpm run test`; never use Bun/npm and do not rely on `make check` alone.
