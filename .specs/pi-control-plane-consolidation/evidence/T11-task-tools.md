# T11 Task tools evidence

- Item: T11
- Module placement: tools are registered from existing auto-discovered `pi/extensions/tasks.ts`; reusable helpers live under `pi/lib/`.
- Tool names: `task_create`, `task_batch_create`, `task_list`, `task_get`, `task_update`; deferred `task_execute`, `task_stop`, `task_output` return `deferred` and perform no execution.
- Verification: `task-tools.test.ts` passed.
