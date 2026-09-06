# Authentication & Authorization Patterns

Choose the simplest credential and permission model that meets the actual trust boundary.

## Credential Models

| Model | Suitable use | Key controls |
|-------|--------------|--------------|
| API key | Server-to-server integration | Scope, rotate, hash at rest, never place in URLs |
| Signed access token | Stateless client access | Verify signature, issuer, audience, expiry, and scopes |
| OAuth authorization code | Delegated user access | Registered redirects, PKCE, narrow scopes, server-side exchange |
| Client credentials | Service identity without a user | Audience-bound token and least-privilege scopes |

Do not select OAuth solely because it is common. Use it when a user delegates access to another client or service. Use established provider libraries and the current OAuth security guidance rather than implementing a protocol flow from scratch.

## Tokens and Sessions

- Validate signature and all relevant claims on every request. Never accept an unsigned token or trust token data before verification.
- Use short-lived access tokens. Protect refresh tokens more strongly, rotate them when supported, and revoke or invalidate them on logout, compromise, and credential changes according to the session policy.
- Store browser session credentials in secure, httpOnly, appropriately scoped cookies when cookie sessions fit the application. Do not put long-lived sensitive tokens in browser storage.
- Use HTTPS for every credential-bearing flow. Do not log authorization headers, tokens, secrets, or raw credentials.
- Return generic authentication failures so callers cannot enumerate users, tokens, or internal validation steps.

## Authorization

- Authenticate first, then authorize every operation against the acting principal, action, and target resource.
- Start with role-based access control when permissions map cleanly to roles. Move to attribute or policy-based checks only when ownership, tenancy, state, or contextual rules require it.
- Keep permission names domain-oriented and reviewable, such as `posts:write`; do not infer authority from client-supplied roles or identifiers.
- Enforce tenant and object-level access in the service or data boundary, not only in route middleware or user-interface visibility.
- Deny by default. Record authorization decisions with safe audit context where the domain requires it.

## Middleware Boundary

Middleware may extract credentials, validate identity, attach a trusted principal, and enforce broad route policy. Domain services must still enforce resource-specific authorization so background jobs, GraphQL resolvers, and alternate entrypoints cannot bypass it.

## Operational Controls

- Rate-limit login, token refresh, recovery, and credential-creation endpoints based on measured abuse risk.
- Support overlapping active keys during rotation and identify keys by a non-secret prefix.
- Hash API keys before storage when lookup design permits; display the full secret only at creation time.
- Set secure cookie attributes, protect state-changing cookie requests from CSRF, and validate redirect destinations.
- Test expired, revoked, wrong-audience, wrong-tenant, and insufficient-permission cases through the same entrypoints as production.

## Common Vulnerabilities

| Vulnerability | Prevention |
|--------------|------------|
| Token theft | Short expiry, HTTPS, safe storage, and revocation policy |
| Token replay | Audience, expiry, nonce or sender constraints where applicable |
| Cross-site request forgery | SameSite cookies and CSRF protection for state changes |
| Cross-site scripting impact | httpOnly cookies, output safety, and minimal token exposure |
| Brute force | Rate limits, monitoring, and recovery controls |
| Privilege escalation | Server-side object and tenant authorization |

## Error Responses

Use a consistent, non-enumerating error contract. Authentication failures return 401, authorization failures return 403, and rate limits return retry guidance. Include a stable error code without exposing credential or policy details.
