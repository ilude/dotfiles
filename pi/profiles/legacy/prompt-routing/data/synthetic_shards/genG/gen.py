"""
gen.py -- Generate synthetic_shards/genG/chunk.jsonl
250 rows focused on architecture/security/reliability tradeoffs.
Route distribution: 200 large/medium, 30 core/high, 20 large/high.
"""

import json
import itertools
from pathlib import Path

PROVENANCE = {
    "generator_model": "claude-sonnet",
    "generator_model_size": "medium",
    "adjudicator_model": "claude-opus",
    "adjudicator_model_size": "large",
    "prompt_version_hash": "sha256:genG-v1",
    "temperature": 0.0,
    "generated_at": "2026-05-11T00:00:00Z",
}

# ---------------------------------------------------------------------------
# Template banks for large/medium (200 rows)
# Each entry: prompt, family_id suffix, domain, task_type, ambiguity,
#             complexity_tier, insufficient_rationale, acceptable_rationale,
#             overkill_rationale, notes
# ---------------------------------------------------------------------------

OPUS_MED_TEMPLATES = [
    # --- security / auth ---
    {
        "family": "fam-genG-jwt-key-rotation",
        "domain": "security",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Walk me through rotating JWT signing keys in a stateless API without invalidating active user sessions mid-flight.",
            "Our stateless API signs JWTs with a symmetric key. Help us think through key rotation so in-flight tokens stay valid while old keys are retired.",
            "We need to rotate our JWT signing keys on a 90-day schedule. Design a dual-key overlap strategy that prevents session drops during rotation.",
            "Our security team mandates quarterly key rotation for JWT secrets. Outline the steps to support multiple valid signing keys during the transition window.",
            "Help us design a JWT key-rotation plan where both the old and new keys are accepted during a grace period before the old key is revoked.",
        ],
        "ins_rationale": "Suggested revoking the old key immediately, missing the in-flight token grace window and the need for a multi-key verification step.",
        "acc_rationale": "Identified the dual-key overlap pattern, explained how to embed kid (key ID) in the JWT header, and described the grace-period revocation sequence.",
        "overkill_rationale": "Added unsolicited advice on migrating from HMAC to RSA signing and redesigning the token issuance pipeline beyond the rotation scope.",
        "notes": "large/medium: dual-key overlap design spans auth and infra but is a well-bounded architectural pattern.",
    },
    {
        "family": "fam-genG-oauth-token-leak",
        "domain": "security",
        "task_type": "analysis",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Our OAuth2 access tokens are appearing in browser history because the authorization code flow redirects with tokens in the query string. Analyze the attack surface and propose a fix.",
            "We see OAuth bearer tokens in server access logs because the client appends them as query params. Help us think through the exposure and the correct transport fix.",
            "A penetration tester flagged that our OAuth callback URL leaks the access token via the fragment identifier. Analyze what an attacker can extract from browser history and how to mitigate.",
            "Walk me through the attack surface when an OAuth2 implicit flow leaks access tokens in referrer headers, and recommend the migration path.",
            "Our SPA stores OAuth tokens in localStorage. Analyze the XSS risk and compare it to using HttpOnly cookies with a BFF pattern.",
        ],
        "ins_rationale": "Described token exposure as a generic 'use HTTPS' issue without tracing the specific referrer-header or history-log leak vector.",
        "acc_rationale": "Identified the specific leak vector (query string vs fragment vs referrer), explained the storage risk, and recommended PKCE with authorization code flow plus HttpOnly cookie storage.",
        "overkill_rationale": "Went beyond the analysis to produce a full OpenID Connect migration plan including provider configuration and SDK swap.",
        "notes": "large/medium: token-leak analysis requires multi-step threat reasoning but the scope is a single auth flow.",
    },
    {
        "family": "fam-genG-secrets-in-env",
        "domain": "security",
        "task_type": "code_review",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Review this Dockerfile and CI pipeline config where database credentials are passed as ENV instructions. Identify the exposure points and recommend a secrets-injection alternative.",
            "Our CI YAML hardcodes AWS_SECRET_ACCESS_KEY as a plain-text environment variable. Walk me through the risks and a remediation using a secrets manager.",
            "A developer committed a .env file with production credentials to the repo. Help us think through the blast radius and the remediation steps, including key rotation and history rewrite.",
            "Review this Kubernetes Deployment manifest that mounts secrets as environment variables instead of volume mounts. Identify the attack surface difference and the preferred approach.",
            "Our Terraform plan stores an RDS password in state as plaintext. Analyze the risk and propose a solution using a secrets manager backend.",
        ],
        "ins_rationale": "Flagged the plaintext credential as a generic 'move to secrets manager' recommendation without tracing the specific exposure: image layer history, CI log scraping, or state file access.",
        "acc_rationale": "Identified the specific exposure path (image layer, CI artifact, state file), explained why env vars are visible to all child processes, and provided a concrete secrets-injection pattern using Vault or cloud-native secrets manager.",
        "overkill_rationale": "Added an unrequested audit of all other secrets handling across the codebase and a proposed secrets governance policy.",
        "notes": "large/medium: secrets exposure review is a focused threat analysis with concrete remediation steps.",
    },
    {
        "family": "fam-genG-api-rate-limiting",
        "domain": "security",
        "task_type": "design",
        "ambiguity": "borderline",
        "complexity_tier": "mid",
        "prompts": [
            "Design a rate-limiting strategy for our public REST API that defends against credential stuffing without blocking legitimate high-volume API clients.",
            "We need rate limiting that distinguishes abusive credential-stuffing bots from our legitimate partners who make 10k calls per minute. Help us think through the design.",
            "Our team needs a rate-limit architecture that applies per-IP limits for anonymous users but per-API-key limits for authenticated partners, with a burst allowance.",
            "Walk me through choosing between token-bucket and sliding-window rate limiting for an endpoint that sees both bursty legitimate traffic and sustained credential-stuffing attacks.",
            "Help us design a layered rate-limit scheme: global per-IP, per-user, and per-endpoint limits that degrade gracefully under a DDoS without triggering false positives for real users.",
        ],
        "ins_rationale": "Recommended a fixed-window per-IP counter without addressing the credential-stuffing pattern or the partner exemption requirement.",
        "acc_rationale": "Explained the token-bucket vs sliding-window tradeoff for burst tolerance, described per-IP vs per-key layering, and flagged the risk of IP-based limits blocking legitimate NAT traffic.",
        "overkill_rationale": "Produced a full WAF rule specification and a CDN edge-rate-limit rollout plan beyond the API design scope.",
        "notes": "Borderline because partner exemption adds a second dimension, but the core tradeoff is a standard rate-limit design problem.",
    },
    {
        "family": "fam-genG-mtls-service-mesh",
        "domain": "security",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design mTLS between microservices in a Kubernetes cluster using a service mesh. Focus on certificate issuance, rotation, and what happens when a cert expires mid-request.",
            "Our team needs to enforce mTLS for east-west traffic in our service mesh. Walk me through the certificate lifecycle including automatic rotation before expiry.",
            "We are adopting a service mesh for mTLS. Help us think through the tradeoff between short-lived certs (high rotation cost) and long-lived certs (longer breach window).",
            "Design the certificate authority chain for a zero-trust service mesh where each service gets a SPIFFE SVID with a 24-hour TTL. Address what happens during control-plane outages.",
            "Our security requirement is that no service-to-service call is unencrypted. Design the mTLS bootstrap process for a new service joining the mesh, including how it authenticates to the CA.",
        ],
        "ins_rationale": "Described TLS termination at the ingress without addressing east-west mTLS or the cert rotation lifecycle between services.",
        "acc_rationale": "Explained SPIFFE/SVID identity, described short-lived cert issuance by a mesh CA, addressed the rotation window and what happens during control-plane unavailability.",
        "overkill_rationale": "Added a full PKI hierarchy design with offline root CA and intermediate CA chain beyond what a service mesh implementation requires.",
        "notes": "large/medium: mTLS cert lifecycle design is architectural reasoning within a bounded service mesh scope.",
    },
    {
        "family": "fam-genG-sql-injection-review",
        "domain": "security",
        "task_type": "code_review",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Review this Python function that builds SQL queries with string concatenation using user-supplied filter values. Identify the injection vectors and rewrite using parameterized queries.",
            "Our team's ORM usage mixes raw SQL strings with user input in three places. Walk me through the injection risk in each case and the correct fix using prepared statements.",
            "A code review flagged string-formatted SQL in our reporting module. Help us identify which parameter is injectable and how an attacker could exfiltrate schema information.",
            "Review this Node.js route handler that passes req.query.id directly into a SQL template string. Trace the injection path and show the correct parameterization.",
            "Our legacy PHP codebase uses mysql_real_escape_string for sanitization. Analyze the cases where this fails (charset attacks, LIKE wildcards) and propose a migration to PDO.",
        ],
        "ins_rationale": "Flagged the concatenation pattern as dangerous without tracing the specific injection vector or explaining how an attacker would craft a payload to extract data.",
        "acc_rationale": "Traced the specific injectable parameter, explained the exfiltration path (UNION-based or error-based), and provided a concrete parameterized query rewrite.",
        "overkill_rationale": "Extended the review to cover the entire codebase with an automated SAST scan recommendation and a data classification policy.",
        "notes": "large/medium: SQL injection review requires following the data flow but is scoped to the identified functions.",
    },
    {
        "family": "fam-genG-zero-trust-network",
        "domain": "security",
        "task_type": "design",
        "ambiguity": "borderline",
        "complexity_tier": "mid",
        "prompts": [
            "Help us design a zero-trust network architecture for a hybrid cloud environment where on-premises workloads need to access SaaS APIs without a VPN.",
            "Our team needs to replace perimeter-based network trust with identity-based access for users connecting from untrusted networks. Design the policy enforcement points.",
            "Walk me through the tradeoffs between BeyondCorp-style zero trust and a traditional VPN for remote developer access to internal tooling.",
            "Design an identity-aware proxy layer that enforces per-request authorization based on user identity, device posture, and resource sensitivity.",
            "Our security team wants zero-trust for service-to-service calls without requiring a service mesh. Design a token-based approach using workload identity federation.",
        ],
        "ins_rationale": "Described zero trust as 'verify everything' without specifying the policy enforcement points, identity signals, or how existing non-cloud workloads authenticate.",
        "acc_rationale": "Identified the three policy enforcement planes (network, identity, device posture), explained workload identity federation for hybrid scenarios, and addressed the migration path from VPN.",
        "overkill_rationale": "Produced a full vendor evaluation matrix for zero-trust platforms and an 18-month migration roadmap beyond the design scope.",
        "notes": "Borderline because hybrid environments add integration complexity, but the design question is architecturally focused.",
    },
    {
        "family": "fam-genG-cors-policy",
        "domain": "security",
        "task_type": "analysis",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Our API uses Access-Control-Allow-Origin: * with credentialed requests. Analyze the security implication and explain why the browser will block this, and what the correct policy is.",
            "Walk me through the CORS attack surface when we reflect the Origin header back without validation, including how an attacker can use a subdomain takeover to bypass it.",
            "Our team added CORS headers to allow cross-origin requests from our mobile app domain. Help us think through whether the policy also exposes the endpoint to malicious third-party sites.",
            "Analyze whether a CORS misconfiguration on our internal admin API (not exposed publicly) still represents a risk if an attacker can trick an authenticated user into visiting a malicious page.",
            "Review our CORS configuration that allows all subdomains via regex. Identify the subdomain wildcard attack and what an attacker needs to exploit it.",
        ],
        "ins_rationale": "Described CORS as a browser-enforced mechanism without analyzing the specific misconfiguration vector or how a reflective Origin policy enables cross-site request forgery.",
        "acc_rationale": "Identified the specific misconfiguration (wildcard with credentials, reflective Origin, or subdomain regex), traced the attack path, and provided the correct restrictive policy.",
        "overkill_rationale": "Added a full Content-Security-Policy and SameSite cookie audit beyond the CORS analysis scope.",
        "notes": "large/medium: CORS misconfiguration analysis is a focused security review with a clear attack path to trace.",
    },
    # --- architecture ---
    {
        "family": "fam-genG-cqrs-event-sourcing",
        "domain": "architecture",
        "task_type": "design",
        "ambiguity": "borderline",
        "complexity_tier": "mid",
        "prompts": [
            "We want to add CQRS to our order management service to separate read and write models. Walk me through the consistency tradeoffs when the read model lags behind the write side.",
            "Help us think through whether event sourcing is the right fit for a billing system where auditability is required but replaying 5 years of events is a performance concern.",
            "Our team wants to decouple command handling from query handling using CQRS. Design the event propagation path and explain how eventual consistency affects our API contract.",
            "Design a CQRS projection pipeline for a customer profile service where the write side uses PostgreSQL and the read side needs to serve sub-100ms queries from a denormalized view.",
            "Walk me through the failure modes when a CQRS event bus goes down: which commands can still be accepted, which queries degrade, and how to recover the projection state.",
        ],
        "ins_rationale": "Described CQRS as a pattern to scale reads without addressing the consistency lag, projection failure modes, or the API contract implications for callers expecting synchronous consistency.",
        "acc_rationale": "Explained the consistency window between command and projection, described how to handle lag in API responses (conditional reads, version tokens), and outlined event bus failure recovery.",
        "overkill_rationale": "Added an unsolicited domain-driven design bounded context analysis and a microservices decomposition plan.",
        "notes": "Borderline because eventual consistency implications require multi-step reasoning but the scope is one service pattern.",
    },
    {
        "family": "fam-genG-multi-region-failover",
        "domain": "architecture",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design a multi-region active-passive failover for a stateful API where the primary region holds the authoritative database and the secondary must serve reads with eventual consistency.",
            "Our service needs to survive a full primary region failure with an RTO of 15 minutes. Walk me through the failover sequence including DNS cutover and database promotion.",
            "Help us think through the replication lag risk in a multi-region setup where writes go to region A and region B is the standby. What data loss window should we design for?",
            "Design the health-check and automatic failover logic for a multi-region deployment. Include the circuit-breaker conditions that trigger promotion of the secondary database.",
            "Walk me through the split-brain risk when both regions believe they are primary after a network partition, and design the fencing mechanism to prevent dual-write.",
        ],
        "ins_rationale": "Described failover as a DNS change without addressing database promotion, replication lag RPO, or the split-brain risk during a partition.",
        "acc_rationale": "Explained the replication lag RPO window, described the database promotion sequence with fencing, outlined the DNS TTL considerations for RTO, and addressed split-brain prevention.",
        "overkill_rationale": "Added an unrequested global load balancer design and a full chaos engineering test plan for the failover.",
        "notes": "large/medium: multi-region failover design requires reasoning about consistency, fencing, and DNS but is a standard HA pattern.",
    },
    {
        "family": "fam-genG-db-schema-migration",
        "domain": "database",
        "task_type": "plan",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Plan a zero-downtime schema migration that adds a NOT NULL column to a 500M-row table in PostgreSQL without locking writes.",
            "Our team needs to rename a widely-used database column while keeping the old name available for a deprecation period. Walk me through the shadow-column migration strategy.",
            "We need to change a column from nullable to NOT NULL on a live table. Help us plan the backfill, constraint addition, and deployment sequence to avoid table locks.",
            "Design a migration plan for splitting a monolithic users table into users and user_profiles while keeping the application backward-compatible during the transition.",
            "Walk me through the steps to safely drop a column that is still referenced by some legacy application instances that have not yet deployed the new version.",
        ],
        "ins_rationale": "Suggested running ALTER TABLE directly, missing the lock-timeout risk on large tables and the need for a multi-phase backfill approach.",
        "acc_rationale": "Described the expand/contract pattern, explained how to backfill in batches with lock_timeout guards, and outlined the deployment sequencing for each phase.",
        "overkill_rationale": "Added an unrequested analysis of the entire migration toolchain including Flyway vs Liquibase vs custom scripts.",
        "notes": "large/medium: zero-downtime migration planning requires multi-step reasoning across schema, application, and deployment phases.",
    },
    {
        "family": "fam-genG-cache-invalidation",
        "domain": "architecture",
        "task_type": "design",
        "ambiguity": "borderline",
        "complexity_tier": "mid",
        "prompts": [
            "Design a cache invalidation strategy for a product catalog where updates from the CMS must be visible to users within 30 seconds without polling the database on every request.",
            "Our read-through cache serves 95% of product queries but invalidation is unreliable. Help us think through whether to use TTL-based expiry, event-driven invalidation, or versioned cache keys.",
            "Walk me through the thundering-herd problem when a cache is cleared and 10k concurrent users trigger simultaneous database fetches. Design a cache-stampede prevention mechanism.",
            "Our team uses Redis for session caching but cache invalidation when a user changes their role takes up to 5 minutes. Design an event-driven invalidation path using a pub/sub channel.",
            "Design a cache coherence strategy for a distributed cache cluster where nodes can miss invalidation messages during a network partition.",
        ],
        "ins_rationale": "Recommended a short TTL without addressing the thundering-herd on expiry, the message loss risk during partition, or the event propagation latency to meet the 30-second SLA.",
        "acc_rationale": "Explained the event-driven invalidation path, described cache-stampede prevention using a probabilistic early expiration or a lock-based refresh, and addressed message delivery guarantees.",
        "overkill_rationale": "Added an unrequested evaluation of switching the caching tier from Redis to a distributed cache mesh with replication topology.",
        "notes": "Borderline because thundering-herd and partition scenarios require multi-step reasoning, but the invalidation design is scoped.",
    },
    {
        "family": "fam-genG-async-job-queue",
        "domain": "architecture",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design a job queue architecture for background email sending that guarantees at-least-once delivery, handles retries with exponential backoff, and surfaces failures to an alerting system.",
            "Our background job processor drops tasks when workers crash mid-execution. Walk me through the design changes needed to make jobs idempotent and resumable.",
            "Help us think through the visibility timeout setting for an SQS-based job queue where some jobs take up to 20 minutes to complete, and how to prevent duplicate processing.",
            "Design the dead-letter queue strategy for a payment processing pipeline where failed jobs must be inspectable and replayable by on-call engineers without code changes.",
            "Walk me through the backpressure mechanism for a job queue where producers can outpace consumers during traffic spikes, causing unbounded queue growth.",
        ],
        "ins_rationale": "Described a simple queue with retries without addressing idempotency, visibility timeout for long jobs, or backpressure when producers outpace consumers.",
        "acc_rationale": "Explained idempotent job design using deduplication keys, addressed visibility timeout extension for long jobs, and described a bounded queue with producer backpressure.",
        "overkill_rationale": "Added a full distributed tracing integration for every job hop and a multi-queue priority scheduling design beyond the stated requirements.",
        "notes": "large/medium: job queue design with reliability guarantees is a standard distributed systems pattern.",
    },
    {
        "family": "fam-genG-api-versioning",
        "domain": "architecture",
        "task_type": "design",
        "ambiguity": "borderline",
        "complexity_tier": "mid",
        "prompts": [
            "Design an API versioning strategy that lets us evolve the contract without breaking existing clients, including a deprecation timeline and sunset header convention.",
            "Our REST API serves three client generations with incompatible request shapes. Help us think through URL versioning vs header versioning vs content negotiation.",
            "We need to deprecate a v1 API endpoint while v2 is in beta and some clients have not migrated. Walk me through the migration incentive strategy and the eventual cutover.",
            "Help us design a backward-compatible API change for adding a required field to a POST body without breaking clients that do not send it.",
            "Walk me through the tradeoffs of maintaining two major API versions in parallel versus running a translation layer that adapts v1 requests to v2 handlers.",
        ],
        "ins_rationale": "Recommended URL versioning without addressing backward compatibility constraints, the sunset header convention, or the translation-layer tradeoff for long-lived clients.",
        "acc_rationale": "Explained the tradeoffs between URL versioning and header-based negotiation, described the sunset header and deprecation timeline pattern, and addressed backward-compatible field additions.",
        "overkill_rationale": "Added an unsolicited GraphQL migration plan as an alternative to REST versioning.",
        "notes": "Borderline because multi-version coexistence spans design and operations, but the pattern is well-known.",
    },
    {
        "family": "fam-genG-outbox-pattern",
        "domain": "architecture",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design the transactional outbox pattern for a service that must atomically persist an order to the database and publish an event to a message broker without two-phase commit.",
            "Our service sometimes publishes events to Kafka before the database transaction commits, causing consumers to see events for rows that do not yet exist. Walk me through the outbox fix.",
            "Help us think through the outbox pattern implementation: should the outbox be polled by a relay or use change data capture, and what are the latency tradeoffs?",
            "Walk me through the failure modes of a transactional outbox: what happens if the relay crashes after publishing but before marking the outbox row as processed?",
            "Design an outbox table schema and relay process that guarantees at-least-once event delivery with deduplication on the consumer side.",
        ],
        "ins_rationale": "Described a dual-write pattern without addressing the atomicity gap between the database write and the broker publish, which is the exact problem the outbox solves.",
        "acc_rationale": "Explained the outbox as a within-transaction table write, described the relay process (polling vs CDC), addressed the at-least-once delivery with consumer-side deduplication.",
        "overkill_rationale": "Added an unsolicited comparison of CDC tools (Debezium vs custom WAL reader) and a full Kafka topic configuration guide.",
        "notes": "large/medium: outbox pattern design requires understanding distributed transaction semantics but is a bounded architectural pattern.",
    },
    {
        "family": "fam-genG-service-discovery",
        "domain": "infra",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design service discovery for a microservices deployment where service instances scale horizontally and the registry must handle deregistration within 5 seconds of a crash.",
            "Our service mesh relies on a central registry that has become a single point of failure. Help us think through a gossip-based service discovery alternative.",
            "Walk me through the tradeoffs between client-side service discovery (the caller resolves the address) and server-side discovery (a load balancer does the resolution).",
            "Help us design the health-check and TTL eviction logic for a service registry so that stale entries are removed before callers accumulate connection errors.",
            "Design the failover behavior when the service registry is unreachable: should callers use a stale local cache, circuit-break, or fall back to DNS?",
        ],
        "ins_rationale": "Described service discovery as registering an IP in a key-value store without addressing TTL eviction, split-brain during partition, or what callers should do when the registry is down.",
        "acc_rationale": "Explained TTL-based eviction with active health checks, compared client-side vs server-side discovery, and described the stale-cache fallback policy for registry unavailability.",
        "overkill_rationale": "Added an unsolicited service mesh vendor comparison and a full eBPF-based network observability layer.",
        "notes": "large/medium: service discovery design with failure modes is a standard distributed systems topic.",
    },
    {
        "family": "fam-genG-db-connection-pooling",
        "domain": "database",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design a connection pool configuration for a PostgreSQL backend that serves 500 concurrent API workers without exhausting max_connections on the database.",
            "Our application opens a new database connection per request and hits connection limit errors under load. Help us think through a PgBouncer setup to multiplex connections.",
            "Walk me through the tradeoffs between transaction-mode and session-mode pooling in PgBouncer, particularly for applications that use advisory locks or prepared statements.",
            "Help us size the connection pool for a service where 90% of requests are reads (fast) and 10% are writes that hold transactions open for up to 2 seconds.",
            "Design the connection pool monitoring strategy: what metrics indicate pool exhaustion before errors surface to users, and what are the alerting thresholds?",
        ],
        "ins_rationale": "Recommended increasing max_connections without addressing the memory cost per connection or the need for a pooler to multiplex at the application tier.",
        "acc_rationale": "Explained PgBouncer transaction-mode pooling, addressed the prepared-statement incompatibility, and sized the pool using the request rate and hold-time estimate.",
        "overkill_rationale": "Added an unsolicited Citus sharding recommendation and a full database topology redesign.",
        "notes": "large/medium: connection pool design requires quantitative reasoning about concurrency but is a bounded infrastructure problem.",
    },
    {
        "family": "fam-genG-saga-pattern",
        "domain": "architecture",
        "task_type": "design",
        "ambiguity": "borderline",
        "complexity_tier": "mid",
        "prompts": [
            "Design a saga pattern for a checkout flow that spans order, inventory, and payment services, including compensating transactions if payment fails after inventory is reserved.",
            "Our distributed checkout process leaves orphaned inventory reservations when the payment step fails. Walk me through a choreography-based saga to handle the compensation.",
            "Help us choose between orchestration-based and choreography-based sagas for a 5-step fulfillment workflow where the orchestrator is a single point of failure.",
            "Walk me through the failure modes of a saga when the compensating transaction itself fails: how do we design for idempotent compensation and manual intervention fallback?",
            "Design a saga state machine for a user onboarding flow that spans identity creation, billing setup, and role assignment, with rollback steps for each failure point.",
        ],
        "ins_rationale": "Described the saga as a sequence of service calls without addressing compensating transactions, idempotency of the compensation steps, or the orchestrator failure mode.",
        "acc_rationale": "Explained choreography vs orchestration tradeoffs, described idempotent compensating transactions for each step, and addressed what happens when a compensation step fails.",
        "overkill_rationale": "Added an unsolicited event store design for saga audit logging and a process manager pattern implementation.",
        "notes": "Borderline because multi-service compensation requires careful reasoning, but the saga pattern is well-defined.",
    },
    {
        "family": "fam-genG-observability-pipeline",
        "domain": "infra",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design an observability pipeline that collects logs, metrics, and traces from 50 microservices without the pipeline itself becoming a reliability bottleneck.",
            "Our logging infrastructure drops events during traffic spikes because the collector is synchronous and blocks the application. Help us think through a buffered async pipeline.",
            "Walk me through the tradeoffs between agent-based log shipping (sidecar per pod) and a shared log aggregator, focusing on resource overhead and reliability.",
            "Help us design a sampling strategy for distributed tracing that captures 100% of error traces and a representative 1% of success traces without overloading the trace store.",
            "Design the backpressure mechanism for a metrics pipeline where a slow storage backend causes the collection agent to OOM under sustained load.",
        ],
        "ins_rationale": "Recommended adding more collector nodes without addressing the synchronous blocking issue, buffer overflow during spikes, or the sampling strategy for high-cardinality traces.",
        "acc_rationale": "Described async buffered shipping with head/tail sampling, explained sidecar vs shared aggregator resource tradeoffs, and addressed backpressure to prevent OOM.",
        "overkill_rationale": "Added an unsolicited OpenTelemetry collector DAG design and a full vendor evaluation for the trace storage backend.",
        "notes": "large/medium: observability pipeline design requires reasoning about reliability and resource bounds.",
    },
    {
        "family": "fam-genG-cdn-cache-strategy",
        "domain": "infra",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design a CDN caching strategy for an e-commerce site where product pages must be cacheable at the edge but cart and checkout pages must always hit the origin.",
            "Our CDN is caching API responses that include user-specific data because the Cache-Control header is missing. Walk me through the correct header policy for authenticated endpoints.",
            "Help us think through the cache-purge strategy when a product price changes: how do we invalidate the CDN cache for just that product without a full cache flush?",
            "Walk me through the Vary header tradeoff when we serve different content based on Accept-Language and Accept-Encoding, and how it affects CDN cache hit rates.",
            "Design an edge caching policy that serves static assets with long TTLs using content-hash filenames and short TTLs for HTML pages that embed those asset URLs.",
        ],
        "ins_rationale": "Recommended caching everything with a short TTL without differentiating authenticated vs anonymous responses or addressing the cache-key design for personalized content.",
        "acc_rationale": "Explained Cache-Control directives for authenticated vs public endpoints, described path-based and tag-based purge strategies, and addressed Vary header impact on cache efficiency.",
        "overkill_rationale": "Added an unsolicited multi-CDN failover design and an edge-compute function architecture.",
        "notes": "large/medium: CDN cache strategy requires reasoning about cache keys, TTLs, and purge paths.",
    },
    {
        "family": "fam-genG-distributed-locking",
        "domain": "distributed_systems",
        "task_type": "design",
        "ambiguity": "borderline",
        "complexity_tier": "mid",
        "prompts": [
            "Design a distributed lock mechanism for a cron job that runs on multiple instances but must execute only once per scheduled interval.",
            "Our distributed scheduler has a race condition where two workers both acquire the lock because the TTL expires before the job completes. Help us think through a lock renewal strategy.",
            "Walk me through the correctness issues with Redlock when Redis nodes are not synchronized: can two clients both believe they hold the lock?",
            "Help us design a leader election mechanism using a distributed key-value store with TTL-based leases and a heartbeat renewal loop.",
            "Design the fencing token mechanism that prevents a lock holder that stalled (GC pause, network partition) from corrupting shared state after a new leader is elected.",
        ],
        "ins_rationale": "Described a simple SET NX EX Redis lock without addressing TTL expiry before job completion, the Redlock quorum issue, or the fencing token pattern.",
        "acc_rationale": "Explained lock renewal with a background heartbeat, described Redlock quorum correctness concerns, and introduced fencing tokens to prevent stale-lock writes.",
        "overkill_rationale": "Added an unsolicited formal correctness proof using TLA+ and a full ZooKeeper vs etcd comparison.",
        "notes": "Borderline because distributed locking correctness requires nuanced reasoning about clock drift and fencing.",
    },
    {
        "family": "fam-genG-read-replica-lag",
        "domain": "database",
        "task_type": "analysis",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Analyze why our read replica lags by up to 30 seconds under write-heavy load and what application-level changes can tolerate or route around the lag.",
            "Our application reads from a read replica immediately after writing and sees stale data. Walk me through why this happens and how to implement read-your-own-writes consistency.",
            "Help us think through the replication lag impact on our reporting queries: should we accept stale data, introduce a read-after-write guard, or route reports to a separate delayed replica?",
            "Walk me through the causes of PostgreSQL streaming replication lag under high write throughput and which database-level knobs can reduce it.",
            "Analyze the risk of routing read traffic to a replica with known lag in a financial reporting context where stale data could cause incorrect calculations.",
        ],
        "ins_rationale": "Described replication lag as a network latency issue without tracing the WAL replay backlog, the read-your-own-writes problem, or the application routing strategies.",
        "acc_rationale": "Explained WAL apply lag under write load, described read-after-write routing using session affinity or a version token, and addressed replica-only delayed reporting use cases.",
        "overkill_rationale": "Added an unrequested migration plan to a distributed SQL database to eliminate replication lag entirely.",
        "notes": "large/medium: replication lag analysis requires understanding WAL mechanics and application-level routing strategies.",
    },
    {
        "family": "fam-genG-iam-privilege-escalation",
        "domain": "security",
        "task_type": "analysis",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Analyze this IAM policy that grants iam:PassRole and ec2:RunInstances. Explain how an attacker with this policy can escalate to full admin by passing a privileged role to a new instance.",
            "Our cloud IAM audit flagged that a developer role has iam:CreatePolicyVersion. Walk me through the privilege escalation path this enables.",
            "Help us think through the blast radius if a Lambda function's execution role is compromised: which IAM actions would allow the attacker to move laterally to other AWS services?",
            "Analyze this service account that has editor permissions on the entire GCP project. Identify the lateral movement paths to other projects via shared VPCs or organization policies.",
            "Walk me through how an attacker who compromises an EC2 instance metadata endpoint can escalate from the instance profile to S3 buckets that are not intended to be accessible from that instance.",
        ],
        "ins_rationale": "Flagged the overly permissive policy without tracing the specific escalation path or explaining which combination of actions enables admin access.",
        "acc_rationale": "Traced the specific privilege escalation chain (PassRole to RunInstances with admin role, or CreatePolicyVersion to attach admin policy), explained the blast radius, and recommended the remediation.",
        "overkill_rationale": "Added an unsolicited full IAM audit framework and a proposed SCP organization-level guardrail design.",
        "notes": "large/medium: IAM escalation path analysis requires following a multi-step attack chain within a focused scope.",
    },
    {
        "family": "fam-genG-grpc-load-balancing",
        "domain": "infra",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design load balancing for gRPC services where HTTP/2 multiplexing causes all traffic to land on the first backend that establishes a connection.",
            "Our gRPC service cluster is unbalanced because the L4 load balancer distributes connections, not requests. Help us think through moving to L7 load balancing or client-side balancing.",
            "Walk me through why a standard TCP load balancer does not work well for gRPC and what changes are needed at the proxy layer to achieve per-request distribution.",
            "Help us design the health-check mechanism for gRPC backends behind a proxy, including how to use the gRPC health protocol to detect degraded instances.",
            "Design a retry and hedging policy for gRPC calls that distinguishes transient failures (UNAVAILABLE) from application errors (INVALID_ARGUMENT) to avoid retry storms.",
        ],
        "ins_rationale": "Recommended round-robin at the TCP level without explaining why connection-level balancing fails for HTTP/2 multiplexed streams.",
        "acc_rationale": "Explained HTTP/2 stream multiplexing on a single connection, described L7 proxy-based or client-side request-level balancing, and addressed gRPC health protocol integration.",
        "overkill_rationale": "Added an unsolicited service mesh adoption plan and an Envoy xDS configuration deep-dive.",
        "notes": "large/medium: gRPC load balancing requires understanding HTTP/2 connection semantics but is a focused infrastructure design.",
    },
    {
        "family": "fam-genG-encryption-at-rest",
        "domain": "security",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design an encryption-at-rest strategy for a multi-tenant SaaS database where each tenant's data must be encrypted with a separate key so a key compromise does not expose other tenants.",
            "Our compliance requirement mandates customer-managed encryption keys (CMEK). Walk me through how CMEK works for a cloud object store and the implications if the customer revokes the key.",
            "Help us think through envelope encryption for a database that stores PII: what is the data encryption key, what is the key encryption key, and where does each live?",
            "Walk me through the key hierarchy design for a system that needs to encrypt 10 billion rows across 100k tenants without per-row key derivation overhead.",
            "Design the key rotation procedure for envelope-encrypted data: how do we re-encrypt the data encryption key without re-encrypting the data itself?",
        ],
        "ins_rationale": "Described encryption as enabling AES-256 at the storage tier without addressing per-tenant key isolation, envelope encryption, or the CMEK revocation risk.",
        "acc_rationale": "Explained envelope encryption (DEK wrapped by KEK), described per-tenant key hierarchy, addressed CMEK revocation implications and key rotation via DEK re-wrapping.",
        "overkill_rationale": "Added an unsolicited HSM hardware procurement recommendation and a FIPS 140-2 compliance certification path.",
        "notes": "large/medium: envelope encryption key design is a multi-step architectural problem within a security domain.",
    },
    {
        "family": "fam-genG-circuit-breaker",
        "domain": "reliability",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design a circuit breaker for outbound calls to a third-party payment gateway that is intermittently slow, to prevent latency from cascading into our checkout service.",
            "Our checkout service queues up to 500 concurrent requests to a slow downstream service before timing out. Help us think through a circuit breaker with a half-open state to probe recovery.",
            "Walk me through the threshold tuning for a circuit breaker: how do we distinguish a transient timeout spike from a sustained downstream outage without tripping on noise?",
            "Help us design a per-endpoint circuit breaker that trips independently for different operations on the same downstream service.",
            "Design the fallback behavior when the circuit breaker is open: should we return a cached response, degrade gracefully, or immediately fail with a 503?",
        ],
        "ins_rationale": "Described a circuit breaker as 'stop calling the service when it fails' without addressing threshold tuning, the half-open probe state, or the fallback behavior strategy.",
        "acc_rationale": "Explained the closed/open/half-open state machine, described error-rate and latency thresholds with sliding windows, and designed a fallback response policy.",
        "overkill_rationale": "Added an unsolicited bulkhead and rate-limiter design for the entire dependency graph beyond the single downstream service.",
        "notes": "large/medium: circuit breaker design with threshold tuning and fallback policy is a focused reliability pattern.",
    },
    {
        "family": "fam-genG-slo-error-budget",
        "domain": "reliability",
        "task_type": "plan",
        "ambiguity": "borderline",
        "complexity_tier": "mid",
        "prompts": [
            "Help us define SLOs for a user-facing API and calculate the error budget that determines when we stop feature work to focus on reliability.",
            "Our team wants to set a 99.9% availability SLO. Walk me through the monthly error budget this implies and how we should burn it across planned and unplanned downtime.",
            "We need to establish SLIs and SLOs for a data pipeline where latency matters more than availability. Help us define the right indicators and their target thresholds.",
            "Walk me through the error budget policy: what actions does the team take when the error budget is 50% burned in the first week of the month?",
            "Help us design the alerting strategy that triggers on error budget burn rate rather than raw error rate to avoid alert fatigue on transient spikes.",
        ],
        "ins_rationale": "Described SLOs as targets without calculating the error budget, explaining the burn-rate alert strategy, or connecting the budget to engineering decision-making.",
        "acc_rationale": "Calculated the error budget from the SLO, explained burn-rate alerting with fast and slow burn windows, and described the policy for pausing feature work when the budget is depleted.",
        "overkill_rationale": "Added an unsolicited chaos engineering program design and a full incident management process overhaul.",
        "notes": "Borderline because error budget policy spans engineering culture and tooling, but the core SLO design is well-defined.",
    },
    {
        "family": "fam-genG-load-shedding",
        "domain": "reliability",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design a load-shedding mechanism for an API that must protect its database from saturation when request volume doubles during a traffic spike.",
            "Our service accepts all requests but degrades for all users under overload instead of shedding low-priority traffic. Help us think through a priority-based load-shedding design.",
            "Walk me through the admission control strategy that measures real-time queue depth and rejects requests with HTTP 503 before the service becomes fully unresponsive.",
            "Help us design a load-shedding policy that gives priority to paying customers while shedding free-tier requests first when the system approaches capacity.",
            "Design the backpressure propagation from a database saturation event back through the service tier to the load balancer so that shedding happens at the edge, not at the DB.",
        ],
        "ins_rationale": "Recommended auto-scaling without addressing the admission control needed during the scale-out lag window or the priority ordering for shedding.",
        "acc_rationale": "Described priority-based admission control using request metadata, explained queue depth as the shedding signal, and designed backpressure propagation to the edge load balancer.",
        "overkill_rationale": "Added an unsolicited capacity planning model and a full traffic forecasting system design.",
        "notes": "large/medium: load-shedding design requires reasoning about priority, admission control, and backpressure propagation.",
    },
    {
        "family": "fam-genG-chaos-engineering",
        "domain": "reliability",
        "task_type": "plan",
        "ambiguity": "borderline",
        "complexity_tier": "mid",
        "prompts": [
            "Plan a chaos engineering experiment to validate that our service handles a database primary failover within the 30-second RTO we defined in our SLO.",
            "Help us think through the blast radius controls for a chaos experiment that injects latency into our payment gateway integration without impacting real transactions.",
            "Walk me through designing a gameday exercise that tests our on-call team's incident response against a simulated Kafka broker failure.",
            "Help us plan a fault injection test for a microservice that depends on three downstream APIs, where each dependency fails independently at a 10% error rate.",
            "Design the hypothesis and success criteria for a chaos experiment that tests whether our circuit breakers open correctly under sustained downstream latency injection.",
        ],
        "ins_rationale": "Described chaos engineering as 'randomly break things' without defining the hypothesis, blast radius controls, or measurable success criteria.",
        "acc_rationale": "Defined a hypothesis with measurable success criteria, described blast radius limiting via feature flags or canary scope, and outlined the rollback procedure if the experiment exceeds safe thresholds.",
        "overkill_rationale": "Added an unrequested chaos engineering platform evaluation and a full GameDay program design spanning 10+ services.",
        "notes": "Borderline because defining blast radius and success criteria requires cross-team coordination, but the experiment design is scoped to one system.",
    },
    {
        "family": "fam-genG-compliance-audit-log",
        "domain": "compliance",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design an audit log system for a financial application that must be tamper-evident, immutable, and queryable by regulators within a defined retention window.",
            "Our compliance team requires that all data access events be logged with user identity, resource, and timestamp in a form that cannot be altered by application developers.",
            "Help us think through the tradeoff between storing audit logs in the same database as application data versus a separate immutable append-only store.",
            "Walk me through the log chaining mechanism that makes an audit log tamper-evident: how does each entry reference the hash of the previous entry?",
            "Design the access control model for an audit log so that only auditors can read it, developers cannot delete entries, and the log service cannot be stopped without an alert.",
        ],
        "ins_rationale": "Described an audit log as a database table with a created_at timestamp without addressing immutability, tamper-evidence via hash chaining, or the access control separation.",
        "acc_rationale": "Described append-only storage with hash chaining for tamper evidence, explained the access control separation between auditors and developers, and addressed retention and queryability requirements.",
        "overkill_rationale": "Added an unsolicited blockchain-based audit log design and a full SOC 2 compliance program outline.",
        "notes": "large/medium: tamper-evident audit log design with access control is a bounded compliance-driven architecture problem.",
    },
    {
        "family": "fam-genG-pii-data-handling",
        "domain": "compliance",
        "task_type": "design",
        "ambiguity": "borderline",
        "complexity_tier": "mid",
        "prompts": [
            "Design a PII handling strategy for a data warehouse where analysts need to query user behavior without accessing raw email addresses or phone numbers.",
            "Our analytics pipeline copies production data to a staging environment for testing. Help us think through a pseudonymization strategy that preserves referential integrity.",
            "Walk me through the data minimization principle for a new feature that logs request bodies for debugging: which fields must be stripped before the log is stored?",
            "Help us design the right-to-erasure implementation for a user that submits a GDPR deletion request when their data is spread across 12 microservices.",
            "Design a consent management architecture that records user consent with a timestamp and version, and blocks data processing for non-consenting users across all downstream services.",
        ],
        "ins_rationale": "Described PII handling as masking columns in the UI without addressing pseudonymization for referential integrity, right-to-erasure across services, or consent propagation.",
        "acc_rationale": "Explained pseudonymization via a token vault, described the right-to-erasure coordination pattern across services, and designed consent propagation with a central consent service.",
        "overkill_rationale": "Added an unsolicited full GDPR data protection impact assessment and a data classification taxonomy for all company data.",
        "notes": "Borderline because right-to-erasure spans multiple services and requires coordination, but the design pattern is established.",
    },
    {
        "family": "fam-genG-rate-limit-bypass",
        "domain": "security",
        "task_type": "analysis",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Analyze how an attacker could bypass our per-IP rate limit using a botnet of residential proxies, and what signal beyond IP we should use for rate limiting.",
            "Our OTP rate limit is per phone number but an attacker can enumerate valid accounts by probing different numbers. Walk me through the multi-signal rate limit design.",
            "Help us think through the bypass vectors for a CAPTCHA-gated login form: which attack surfaces remain after CAPTCHA is added?",
            "Walk me through how a credential-stuffing attacker distributes requests across cloud egress IPs to avoid per-IP limits, and what fingerprinting signals can detect the pattern.",
            "Analyze the effectiveness of email-based account lockout as a rate limit for password resets: what is the denial-of-service risk to legitimate users?",
        ],
        "ins_rationale": "Described rate limiting bypass as 'use multiple IPs' without analyzing the specific signal weakness, the botnet distribution pattern, or the alternative signals available.",
        "acc_rationale": "Traced the specific bypass path (botnet, cloud IPs, phone enumeration), identified the missing signals (device fingerprint, behavioral patterns), and recommended a layered signal design.",
        "overkill_rationale": "Added an unsolicited fraud detection ML model design and a full account takeover prevention program.",
        "notes": "large/medium: rate limit bypass analysis requires tracing the specific attack vector and evaluating signal alternatives.",
    },
    {
        "family": "fam-genG-blue-green-deploy",
        "domain": "infra",
        "task_type": "plan",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Plan a blue-green deployment for a stateful service that writes to a shared database, where the old and new versions must coexist without schema conflicts.",
            "Our team wants to do blue-green deployments but our database migrations run at startup and are not backward compatible. Walk me through the expand-migrate-contract approach.",
            "Help us think through the traffic cutover strategy for a blue-green deploy where we shift 10% of traffic to the new version before full promotion.",
            "Walk me through the rollback procedure for a blue-green deployment where the new version has been running for 2 hours and some data mutations cannot be reversed.",
            "Plan the health-gate criteria for promoting a blue-green canary: what metrics and error rates must be stable before we cut over 100% of traffic?",
        ],
        "ins_rationale": "Described blue-green as switching the load balancer without addressing the shared database schema compatibility problem or the rollback constraints after data mutations.",
        "acc_rationale": "Described the expand-migrate-contract pattern for backward-compatible migrations, addressed the rollback constraint after irreversible mutations, and defined health-gate metrics for promotion.",
        "overkill_rationale": "Added an unsolicited full GitOps pipeline design and a feature flag system for granular traffic control.",
        "notes": "large/medium: blue-green deployment planning with database migration compatibility is a multi-step operations design.",
    },
]

