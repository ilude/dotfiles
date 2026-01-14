# Authentication & Authorization Patterns

Detailed reference for API authentication and authorization patterns including API keys, JWT, OAuth2, role-based and attribute-based access control.

## API Key Pattern

**Simple, good for service-to-service:**
```
GET /api/data
Authorization: Bearer api_key_xyz

or

GET /api/data?api_key=xyz123
```

**Pros:** Simple, easy to debug
**Cons:** Less secure than OAuth2, no scoping

**Storage:** Use secure vaults, MUST NOT log keys, rotate regularly.

---

## JWT (JSON Web Token)

### Flow
```
1. Client authenticates (POST /auth/login)
2. Server returns JWT
3. Client includes in Authorization header
4. Server validates signature

GET /api/protected
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### JWT structure
`header.payload.signature`

```json
Header: { "alg": "HS256", "typ": "JWT" }
Payload: { "sub": "user123", "exp": 1629801600, "scope": "read write" }
Signature: HMACSHA256(header.payload, secret)
```

### Best practices
- Store secret securely (environment variable, vault)
- Include expiration (`exp`)
- Use HTTPS only
- Validate signature on every request
- Refresh tokens for long-lived sessions
- Include scopes for fine-grained permissions

### Token Refresh Flow
```
1. Client receives access_token (short-lived) + refresh_token (long-lived)
2. Access token expires
3. Client calls POST /auth/refresh with refresh_token
4. Server validates refresh_token, issues new access_token
5. Optionally rotate refresh_token
```

### Security Considerations
- **Access token:** Short expiry (15 min - 1 hour)
- **Refresh token:** Longer expiry (days - weeks), store securely
- **Token revocation:** Maintain blacklist or use short-lived tokens
- **Audience claim:** Validate `aud` to prevent token reuse across services

---

## OAuth2 (Delegated Authorization)

### Authorization Code Flow
```
1. User clicks "Login with Google"
2. Redirect to OAuth provider
3. User authenticates with provider
4. Provider redirects back with auth code
5. Server exchanges code for access token
6. Server gets user info, creates session
```

### Flow Diagram
```
Client                    Your Server              OAuth Provider
  |                           |                          |
  |-- Click "Login" --------->|                          |
  |                           |-- Redirect to provider ->|
  |<--------------------------|                          |
  |-- User authenticates ----------------------------->|
  |<-------------------------- Auth code + redirect ---|
  |                           |<-- Exchange code --------|
  |                           |-- Access token --------->|
  |                           |<-- User info ------------|
  |<-- Session created -------|                          |
```

### When to use
- Third-party integrations
- User account delegation
- "Login with X" functionality

### Scopes
```
scope=read write user:email profile
```

Define minimal scopes needed for your application.

### Client Credentials Flow (Service-to-Service)
```
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=your_client_id
&client_secret=your_client_secret
&scope=read write
```

Use for backend service communication where no user context is needed.

---

## Permission Models

### Role-based (RBAC)

```
User -> Role(s) -> Permission(s)

admin: can do everything
moderator: can delete comments, ban users
user: can create posts, read public data
```

**Implementation:**
```python
# Simple RBAC check
ROLE_PERMISSIONS = {
    "admin": ["read", "write", "delete", "manage_users"],
    "moderator": ["read", "write", "delete"],
    "user": ["read", "write"]
}

def has_permission(user_role, required_permission):
    return required_permission in ROLE_PERMISSIONS.get(user_role, [])
```

### Attribute-based (ABAC)

```
Can user perform action on resource?

Policy: user can delete post if:
  - user.role == "admin" OR
  - resource.owner_id == user.id OR
  - user.created_at < resource.created_at - 24hours
```

**Implementation:**
```python
# ABAC policy evaluation
def can_delete_post(user, post):
    if user.role == "admin":
        return True
    if post.owner_id == user.id:
        return True
    if user.is_moderator and post.flagged:
        return True
    return False
```

### Recommendation
Start with RBAC (simpler). Move to ABAC only if needed for complex, attribute-dependent policies.

---

## Implementation Patterns

### Middleware approach
```
1. Extract user/token from request
2. Load user permissions
3. Check against required permission
4. Allow/deny
```

### Example middleware (pseudo-code)
```python
def auth_middleware(required_permission):
    def middleware(request, next):
        # 1. Extract token
        token = extract_bearer_token(request.headers)
        if not token:
            return Response(401, "Unauthorized")

        # 2. Validate token, get user
        try:
            user = validate_token(token)
        except InvalidToken:
            return Response(401, "Invalid token")

        # 3. Check permission
        if not has_permission(user, required_permission):
            return Response(403, "Forbidden")

        # 4. Attach user to request, continue
        request.user = user
        return next(request)

    return middleware
```

### Decorator pattern
```python
@require_permission("posts:write")
def create_post(request):
    # Only reached if user has posts:write permission
    ...
```

---

## Security Best Practices

### General
- Always use HTTPS
- Never log tokens or credentials
- Implement rate limiting on auth endpoints
- Use secure, httpOnly cookies for session tokens in browsers

### Token Storage (Browser)
- **Access token:** Memory only (JavaScript variable)
- **Refresh token:** httpOnly cookie (prevents XSS)
- **Never:** localStorage for sensitive tokens

### API Key Management
- Rotate keys regularly
- Support multiple active keys for rotation
- Hash keys before storing (like passwords)
- Provide key prefix for identification (e.g., `sk_live_`, `pk_test_`)

### Common Vulnerabilities
| Vulnerability | Prevention |
|--------------|------------|
| Token theft | Short expiry, HTTPS, secure storage |
| CSRF | SameSite cookies, CSRF tokens |
| XSS | httpOnly cookies, input sanitization |
| Brute force | Rate limiting, account lockout |
| Token replay | Include nonce, check `iat` claim |

---

## Error Responses

### Authentication errors (401)
```json
{
  "code": "AUTHENTICATION_FAILED",
  "message": "Invalid or expired token"
}
```

### Authorization errors (403)
```json
{
  "code": "INSUFFICIENT_PERMISSIONS",
  "message": "You do not have permission to delete this resource"
}
```

### Rate limit errors (429)
```json
{
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many authentication attempts",
  "retry_after": 60
}
```
