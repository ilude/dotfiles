# ORM Patterns

Use the project's existing ORM style. Keep persistence boundaries explicit when domain logic, transaction coordination, or testability needs them; an active-record model is sufficient for small, simple applications.

## Query Safety and Loading

- Use parameterized ORM queries or query builders. Never interpolate untrusted values into query strings.
- Treat relationship access in loops as a likely N+1 query. Use the ORM's eager or batch loading strategy and inspect the generated query count.
- Select required fields and bound collection queries rather than loading full graphs by default.
- Do not rely on ORM abstraction to make a query portable or efficient. Check generated SQL and execution plans for critical paths.

## Transactions

- Group writes that must remain consistent in one short transaction.
- Let exceptions abort the transaction; do not commit partial state and attempt application-level compensation without a defined recovery design.
- Keep external calls outside a database transaction unless the consistency boundary explicitly requires coordination.

## Testing

- Use an isolated test database with the same relevant engine behavior as production.
- Prefer transaction rollback or deterministic cleanup between tests.
- Seed only the records needed by a test; fixtures must not hide relationship loading or constraint behavior.
- Test migrations and query behavior against the actual database where provider differences matter.

## Common Pitfalls

| Pitfall | Consequence | Mitigation |
|---------|-------------|------------|
| Lazy relationship access in a loop | N+1 queries | Eager or batch load deliberately |
| Detached entities | Lost updates or unexpected writes | Define unit-of-work and ownership boundaries |
| Long transactions | Lock contention | Keep work small and avoid external calls |
| Test-only database behavior | Production-only failures | Exercise production-equivalent database paths |