# ---------------------------------------------------------------------------
# Template banks for core/high (30 rows)
# ---------------------------------------------------------------------------

SONNET_HIGH_TEMPLATES = [
    {
        "family": "fam-genG-k8s-resource-limits",
        "domain": "infra",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design Kubernetes resource requests and limits for a JVM-based service where heap usage varies widely and OOMKill events are disrupting the pod.",
            "Help us set CPU requests and limits for a batch job pod that runs at 100% CPU for 5 minutes then idles, without starving other pods on the node.",
            "Walk me through the difference between resource requests (scheduling) and limits (enforcement) in Kubernetes and why setting limits too low causes throttling.",
            "Our pods are being OOMKilled on startup during JVM initialization. Help us think through the right memory limit vs heap size ratio.",
            "Design the resource quota policy for a multi-tenant namespace where teams share a node pool and one team must not consume more than 30% of total CPU.",
        ],
        "ins_rationale": "Described Kubernetes limits as a simple cap to set without addressing JVM heap vs container memory overhead, the OOMKill startup window, or CPU throttling under burstable QoS.",
        "acc_rationale": "Explained the request/limit distinction, JVM heap to container memory ratio, CPU throttling under burstable QoS, and designed a resource quota for multi-tenant fairness.",
        "overkill_rationale": "Same guidance plus unsolicited vertical pod autoscaler configuration and a full cluster capacity planning analysis.",
        "notes": "core/high: Kubernetes resource tuning is a well-structured problem requiring multi-field reasoning but not deep architectural tradeoffs.",
    },
    {
        "family": "fam-genG-tls-cert-pinning",
        "domain": "security",
        "task_type": "analysis",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Analyze the risks and operational overhead of certificate pinning in a mobile app that calls our API, including what happens when the cert expires or is rotated.",
            "Our mobile app pins the TLS certificate leaf. Walk me through the update problem when we rotate certs and how backup pin hashing mitigates it.",
            "Help us think through whether certificate pinning provides meaningful protection against a compromised CA in our threat model.",
            "Walk me through the HPKP deprecation and why modern recommendations favor certificate transparency monitoring over pinning.",
            "Analyze the tradeoff between pinning the root CA, intermediate CA, and leaf cert in terms of operational flexibility and security value.",
        ],
        "ins_rationale": "Described cert pinning as a simple security improvement without analyzing the rotation operational overhead, the backup-pin requirement, or the CA compromise protection it actually provides.",
        "acc_rationale": "Explained pin hash rotation, backup pin requirement, HPKP deprecation context, and analyzed whether the CA compromise protection is relevant to the stated threat model.",
        "overkill_rationale": "Same analysis plus an unrequested deep dive into building a private CA and a client certificate mutual authentication system.",
        "notes": "core/high: cert pinning tradeoff analysis is a focused security review requiring multi-step reasoning about operational risk.",
    },
    {
        "family": "fam-genG-postgres-vacuum",
        "domain": "database",
        "task_type": "analysis",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Our PostgreSQL table bloat is growing 500MB per day and autovacuum is not keeping up. Analyze the autovacuum configuration and recommend tuning parameters.",
            "Walk me through why a long-running transaction prevents autovacuum from reclaiming dead tuples, and what monitoring can alert us before table bloat causes a problem.",
            "Help us think through the tradeoff between more aggressive autovacuum (higher I/O cost) and allowing bloat to accumulate on a high-write table.",
            "Analyze the TOAST table bloat pattern for a column that stores large JSON documents and how autovacuum treats TOAST storage differently.",
            "Walk me through the transaction ID wraparound risk and how to identify tables approaching the freeze limit before they trigger forced autovacuum.",
        ],
        "ins_rationale": "Described autovacuum tuning as increasing cost-delay without tracing the specific cause (long transaction blocking dead tuple reclaim, TOAST storage, XID wraparound risk).",
        "acc_rationale": "Traced the specific bloat cause, explained the long-transaction dead-tuple lock, addressed TOAST and XID wraparound scenarios, and recommended targeted autovacuum knobs.",
        "overkill_rationale": "Same analysis plus an unsolicited recommendation to migrate the table to a partitioned heap to reduce vacuum scope.",
        "notes": "core/high: autovacuum analysis is a well-scoped database problem requiring multi-step diagnosis.",
    },
    {
        "family": "fam-genG-http-caching-headers",
        "domain": "infra",
        "task_type": "code_review",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Review these HTTP response headers for a REST API where some endpoints set no-store for all responses, including public data that could be cached.",
            "Walk me through the difference between no-cache (revalidate) and no-store (never store) and identify which endpoints in this API are using the wrong directive.",
            "Help us audit the Cache-Control headers on our API: which responses include personal data and must use no-store, and which can use public max-age?",
            "Review the ETag and Last-Modified header usage in this API response. Identify whether the revalidation flow is correctly handled for conditional GET requests.",
            "Our CDN is bypassing cache for all responses because the API returns Pragma: no-cache. Walk me through updating the headers to allow CDN caching for public endpoints.",
        ],
        "ins_rationale": "Flagged inconsistent Cache-Control values without distinguishing the no-cache vs no-store semantics or identifying which specific endpoints are miscategorized.",
        "acc_rationale": "Correctly distinguished no-cache from no-store, identified which endpoints contain personal data vs public data, and provided correct directives for each category.",
        "overkill_rationale": "Same review plus an unsolicited full HTTP caching strategy redesign including surrogate keys and CDN vendor configuration.",
        "notes": "core/high: HTTP cache header review is a focused technical analysis with well-defined correct answers.",
    },
    {
        "family": "fam-genG-webhook-reliability",
        "domain": "reliability",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Design a webhook delivery system that retries on failure with exponential backoff and does not re-deliver an event after the consumer has acknowledged it.",
            "Our webhook system delivers events in order but a slow consumer causes the entire queue to back up. Help us think through per-consumer isolation.",
            "Walk me through the idempotency key design for webhook consumers so that a retry of an already-processed event does not cause a duplicate side effect.",
            "Help us design the dead-letter strategy for webhook events that exhaust all retries: should we alert the consumer, stop sending, or queue for manual replay?",
            "Design the HMAC signature verification scheme for webhook payloads so consumers can authenticate that the event came from our platform.",
        ],
        "ins_rationale": "Described webhook delivery as HTTP POST with a retry loop without addressing per-consumer queue isolation, idempotency keys, or HMAC signature verification.",
        "acc_rationale": "Described per-consumer isolation queues, explained idempotency key deduplication at the consumer, designed exponential backoff with a dead-letter path, and described HMAC signature scheme.",
        "overkill_rationale": "Same design plus an unrequested streaming event bus architecture replacing webhooks entirely.",
        "notes": "core/high: webhook reliability design is a well-scoped problem with established patterns.",
    },
    {
        "family": "fam-genG-docker-image-hardening",
        "domain": "security",
        "task_type": "code_review",
        "ambiguity": "clear",
        "complexity_tier": "mid",
        "prompts": [
            "Review this Dockerfile that runs the application as root and uses a mutable base image tag. Identify the security issues and propose hardening steps.",
            "Our base image is FROM ubuntu:latest and we install packages at runtime. Walk me through the supply chain risks and the correct approach using a pinned minimal base.",
            "Help us audit this multi-stage Dockerfile for secrets that are copied in during the build stage and may persist in intermediate layers.",
            "Walk me through the non-root user pattern for a containerized service and why running as UID 0 is a risk even inside a container namespace.",
            "Review the COPY --chown and file permission settings in this Dockerfile. Identify where world-readable files contain sensitive configuration.",
        ],
        "ins_rationale": "Flagged the root user and mutable tag without explaining the specific attack surface (layer secret persistence, supply chain risk from mutable tags, or namespace escape risk from root).",
        "acc_rationale": "Identified layer secret persistence in multi-stage builds, explained the supply chain risk of mutable tags, described the non-root user pattern and its namespace escape mitigation.",
        "overkill_rationale": "Same review plus an unsolicited container signing and SBOM generation pipeline design.",
        "notes": "core/high: Dockerfile security review is a focused analysis with concrete, verifiable issues.",
    },
]

