# T13 Task renderer evidence

- Item: T13
- Changes: added pure renderer/settings helpers with hidden/compact/full modes. Hidden mode emits recovery guidance for `/tasks settings mode compact`; compact mode summarizes terminal states and redacts output.
- Verification: `task-renderer.test.ts` passed; extension typecheck exited 0.
