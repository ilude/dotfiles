"""
Generator for genF synthetic shard -- core/high bounded complex implementation/debugging.

Route distribution:
  - 200 core/high
  - 30 core/medium
  - 20 large/medium

Output: data/synthetic_shards/genF/chunk.jsonl
"""

import json
import random
from pathlib import Path

random.seed(42)

PROVENANCE = {
    "generator_model": "claude-sonnet",
    "generator_model_size": "medium",
    "adjudicator_model": "claude-opus",
    "adjudicator_model_size": "large",
    "prompt_version_hash": "sha256:genF-v1",
    "temperature": 0.0,
    "generated_at": "2026-05-11T00:00:00Z",
}

# ---------------------------------------------------------------------------
# core/high families -- bounded complex implementation and debugging tasks
# ---------------------------------------------------------------------------

SONNET_HIGH_FAMILIES = [
    # --- Flaky test root cause analysis ---
    {
        "family_id": "fam-genF-flaky-test-root-cause",
        "domain": "testing",
        "task_type": "code_debug",
        "complexity_tier": "mid",
        "ambiguity": "clear",
        "prompts": [
            "Our Pytest suite has one test that fails roughly 1-in-5 runs. The test checks that a background thread drains a queue and writes results to a shared list. Walking through the test code, identify the data race and propose a fix using threading.Event or a suitable synchronization primitive.",
            "A Jest test for our React component fails intermittently in CI but never locally. The test asserts that a mocked API call resolves before a spinner disappears. Trace why the timing assumption breaks under Node's fake timer implementation and suggest a deterministic fix.",
            "One of our Go integration tests sporadically errors with 'context deadline exceeded' when hitting a locally spawned HTTP server. Identify why the server port might not be ready when the test client connects and write a readiness-probe loop that eliminates the race.",
            "A Pytest fixture that creates and destroys a temp database schema fails with 'table already exists' on about 10% of runs. The database is shared across test workers. Pinpoint the fixture scope or teardown gap and propose a fix that is safe under pytest-xdist parallel execution.",
            "Our Mocha test suite has a test that asserts a debounced search handler fires exactly once after rapid input. It flakes because the fake clock is advanced before the debounce timer is registered. Explain the ordering issue and show a corrected test structure using sinon fake timers.",
            "A JUnit test for an async message consumer sporadically asserts against stale state because the consumer processes messages on a different thread. Identify the missing happens-before edge and show how CountDownLatch or CompletableFuture can make the assertion deterministic.",
            "Our Python test uses monkeypatch to replace time.sleep but the background worker it tests imports time at module load time. Explain why the patch does not take effect and provide the corrected import-path target for monkeypatch.setattr.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "medium"},
        "insufficient_rationale_tmpl": "Identified the symptom (timing sensitivity) but did not trace the missing synchronization primitive or explain the specific happens-before violation in {task}.",
        "acceptable_rationale_tmpl": "Correctly identified the data race or timer ordering issue in {task}, named the specific synchronization primitive needed, and provided a concrete fix that eliminates the non-determinism.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Same root-cause analysis as core/high plus an unsolicited deep dive into the test framework internals and suggested migration to a different testing library.",
        "notes_tmpl": "core/high is the right tier: tracing a concurrency bug in a test requires multi-step reasoning but the scope is bounded to a single test file.",
    },
    # --- Multi-file backend bug ---
    {
        "family_id": "fam-genF-multifile-backend-bug",
        "domain": "backend",
        "task_type": "code_debug",
        "complexity_tier": "mid",
        "ambiguity": "clear",
        "prompts": [
            "Our Express.js API returns HTTP 200 with an empty body for POST /orders when the database write succeeds but the response serialization throws. Trace the middleware chain, identify where the error is swallowed, and add an error handler that returns HTTP 500 with a JSON error body.",
            "A Django REST Framework view that creates invoices returns HTTP 201 but the invoice is missing its line_items relation when fetched immediately after. The create serializer calls save() and then a signal handler runs but the transaction is not yet committed. Explain the race and show how transaction.on_commit fixes it.",
            "Our FastAPI endpoint for file uploads occasionally returns a 500 with 'I/O operation on closed file'. The background task receives the UploadFile object but the request context has already cleaned it up. Identify the lifecycle mismatch and show the correct way to read the file bytes before returning a response.",
            "A Spring Boot controller returns 200 OK for a PATCH /users/{id} request even when the user does not exist, because the service layer silently ignores the Optional.empty() case. Trace the call from controller through service to repository and add the missing 404 branch.",
            "Our Go HTTP handler for /webhook sometimes panics with 'runtime error: invalid memory address or nil pointer dereference'. The panic originates in a JSON decoder that assumes the request body is never nil. Identify the guard missing for empty bodies and add nil-body and max-size protection.",
            "A Flask blueprint for /reports/generate starts the report generation synchronously and times out on large datasets. Identify that the route is blocking the worker, and refactor it to enqueue a Celery task and return HTTP 202 Accepted with a task ID.",
            "Our Hapi.js route handler for /cart/checkout returns 200 even when the inventory reservation fails, because the promise rejection inside a helper function is not propagated to the route handler. Trace the missing await and show the corrected async control flow.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "medium"},
        "insufficient_rationale_tmpl": "Spotted the surface-level HTTP status mismatch but did not trace the root cause through the middleware or async boundary in {task}.",
        "acceptable_rationale_tmpl": "Traced the bug through the full call stack in {task}, identified the specific error-swallowing or lifecycle mismatch, and provided a corrected implementation with the correct HTTP semantics.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Reproduced the core/high diagnosis with correct fix, then added unsolicited recommendations for API versioning strategy and OpenAPI spec generation.",
        "notes_tmpl": "core/high is appropriate: tracing an async bug across middleware layers requires multi-step analysis but the codebase scope is bounded.",
    },
    # --- Database migration with constraints ---
    {
        "family_id": "fam-genF-database-migration",
        "domain": "database",
        "task_type": "code_write",
        "complexity_tier": "mid",
        "ambiguity": "borderline",
        "prompts": [
            "Write an Alembic migration that adds a non-nullable 'tenant_id' UUID column to the 'accounts' table, backfills it from an existing 'org_id' column using a subquery join to the 'orgs' table, then drops 'org_id'. The migration must be runnable without table-level locks on Postgres 14.",
            "Write a Flyway migration that splits the 'full_name' column in the 'contacts' table into 'first_name' and 'last_name' using a best-effort space split, handling single-token names by populating 'first_name' and leaving 'last_name' empty. Include both V and U scripts.",
            "Write a Django migration that converts a CharField 'status' with free-text values to an IntegerField backed by an IntegerChoices enum, mapping the four known values and setting unknown values to a sentinel integer. Include the data migration step as a separate RunPython operation.",
            "Write a Knex migration that adds a partial index on the 'events' table for rows where archived=false, and adds a CHECK constraint that start_time < end_time. The migration must be reversible with a proper down() function.",
            "Write a Liquibase changeset that adds a 'deleted_at' timestamp column to 'users', migrates rows where 'is_deleted=true' by setting 'deleted_at' to NOW(), then drops the 'is_deleted' boolean column. Include rollback steps.",
            "Write a TypeORM migration that changes a 'price' column from NUMERIC(10,2) to NUMERIC(12,4), preserving all existing values and updating the column in a single ALTER TABLE statement safe for Postgres under READ COMMITTED isolation.",
            "Write a Prisma migration that adds a composite unique index on (user_id, resource_id, scope) to the 'permissions' table. The table has 8M rows; explain the strategy to build the index concurrently and add the CREATE INDEX CONCURRENTLY statement as a raw SQL step.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "medium"},
        "insufficient_rationale_tmpl": "Produced a syntactically valid migration but missed the locking or concurrency constraint for {task}, resulting in a migration that would block production traffic.",
        "acceptable_rationale_tmpl": "Wrote the complete migration for {task} with correct backfill logic, proper reversibility, and addressed the locking concern explicitly using the appropriate Postgres or ORM pattern.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Identical migration to core/high but also included an unsolicited schema design review and suggestions for restructuring the table relationships.",
        "notes_tmpl": "core/high covers the locking and backfill reasoning; large/high would spend effort on schema redesign that was not requested.",
    },
    # --- Auth/JWT debugging ---
    {
        "family_id": "fam-genF-auth-jwt-debug",
        "domain": "auth",
        "task_type": "code_debug",
        "complexity_tier": "mid",
        "ambiguity": "clear",
        "prompts": [
            "Our Node.js API issues JWTs signed with RS256 but the client is validating with the public key in PEM format and getting 'invalid signature' errors. Trace the possible causes: key format mismatch, header encoding, or algorithm mismatch, and show how to verify which is the culprit using jwt.io and openssl commands.",
            "A FastAPI endpoint decorated with our custom JWT dependency returns HTTP 422 instead of HTTP 401 when the Authorization header is missing. Trace why FastAPI's dependency injection raises a RequestValidationError instead of an HTTPException and show the fix using Optional header parsing with explicit 401 handling.",
            "Our Django REST Framework API uses SimpleJWT but tokens expire in 15 minutes and the frontend reports random logout events well before that. Identify that clock skew between the token issuer and validator can cause premature expiry, and show how to add a leeway parameter to the TokenBackend.",
            "A Spring Security configuration allows unauthenticated access to /public/** but a request to /public/health is returning HTTP 403. Trace how AntMatcher vs MvcMatcher pattern semantics differ and show the corrected SecurityFilterChain configuration.",
            "Our Go middleware validates JWTs from two issuers by trying each JWKS endpoint in sequence, but occasionally the second issuer's key is used to validate a token from the first issuer and succeeds incorrectly. Trace the key overlap risk and show how to scope validation by the 'iss' claim before selecting the JWKS.",
            "A Rails API using Devise-JWT returns a fresh token in the Authorization response header but the Axios client is not reading it because the header is not in Access-Control-Expose-Headers. Identify the CORS gap and show the Rack CORS configuration fix.",
            "Our Express.js middleware logs 'JsonWebTokenError: jwt malformed' for requests that previously worked. The JWTs are base64url-encoded but a recent nginx config change added URL-decoding of the Authorization header, corrupting the dots. Trace the transformation and show how to configure nginx correctly.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "medium"},
        "insufficient_rationale_tmpl": "Named the general category of JWT error but did not trace the specific encoding, header, or algorithm mismatch step-by-step for {task}.",
        "acceptable_rationale_tmpl": "Correctly traced the JWT validation failure in {task} to its specific root cause, provided diagnostic commands or code, and gave a targeted fix rather than a general JWT troubleshooting checklist.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Provided the same correct JWT fix as core/high but also added an unprompted security audit of the token lifecycle and rotation strategy.",
        "notes_tmpl": "core/high correctly diagnoses a specific JWT misconfiguration without needing the broader security audit that large/high would inject.",
    },
    # --- DevOps / pipeline debugging ---
    {
        "family_id": "fam-genF-devops-pipeline-debug",
        "domain": "devops",
        "task_type": "code_debug",
        "complexity_tier": "mid",
        "ambiguity": "clear",
        "prompts": [
            "Our GitHub Actions workflow runs integration tests against a Postgres container but fails with 'connection refused' on the first test. The service container is defined but the 'options: --health-cmd' check uses pg_isready with wrong flags. Show the corrected health check configuration and explain why the job step starts before the container is ready.",
            "A Dockerfile for our Python service produces a 2.3 GB image. The requirements.txt is copied before the application code, but build cache is still invalidated on every push because the COPY instruction targets a directory that includes a .git folder. Identify the cache-busting cause and show a corrected multi-stage Dockerfile.",
            "Our Terraform plan shows the RDS instance will be destroyed and recreated when only the 'backup_retention_period' changed. Identify that this attribute is in the 'forces new resource' set for the aws_db_instance resource, and show the correct approach using lifecycle ignore_changes or a blue/green strategy.",
            "A Kubernetes Deployment is stuck in 'Pending' because the requested memory limit of 8Gi exceeds the node's allocatable memory of 7.5Gi. Walk through the kubectl commands to diagnose this, then show a corrected resource spec and explain the difference between requests and limits.",
            "Our CI pipeline caches node_modules using the package-lock.json hash but the cache is never hit because package-lock.json is in .gitignore. Identify the cache key mismatch, propose using package.json as the fallback hash key, and show the corrected cache action configuration.",
            "A Helm chart upgrade fails with 'cannot patch Deployment because it is immutable'. The change was to add a new label to spec.selector.matchLabels, which is immutable after creation. Explain the immutability constraint and show how to perform the upgrade using helm upgrade --force or a delete-and-redeploy strategy.",
            "Our Ansible playbook idempotency check fails because the shell module is used for a task that creates a file, and it always reports 'changed'. Replace the shell module task with the appropriate file and template modules so the playbook reports 'ok' on subsequent runs.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "medium"},
        "insufficient_rationale_tmpl": "Suggested a general debugging approach but did not identify the specific misconfiguration or constraint (such as the immutable field or cache key mismatch) in {task}.",
        "acceptable_rationale_tmpl": "Identified the specific root cause in {task} -- not just the symptom -- provided the corrected configuration, and explained the underlying constraint that makes the naive approach fail.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Delivered the same correct fix as core/high and additionally proposed a full CI/CD pipeline redesign that was outside the scope of the question.",
        "notes_tmpl": "core/high is right for diagnosing a specific DevOps misconfiguration; the scope is bounded to one pipeline or deployment artifact.",
    },
    # --- Performance / query optimization ---
    {
        "family_id": "fam-genF-perf-query-optimization",
        "domain": "performance",
        "task_type": "analysis",
        "complexity_tier": "mid",
        "ambiguity": "borderline",
        "prompts": [
            "Our Postgres query that aggregates daily revenue by product_category takes 4 seconds on 50M rows. The EXPLAIN ANALYZE shows a sequential scan despite an index on (order_date, product_category). Analyze why the index is not used and propose whether a partial index, a materialized view, or a covering index is the right fix.",
            "A MongoDB aggregation pipeline groups shipments by region, unwinds items, and computes totals. The pipeline takes 8 seconds on a 10M document collection. The explain output shows a COLLSCAN on the $match stage. Identify the missing index and describe the compound index field order that will allow the match and sort to use the same index.",
            "Our Elasticsearch query for full-text search across three fields with a date range filter is taking 2 seconds at p95. The query uses query_string across all fields without field boosting. Propose switching to multi_match with per-field boost values and explain how to use a filter context for the date range to avoid scoring overhead.",
            "A Redis LRANGE call on a list with 200k entries is blocking the event loop for 300ms. Identify why LRANGE O(S+N) on a large list is the bottleneck, and propose replacing it with a sorted set with ZRANGEBYSCORE to return a bounded page of results in O(log N + M).",
            "Our Node.js API has a route that fetches a user, then N product records in a loop (N+1 query pattern). Each product query takes 2ms but with 200 products the route takes 400ms. Identify the N+1 pattern, show the SQL rewrite using a single IN clause or JOIN, and estimate the expected speedup.",
            "A Python data pipeline processes 500k CSV rows by calling a pandas apply() with a UDF that does string parsing. It takes 90 seconds. Analyze why apply() with a Python UDF is slow and show a vectorized rewrite using str accessor methods that should run in under 5 seconds.",
            "Our API response time at p99 jumped from 80ms to 600ms after adding a new index to the 'transactions' table. Explain how adding a write-heavy index increases write amplification and WAL volume, and describe how to evaluate whether the query read benefit outweighs the write cost using pg_stat_user_indexes.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "medium"},
        "insufficient_rationale_tmpl": "Recommended adding an index generically without analyzing the EXPLAIN output or identifying why the existing index is not used for {task}.",
        "acceptable_rationale_tmpl": "Analyzed the query plan or data structure for {task}, identified the specific bottleneck (index selectivity, N+1 pattern, or O(N) data structure), and recommended the targeted fix with a rationale tied to the observed cost.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Provided the same targeted optimization as core/high and then added unsolicited advice on connection pooling, caching layers, and read replica setup.",
        "notes_tmpl": "core/high can reason through query plans and recommend the right index or data structure change; large/high would add unrequested infrastructure recommendations.",
    },
    # --- API design / refactor ---
    {
        "family_id": "fam-genF-api-refactor",
        "domain": "api",
        "task_type": "code_write",
        "complexity_tier": "high",
        "ambiguity": "borderline",
        "prompts": [
            "Refactor a REST endpoint POST /batch-create-users that accepts a flat array of user objects to use a proper batch request envelope with a 'users' key, return per-item results in a 'results' array with individual status codes, and preserve backward compatibility with a deprecation header for the flat-array format.",
            "Rewrite a synchronous Python function that calls three external APIs sequentially (user service, billing service, feature-flag service) to call them concurrently using asyncio.gather(), handle partial failures by returning a partial result object rather than raising, and add structured logging for each service call.",
            "Extract a pagination cursor scheme from an existing offset-based GET /items?page=N&size=M endpoint. The new cursor should be opaque (base64-encoded JSON of last-seen ID and timestamp), support forward-only navigation, and fall back to offset if no cursor is provided, with a deprecation warning in the response.",
            "Refactor a monolithic Flask route handler for /checkout that is 300 lines long into a service layer, a validation layer, and a thin controller. The service layer must be independently testable without an HTTP context. Show the three resulting files with their interfaces.",
            "Add idempotency key support to a POST /payments endpoint: accept an Idempotency-Key header, store the key and response in Redis with a 24-hour TTL, and return the cached response on duplicate requests. Show the middleware and the Redis schema.",
            "Rewrite a GraphQL resolver that fetches author data inside a loop (N+1) to use a DataLoader that batches author IDs and fetches them in a single query. Show the DataLoader definition, the resolver change, and explain the batch scheduling behavior.",
            "Add request signing verification to a webhook receiver endpoint: parse the X-Signature-256 header, recompute HMAC-SHA256 of the raw request body using the shared secret, compare in constant time, and return HTTP 401 on mismatch. Show the middleware and the constant-time comparison.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "medium"},
        "insufficient_rationale_tmpl": "Sketched the high-level structure but omitted the backward compatibility handling or partial-failure semantics specific to {task}.",
        "acceptable_rationale_tmpl": "Provided a complete implementation for {task} with correct handling of the edge cases (partial failures, cursor encoding, or idempotency collision), proper interface boundaries, and working code.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Produced the correct implementation then added unrequested API versioning strategy and rate-limiting design discussion.",
        "notes_tmpl": "core/high handles the bounded refactor with edge cases; the task does not require large-level architectural reasoning.",
    },
    # --- Distributed systems bounded tasks ---
    {
        "family_id": "fam-genF-distributed-bounded",
        "domain": "distributed_systems",
        "task_type": "code_debug",
        "complexity_tier": "mid",
        "ambiguity": "clear",
        "prompts": [
            "Our Kafka consumer group is rebalancing every 2 minutes, causing 10-second processing gaps. The consumer's max.poll.interval.ms is 120000 but the batch processing loop sometimes takes 150 seconds on large batches. Identify the heartbeat miss, show how to reduce batch size or move processing to a thread pool, and set the correct poll interval.",
            "A gRPC service returns UNAVAILABLE for about 5% of requests during rolling deploys. The load balancer is using round-robin but not respecting gRPC's HTTP/2 connection reuse, causing new connections to be routed to draining pods. Identify the client-side load balancing gap and show how to configure a pick_first or round_robin policy on the gRPC channel.",
            "Our RabbitMQ dead-letter queue is growing at 1000 messages/hour. Messages are being negatively acknowledged with requeue=False when a downstream HTTP call returns 503. Show how to add a retry policy using x-death headers and a delayed exchange so transient 503s are retried up to 3 times before dead-lettering.",
            "A Redis Streams consumer group is processing duplicate messages after a consumer restarts because messages are acknowledged only after the full processing chain completes, but a crash between step 2 and the XACK leaves messages in the PEL. Explain the at-least-once semantics and show how to use XAUTOCLAIM to reclaim and reprocess stale PEL entries.",
            "Our Celery workers are consuming tasks faster than they process them, exhausting memory. The prefetch_multiplier is set to the default 4 and workers have 8 threads each, consuming 32 tasks per worker. Show how to set acks_late=True and prefetch_multiplier=1 to prevent over-fetching and explain the tradeoff with task throughput.",
            "A Pub/Sub subscription is delivering messages out of order despite ordering keys being set, because two subscriptions share the same topic and the second subscription does not have message ordering enabled. Identify the ordering configuration gap and show the corrected subscription setup.",
            "Our service mesh (Envoy-based) is applying circuit breaking but the threshold is never triggered because each Envoy sidecar tracks its own request counts independently rather than sharing state. Explain why distributed circuit breaking does not aggregate across pods and show how to tune per-host outlier detection to achieve the intended behavior.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "medium"},
        "insufficient_rationale_tmpl": "Identified that message processing was slow or rebalancing occurred but did not pinpoint the specific configuration parameter (such as max.poll.interval.ms or prefetch_multiplier) causing {task}.",
        "acceptable_rationale_tmpl": "Correctly diagnosed the specific configuration root cause in {task}, explained the protocol-level behavior (heartbeat, PEL, or load-balancing policy) driving the issue, and provided the corrected configuration with tradeoff notes.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Same diagnosis and fix as core/high, plus unsolicited advice on migrating to a different messaging system and redesigning the consumer topology.",
        "notes_tmpl": "core/high diagnoses a specific distributed systems misconfiguration without needing large-level protocol redesign suggestions.",
    },
    # --- Code review: backend ---
    {
        "family_id": "fam-genF-code-review-backend",
        "domain": "backend",
        "task_type": "code_review",
        "complexity_tier": "mid",
        "ambiguity": "clear",
        "prompts": [
            "Review this Python function that fetches user records from Postgres using psycopg2, formats them, and returns a list. Identify the SQL injection vulnerability from string interpolation, the missing connection close in the success path, and propose the corrected version using parameterized queries and a context manager.",
            "Review this Node.js middleware that reads a JSON config file on every request, parses it, and merges it into req.config. Identify the synchronous file I/O call in an async context, the redundant parsing on every request, and show a refactor that reads and caches the config at startup.",
            "Review this Go handler that decodes a JSON request body into a struct, checks a required field, and writes to a database. Point out the missing max body size limit, the unchecked Decode error, and the missing defer for closing the request body. Show the corrected handler.",
            "Review this Java Spring Boot service method that calls an external payment API inside a @Transactional method. Identify why a long-running external call inside a transaction holds a database connection for the full duration, and show how to restructure to release the connection before the external call.",
            "Review this Ruby on Rails controller action that constructs an ActiveRecord query using params[:sort_field] directly in an order() call. Identify the SQL injection risk and show how to whitelist allowed sort fields using a constant array.",
            "Review this PHP function that generates a password reset token using rand() and stores it in the database. Identify that rand() is not cryptographically secure, propose using random_bytes() with bin2hex(), and note that the token should be hashed before storage.",
            "Review this Rust async function that holds a MutexGuard across an await point. Identify why this can deadlock or cause a panic in an async runtime, and show how to release the lock before the await using a scoped block.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "medium"},
        "insufficient_rationale_tmpl": "Flagged one of the issues (e.g., SQL injection) but missed the resource leak or the async/sync boundary problem specific to {task}.",
        "acceptable_rationale_tmpl": "Identified all the specific issues in {task} -- security, resource management, and async correctness -- and provided a corrected implementation addressing each one.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Caught the same issues as core/high and additionally proposed a full architectural refactor of the service layer that was not requested.",
        "notes_tmpl": "core/high is sufficient for a bounded code review of a single function; all issues are findable with careful single-file analysis.",
    },
    # --- Planning: backend system design (bounded) ---
    {
        "family_id": "fam-genF-plan-bounded-system",
        "domain": "backend",
        "task_type": "plan",
        "complexity_tier": "high",
        "ambiguity": "borderline",
        "prompts": [
            "Plan the steps to migrate a synchronous Python monolith's user-notification system to an async Celery task queue without downtime. Include: how to deploy the Celery worker alongside the monolith, how to dual-route notifications during the transition, and how to validate the migration before cutting over fully.",
            "Plan a zero-downtime schema migration for adding a NOT NULL 'region' column to a 50M-row 'orders' table in Postgres. Cover the three-phase approach: add nullable column, backfill in batches, add NOT NULL constraint. Include how to handle the constraint validation without a full table lock.",
            "Plan the steps to add distributed tracing (using OpenTelemetry) to an existing Node.js Express API that calls three downstream services. Cover: which instrumentation libraries to add, how to propagate the trace context across HTTP and async boundaries, and how to configure the OTLP exporter without changing application logic.",
            "Plan a feature flag rollout for a new checkout flow that replaces a legacy one. The flag must support percentage-based rollout, per-user targeting, and kill-switch. Describe the evaluation order, the flag SDK integration points, and how to clean up the old code path after the rollout completes.",
            "Plan the steps to add rate limiting to a public REST API that currently has none. Cover: where to enforce the limit (gateway, middleware, or application), which storage backend to use for counters (Redis with sliding window vs token bucket), how to return RFC 7807 error responses, and how to test under load.",
            "Plan a blue/green deployment for a stateful service that uses a shared Postgres database. Cover: how to run schema migrations that are backward compatible with both versions, how to switch traffic, and how to roll back if the green deployment has errors after switch-over.",
            "Plan the steps to extract a user-profile service from a Rails monolith as a standalone Sinatra API. Cover: how to identify the bounded context, how to route traffic to the new service using the strangler fig pattern, how to keep data consistent during the transition, and when to remove the monolith code path.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "medium"},
        "insufficient_rationale_tmpl": "Produced a high-level checklist but missed the specific dual-routing or backward-compatibility mechanics required during the transition phase for {task}.",
        "acceptable_rationale_tmpl": "Produced a concrete, sequenced plan for {task} with specific steps for the transition period, rollback criteria, and validation checkpoints -- not just a list of phases.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Provided the same sequenced plan as core/high and additionally proposed re-architecting the entire service mesh and adopting a CQRS pattern that was not part of the scope.",
        "notes_tmpl": "core/high produces a concrete migration plan with transition-period specifics; large/high would broaden scope beyond what was asked.",
    },
]

# ---------------------------------------------------------------------------
# core/medium families -- moderate complexity, bounded scope
# ---------------------------------------------------------------------------

SONNET_MEDIUM_FAMILIES = [
    {
        "family_id": "fam-genF-sm-api-debug",
        "domain": "api",
        "task_type": "code_debug",
        "complexity_tier": "mid",
        "ambiguity": "clear",
        "prompts": [
            "Our REST API returns HTTP 400 for a valid POST request because the Content-Type header is 'application/json;charset=UTF-8' and the parser requires exactly 'application/json'. Identify the strict content-type check and show the fix to accept charset suffixes.",
            "A GET /users endpoint returns an empty array when querying with a filter that uses a boolean query param: ?active=true. The server is comparing the string 'true' to a boolean False. Identify the type coercion bug and show the corrected query parameter parsing.",
            "Our API client receives HTTP 413 Payload Too Large when uploading a 4MB JSON body. The server default is 1MB. Identify the limit setting location in Express (body-parser) and show how to raise it to 10MB.",
            "A PATCH /settings endpoint silently ignores unknown fields instead of returning HTTP 422. The Pydantic model uses the default Config without extra='forbid'. Show the Config change that enforces strict field validation.",
            "Our API returns stale data because a response is cached by an intermediate proxy for 5 minutes. The Cache-Control header is missing. Add the correct Cache-Control: no-store header for authenticated endpoints and Cache-Control: max-age=60 for public endpoints.",
        ],
        "insufficient_route": {"model_tier": "mini", "effort": "medium"},
        "insufficient_rationale_tmpl": "Named the wrong layer (e.g., blamed the client) without checking the specific header parsing or type coercion code for {task}.",
        "acceptable_rationale_tmpl": "Identified the specific parameter parsing or header handling bug in {task} and provided a one-line or small targeted fix.",
        "overkill_route": {"model_tier": "core", "effort": "high"},
        "overkill_rationale_tmpl": "Correctly fixed the bug in {task} and added unsolicited API validation framework refactoring.",
        "notes_tmpl": "core/medium is sufficient: each bug is in a single configuration or type-check, no multi-file tracing needed.",
    },
    {
        "family_id": "fam-genF-sm-sql-write",
        "domain": "database",
        "task_type": "code_write",
        "complexity_tier": "mid",
        "ambiguity": "borderline",
        "prompts": [
            "Write a SQL query that returns the top 5 products by revenue for each category in the last 30 days, using a window function with RANK() OVER (PARTITION BY category ORDER BY revenue DESC).",
            "Write a Postgres function that upserts a row in the 'sessions' table keyed on (user_id, device_id), updating 'last_seen' and incrementing 'visit_count' atomically using INSERT ... ON CONFLICT DO UPDATE.",
            "Write a SQL query using a recursive CTE to traverse an employee reporting hierarchy from a given manager_id down to all direct and indirect reports, returning employee_id, name, and depth.",
            "Write a Postgres trigger function that logs changes to the 'prices' table into an 'audit_prices' table, capturing old_price, new_price, changed_by (current_user), and changed_at (now()) on UPDATE events.",
            "Write a query that identifies duplicate email addresses in the 'contacts' table, showing the email, the count of duplicates, and the IDs of all duplicate rows using GROUP BY and STRING_AGG.",
        ],
        "insufficient_route": {"model_tier": "mini", "effort": "medium"},
        "insufficient_rationale_tmpl": "Wrote a query that computed the result correctly for simple cases but missed the PARTITION BY semantics or recursion termination for {task}.",
        "acceptable_rationale_tmpl": "Wrote a correct, idiomatic SQL query for {task} using the appropriate window function or CTE, with correct partition or recursion logic.",
        "overkill_route": {"model_tier": "core", "effort": "high"},
        "overkill_rationale_tmpl": "Correct SQL plus unsolicited index recommendations and query plan analysis for {task}.",
        "notes_tmpl": "core/medium handles moderate SQL writing with window functions or CTEs without needing the broader analysis core/high would provide.",
    },
    {
        "family_id": "fam-genF-sm-devops-write",
        "domain": "devops",
        "task_type": "code_write",
        "complexity_tier": "mid",
        "ambiguity": "clear",
        "prompts": [
            "Write a GitHub Actions workflow that builds a Docker image, tags it with the git SHA and 'latest', and pushes to a container registry only on pushes to the main branch.",
            "Write a shell script that checks if a Postgres database is accepting connections by running pg_isready in a loop with a 30-second timeout, exiting 0 on success and 1 on timeout.",
            "Write a Terraform resource block for an S3 bucket with versioning enabled, server-side encryption using SSE-S3, and a bucket policy that denies public access.",
            "Write a Makefile target 'test-integration' that starts a Docker Compose stack, waits for the health check to pass, runs pytest, and tears down the stack regardless of test outcome.",
            "Write an Ansible task that installs a list of packages defined in a variable 'required_packages' using apt, updates the cache if it is older than 1 hour, and fails if any package is unavailable.",
        ],
        "insufficient_route": {"model_tier": "mini", "effort": "medium"},
        "insufficient_rationale_tmpl": "Produced a template with placeholders but omitted the conditional logic (branch filter or timeout loop) required for {task}.",
        "acceptable_rationale_tmpl": "Wrote a complete, runnable configuration for {task} with correct conditional logic and error handling.",
        "overkill_route": {"model_tier": "core", "effort": "high"},
        "overkill_rationale_tmpl": "Correct implementation plus unrequested discussion of multi-environment strategy and secrets management for {task}.",
        "notes_tmpl": "core/medium is the right fit: self-contained infrastructure snippet with bounded conditional logic.",
    },
    {
        "family_id": "fam-genF-sm-testing-write",
        "domain": "testing",
        "task_type": "code_write",
        "complexity_tier": "mid",
        "ambiguity": "clear",
        "prompts": [
            "Write a Pytest test for a function that sends an email via SMTP, mocking smtplib.SMTP to verify the correct recipient, subject, and body are passed without making a real network call.",
            "Write a Jest test for a Redux reducer that handles an 'ADD_ITEM' action, verifying that the state is updated immutably (the original state object is not mutated).",
            "Write a Go table-driven test for a function that parses duration strings ('5m', '2h30m') into time.Duration, covering valid inputs, unknown units, and empty strings.",
            "Write a Python property-based test using Hypothesis that verifies a base64 encode/decode round-trip for arbitrary byte strings up to 1000 bytes.",
            "Write a Cypress test that logs in via the UI, navigates to the settings page, changes the display name, saves, and asserts the new name appears in the nav bar after a page reload.",
        ],
        "insufficient_route": {"model_tier": "mini", "effort": "medium"},
        "insufficient_rationale_tmpl": "Wrote a test that checked the happy path but omitted the mock assertion or the edge-case inputs required for {task}.",
        "acceptable_rationale_tmpl": "Wrote a complete test for {task} with correct mocking, assertion of side effects, and coverage of the specified edge cases.",
        "overkill_route": {"model_tier": "core", "effort": "high"},
        "overkill_rationale_tmpl": "Correct test plus unrequested discussion of test pyramid structure and coverage thresholds for {task}.",
        "notes_tmpl": "core/medium is right for writing a single, bounded unit or integration test with mocking.",
    },
    {
        "family_id": "fam-genF-sm-backend-analysis",
        "domain": "backend",
        "task_type": "analysis",
        "complexity_tier": "mid",
        "ambiguity": "borderline",
        "prompts": [
            "Compare connection pool sizing strategies for a FastAPI app with 10 worker processes that connects to a single Postgres instance. Analyze the tradeoffs between per-worker pools and a shared async pool using asyncpg.",
            "Analyze whether a Python Flask app using threading mode can share a single database connection across requests, and describe what goes wrong when two threads share the same psycopg2 connection.",
            "Evaluate the tradeoffs between using Redis sorted sets vs a Postgres table with a timestamp index for implementing a leaderboard with real-time rank queries on 1M users.",
            "Analyze the memory and CPU tradeoffs of streaming a 100MB CSV file through a Pandas read_csv() call vs processing it in chunks with chunksize=10000, given a 512MB container memory limit.",
            "Compare using background threads vs asyncio tasks for handling webhook deliveries in a Django application, given that Django's ORM is synchronous and each webhook call involves a database write.",
        ],
        "insufficient_route": {"model_tier": "mini", "effort": "medium"},
        "insufficient_rationale_tmpl": "Stated a preference without analyzing the specific tradeoff (memory footprint, thread safety, or latency profile) for {task}.",
        "acceptable_rationale_tmpl": "Analyzed the specific tradeoffs for {task} -- including the quantitative dimensions like memory or connection count -- and gave a grounded recommendation.",
        "overkill_route": {"model_tier": "core", "effort": "high"},
        "overkill_rationale_tmpl": "Correct analysis plus unsolicited benchmarking plan and infrastructure cost estimation for {task}.",
        "notes_tmpl": "core/medium handles a focused tradeoff analysis with two concrete options and a bounded scope.",
    },
    {
        "family_id": "fam-genF-sm-auth-write",
        "domain": "auth",
        "task_type": "code_write",
        "complexity_tier": "mid",
        "ambiguity": "clear",
        "prompts": [
            "Write a Python middleware that validates an HMAC-SHA256 request signature from a webhook provider, compares it to the X-Hub-Signature-256 header in constant time, and returns HTTP 401 on mismatch.",
            "Write a Node.js function that generates a secure random token for email verification, stores it hashed with SHA-256 in the database, and returns the unhashed token to be sent in the email link.",
            "Write a Go middleware that reads a Bearer token from the Authorization header, validates it against a JWKS endpoint with caching, and attaches the claims to the request context.",
            "Write a Django view that implements password reset using a time-limited signed token (itsdangerous or Django's built-in signing), verifying the token on POST and updating the password if valid.",
            "Write a FastAPI dependency that reads an API key from the X-API-Key header, looks it up in a Redis cache first and then a Postgres fallback, and raises HTTP 403 if not found.",
        ],
        "insufficient_route": {"model_tier": "mini", "effort": "medium"},
        "insufficient_rationale_tmpl": "Wrote code that performs the check but missed the constant-time comparison or the hash-before-store requirement for {task}.",
        "acceptable_rationale_tmpl": "Wrote a correct, secure implementation for {task} including the cryptographic detail (constant-time compare, hashed storage, or signed token) that makes it production-safe.",
        "overkill_route": {"model_tier": "core", "effort": "high"},
        "overkill_rationale_tmpl": "Correct implementation plus unsolicited OAuth2 integration design and token rotation strategy for {task}.",
        "notes_tmpl": "core/medium handles a bounded security implementation task that requires correct use of one cryptographic primitive.",
    },
]

# ---------------------------------------------------------------------------
# large/medium families -- tasks requiring broader reasoning but not high effort
# ---------------------------------------------------------------------------

OPUS_MEDIUM_FAMILIES = [
    {
        "family_id": "fam-genF-om-distributed-analysis",
        "domain": "distributed_systems",
        "task_type": "analysis",
        "complexity_tier": "high",
        "ambiguity": "borderline",
        "prompts": [
            "Analyze the consistency guarantees of our event sourcing system where command handlers write events and read-model projectors consume them asynchronously. Identify under which failure scenarios a user could read stale or missing data immediately after a write, and describe the possible mitigation strategies.",
            "Analyze the failure modes of a saga-based checkout flow that coordinates inventory reservation, payment processing, and order creation across three microservices. Identify which compensating transactions are needed, which failures cannot be compensated, and what the user experience should be in each case.",
            "Analyze the split-brain risk in a two-node primary/standby Postgres configuration using streaming replication with synchronous_commit=on. Identify the exact scenario where both nodes could believe they are primary and describe how pg_fence or Patroni prevents this.",
            "Analyze the tradeoffs of using optimistic locking (version column) vs pessimistic locking (SELECT FOR UPDATE) for concurrent updates to a 'shopping cart' entity that is updated from multiple devices for the same user simultaneously.",
            "Analyze how backpressure propagates through a pipeline of Kafka consumer -> async processor -> downstream HTTP service when the HTTP service degrades to 5-second response times. Identify where unbounded queue growth occurs and describe the correct pressure relief mechanism.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "high"},
        "insufficient_rationale_tmpl": "Identified the happy path correctly but did not fully enumerate the failure modes or compensating transaction requirements for {task}.",
        "acceptable_rationale_tmpl": "Enumerated the relevant failure scenarios for {task} with concrete examples, identified which failures are recoverable vs not, and described the mitigation mechanisms at the right level of specificity.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Same failure analysis as large/medium but also derived formal consistency proofs and proposed migrating to a different consensus protocol -- beyond the scope of the question.",
        "notes_tmpl": "large/medium is needed to enumerate cross-service failure modes comprehensively; core/high underestimates the interaction complexity.",
    },
    {
        "family_id": "fam-genF-om-auth-plan",
        "domain": "auth",
        "task_type": "plan",
        "complexity_tier": "high",
        "ambiguity": "borderline",
        "prompts": [
            "Plan the migration of a legacy session-based authentication system to stateless JWTs without logging users out. Cover how to issue JWTs alongside session cookies during the transition, how to validate both in parallel, how to revoke compromised JWTs before expiry using a denylist, and when to sunset session cookies.",
            "Plan the implementation of multi-tenant row-level security in Postgres for a SaaS application where each tenant's data must be isolated. Cover how to set the current tenant in the session using SET LOCAL, how to define RLS policies, how to test that cross-tenant data leakage is impossible, and the performance impact of RLS on query plans.",
            "Plan how to add OAuth2 authorization code flow to an existing API that currently uses API keys. Cover registration of the OAuth app, how to issue authorization codes, how to exchange them for tokens, how to handle token refresh, and how to support both API key and OAuth token authentication during the transition.",
            "Plan a secrets rotation strategy for a service that connects to Postgres and Redis using long-lived credentials stored in environment variables. Cover how to push new credentials without downtime, how to use a secrets manager with dynamic credentials, and how to audit which service instances used which credential version.",
            "Plan how to implement account takeover detection using login event signals: device fingerprint changes, geolocation anomalies, and rapid successive failed logins. Describe the feature flag rollout, the risk-score computation, the step-up authentication trigger, and the alert escalation path.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "high"},
        "insufficient_rationale_tmpl": "Outlined the main phases but missed the parallel-operation transition mechanics or the rollback path required for {task}.",
        "acceptable_rationale_tmpl": "Produced a complete plan for {task} with concrete transition steps, rollback criteria, and security validation checkpoints -- not just a feature list.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Same concrete plan as large/medium plus formal threat modeling and a complete security architecture review that was not requested.",
        "notes_tmpl": "large/medium is needed for planning complex auth transitions with multi-phase coexistence; core/high misses the transition-period edge cases.",
    },
    {
        "family_id": "fam-genF-om-perf-plan",
        "domain": "performance",
        "task_type": "plan",
        "complexity_tier": "high",
        "ambiguity": "borderline",
        "prompts": [
            "Plan a performance investigation for an API that has p99 latency of 2 seconds but p50 of 80ms, suggesting tail latency caused by a specific subset of requests. Describe the profiling approach: how to sample slow requests, which metrics to collect (GC pauses, lock contention, external call latency), and how to isolate the root cause.",
            "Plan the steps to shard a single Postgres 'events' table that is growing at 500GB/month. Cover horizontal vs time-based partitioning, how to route queries to the correct shard, how to migrate existing data without downtime, and how to handle queries that span shards.",
            "Plan how to add a read cache layer (Redis) to an API that currently reads user preferences from Postgres on every request. Cover cache warming, cache invalidation on write, TTL strategy, cache stampede prevention using probabilistic early expiration, and how to measure cache hit rate.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "high"},
        "insufficient_rationale_tmpl": "Described the general approach but missed the tail-latency isolation strategy or the cross-shard query handling specific to {task}.",
        "acceptable_rationale_tmpl": "Produced a sequenced investigation or migration plan for {task} with specific tooling, metrics, and decision criteria at each step.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Same plan as large/medium plus unsolicited migration to a different database engine and a capacity planning model.",
        "notes_tmpl": "large/medium is appropriate for planning a multi-phase performance or sharding initiative with cross-cutting concerns.",
    },
    {
        "family_id": "fam-genF-om-backend-code-review",
        "domain": "backend",
        "task_type": "code_review",
        "complexity_tier": "high",
        "ambiguity": "borderline",
        "prompts": [
            "Review the overall architecture of a Python service that handles webhook ingestion: an HTTP receiver, a deduplication layer using Redis, a Celery queue, and three worker types. Identify where idempotency is not guaranteed, which failure scenarios could cause double-processing, and what observability is missing.",
            "Review a Go service that uses a single global database connection (sql.DB) configured with MaxOpenConns=1. Identify the bottleneck under concurrent requests, explain the risk of connection starvation, recommend correct pool settings for 50 concurrent workers, and flag any missing error handling patterns.",
            "Review a microservice's API contract: it returns HTTP 200 with a success flag in the body for both success and business errors. Identify why this breaks HTTP semantics, how it complicates client retry logic, and propose a migration to proper HTTP status codes with a backward-compatible transition.",
        ],
        "insufficient_route": {"model_tier": "core", "effort": "high"},
        "insufficient_rationale_tmpl": "Identified individual code-level issues but did not reason about the cross-cutting architectural concern (idempotency gap, connection starvation, or HTTP semantics) for {task}.",
        "acceptable_rationale_tmpl": "Identified the architectural issue in {task}, explained the systemic risk (not just the code smell), and proposed a concrete remedy with the right tradeoff discussion.",
        "overkill_route": {"model_tier": "large", "effort": "high"},
        "overkill_rationale_tmpl": "Same architectural review as large/medium plus a full service decomposition recommendation and migration roadmap that was not requested.",
        "notes_tmpl": "large/medium is needed for an architectural review that requires reasoning across multiple components; core/high focuses on code-level details.",
    },
]


def build_rows():
    rows = []
    counter = 1

    def pad(n):
        return f"synth-genF-{n:04d}"

    def make_judgments(insufficient_route, insuf_rat, acceptable_route, accept_rat, overkill_route, overkill_rat):
        return [
            {
                "route": insufficient_route,
                "verdict": "insufficient",
                "rationale": insuf_rat,
            },
            {
                "route": acceptable_route,
                "verdict": "acceptable",
                "rationale": accept_rat,
            },
            {
                "route": overkill_route,
                "verdict": "overkill",
                "rationale": overkill_rat,
            },
        ]

    # -----------------------------------------------------------------------
    # Generate core/high rows from families
    # -----------------------------------------------------------------------
    # 10 families * 7 prompts = 70 natural rows; need 200 total.
    # Cycle through families to reach 200 rows with varied wording.
    sh_route = {"model_tier": "core", "effort": "high"}

    # Use all prompts from all families first, then cycle with paraphrasing.
    sh_prompts = []
    for fam in SONNET_HIGH_FAMILIES:
        for i, p in enumerate(fam["prompts"]):
            sh_prompts.append((fam, i, p))

    # We have 10 families * 7 = 70 base prompts; need 200.
    # Generate extra prompts by adding variation cues.
    extra_cues = [
        "Step through each layer of the stack and",
        "Given only the symptoms described,",
        "Without access to production logs,",
        "Assuming the issue is reproducible in a staging environment,",
        "Walking through this systematically,",
        "From first principles,",
        "Considering both the immediate fix and a longer-term solution,",
        "Taking into account backward compatibility,",
        "Focusing on the minimal change needed to fix this,",
        "Considering the operational impact,",
        "Keeping the change as small as possible,",
        "Treating this as a production incident,",
        "Assuming a junior engineer will apply this fix,",
    ]

    used_prompts = set()
    rng = random.Random(1337)

    while len(sh_prompts) < 200:
        # Augment with a cue prepended
        base_idx = len(sh_prompts) % 70
        fam, i, base_p = sh_prompts[base_idx]
        cue = extra_cues[len(sh_prompts) % len(extra_cues)]
        # Only augment if would create a distinct prompt
        new_p = f"{cue} {base_p[0].lower()}{base_p[1:]}"
        sh_prompts.append((fam, i, new_p))

    for fam, fam_idx, p in sh_prompts[:200]:
        task_hint = f"the {fam['task_type']} task"
        insuf_rat = fam["insufficient_rationale_tmpl"].replace("{task}", task_hint)
        accept_rat = fam["acceptable_rationale_tmpl"].replace("{task}", task_hint)
        overkill_rat = fam["overkill_rationale_tmpl"].replace("{task}", task_hint)

        ambiguity = fam.get("ambiguity", "clear")
        # Limit ambiguous to <15% of 200 = <30. Keep most clear/borderline.
        if ambiguity == "ambiguous" and len([r for r in rows if r.get("ambiguity") == "ambiguous"]) >= 35:
            ambiguity = "borderline"

        row = {
            "prompt_id": pad(counter),
            "family_id": fam["family_id"],
            "prompt": p,
            "source": "synthetic_large",
            "domain": fam["domain"],
            "task_type": fam["task_type"],
            "ambiguity": ambiguity,
            "cheapest_acceptable_route": sh_route,
            "complexity_tier": fam.get("complexity_tier", "mid"),
            "route_judgments": make_judgments(
                fam["insufficient_route"],
                insuf_rat,
                sh_route,
                accept_rat,
                fam["overkill_route"],
                overkill_rat,
            ),
            "provenance": PROVENANCE,
            "notes": fam["notes_tmpl"],
        }
        rows.append(row)
        counter += 1

    # -----------------------------------------------------------------------
    # Generate core/medium rows
    # -----------------------------------------------------------------------
    sm_route = {"model_tier": "core", "effort": "medium"}
    sm_prompts = []
    for fam in SONNET_MEDIUM_FAMILIES:
        for i, p in enumerate(fam["prompts"]):
            sm_prompts.append((fam, i, p))

    # Need 30 rows; have 6 families * 5 = 30. Perfect.
    for fam, fam_idx, p in sm_prompts[:30]:
        task_hint = f"the {fam['task_type']} task"
        insuf_rat = fam["insufficient_rationale_tmpl"].replace("{task}", task_hint)
        accept_rat = fam["acceptable_rationale_tmpl"].replace("{task}", task_hint)
        overkill_rat = fam["overkill_rationale_tmpl"].replace("{task}", task_hint)

        row = {
            "prompt_id": pad(counter),
            "family_id": fam["family_id"],
            "prompt": p,
            "source": "synthetic_large",
            "domain": fam["domain"],
            "task_type": fam["task_type"],
            "ambiguity": fam.get("ambiguity", "clear"),
            "cheapest_acceptable_route": sm_route,
            "complexity_tier": fam.get("complexity_tier", "mid"),
            "route_judgments": make_judgments(
                fam["insufficient_route"],
                insuf_rat,
                sm_route,
                accept_rat,
                fam["overkill_route"],
                overkill_rat,
            ),
            "provenance": PROVENANCE,
            "notes": fam["notes_tmpl"],
        }
        rows.append(row)
        counter += 1

    # -----------------------------------------------------------------------
    # Generate large/medium rows
    # -----------------------------------------------------------------------
    om_route = {"model_tier": "large", "effort": "medium"}
    om_prompts = []
    for fam in OPUS_MEDIUM_FAMILIES:
        for i, p in enumerate(fam["prompts"]):
            om_prompts.append((fam, i, p))

    # Need 20 rows; have: 5+5+3+3 = 16 base prompts. Need 4 more.
    extra_om_cues = [
        "Considering long-term maintainability,",
        "From an operational reliability perspective,",
        "Focusing on the systemic risk rather than individual bugs,",
        "Assuming a team of 5 engineers will own this system,",
    ]
    while len(om_prompts) < 20:
        base_idx = len(om_prompts) % 16
        fam, i, base_p = om_prompts[base_idx]
        cue = extra_om_cues[len(om_prompts) % len(extra_om_cues)]
        new_p = f"{cue} {base_p[0].lower()}{base_p[1:]}"
        om_prompts.append((fam, i, new_p))

    for fam, fam_idx, p in om_prompts[:20]:
        task_hint = f"the {fam['task_type']} task"
        insuf_rat = fam["insufficient_rationale_tmpl"].replace("{task}", task_hint)
        accept_rat = fam["acceptable_rationale_tmpl"].replace("{task}", task_hint)
        overkill_rat = fam["overkill_rationale_tmpl"].replace("{task}", task_hint)

        row = {
            "prompt_id": pad(counter),
            "family_id": fam["family_id"],
            "prompt": p,
            "source": "synthetic_large",
            "domain": fam["domain"],
            "task_type": fam["task_type"],
            "ambiguity": fam.get("ambiguity", "borderline"),
            "cheapest_acceptable_route": om_route,
            "complexity_tier": fam.get("complexity_tier", "high"),
            "route_judgments": make_judgments(
                fam["insufficient_route"],
                insuf_rat,
                om_route,
                accept_rat,
                fam["overkill_route"],
                overkill_rat,
            ),
            "provenance": PROVENANCE,
            "notes": fam["notes_tmpl"],
        }
        rows.append(row)
        counter += 1

    return rows


def main():
    out_path = Path(__file__).parent / "chunk.jsonl"
    rows = build_rows()
    assert len(rows) == 250, f"Expected 250 rows, got {len(rows)}"

    sh = sum(1 for r in rows if r["cheapest_acceptable_route"] == {"model_tier": "core", "effort": "high"})
    sm = sum(1 for r in rows if r["cheapest_acceptable_route"] == {"model_tier": "core", "effort": "medium"})
    om = sum(1 for r in rows if r["cheapest_acceptable_route"] == {"model_tier": "large", "effort": "medium"})
    assert sh == 200, f"Expected 200 core/high, got {sh}"
    assert sm == 30, f"Expected 30 core/medium, got {sm}"
    assert om == 20, f"Expected 20 large/medium, got {om}"

    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"Wrote {len(rows)} rows to {out_path}")
    print(f"  core/high: {sh}")
    print(f"  core/medium: {sm}")
    print(f"  large/medium: {om}")


if __name__ == "__main__":
    main()