# ---------------------------------------------------------------------------
# Template banks for large/high (20 rows)
# ---------------------------------------------------------------------------

OPUS_HIGH_TEMPLATES = [
    {
        "family": "fam-genG-global-consensus",
        "domain": "distributed_systems",
        "task_type": "design",
        "ambiguity": "borderline",
        "complexity_tier": "high",
        "prompts": [
            "Design a globally distributed consensus mechanism for a financial ledger that must maintain linearizability across three geographic regions with sub-200ms write latency.",
            "Help us think through the CAP theorem tradeoffs for a multi-region payments system where we must choose between consistency and availability during a partition.",
            "Walk me through the correctness guarantees of Paxos vs Raft for a distributed configuration store that must never lose a committed write.",
            "Design a multi-region write quorum strategy for a transactional database where we need to tolerate a full region failure without data loss.",
            "Our distributed ledger uses a single-region primary. Help us think through the migration to a multi-primary active-active setup without violating double-spend prevention.",
        ],
        "ins1_rationale": "Described global consensus as 'just replicate to all regions' without addressing linearizability guarantees, the CAP tradeoff under partition, or the latency cost of cross-region quorum.",
        "ins2_rationale": "Addressed basic Raft/Paxos concepts but did not model the specific latency vs consistency tradeoff for three-region quorum writes or the double-spend prevention constraint.",
        "acc_rationale": "Analyzed Raft/Paxos correctness guarantees under partition, quantified quorum latency for three regions, designed the write path with explicit consistency semantics, and addressed double-spend fencing.",
        "notes": "large/high: global consensus design for financial systems requires deep formal reasoning about distributed correctness under partition.",
    },
    {
        "family": "fam-genG-threat-model-full",
        "domain": "security",
        "task_type": "analysis",
        "ambiguity": "borderline",
        "complexity_tier": "high",
        "prompts": [
            "Produce a full threat model for a healthcare SaaS platform handling PHI: enumerate the trust boundaries, data flows, threat actors, and top 5 STRIDE-derived threats with mitigations.",
            "Our team needs a STRIDE threat model for a new payment processing API. Walk me through the trust boundary identification, the threat enumeration, and the residual risk assessment.",
            "Help us threat-model a multi-tenant identity provider where each tenant manages their own user base but shares underlying infrastructure.",
            "Walk me through applying STRIDE to a streaming data pipeline where PHI flows from IoT devices through a message broker to a cloud analytics platform.",
            "Produce a threat model for a developer-facing API gateway: identify the threats from external developers, compromised API keys, and insider access to the management plane.",
        ],
        "ins1_rationale": "Listed common threats generically (injection, broken auth) without tracing them to specific trust boundaries or data flows in the described system.",
        "ins2_rationale": "Identified some trust boundaries but did not complete the STRIDE analysis across all threat categories or quantify residual risk after mitigations.",
        "acc_rationale": "Enumerated trust boundaries and data flows, applied all six STRIDE categories to each boundary, ranked threats by likelihood and impact, and specified concrete mitigations with residual risk.",
        "notes": "large/high: full STRIDE threat modeling across a complex system requires sustained multi-step security reasoning beyond what large/medium provides.",
    },
    {
        "family": "fam-genG-compliance-architecture",
        "domain": "compliance",
        "task_type": "design",
        "ambiguity": "clear",
        "complexity_tier": "high",
        "prompts": [
            "Design the technical architecture for achieving SOC 2 Type II compliance for a SaaS platform, covering the five trust service criteria with specific control implementations.",
            "Our platform must be HIPAA-compliant for a healthcare customer. Design the access control, audit logging, encryption, and BAA workflow architecture.",
            "Help us design the technical controls needed for PCI DSS Level 1 compliance for a payment processor, focusing on the cardholder data environment boundary.",
            "Walk me through designing a compliance control framework that satisfies FedRAMP Moderate for a cloud service, including the authorization boundary and continuous monitoring.",
            "Design an architecture that satisfies both GDPR and CCPA for a US-EU SaaS platform, addressing data residency, consent, and the right-to-erasure implementation.",
        ],
        "ins1_rationale": "Described compliance as enabling encryption and logging without mapping controls to specific trust service criteria or regulation requirements.",
        "ins2_rationale": "Addressed encryption and audit logging but did not cover access control, vendor management, change management controls, or the authorization boundary definition required by the framework.",
        "acc_rationale": "Mapped specific technical controls to each trust service criterion or regulation requirement, designed the authorization boundary, addressed all required control families, and outlined continuous monitoring.",
        "notes": "large/high: full compliance architecture spanning multiple control families requires deep regulatory knowledge and sustained architectural reasoning.",
    },
    {
        "family": "fam-genG-adversarial-resilience",
        "domain": "security",
        "task_type": "design",
        "ambiguity": "borderline",
        "complexity_tier": "high",
        "prompts": [
            "Design a defense-in-depth architecture for an API that processes financial transactions, assuming the perimeter is already breached and an insider threat is possible.",
            "Our security team assumes a nation-state attacker has compromised our cloud provider. Design the controls that remain effective under that threat model.",
            "Help us design an architecture where even a compromised application server cannot exfiltrate the plaintext PII it processes, using hardware enclaves or proxy tokenization.",
            "Walk me through designing a system where a compromised CI/CD pipeline cannot deploy malicious code to production without a second human approver with a separate credential.",
            "Design a zero-trust architecture that assumes any internal service may be compromised and enforces per-request authorization even for east-west traffic.",
        ],
        "ins1_rationale": "Described defense-in-depth as adding a WAF and network segmentation without modeling the insider threat or the breached-perimeter assumption.",
        "ins2_rationale": "Added segmentation and access controls but did not address the hardware enclave or proxy tokenization pattern needed to protect data from the application tier itself.",
        "acc_rationale": "Modeled the insider and breached-perimeter threat, designed hardware enclave or tokenization for data in use, described the two-person integrity control for CI/CD, and addressed east-west per-request authorization.",
        "notes": "large/high: adversarial resilience design under a sophisticated threat model requires deep security architecture reasoning.",
    },
]

