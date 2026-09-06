# GraphQL Patterns

Design the schema around client tasks and domain concepts, not table layout or resolver implementation details.

## Schema Contracts

- Use non-null fields only when the server can uphold that guarantee. A non-null list and non-null items express different contracts.
- Prefer additive schema changes and deprecate fields with a replacement and removal policy rather than versioning the endpoint.
- Define input types separately from output types. Validate input and authorization at the mutation boundary.
- Use connections with opaque cursors when clients need stable pagination over large or changing collections. Do not expose database offsets as cursors.
- Document field cost, nullability, authorization behavior, and error behavior for public schemas.

## Resolver Boundaries

- Keep resolvers thin and delegate domain rules to services or repositories.
- Request-scoped loaders must batch and cache by stable key to prevent N+1 queries. Verify query count for nested list fields.
- Do not use a process-global DataLoader cache for user-specific data; it can leak stale or unauthorized results.
- Select only requested fields when the data layer supports it, but do not let selection logic bypass authorization or domain invariants.

## Operations

- Queries must not mutate state. Mutations should return the updated object or a typed result that allows callers to handle expected failure.
- Use typed union or interface results for expected mutation failures. Reserve GraphQL execution errors for malformed, unavailable, or unexpected operations.
- Enforce depth, breadth, and complexity limits based on measured resolver cost. Reject over-budget queries with a clear client-safe error.
- Use persisted or allowlisted queries where arbitrary client queries create material performance or abuse risk.

### Typed mutation result

```graphql
union CreateUserResult = User | ValidationError | EmailAlreadyExists

type Mutation {
  createUser(input: CreateUserInput!): CreateUserResult!
}
```

## Security and Operations

- Authenticate before resolving protected fields and authorize at the object and field level where data sensitivity requires it.
- Apply rate limits and query budgets per caller or tenant, with controls that account for aliases and batched operations.
- Disable or restrict introspection only when the threat model requires it; schema documentation remains valuable to legitimate clients.
- Log operation name, safe complexity dimensions, latency, and request identifier. Never log credentials or sensitive variables.

## Common Pitfalls

| Pitfall | Consequence | Better approach |
|---------|-------------|-----------------|
| Schema mirrors tables | Leaks persistence and hinders evolution | Model client-facing domain concepts |
| Nested resolver loops | N+1 database queries | Request-scoped batching |
| Nullable errors hidden in data | Ambiguous client behavior | Publish typed error contracts |
| Unbounded query shape | Resource exhaustion | Depth, breadth, and cost limits |
| Global loader cache | Cross-request data leakage | Scope loader cache to each request |
| Removing a field abruptly | Client breakage | Deprecate and migrate consumers |
