---
paths:
  - "**/routes/**/*"
  - "**/api/**/*"
  - "**/endpoints/**/*"
  - "**/controllers/**/*"
  - "openapi.yaml"
  - "openapi.json"
  - "swagger.yaml"
  - "swagger.json"
  - "**/*.graphql"
  - "schema.graphql"
---

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

# API Design Patterns

Language-agnostic patterns for designing robust, scalable REST and GraphQL APIs. Focus on solving real problems with simple, maintainable solutions.

**Auto-activate when:** Working with API routes, endpoints, REST design, GraphQL schemas, OpenAPI/Swagger specs, authentication tokens, API documentation, or discussing endpoint design, versioning strategies, or API architecture.

## Reference Documentation

For detailed patterns and examples, see:
- @~/.claude/rules/api-design/rest-patterns.md - Resource naming, HTTP methods, status codes, versioning, pagination
- @~/.claude/rules/api-design/graphql-patterns.md - Schema design, queries, mutations, resolvers, N+1 prevention
- @~/.claude/rules/api-design/auth-patterns.md - API keys, JWT, OAuth2, permission models (RBAC/ABAC)

---

## Philosophy

- **Simple over clever** - Choose straightforward patterns that solve the problem
- **Consistency** - Apply patterns consistently across endpoints
- **Least Astonishment** - APIs should do what their names suggest, nothing more (see @~/.claude/rules/least-astonishment/)
- **Pragmatism** - Pick approaches based on actual use cases, not theoretical purity
- **No over-engineering** - Don't add features or complexity "just in case"

---

## CRITICAL: Avoid Complexity Theater

**Adding patterns is easy. Adding patterns WORTH THE COMPLEXITY is hard.**

Before recommending ANY API pattern, ask:

1. **Does this solve a real problem or a hypothetical one?**
   - "We might need..." vs "We currently need..."
   - YAGNI (You Aren't Gonna Need It) applies to APIs too

2. **Is the simpler approach sufficient?**
   - REST before GraphQL (unless you have N+1 query problems)
   - Query parameters before complex filtering DSLs
   - Flat responses before nested structures

3. **What's the maintenance cost?**
   - Every abstraction requires documentation, testing, and support
   - Versioning strategies add cognitive overhead

### The Complexity Theater Litmus Test

> "If I remove this pattern, what specific problem occurs in production?"

If the answer is vague ("flexibility", "future-proofing", "best practices"), the pattern may be theater.

### API Anti-Patterns to Avoid

| Anti-Pattern | Example | Problem |
|--------------|---------|---------|
| **Premature GraphQL** | "Use GraphQL for flexibility" | When you have 3 endpoints and 10 users |
| **Over-versioning** | "v1, v2, v3 for every change" | When backwards-compatible changes suffice |
| **Enterprise patterns** | "Add HATEOAS for discoverability" | When your API has 5 endpoints |
| **Pagination theater** | "Cursor-based pagination everywhere" | When datasets are under 1000 items |

---

## Core Design Principles

### REST Fundamentals
- Use **nouns** for resources, not verbs: `GET /users` not `GET /getUsers`
- Use **plural** for collections: `/users`, `/posts`
- Represent relationships hierarchically: `/users/{id}/posts`
- Use query parameters for filtering: `GET /users?role=admin&status=active`

### HTTP Methods
| Method | Purpose | Idempotent |
|--------|---------|-----------|
| GET | Retrieve | Yes |
| POST | Create | No |
| PUT | Replace | Yes |
| PATCH | Update | No |
| DELETE | Remove | Yes |

### GraphQL Principles
- **Deprecation over versioning** - Use `@deprecated` directive
- **DataLoaders for N+1 prevention** - MUST use batching for nested resolvers
- **Query depth limiting** - SHOULD limit to 10-15 levels

---

## Quick Reference Tables

### HTTP Status Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| 200 | OK | General success |
| 201 | Created | Resource created (POST) |
| 204 | No Content | Success, no body (DELETE) |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | Authenticated, no permission |
| 404 | Not Found | Resource doesn't exist |
| 422 | Unprocessable | Validation errors |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unexpected error |

### Authentication Methods

| Method | Best For | Complexity |
|--------|----------|------------|
| API Key | Service-to-service, simple APIs | Low |
| JWT | Public APIs, stateless auth | Medium |
| OAuth2 | Third-party integrations, "Login with X" | High |

### Pagination Strategies

| Strategy | Best For |
|----------|----------|
| Offset/Limit | Small, static datasets |
| Cursor-based | Large, growing datasets (RECOMMENDED) |
| Keyset | Natural sort fields |

---

## Error Response Format

**Standard structure:**
```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "details": {}
}
```

**Error codes (use consistently):**
- `INVALID_REQUEST` - Malformed request
- `VALIDATION_ERROR` - Field validation failed
- `AUTHENTICATION_FAILED` - Invalid credentials
- `INSUFFICIENT_PERMISSIONS` - Authorized but lacks permission
- `RESOURCE_NOT_FOUND` - 404
- `RESOURCE_ALREADY_EXISTS` - 409 on duplicate
- `INTERNAL_SERVER_ERROR` - 500

---

## Common Pitfalls

### Endpoint Explosion
```
Bad:  GET /users/admins, GET /users/active, GET /users/verified
Good: GET /users?role=admin&status=active&verified=true
```

### God Endpoints
```
Bad:  GET /data?type=users&action=delete&id=123
Good: DELETE /users/123
```

### Inconsistent Errors
Standardize error format across ALL endpoints.

### Missing Pagination
MUST paginate all collection endpoints. No unbounded result sets.

### Exposed Internals
```
Bad:  "ERROR: Unique constraint violation on users_email_idx"
Good: { "code": "VALIDATION_ERROR", "message": "Email already in use" }
```

### Credentials in URLs
```
Bad:  GET /api/data?api_key=secret123
Good: GET /api/data (Authorization: Bearer <token>)
```

---

## API Design Checklist

**MUST include:**
- [ ] Consistent endpoint structure
- [ ] Clear error responses
- [ ] Proper status codes
- [ ] Pagination on collections
- [ ] Authentication/authorization
- [ ] Request validation
- [ ] Documentation (OpenAPI/GraphQL schema)
- [ ] Caching headers (for REST)

---

**Note:** For project-specific API patterns, check `.claude/CLAUDE.md` in the project directory.