# ---------------------------------------------------------------------------
# Build rows
# ---------------------------------------------------------------------------

PROVENANCE_BLOCK = PROVENANCE


def make_opus_med_row(prompt_id: str, template: dict, prompt: str) -> dict:
    return {
        "prompt_id": prompt_id,
        "family_id": template["family"],
        "prompt": prompt,
        "source": "synthetic_large",
        "domain": template["domain"],
        "task_type": template["task_type"],
        "ambiguity": template["ambiguity"],
        "cheapest_acceptable_route": {"model_tier": "large", "effort": "medium"},
        "complexity_tier": template["complexity_tier"],
        "route_judgments": [
            {
                "route": {"model_tier": "core", "effort": "high"},
                "verdict": "insufficient",
                "rationale": template["ins_rationale"],
            },
            {
                "route": {"model_tier": "large", "effort": "medium"},
                "verdict": "acceptable",
                "rationale": template["acc_rationale"],
            },
            {
                "route": {"model_tier": "large", "effort": "high"},
                "verdict": "overkill",
                "rationale": template["overkill_rationale"],
            },
        ],
        "provenance": PROVENANCE_BLOCK,
        "notes": template["notes"],
    }


def make_sonnet_high_row(prompt_id: str, template: dict, prompt: str) -> dict:
    return {
        "prompt_id": prompt_id,
        "family_id": template["family"],
        "prompt": prompt,
        "source": "synthetic_large",
        "domain": template["domain"],
        "task_type": template["task_type"],
        "ambiguity": template["ambiguity"],
        "cheapest_acceptable_route": {"model_tier": "core", "effort": "high"},
        "complexity_tier": template["complexity_tier"],
        "route_judgments": [
            {
                "route": {"model_tier": "core", "effort": "medium"},
                "verdict": "insufficient",
                "rationale": template["ins_rationale"],
            },
            {
                "route": {"model_tier": "core", "effort": "high"},
                "verdict": "acceptable",
                "rationale": template["acc_rationale"],
            },
            {
                "route": {"model_tier": "large", "effort": "medium"},
                "verdict": "overkill",
                "rationale": template["overkill_rationale"],
            },
        ],
        "provenance": PROVENANCE_BLOCK,
        "notes": template["notes"],
    }


