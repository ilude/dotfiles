# REST API Design Patterns

Detailed reference for REST API design patterns including resource naming, HTTP methods, status codes, versioning, pagination, filtering, rate limiting, and request/response handling.

## Resource Naming Conventions

**Principles:**
- Use **nouns** for resource names, not verbs
- Use **lowercase** with hyphens for multi-word resources
- Represent relationships hierarchically
- Use **plural** for collections

```
Good patterns:
GET  /users
GET  /users/{id}
GET  /users/{id}/posts
GET  /users/{id}/posts/{post_id}/comments
POST /users
PUT  /users/{id}
DELETE /users/{id}

Avoid verbs:
GET /getUsers
GET /fetchUserById
POST /createUser
GET /getUserPosts
```

**Special cases:**
- **Singular for singleton resources:** `/profile`, `/settings` (user-specific, not collections)
- **Actions as sub-resources:** `/users/{id}/activate` (when GET/POST semantics don't fit)
- **Search/filter:** Use query parameters, not new endpoints
  - `GET /users?role=admin&status=active`
  - NOT `GET /users/admins` or `GET /active-users`

---

## HTTP Methods

| Method | Purpose | Idempotent | Safe | Has Body |
|--------|---------|-----------|------|----------|
| **GET** | Retrieve resource | Yes | Yes | No |
| **POST** | Create new resource | No | No | Yes |
| **PUT** | Replace entire resource | Yes | No | Yes |
| **PATCH** | Partial update | No | No | Yes |
| **DELETE** | Remove resource | Yes | No | No |
| **HEAD** | Like GET, no body | Yes | Yes | No |
| **OPTIONS** | Describe communication | Yes | Yes | No |

**Best practices:**
- **GET** - MUST NOT use for mutations; safe to retry
- **POST** - Create new or trigger actions; use 201 Created
- **PUT** - Full replacement; include all fields
- **PATCH** - Partial update; only changed fields
- **DELETE** - Use 204 No Content or 200 with body

**Avoid:** PATCH if API is simple; use PUT instead. Don't mix PUT/PATCH semantics.

---

## HTTP Status Codes

### 2xx Success
- `200 OK` - General success (GET, PUT with response body)
- `201 Created` - Resource created (POST)
- `204 No Content` - Success, no body (DELETE, PATCH with no response)
- `202 Accepted` - Request queued, will process asynchronously

### 3xx Redirection
- `301 Moved Permanently` - Resource moved (deprecated endpoints)
- `304 Not Modified` - Client cache valid (use ETag/If-None-Match)

### 4xx Client Error
- `400 Bad Request` - Invalid input (malformed JSON, missing fields)
- `401 Unauthorized` - Missing or invalid auth
- `403 Forbidden` - Authenticated but no permission
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Concurrent update or constraint violation
- `422 Unprocessable Entity` - Semantically invalid (validation errors)
- `429 Too Many Requests` - Rate limit exceeded

### 5xx Server Error
- `500 Internal Server Error` - Unexpected error
- `503 Service Unavailable` - Temporary downtime

---

## Versioning Strategies

### Option 1: URL Path (Explicit, Straightforward)
```
/api/v1/users
/api/v2/users
```
Pros: Clear, cacheable, explicit breaking changes
Cons: Multiple code paths, redundancy

### Option 2: Header-based (Clean URLs)
```
GET /api/users
Accept-Version: 1.0
```
Pros: Clean URLs, version handling logic centralized
Cons: Less obvious in browser/logs

### Option 3: Media Type (Accept header)
```
GET /api/users
Accept: application/vnd.myapi.v2+json
```
Pros: RESTful, content negotiation
Cons: Complex, less common

**Recommendation:** Use URL versioning for major changes. Avoid if possible - design for **forward compatibility**:
- Add fields without removing old ones
- Make new features optional
- Deprecated endpoints return 410 Gone with migration info

---

## Pagination Patterns

### Offset/Limit (Simple, works for small datasets)
```json
GET /users?offset=0&limit=20

Response:
{
  "data": [...],
  "pagination": {
    "offset": 0,
    "limit": 20,
    "total": 1500
  }
}
```

### Cursor-based (RECOMMENDED for large datasets)
```json
GET /users?cursor=abc123&limit=20

Response:
{
  "data": [...],
  "pagination": {
    "cursor": "next_cursor_xyz",
    "limit": 20,
    "has_more": true
  }
}
```
Pros: Efficient queries, works with distributed systems, stable under concurrent writes
Cons: Cursor generation logic needed, no random page access

### Keyset pagination (Efficient, uses natural ordering)
```
GET /users?after_id=123&limit=20
```
Use natural sort fields (ID, timestamp) instead of arbitrary cursors.

**Recommendation:**
- Small fixed datasets: offset/limit
- Large or growing datasets: cursor-based (RECOMMENDED)
- Simple endpoints: keyset pagination

---

## Idempotency Keys

For safe retries on non-idempotent operations (POST, PATCH):
```
POST /payments
X-Idempotency-Key: unique-client-generated-uuid

Request:
{
  "amount": 100,
  "currency": "USD"
}
```

**Implementation:**
- Client generates unique key per logical operation
- Server stores key + response for configured duration (e.g., 24 hours)
- Duplicate requests return cached response
- Use 409 Conflict if same key with different payload

---

## Conditional Requests

### ETags for cache validation
```
GET /users/123
Response:
ETag: "abc123xyz"
Last-Modified: Wed, 15 Jan 2025 10:30:00 GMT

Subsequent request:
GET /users/123
If-None-Match: "abc123xyz"

Response (if unchanged):
304 Not Modified
```

### Optimistic locking for updates
```
PUT /users/123
If-Match: "abc123xyz"
{
  "name": "Updated Name"
}

Response (if changed by another client):
412 Precondition Failed
```

---

## Async Operations

For long-running operations, use `202 Accepted` with job tracking:
```
POST /reports/generate
{
  "type": "monthly-sales"
}

Response:
HTTP/1.1 202 Accepted
Location: /jobs/job-123

{
  "job_id": "job-123",
  "status": "pending",
  "status_url": "/jobs/job-123"
}
```

**Poll for completion:**
```
GET /jobs/job-123

Response (in progress):
{
  "job_id": "job-123",
  "status": "processing",
  "progress": 45
}

Response (complete):
{
  "job_id": "job-123",
  "status": "completed",
  "result_url": "/reports/report-456"
}
```

---

## Filtering, Sorting, Searching

### Filtering
```
GET /users?role=admin&status=active&department=sales
GET /posts?created_after=2024-01-01&created_before=2024-12-31
```

### Sorting
```
GET /users?sort=name,-created_at
(hyphen = descending)

Or explicit:
GET /users?sort_by=name&sort_order=asc
```

### Searching
```
GET /users?search=john
GET /posts?q=api+design

(Full-text search, implementation-specific)
```

**Validation:**
- Whitelist allowed filter/sort fields
- Escape search queries (SQL injection prevention)
- Limit result count with pagination

---

## Rate Limiting

### Headers
```
HTTP/1.1 200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 998
X-RateLimit-Reset: 1629801600
```

### When limit exceeded
```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

### Strategies
- **Token bucket** - Smooth bursts, standard
- **Leaky bucket** - Even distribution
- **Fixed window** - Simple, vulnerable to boundary abuse
- **Sliding window** - Balanced complexity/accuracy

**Recommendation:** Token bucket per user/API key with reasonable defaults (e.g., 1000 req/hour).

---

## Request/Response Patterns

### Request Validation

**Validate early:**
```
1. Schema validation (required fields, types)
2. Format validation (email, UUID, dates)
3. Business logic validation (duplicate check, range)
4. Return appropriate error
```

**Request validation example:**
```json
POST /users
{
  "email": "user@example.com",
  "name": "John Doe",
  "age": 30
}
```

**Validation error response (400/422):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "code": "INVALID_EMAIL",
        "message": "Invalid email format"
      },
      {
        "field": "age",
        "code": "OUT_OF_RANGE",
        "message": "Age must be >= 18"
      }
    ]
  }
}
```

### Error Response Format

**Consistent error structure:**
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "User with id 123 does not exist",
    "status": 404,
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_abc123xyz"
  }
}
```

Or simplified for simple APIs:
```json
{
  "code": "INVALID_REQUEST",
  "message": "Missing required field: email"
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

### Success Response Format

**Envelope pattern (good for APIs with metadata):**
```json
{
  "data": {
    "id": "123",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0"
  }
}
```

**Direct pattern (simpler, common in modern APIs):**
```json
{
  "id": "123",
  "name": "John Doe",
  "email": "john@example.com"
}
```

**Collection response:**
```json
{
  "data": [
    { "id": "1", "name": "User 1" },
    { "id": "2", "name": "User 2" }
  ],
  "pagination": {
    "cursor": "next_page",
    "limit": 20
  }
}
```

**Recommendation:** Keep responses consistent. Use envelopes if you need pagination/meta at root level. For collections, include pagination separately.

### Partial Responses (Optional)

Allow clients to request specific fields:
```
GET /users/123?fields=id,name,email
```

Reduces bandwidth for large objects. Implement via field selection in queries (GraphQL does this naturally).

---

## OpenAPI Documentation

All REST endpoints MUST be documented with OpenAPI specs:
- Include request/response schemas
- Document all status codes
- Provide example values
- Use `$ref` for reusable components
- Keep spec in sync with implementation (generate or validate in CI)

### Minimal Example
```yaml
openapi: 3.0.0
info:
  title: User API
  version: 1.0.0
paths:
  /users:
    get:
      summary: List users
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: User list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
    post:
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'

components:
  schemas:
    User:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
        email: { type: string }
      required: [id, name, email]
```

### Tools
- Swagger UI - Interactive exploration
- ReDoc - Clean documentation
- Postman - API client and testing
