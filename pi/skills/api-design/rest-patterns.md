# REST API Design Patterns

Design resources around the domain and follow the repository's existing conventions.

## Resource Shape

- Use lowercase plural nouns for collections: `/users`, `/users/{id}`, and `/users/{id}/posts`.
- Use singleton paths only for true singletons, such as `/profile`.
- Use query parameters for filtering, sorting, searching, and field selection. Whitelist supported fields and operators.
- Model exceptional commands as explicit action sub-resources only when normal resource operations do not express the intent.
- Avoid endpoint variants that encode filters in paths or generic endpoints that dispatch by `type` and `action`.

## Compatibility

- Make compatible additions first: optional request fields, additive response fields, and new endpoints.
- Version only for a real breaking contract. Use the repository's chosen path, header, or media-type convention consistently.
- Deprecate with migration guidance and a removal date only when consumers and operational policy support it.

## Collections and Concurrency

- Bound every collection response and define deterministic ordering.
- Use offset pagination for small, stable sets. Use cursor or keyset pagination for large or changing sets where deep offsets or concurrent writes matter.
- Validate and cap page size; do not expose storage-specific cursors without signing or validating them.
- Use an `Idempotency-Key` for retryable create or action requests. Store the request identity and response for the retry window; reject a reused key with a different payload as `409 Conflict`.
- Use ETags or equivalent version fields with conditional updates when concurrent overwrite is a real risk; reject a stale `If-Match` update as `412 Precondition Failed`.

## Async Work

For work that cannot finish within the request budget, return `202 Accepted` with `Location: /operations/{id}` for a stable status resource. Define terminal states, failure details suitable for the caller, cancellation semantics if supported, and result retention.

## Request and Response Contracts

- Validate syntax, shape, business rules, and authorization before side effects.
- Use one documented error envelope across endpoints. Include a stable machine-readable code and a safe human-readable message; attach a request identifier when available.
- Do not expose database errors, stack traces, credentials, or internal topology.
- Choose a direct resource response or an envelope based on whether metadata is needed consistently. Do not mix shapes arbitrarily.
- Document request schemas, response schemas, authentication, pagination, error cases, and compatibility expectations in OpenAPI. Keep it synchronized with implementation.

### Example error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "email", "code": "INVALID_EMAIL" }]
  }
}
```

## Operational Controls

- Authenticate before applying per-principal rate limits; return retry guidance when a limit is exceeded.
- Use a rate-limit algorithm and limits based on measured workload and abuse risk, not a copied default.
- Set caching headers only when representation, privacy, and invalidation behavior are understood.
- Log request identifiers, outcome, latency, and safe dimensions needed to diagnose production behavior.

## Common Pitfalls

| Pitfall | Consequence | Better approach |
|---------|-------------|-----------------|
| Verb-based or filter-specific endpoints | Inconsistent resource model | Use resources and query parameters |
| Unbounded collections | Latency and memory failures | Order and paginate |
| Inconsistent errors | Fragile clients | Publish one error contract |
| Blind retries of creates | Duplicate side effects | Support idempotency keys where needed |
| Exposed implementation errors | Security and coupling risk | Return safe codes and messages |
| Undocumented breaking change | Client outage | Make compatible additions or version deliberately |