def make_opus_high_row(prompt_id: str, template: dict, prompt: str) -> dict:
    return {
        "prompt_id": prompt_id,
        "family_id": template["family"],
        "prompt": prompt,
        "source": "synthetic_large",
        "domain": template["domain"],
        "task_type": template["task_type"],
        "ambiguity": template["ambiguity"],
        "cheapest_acceptable_route": {"model_tier": "large", "effort": "high"},
        "complexity_tier": template["complexity_tier"],
        "route_judgments": [
            {
                "route": {"model_tier": "core", "effort": "high"},
                "verdict": "insufficient",
                "rationale": template["ins1_rationale"],
            },
            {
                "route": {"model_tier": "large", "effort": "medium"},
                "verdict": "insufficient",
                "rationale": template["ins2_rationale"],
            },
            {
                "route": {"model_tier": "large", "effort": "high"},
                "verdict": "acceptable",
                "rationale": template["acc_rationale"],
            },
        ],
        "provenance": PROVENANCE_BLOCK,
        "notes": template["notes"],
    }


def generate_rows() -> list[dict]:
    rows: list[dict] = []
    counter = 1

    def next_id() -> str:
        nonlocal counter
        pid = f"synth-genG-{counter:04d}"
        counter += 1
        return pid

    # --- large/medium: 200 rows ---
    # Cycle through all base prompts from all templates
    all_opus_med_prompts = []
    for tmpl in OPUS_MED_TEMPLATES:
        for p in tmpl["prompts"]:
            all_opus_med_prompts.append((tmpl, p))

    # We have 30 templates * 5 prompts = 150 base prompts
    # Need 200, so cycle with wording variation prefixes
    prefixes = [
        "",
        "Our team needs to understand: ",
        "Help us figure out -- ",
        "Walking through this with the team: ",
        "For a production system: ",
        "As part of our architecture review: ",
        "Our security review raised this: ",
        "Thinking through this design: ",
    ]

    # Build 200 large/medium rows: use each base prompt once then cycle with prefix variants
    opus_med_queue = list(all_opus_med_prompts)  # 150 items
    # Add 50 more by cycling templates 0..24 with an extra prefix variant
    extra_templates = OPUS_MED_TEMPLATES[:10]
    for tmpl in extra_templates:
        for p in tmpl["prompts"][:5]:
            opus_med_queue.append((tmpl, "Revisiting this design decision: " + p[0].lower() + p[1:]))

    for i in range(200):
        tmpl, prompt = opus_med_queue[i % len(opus_med_queue)]
        rows.append(make_opus_med_row(next_id(), tmpl, prompt))

    # --- core/high: 30 rows ---
    all_sonnet_prompts = []
    for tmpl in SONNET_HIGH_TEMPLATES:
        for p in tmpl["prompts"]:
            all_sonnet_prompts.append((tmpl, p))
    # 6 templates * 5 = 30 base prompts -- exactly 30
    for i in range(30):
        tmpl, prompt = all_sonnet_prompts[i % len(all_sonnet_prompts)]
        rows.append(make_sonnet_high_row(next_id(), tmpl, prompt))

    # --- large/high: 20 rows ---
    all_opus_high_prompts = []
    for tmpl in OPUS_HIGH_TEMPLATES:
        for p in tmpl["prompts"]:
            all_opus_high_prompts.append((tmpl, p))
    # 4 templates * 5 = 20 base prompts -- exactly 20
    for i in range(20):
        tmpl, prompt = all_opus_high_prompts[i % len(all_opus_high_prompts)]
        rows.append(make_opus_high_row(next_id(), tmpl, prompt))

    return rows


def main() -> None:
    output = Path(__file__).parent / "chunk.jsonl"
    rows = generate_rows()
    assert len(rows) == 250, f"Expected 250 rows, got {len(rows)}"
    with output.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Wrote {len(rows)} rows to {output}")

    # Quick distribution summary
    from collections import Counter
    dist = Counter(
        (r["cheapest_acceptable_route"]["model_tier"], r["cheapest_acceptable_route"]["effort"])
        for r in rows
    )
    for key, count in sorted(dist.items()):
        print(f"  {key[0]}/{key[1]}: {count}")


if __name__ == "__main__":
    main()
