---
name: api-design
description: API design, REST, GraphQL, or authentication patterns.
---

# API Design

## References

Load only the reference needed for the request:

- [REST](rest-patterns.md)
- [GraphQL](graphql-patterns.md)
- [Authentication and authorization](auth-patterns.md)

## Process

1. Inspect the repository's existing API conventions and consumers.
2. Define the resource, operation, inputs, outputs, errors, authorization, and compatibility requirements.
3. Choose the simplest established pattern that meets those requirements.
4. Specify observable behavior before implementation.
5. Validate through the real protocol boundary when serialization, authentication, transport, or deployment behavior matters.

## Defaults

- Use resource nouns and standard HTTP methods for REST.
- Keep response and error shapes consistent with neighboring endpoints.
- Distinguish missing authentication (`401`) from insufficient permission (`403`).
- Parse external representations once at the boundary and pass validated domain values inward without exposing internal errors. Do not spread transport primitives through code that depends on stronger invariants.
- Put credentials in headers, never URLs.
- Add pagination, filtering, caching, rate limits, versioning, GraphQL depth limits, or DataLoaders only when the contract requires them.
- Prefer backward-compatible changes. For GraphQL fields, deprecate before removal.

## Error contract

Errors should provide a stable machine-readable code and a safe human-readable message. Add structured details only when consumers need them. Do not expose stack traces, database constraints, credentials, or internal identifiers.

## Review

Check only what the API contract uses:

- Resource and operation semantics.
- Request and response schemas.
- Status or GraphQL error behavior.
- Authentication and authorization.
- Compatibility with current consumers.
- Bounded collection behavior when required.
- Consumer-facing schema or OpenAPI documentation when required.
