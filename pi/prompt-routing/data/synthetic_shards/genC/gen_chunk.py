"""
PEP 723
# requires-python = ">=3.11"
"""
import json
import hashlib
import random

random.seed(42)

def make_id(n):
    h = format(n * 0x9e3779b9 & 0xFFFFFF, "06x")
    return f"GC-{h}"

def make_family(domain, tier, effort):
    return f"GC-{domain}-{tier}-{effort}"

def prov():
    return {
        "generator_model": "claude-sonnet-4-6",
        "generator_model_size": "medium",
        "adjudicator_model": "self",
        "adjudicator_model_size": "medium",
        "adjudicator_temperature": 0.0,
        "prompt_version_hash": "GC-v1",
        "mode": "live_agent",
        "cross_family": False,
    }

def row(n, prompt, domain, task_type, ambiguity, model_tier, effort):
    pid = make_id(n)
    fid = make_family(domain, model_tier.lower(), effort)
    route = {"model_tier": model_tier, "effort": effort}
    return {
        "prompt_id": pid,
        "family_id": fid,
        "prompt": prompt,
        "source": "synthetic",
        "domain": domain,
        "task_type": task_type,
        "ambiguity": ambiguity,
        "cheapest_acceptable_route": route,
        "labels": {"cheapest_acceptable_route": route},
        "provenance": prov(),
    }

rows = []
n = 0

# ============================================================
# Sonnet + high (300 rows) -- architecture-adjacent design/review/plan
# ============================================================

sonnet_high = [
    # architecture (45)
    ("Design a rate limiter for a public REST API that must support per-user, per-IP, and per-endpoint quotas with burst allowance, Redis-backed state, and graceful degradation when Redis is unavailable.", "architecture", "design", "clear"),
    ("Design an event-driven order fulfillment system. Orders come in via HTTP, must be idempotent, and downstream inventory, billing, and shipping services must each receive exactly-once delivery.", "architecture", "design", "clear"),
    ("You have a monolith deploying to three regions. Design a strangler-fig migration path to extract the billing domain without downtime, preserving transactional guarantees across the old and new services.", "architecture", "plan_migration", "borderline"),
    ("Design the caching strategy for a product catalog served to 10M daily users. Items change at most once per hour. Describe cache topology, invalidation, stampede prevention, and fallback.", "architecture", "design", "clear"),
    ("Review this system design doc for failure modes: a write-through cache backed by Postgres. A single cache node. No read replica. Auto-increment primary keys. What will break at 50k writes/min?", "architecture", "review", "clear"),
    ("Design a multi-region active-active write architecture for a user-profile store. Conflict resolution must be deterministic. Describe replication lag handling and partition behavior.", "architecture", "design", "borderline"),
    ("Our service currently does synchronous HTTP calls to three downstream services in sequence. Design an async fan-out pattern that preserves ordering guarantees and handles partial failures.", "architecture", "design", "clear"),
    ("Design a plugin system for a server-side rendering framework. Plugins can add routes, middleware, and template helpers. Describe the plugin API, isolation, load order, and hot-reload semantics.", "architecture", "design", "clear"),
    ("Walk me through designing a distributed task queue that supports priority, delayed execution, at-least-once delivery, and dead-letter queues. No external dependencies allowed.", "architecture", "design", "clear"),
    ("Design a schema migration framework for a service that runs 30 instances and cannot tolerate downtime. Describe the migration lifecycle, rollback, and zero-downtime column rename strategy.", "architecture", "plan_migration", "borderline"),
    ("Our API gateway currently routes all traffic to a single backend pool. Design a weighted traffic-splitting architecture to support canary deployments with automatic rollback on p99 degradation.", "architecture", "design", "clear"),
    ("Review this design: all microservices share one Postgres database schema and coordinate via stored procedures. Identify failure modes and propose an incremental migration to per-service ownership.", "architecture", "review", "clear"),
    ("Design the session management layer for a multi-tenant SaaS app. Sessions must be tenant-isolated, revocable, and survive a rolling restart without dropping active users.", "architecture", "design", "clear"),
    ("Design a graceful shutdown protocol for a stateful streaming service. Connections must drain, in-flight messages must complete, and the process must exit cleanly within 30s.", "architecture", "design", "clear"),
    ("Plan a phased rollout for promoting a shadow read replica to primary for a 2TB Postgres database. Include pre-flight checks, promotion steps, rollback gates, and post-promotion validation.", "architecture", "plan_migration", "borderline"),
    ("Design a distributed configuration service that supports versioned config, per-environment overrides, hot reload without restart, and audit logging of every change.", "architecture", "design", "clear"),
    ("Review this microservice architecture: each service has its own DB, but they all share the same message broker topic namespace. Identify coupling risks and propose a namespace governance strategy.", "architecture", "review", "clear"),
    ("Design a fan-in aggregation layer that collects results from 20 parallel upstream workers within a deadline, handles stragglers with partial results, and is stateless across restarts.", "architecture", "design", "clear"),
    ("We need to split a shared `users` table across services. Design the decomposition: which service owns the table, how foreign-key relationships are replaced, and how existing queries migrate.", "architecture", "plan_migration", "borderline"),
    ("Design a retry and backoff strategy for an event consumer that processes financial transactions. Include idempotency keys, dead-letter handling, and alerting thresholds.", "architecture", "design", "clear"),
    ("Our background job system uses cron-based scheduling and a shared Postgres table as a lock. Design a replacement that handles node failures, clock skew, and job overlap prevention.", "architecture", "design", "clear"),
    ("Design a zero-downtime blue-green deployment pipeline for a stateful service that holds WebSocket connections. Describe connection migration, health checks, and rollback triggers.", "architecture", "plan_migration", "borderline"),
    ("Review this architecture: a single-process Node app manages both HTTP routing and in-memory session state. What breaks at 10k concurrent users? Propose a redesign.", "architecture", "review", "clear"),
    ("Design a multi-tenant feature-flag system. Flags must be evaluatable per tenant, per user, and per environment. Describe storage, evaluation, caching, and SDK interface.", "architecture", "design", "clear"),
    ("Design a write-ahead log compaction strategy for a local key-value store. The log can grow unboundedly. Compaction must not block reads or writes.", "architecture", "design", "clear"),
    ("Migrate a service from polling-based integration to webhook-based push. Include the cutover strategy, dual-mode operation period, and decommissioning steps.", "architecture", "plan_migration", "clear"),
    ("Design an API versioning strategy for a public HTTP API that must support v1 clients indefinitely while shipping v2 features. Cover routing, deprecation signaling, and sunset policy.", "architecture", "design", "clear"),
    ("Design a bulk-import pipeline that ingests CSV files up to 5GB. Files must be validated, deduplicated, and upserted into Postgres. Describe parallelism, error handling, and progress reporting.", "architecture", "design", "clear"),
    ("Review this rate limiter implementation: a Redis INCR with 1-minute TTL per (user, endpoint) key. Identify races, fairness issues, and TTL drift at window boundaries.", "architecture", "review", "clear"),
    ("Design a scheduled job framework that guarantees each job runs at least once per interval, supports inter-job dependencies, and provides visibility into job state.", "architecture", "design", "clear"),
    ("Design the health check and readiness probe architecture for a service with five dependencies. Each dependency has different recovery time. Describe dependency grouping and probe semantics.", "architecture", "design", "clear"),
    ("We need to migrate 500M rows from a flat events table to a partitioned table without downtime. Design the backfill strategy, cutover, and rollback plan.", "architecture", "plan_migration", "borderline"),
    ("Design a request-coalescing layer in front of an expensive API. Multiple in-flight requests for the same resource should share one upstream call. Describe deduplication, timeout, and error fanout.", "architecture", "design", "clear"),
    ("Review this system: a distributed lock using Redis SETNX with a 30-second TTL and no Redlock. Identify safety hazards under network partition or clock drift.", "architecture", "review", "borderline"),
    ("Design a metadata indexing pipeline for a blob store. Objects are written at 10k/min. Consumers need sub-second lookup by tag, MIME type, and upload date.", "architecture", "design", "clear"),
    ("Plan the rollout of a breaking change to a public gRPC API used by 200 internal clients. Describe the version bump, compatibility shim, migration timeline, and automated client scanning.", "architecture", "plan_migration", "borderline"),
    ("Design a circuit breaker for HTTP calls to a flaky third-party payment provider. Include state machine, threshold tuning, fallback behavior, and metrics instrumentation.", "architecture", "design", "clear"),
    ("Design a multi-writer object store where writers can append chunks to the same logical object concurrently. Describe the ordering guarantee, chunk registry, and read semantics.", "architecture", "design", "borderline"),
    ("Review this design for a search indexing service: it subscribes to a Kafka topic, builds an in-memory index, and writes to Elasticsearch in batches. Identify failure modes and data-loss scenarios.", "architecture", "review", "clear"),
    ("Design a distributed scheduler that assigns tasks to workers based on affinity rules, handles worker failures mid-task, and rebalances load without thundering-herd effects.", "architecture", "design", "borderline"),
    ("Design a tenant onboarding pipeline that provisions a database schema, seeds default data, assigns resource quotas, and sends a welcome email -- all idempotently.", "architecture", "design", "clear"),
    ("Plan the database schema migration strategy for adding soft deletes to 15 existing tables that are joined in complex queries. Describe the phased rollout and index changes.", "architecture", "plan_migration", "borderline"),
    ("Design a reverse proxy that can route requests to different backend versions based on request headers, user cohort, and A/B experiment assignment.", "architecture", "design", "clear"),
    ("Review this event sourcing design: events are stored in Postgres, projections are rebuilt on startup by replaying all events. Identify scalability and operational failure modes.", "architecture", "review", "clear"),
    ("Design a time-series metrics ingest pipeline that must handle 1M data points per second with sub-5-minute query latency. Describe write path, storage layout, and downsampling.", "architecture", "design", "clear"),
    # distributed_systems (25)
    ("Design a consensus-based leader election for a 5-node service cluster without an external coordination service. Describe the election protocol, failure detection, and split-brain prevention.", "distributed_systems", "design", "borderline"),
    ("Describe the failure modes when two services use optimistic locking on the same Postgres row and experience high contention. How does the retry strategy affect throughput?", "distributed_systems", "analysis", "clear"),
    ("Design an exactly-once delivery mechanism for a message queue where consumers can crash mid-processing. Describe the ack model, offset management, and idempotency contract.", "distributed_systems", "design", "clear"),
    ("Review this distributed transaction design: a saga with compensating transactions, but the compensation steps are not idempotent. Identify failure modes and propose fixes.", "distributed_systems", "review", "borderline"),
    ("Design a gossip-based failure detector for a 100-node cluster. Include fanout, heartbeat intervals, and a tunable phi-accrual threshold.", "distributed_systems", "design", "clear"),
    ("Plan the migration from a single-node Redis to a Redis Cluster with 6 shards for a session store that cannot tolerate key loss. Describe the migration window and validation steps.", "distributed_systems", "plan_migration", "borderline"),
    ("Design a vector clock scheme for a distributed document store where concurrent edits must be detected and surfaced to the user for merge.", "distributed_systems", "design", "clear"),
    ("Analyze this design: a two-phase commit coordinator that writes its decision log to the same Postgres database it is coordinating. What happens if the database goes down between prepare and commit?", "distributed_systems", "analysis", "clear"),
    ("Design a partition-tolerant cache invalidation protocol for a CDN with 50 edge nodes. Cache entries must be invalidated within 30 seconds of a write.", "distributed_systems", "design", "clear"),
    ("Review this architecture: a service uses a global in-process cache with no TTL. Identify memory and consistency failure modes in a multi-instance deployment.", "distributed_systems", "review", "clear"),
    ("Design a distributed rate limiter using a token bucket algorithm that is consistent across 10 instances without a central coordinator. Describe the gossip or CRD-based state merging.", "distributed_systems", "design", "borderline"),
    ("Design a linearizable key-value store using Raft. Describe the read path (leader lease vs. read index), write path, and snapshot compaction.", "distributed_systems", "design", "borderline"),
    ("Analyze the CAP trade-offs of your proposed design for a geographically distributed user-preference store. Justify whether AP or CP is the right choice for this workload.", "distributed_systems", "analysis", "borderline"),
    ("Design a change-data-capture pipeline from Postgres to a downstream analytics store. Describe WAL consumption, schema evolution handling, and exactly-once semantics.", "distributed_systems", "design", "clear"),
    ("Review this design: services call each other synchronously in a chain of five hops. Identify cascading failure risks and propose a resilience pattern.", "distributed_systems", "review", "clear"),
    ("Design an anti-entropy reconciliation protocol for two replicas of a key-value store that can diverge during network partitions.", "distributed_systems", "design", "borderline"),
    ("Outline the migration from single-datacenter to active-active multi-region. Include write conflict resolution, read latency goals, and rollback criteria.", "distributed_systems", "plan_migration", "borderline"),
    ("Design a distributed tracing sampling strategy that captures 100% of error traces and 1% of success traces without central coordination between services.", "distributed_systems", "design", "clear"),
    ("Analyze this replication lag scenario: replica is 10 minutes behind primary, a read-your-writes guarantee is required, and traffic is 50k RPS. What strategies keep the guarantee without hammering primary?", "distributed_systems", "analysis", "borderline"),
    ("Design a quorum-based configuration store that allows reads at any consistency level and writes at majority quorum. Describe version vector management.", "distributed_systems", "design", "clear"),
    ("Review this design: a job scheduler uses a distributed lock with 60s TTL. Jobs run for up to 45s. What happens when a worker pauses for 61s due to GC and another worker acquires the lock?", "distributed_systems", "review", "clear"),
    ("Design a backpressure mechanism for a streaming pipeline where the producer outpaces the consumer. Describe the feedback loop, buffer sizing, and drop vs. block policy.", "distributed_systems", "design", "clear"),
    ("Plan the cutover from an eventually-consistent user store to a linearizable one. Describe the dual-write period, validation, and traffic migration.", "distributed_systems", "plan_migration", "borderline"),
    ("Design a checkpointing protocol for a long-running distributed computation that must resume from the last checkpoint on node failure.", "distributed_systems", "design", "clear"),
    ("Analyze this design: a pub-sub system uses topic fan-out to 1000 subscribers. One slow subscriber blocks the broker thread. Identify the bottleneck and redesign.", "distributed_systems", "analysis", "clear"),
    # concurrency (20)
    ("Design a work-stealing thread pool scheduler for CPU-bound tasks. Describe the deque structure, stealing heuristic, and termination detection.", "concurrency", "design", "clear"),
    ("Review this Go code: multiple goroutines write to a shared map protected by a sync.RWMutex, but readers also call a method that internally acquires a write lock. Identify the deadlock scenario.", "concurrency", "review", "clear"),
    ("Design a pipeline of goroutines where each stage fans out to N workers, collects results, and passes aggregated output to the next stage. Describe backpressure and cancellation.", "concurrency", "design", "clear"),
    ("Analyze this lock-free stack implementation in C++: push uses compare-exchange on the head pointer. Identify ABA hazards and describe a safe reclamation strategy.", "concurrency", "analysis", "borderline"),
    ("Design a connection pool with a configurable max size, acquire timeout, and health-check eviction. Describe the locking strategy and waitlist management.", "concurrency", "design", "clear"),
    ("Review this async Python code: three coroutines share a global asyncio.Lock. One coroutine re-enters while holding the lock. Describe the behavior and fix.", "concurrency", "review", "clear"),
    ("Design a broadcast channel in Rust where each receiver sees every message sent after it subscribes. Describe the arc-based slot structure and waker notification.", "concurrency", "design", "borderline"),
    ("Analyze this Java service: thread-local state is populated in a filter but read in a Callable submitted to a thread pool. Identify the race and propose a fix.", "concurrency", "analysis", "clear"),
    ("Design a rate-limited semaphore that allows at most N concurrent operations and enforces a minimum gap of T milliseconds between acquires.", "concurrency", "design", "clear"),
    ("Review this pattern: a background thread reads from a channel and writes results to a Vec protected by a Mutex. The main thread polls the Vec. Identify spin-wait inefficiency and propose a condvar redesign.", "concurrency", "review", "clear"),
    ("Design a concurrent priority queue that supports O(log n) insert and O(log n) delete-min under high contention. Describe the fine-grained locking or lock-free approach.", "concurrency", "design", "borderline"),
    ("Analyze this scenario: two threads increment a shared counter using fetch-and-add on x86. Is the result always correct? What changes on ARM with weak memory ordering?", "concurrency", "analysis", "borderline"),
    ("Design an actor model implementation in Python where actors have mailboxes, can spawn child actors, and support supervised restart on exception.", "concurrency", "design", "clear"),
    ("Review this Node.js code: a global object is mutated by concurrent async tasks in the same event loop tick. Identify the interleaving hazard and propose a fix.", "concurrency", "review", "clear"),
    ("Design a futures-based concurrency runtime that supports cooperative scheduling, cancellation, and timeout propagation through async chains.", "concurrency", "design", "borderline"),
    ("Analyze the performance implications of using a single global lock vs. sharded locks for a cache with 100k entries accessed by 64 threads.", "concurrency", "analysis", "clear"),
    ("Design a transactional memory library in Python using optimistic concurrency: reads are tracked, writes are buffered, commit validates and retries on conflict.", "concurrency", "design", "borderline"),
    ("Review this Rust code: an Arc<Mutex<Vec<T>>> is cloned into multiple threads that push and pop concurrently. The pop returns an Option but callers expect infallibility. Identify the invariant violation.", "concurrency", "review", "clear"),
    ("Design a thread-safe LRU cache with O(1) get and put, supporting concurrent readers and exclusive writers without a global lock.", "concurrency", "design", "clear"),
    ("Analyze this pattern: a service uses a ReentrantReadWriteLock where write locks are held while calling external HTTP APIs. Identify the throughput hazard.", "concurrency", "analysis", "clear"),
    # security (25)
    ("Design a secrets management system for a Kubernetes-based microservices platform. Secrets must be rotated without restarting pods, scoped per service, and audited.", "security", "design", "clear"),
    ("Review this authentication design: a JWT is signed with HS256 using the user ID as the secret. Identify vulnerabilities and redesign.", "security", "review", "clear"),
    ("Design a role-based access control system for a multi-tenant API where each tenant has its own role hierarchy and resource namespaces.", "security", "design", "clear"),
    ("Plan the migration from API key authentication to OAuth 2.0 client credentials for all service-to-service calls. Describe dual-mode operation and key retirement.", "security", "plan_migration", "borderline"),
    ("Review this input validation design: user-supplied HTML is sanitized by stripping script tags with a regex. Identify bypass vectors and recommend a library-based fix.", "security", "review", "clear"),
    ("Design a mutual TLS certificate rotation scheme for a service mesh of 50 services. Certificates expire every 24 hours. Describe issuance, distribution, and zero-downtime rotation.", "security", "design", "borderline"),
    ("Design a SQL injection prevention strategy for a query builder that constructs dynamic WHERE clauses from user-supplied filter objects.", "security", "design", "clear"),
    ("Review this session token design: a 64-bit integer auto-increment ID is stored in a signed cookie with no HMAC. Identify enumeration and forgery attacks.", "security", "review", "clear"),
    ("Design an audit logging system for a financial application. Logs must be tamper-evident, queryable by user and resource, and retained for 7 years.", "security", "design", "clear"),
    ("Design the authorization model for a document management system where documents can be shared with individual users, groups, or made public, with per-document permission overrides.", "security", "design", "borderline"),
    ("Review this password reset flow: a reset token is emailed, stored in Postgres, and valid for 24 hours with no one-time-use enforcement. Identify token reuse attacks and propose fixes.", "security", "review", "clear"),
    ("Design a defense-in-depth strategy for a public-facing API: rate limiting, input validation, authentication, authorization, and secrets handling layers.", "security", "design", "clear"),
    ("Plan the migration from storing passwords as unsalted MD5 hashes to bcrypt without forcing all users to reset their passwords.", "security", "plan_migration", "borderline"),
    ("Review this file upload design: user uploads are stored at /uploads/<original_filename>. Identify path traversal, overwrite, and MIME-type confusion attacks.", "security", "review", "clear"),
    ("Design a capability-based access token system where tokens can be scoped to specific resources and operations, delegated, and revoked without a central revocation list.", "security", "design", "borderline"),
    ("Design a CSRF protection mechanism for a single-page app that uses cookie-based sessions and a REST API. Cover the token lifecycle and SameSite attribute strategy.", "security", "design", "clear"),
    ("Review this token validation logic: the server decodes a JWT without verifying the signature, trusting the algorithm field from the token header. Identify the attack.", "security", "review", "clear"),
    ("Design an SSRF mitigation strategy for a service that fetches user-supplied URLs. Describe allowlist, DNS rebinding prevention, and redirect following controls.", "security", "design", "clear"),
    ("Design the key management architecture for encrypting PII fields in a multi-tenant database. Keys must be per-tenant, rotatable, and backed by a hardware security module.", "security", "design", "borderline"),
    ("Review this OAuth flow: an authorization code is returned in the URL fragment and parsed by JavaScript. Identify referer leakage and open-redirect risks.", "security", "review", "borderline"),
    ("Design a privilege escalation prevention system for a multi-user Linux-based SaaS platform. Users can run arbitrary scripts but must not access each other's data.", "security", "design", "borderline"),
    ("Plan the rollout of Content Security Policy headers for a legacy app with 200 inline scripts. Describe the audit, nonce-based migration, and reporting phase.", "security", "plan_migration", "borderline"),
    ("Review this API key storage design: keys are stored in plaintext in Postgres and used in query parameters in URLs. Identify log exposure and DB compromise risks.", "security", "review", "clear"),
    ("Design a zero-trust network access model for a remote engineering team accessing internal microservices. Describe device trust, identity provider integration, and per-request authorization.", "security", "design", "borderline"),
    ("Design a rate-limiting and abuse-prevention layer for a public signup endpoint. Address credential stuffing, disposable email, and bot-driven account creation.", "security", "design", "clear"),
    # data_modeling (20)
    ("Design the schema for a multi-tenant audit log that stores who did what to which resource, supports efficient queries by user, resource, and time range, and is append-only.", "data_modeling", "design", "clear"),
    ("Design a polymorphic content model for a CMS where articles, videos, and podcasts share common metadata but have type-specific fields. Describe the Postgres schema options and trade-offs.", "data_modeling", "design", "clear"),
    ("Review this schema: a many-to-many relationship between users and groups is implemented as a JSON array column on the users table. Identify query and integrity failure modes.", "data_modeling", "review", "clear"),
    ("Design the data model for a hierarchical permissions system where permissions can be inherited, overridden, and denied at any level of the tree.", "data_modeling", "design", "borderline"),
    ("Plan the migration from a flat tags column (comma-separated string) to a normalized tags table with full-text search support. Describe the backfill and cutover.", "data_modeling", "plan_migration", "clear"),
    ("Design a versioned document store where each save creates a new revision, diffs between revisions are queryable, and documents can be restored to any prior version.", "data_modeling", "design", "clear"),
    ("Review this schema: a notifications table with 500M rows has no partition key and a single non-clustered index on user_id. Identify query and vacuum performance issues.", "data_modeling", "review", "clear"),
    ("Design the schema for a financial ledger that supports double-entry bookkeeping, account balance queries, and historical transaction replay.", "data_modeling", "design", "clear"),
    ("Design a graph data model for a social network's follow relationship in Postgres. Describe the adjacency list schema, index strategy for follower and following queries, and recursive CTE use.", "data_modeling", "design", "borderline"),
    ("Plan the migration of a varchar(255) email column to a normalized email_addresses table to support multiple emails per user. Describe the dual-write strategy.", "data_modeling", "plan_migration", "borderline"),
    ("Design the schema for a product catalog that supports configurable attributes (color, size, weight vary by category) without an EAV anti-pattern.", "data_modeling", "design", "clear"),
    ("Review this schema: a jobs table uses a status enum and is polled by multiple workers with SELECT FOR UPDATE SKIP LOCKED. Identify index requirements and bloat risks.", "data_modeling", "review", "clear"),
    ("Design a time-series schema in Postgres for storing per-user daily metric snapshots for 5 years. Describe partitioning, retention, and query patterns.", "data_modeling", "design", "clear"),
    ("Design a soft-delete strategy for a schema with 20 interrelated tables and foreign key constraints. Describe index changes, view-based compatibility, and cascade rules.", "data_modeling", "design", "borderline"),
    ("Plan the migration of a monolithic schema to per-tenant schemas in Postgres. Describe template schema provisioning, connection pooling, and query routing.", "data_modeling", "plan_migration", "borderline"),
    ("Design the schema for an inventory management system that tracks stock levels across multiple warehouses, supports reservations, and prevents overselling.", "data_modeling", "design", "clear"),
    ("Review this schema: a messages table with sender_id, recipient_id, and body is queried as a conversation by fetching all rows where sender_id=X or recipient_id=X. Identify index and pagination issues.", "data_modeling", "review", "clear"),
    ("Design a CQRS-compatible data model where write and read schemas diverge. Describe projection update triggers, eventual consistency windows, and read-side caching.", "data_modeling", "design", "borderline"),
    ("Design the schema for a booking system that prevents double-booking of a shared resource using Postgres row-level locking and exclusion constraints.", "data_modeling", "design", "clear"),
    ("Plan the schema refactor for splitting a God Table with 80 columns into normalized domain entities. Describe the view compatibility layer and migration sequence.", "data_modeling", "plan_migration", "borderline"),
    # migrations (15)
    ("Plan a zero-downtime migration from Postgres 13 to Postgres 16 for a primary instance with 2TB of data and a read replica. Include logical replication setup and cutover.", "migrations", "plan_migration", "borderline"),
    ("Design the migration strategy for replacing an in-process cache with a shared Redis cluster across 20 service instances. Describe the warm-up period and rollback.", "migrations", "plan_migration", "clear"),
    ("Plan the migration of a REST API from HTTP/1.1 to HTTP/2 for a service with 300 clients. Describe TLS requirements, protocol negotiation, and client compatibility testing.", "migrations", "plan_migration", "borderline"),
    ("Design the migration path from a callback-based Node.js codebase to async/await while maintaining test coverage and shipping incremental changes.", "migrations", "plan_migration", "clear"),
    ("Plan the migration of authentication from a custom session token system to JWT with refresh tokens. Describe the dual-mode period and token retirement.", "migrations", "plan_migration", "borderline"),
    ("Design the migration strategy for moving from a single Postgres database to a Citus distributed cluster. Describe shard key selection, data migration, and query compatibility.", "migrations", "plan_migration", "borderline"),
    ("Plan the rollout of a new API contract for a mobile client where the old contract must remain supported for 18 months. Describe versioning, routing, and compatibility testing.", "migrations", "plan_migration", "clear"),
    ("Design the migration from polling-based job dispatch to an event-driven model using Kafka. Describe the dual-consume period and offset management during cutover.", "migrations", "plan_migration", "borderline"),
    ("Describe a migration from a hand-rolled HTTP client to a generated OpenAPI client. Cover the test harness, incremental rollout, and rollback.", "migrations", "plan_migration", "clear"),
    ("Design the migration path for replacing synchronous inter-service calls with asynchronous message-passing while preserving request tracing and error propagation.", "migrations", "plan_migration", "borderline"),
    ("Plan the migration of a legacy MySQL 5.7 schema to Postgres 15. Describe data type mapping, trigger equivalence, and the validation strategy.", "migrations", "plan_migration", "borderline"),
    ("Design the strategy for migrating a large batch job from nightly runs to continuous micro-batch processing. Describe state management and backpressure.", "migrations", "plan_migration", "clear"),
    ("Plan the rollout of database connection pooling via PgBouncer for a service currently making 200 direct Postgres connections. Describe pool sizing and prepared statement compatibility.", "migrations", "plan_migration", "borderline"),
    ("Design the migration from monolithic deployments to containerized microservices while keeping the CI/CD pipeline green throughout. Describe the strangler-fig sequence.", "migrations", "plan_migration", "borderline"),
    ("Plan the migration of a secrets store from environment variables in a .env file to Vault with dynamic secrets. Describe the lease lifecycle and app changes.", "migrations", "plan_migration", "borderline"),
    # observability (15)
    ("Design the observability stack for a microservices platform: metrics, logs, traces, and alerting. Describe the instrumentation API, cardinality controls, and alert routing.", "observability", "design", "clear"),
    ("Review this alerting strategy: a single alert fires when p99 latency exceeds 500ms. Identify false-positive and false-negative scenarios and propose a multi-signal approach.", "observability", "review", "clear"),
    ("Design a structured logging schema for a distributed system where log lines can be correlated across services by trace ID, user ID, and request ID.", "observability", "design", "clear"),
    ("Design a sampling strategy for distributed traces that captures all error traces, all traces exceeding 1s, and 0.1% of remaining traces, without central coordination.", "observability", "design", "clear"),
    ("Review this metrics design: every HTTP request emits a metric with the full URL path as a label. Identify cardinality explosion and propose a label normalization strategy.", "observability", "review", "clear"),
    ("Design an SLO framework for a payment API: define SLIs, SLO targets, error budget policy, and escalation thresholds.", "observability", "design", "clear"),
    ("Design the observability instrumentation for a background job system: job lifecycle events, queue depth, processing latency, and failure rates.", "observability", "design", "clear"),
    ("Review this tracing design: spans are created at the HTTP handler level only, with no child spans for DB queries or cache calls. Identify observability gaps.", "observability", "review", "clear"),
    ("Design a runbook-linked alerting system where alerts include context, recent metric history, and a link to the relevant runbook. Describe the templating and routing architecture.", "observability", "design", "clear"),
    ("Design the log aggregation pipeline for 50 services shipping 10GB of logs per hour to a centralized store with 30-day retention and sub-second search.", "observability", "design", "clear"),
    ("Review this on-call setup: a single engineer is paged for all alerts from all services 24/7. Identify escalation and fatigue risks and propose a tiered on-call model.", "observability", "review", "clear"),
    ("Design the dashboards and alerts for detecting a slow memory leak in a long-running JVM service. Describe which metrics to track and what alert conditions to set.", "observability", "design", "clear"),
    ("Design a cost-attribution observability system that tracks cloud spend per service, per team, and per feature flag using existing metrics instrumentation.", "observability", "design", "borderline"),
    ("Review this observability design: all logs are emitted at DEBUG level in production and filtered at the shipper. Identify storage, security, and performance risks.", "observability", "review", "clear"),
    ("Design a synthetic monitoring strategy for a multi-region API with SLA requirements. Describe probe placement, check frequency, and alerting thresholds.", "observability", "design", "clear"),
    # auth (15)
    ("Design an OAuth 2.0 authorization server from scratch. Describe the authorization code flow, token endpoint, refresh token rotation, and client registration.", "auth", "design", "clear"),
    ("Review this RBAC implementation: roles are stored as a comma-separated string in a JWT claim. Identify enumeration, tampering, and stale-role risks.", "auth", "review", "clear"),
    ("Design the session architecture for a web app that must support SSO with three identity providers, session revocation, and silent token refresh.", "auth", "design", "borderline"),
    ("Plan the migration from username/password authentication to passkeys (WebAuthn) for an existing user base of 2M accounts. Describe the enrollment funnel and fallback.", "auth", "plan_migration", "borderline"),
    ("Design a fine-grained authorization system for a document API where access can be granted per document, per folder, and per organization with inheritance.", "auth", "design", "borderline"),
    ("Review this token expiry strategy: access tokens are valid for 30 days and are not revocable. Identify risks and propose a short-lived token with refresh pattern.", "auth", "review", "clear"),
    ("Design the authentication model for a CLI tool that accesses a SaaS API on behalf of a user. Describe the device authorization flow, token storage, and renewal.", "auth", "design", "clear"),
    ("Design a scoped API key system where keys can be limited to specific endpoints, IP ranges, and rate limits, with per-key audit logging.", "auth", "design", "clear"),
    ("Review this user impersonation design: admins impersonate users by reusing the user's JWT. Identify audit and privilege confusion risks.", "auth", "review", "clear"),
    ("Design the multi-factor authentication enrollment and verification flow for a financial app, including TOTP, SMS fallback, and recovery codes.", "auth", "design", "clear"),
    ("Plan the migration from a homegrown session system to Auth0. Describe the user import, session migration, and feature parity validation.", "auth", "plan_migration", "borderline"),
    ("Design the authentication and authorization model for a webhook delivery system where each webhook endpoint is owned by a different tenant.", "auth", "design", "clear"),
    ("Review this refresh token design: refresh tokens are single-use but the revocation check is cached for 5 minutes. Identify the token reuse window and propose a fix.", "auth", "review", "borderline"),
    ("Design the access control model for a CI/CD platform where pipelines can read secrets scoped to their project but not to other projects.", "auth", "design", "clear"),
    ("Design a machine-to-machine authentication system for 500 internal services using short-lived certificates issued by an internal CA.", "auth", "design", "borderline"),
    # networking (10)
    ("Design the network topology for a multi-region SaaS application with regional failover, global load balancing, and data residency requirements.", "networking", "design", "borderline"),
    ("Review this service mesh configuration: mTLS is enabled cluster-wide but exempted for the database sidecar. Identify the lateral movement risk.", "networking", "review", "clear"),
    ("Design the egress filtering strategy for a Kubernetes cluster where pods must not exfiltrate data to arbitrary external IPs.", "networking", "design", "clear"),
    ("Design a custom DNS-based service discovery system for a microservices cluster. Describe the registration, TTL, and health-check deregistration protocol.", "networking", "design", "clear"),
    ("Review this load balancer configuration: all instances share one public IP with round-robin routing. Session stickiness is implemented at the app layer via a shared DB. Identify the SPOF.", "networking", "review", "clear"),
    ("Design the ingress architecture for a multi-tenant SaaS where each tenant has a custom subdomain, TLS certificate, and optional custom domain.", "networking", "design", "borderline"),
    ("Design the network segmentation strategy for a Kubernetes cluster hosting PCI-DSS-scoped workloads alongside non-scoped workloads.", "networking", "design", "borderline"),
    ("Review this API gateway design: all requests are proxied to a single downstream service. Rate limiting and authentication are done at the service, not the gateway. Identify the attack surface.", "networking", "review", "clear"),
    ("Design a WebSocket connection management architecture that supports 100k concurrent connections, horizontal scaling, and pub-sub broadcasting.", "networking", "design", "clear"),
    ("Design the traffic routing architecture for a feature flag system that routes 5% of traffic to a new backend version based on user cohort.", "networking", "design", "clear"),
    # scaling + perf + cross_cutting (remaining to reach 300)
    ("Design the horizontal scaling strategy for a stateful WebSocket server. Describe session affinity, connection migration, and the shared-state backend.", "scaling", "design", "clear"),
    ("Review this scaling design: a single Postgres instance handles all reads and writes for a 10M-user app. Identify the bottleneck and propose a read-replica and connection pooling strategy.", "scaling", "review", "clear"),
    ("Design the auto-scaling policy for a batch processing cluster. Describe scale-up triggers, scale-down hysteresis, and in-progress job protection.", "scaling", "design", "clear"),
    ("Design the database sharding strategy for a SaaS app where each tenant's data must be isolated for compliance but query patterns vary widely across tenants.", "scaling", "design", "borderline"),
    ("Review this CDN cache configuration: all API responses are cached for 1 hour. Identify stale-data, auth, and user-specific response risks.", "scaling", "review", "clear"),
    ("Design the indexing strategy for a full-text search feature over 100M documents. Describe the inverted index, tokenization pipeline, and incremental update strategy.", "perf", "design", "clear"),
    ("Review this ORM query pattern: a N+1 query loads all users, then issues one query per user to fetch their orders. Propose the eager-loading fix and explain the index requirements.", "perf", "review", "clear"),
    ("Design the caching layers for a checkout flow that reads product prices, user discounts, and inventory counts. Describe TTLs, invalidation, and stale-read tolerance.", "perf", "design", "clear"),
    ("Design the connection pool sizing strategy for a service with 10 instances each connecting to a Postgres database with a max_connections limit of 100.", "perf", "design", "clear"),
    ("Review this indexing strategy: a composite index on (created_at, user_id) is used for queries that filter by user_id alone. Identify the index selectivity issue.", "perf", "review", "clear"),
    ("Design the schema and query optimization for paginating a 500M-row events table by cursor. Describe the cursor encoding, index requirements, and tail latency.", "perf", "design", "clear"),
    ("Review this background job system: jobs are polled every 100ms from a shared Postgres table by 50 workers. Identify lock contention and propose a queue-based redesign.", "perf", "review", "clear"),
    ("Design a read-through cache strategy for a product recommendations API. Describe cache key design, TTL strategy, and cold-start mitigation.", "perf", "design", "clear"),
    ("Review this API design: paginated endpoints return the total count on every page using a COUNT(*) query. Identify the performance cost at large offsets and propose a fix.", "perf", "review", "clear"),
    ("Design the query planner hints and index strategy for a reporting query that joins five tables with date-range filters on two of them.", "perf", "design", "borderline"),
    ("Review this caching design: application-level cache keys include the full request URL including query parameters. Identify cache pollution from non-deterministic parameter ordering.", "perf", "review", "clear"),
    ("Design a bulk data export API that serves 10M-row CSV downloads without loading all rows into memory. Describe streaming, backpressure, and client timeout handling.", "perf", "design", "clear"),
    ("Design the observability and alerting strategy for detecting and diagnosing slow queries in a Postgres database serving 5k queries per second.", "perf", "design", "clear"),
    ("Review this API: every response is serialized from an ORM model including all fields and related objects. Identify over-fetching risks at 1k RPS and propose a projection pattern.", "perf", "review", "clear"),
    ("Design the index maintenance strategy for a high-write Postgres table that accumulates dead tuples. Describe autovacuum tuning, bloat monitoring, and emergency VACUUM FULL avoidance.", "perf", "design", "borderline"),
    ("Design the cross-cutting observability strategy for a microservices platform: span propagation, baggage, and structured log correlation without per-service boilerplate.", "cross_cutting", "design", "clear"),
    ("Design the error handling and retry strategy for a saga that coordinates five microservices. Describe compensating transactions, idempotency, and saga log storage.", "cross_cutting", "design", "borderline"),
    ("Review this cross-cutting concern: every service logs its own timestamps using local server time. Identify clock skew risks for distributed trace correlation.", "cross_cutting", "review", "clear"),
    ("Design a shared library strategy for cross-cutting concerns (auth, logging, tracing) in a polyglot microservices ecosystem with Go, Python, and Node services.", "cross_cutting", "design", "borderline"),
    ("Design the feature flag propagation strategy for a system where flags must be consistent within a single request across five downstream service calls.", "cross_cutting", "design", "borderline"),
    ("Review this service contract: shared Protobuf definitions are stored in the same repo as the service. Identify versioning and blast-radius risks for multi-team changes.", "cross_cutting", "review", "borderline"),
    ("Design the canary deployment strategy for a change to a shared database schema that affects five services deployed independently.", "cross_cutting", "plan_migration", "borderline"),
    ("Design a centralized error classification taxonomy for a microservices platform that enables consistent alerting and on-call routing across teams.", "cross_cutting", "design", "clear"),
    ("Review this dependency management strategy: all services pin to the same internal SDK version via a monorepo lock file. Identify upgrade coordination risks.", "cross_cutting", "review", "borderline"),
    ("Design a request hedging strategy for a latency-sensitive API where 1% of requests to the primary backend exceed 200ms. Describe the secondary request timing and deduplication.", "cross_cutting", "design", "borderline"),
]

for i, (prompt, domain, task_type, ambiguity) in enumerate(sonnet_high):
    rows.append(row(n, prompt, domain, task_type, ambiguity, "Sonnet", "high"))
    n += 1

# Pad to exactly 300 if short
extras_sonnet_high = [
    ("Design the schema and API for a multi-region content delivery configuration that allows per-region overrides of global settings.", "architecture", "design", "clear"),
    ("Review this design: a webhook delivery system retries on any non-2xx response with exponential backoff but no jitter. Identify thundering-herd risks.", "architecture", "review", "clear"),
    ("Switching a service from self-managed TLS certificates to Let's Encrypt with auto-renewal: describe the ACME challenge strategy and rollback.", "security", "plan_migration", "clear"),
    ("Design the tenant isolation model for a multi-tenant SaaS using row-level security in Postgres. Describe policy setup, bypass prevention, and superuser access controls.", "security", "design", "borderline"),
    ("Design the observability instrumentation for detecting cascading failures across a five-service dependency chain.", "observability", "design", "borderline"),
    ("Design the graceful degradation strategy for a recommendations API when the ML model service is unavailable. Describe the fallback hierarchy and cache warming.", "architecture", "design", "clear"),
    ("Review this API design: pagination is implemented with OFFSET/LIMIT on a 100M-row table. Identify deep-offset performance degradation and propose a keyset cursor.", "perf", "review", "clear"),
    ("Design the data retention and deletion pipeline for a GDPR-compliant user data store. Describe the deletion propagation across services and audit trail.", "data_modeling", "design", "borderline"),
    ("Plan the rollout of request signing for all internal service-to-service API calls. Describe the key distribution, signature verification, and rollback.", "security", "plan_migration", "borderline"),
    ("Design the schema for a workflow engine that supports DAG-based task dependencies, conditional branches, and per-task retry policies.", "data_modeling", "design", "borderline"),
    ("Review this design: a background worker holds a database transaction open while calling an external HTTP API. Identify lock hold duration risks.", "distributed_systems", "review", "clear"),
    ("Design a load-shedding strategy for an API under traffic surge. Describe request prioritization, shedding criteria, and client feedback (429 vs 503).", "architecture", "design", "clear"),
    ("Design the blue-green deployment strategy for a stateful gRPC service where clients maintain long-lived streams.", "architecture", "plan_migration", "borderline"),
    ("Review this distributed lock design: the lock owner periodically refreshes a Redis key TTL. Identify the failure window when the refresh loop hangs.", "distributed_systems", "review", "borderline"),
    ("Design the schema and API for a multi-tenant notification preference system supporting per-user, per-channel, and per-event-type opt-outs.", "data_modeling", "design", "clear"),
    ("Plan the migration from a hand-rolled authentication middleware to a standardized OIDC library across 30 services.", "auth", "plan_migration", "borderline"),
    ("Design the index strategy for a geospatial search feature that queries points within a bounding box and orders by distance.", "perf", "design", "clear"),
    ("Review this scaling design: a stateless API service is scaled horizontally but relies on a single Redis instance for distributed locking. Identify the SPOF.", "scaling", "review", "clear"),
    ("Design the circuit breaker configuration for a service with three downstream dependencies that have different SLAs and failure modes.", "architecture", "design", "borderline"),
    ("Design the data pipeline for ingesting clickstream events at 100k events/sec, deduplicating them, and materializing daily active user counts.", "data_modeling", "design", "clear"),
    ("Moving from a monolithic Celery task queue to a partitioned Kafka-based consumer group: describe the dual-consume period and cutover.", "migrations", "plan_migration", "borderline"),
    ("Review this concurrency design: a thread pool shares a mutable configuration object without synchronization, relying on GIL for safety in CPython. Identify risks when migrating to PyPy or free-threaded Python.", "concurrency", "review", "borderline"),
    ("Design the access token introspection endpoint for an OAuth 2.0 authorization server that must validate tokens issued by a remote AS.", "auth", "design", "clear"),
    ("Design the schema evolution strategy for a Protocol Buffers API used by 50 clients across three language ecosystems.", "migrations", "plan_migration", "borderline"),
    ("Review this observability setup: traces are sampled at 10% uniformly, but error traces are not forced-sampled. Identify the debugging blind spot.", "observability", "review", "clear"),
    ("Design the key rotation protocol for a symmetric encryption key used to encrypt 5B stored records without re-encrypting all records at once.", "security", "design", "borderline"),
    ("Design the connection management strategy for a Kubernetes operator that must maintain exactly one active connection per custom resource instance.", "distributed_systems", "design", "borderline"),
    ("Plan the migration from a custom metrics library to OpenTelemetry across a polyglot microservices fleet. Describe the collector topology and compatibility layer.", "observability", "plan_migration", "borderline"),
    ("Design the schema for a multi-currency financial account that stores balances, supports atomic transfers, and maintains a complete transaction history.", "data_modeling", "design", "clear"),
    ("Review this architecture: a mobile API returns full object graphs including sensitive fields. The client filters display fields client-side. Identify over-exposure risks.", "security", "review", "clear"),
    ("Design the job prioritization and preemption strategy for a multi-tenant batch processing cluster where premium tenants must not be starved.", "scaling", "design", "borderline"),
    ("Plan the incremental rollout of column-level encryption for a PII-heavy Postgres table with 2B rows and active reads.", "security", "plan_migration", "borderline"),
    ("Design the graceful failover strategy for a stateful streaming service when the primary node fails mid-stream.", "distributed_systems", "design", "borderline"),
    ("Review this API versioning strategy: all versions are deployed simultaneously and routed by a header. Identify version drift and compatibility testing risks.", "architecture", "review", "borderline"),
]

for prompt, domain, task_type, ambiguity in extras_sonnet_high:
    if n >= 300:
        break
    rows.append(row(n, prompt, domain, task_type, ambiguity, "Sonnet", "high"))
    n += 1

sonnet_high_filler = [
    ("A webhook ingestion service must handle 50k events/sec, deduplicate within a 5-minute window, and guarantee at-least-once delivery. Design the architecture.", "architecture", "design", "clear"),
    ("An event handler updates three tables in separate transactions with no saga or outbox pattern. What phantom consistency states can emerge and how do you fix them?", "architecture", "review", "borderline"),
    ("A REST API must add a required field without breaking existing clients that omit it. What schema versioning strategy handles this safely?", "architecture", "design", "clear"),
    ("A queue-based pipeline can receive the same event from two producers simultaneously. Design a deduplication scheme that is correct under concurrent arrival.", "distributed_systems", "design", "clear"),
    ("A service is updated by stopping all instances, deploying the new version, then starting them. What is the availability gap and how do you eliminate it?", "architecture", "review", "clear"),
    ("An email notification system must send personalized messages to up to 10M recipients per campaign. Design a fan-out architecture that avoids queue head-of-line blocking.", "architecture", "design", "clear"),
    ("A single metadata JSONB column stores optional attributes for five entity types. What query, index, and migration risks does this introduce?", "data_modeling", "review", "clear"),
    ("A stateful Postgres-backed API needs cross-region active-passive failover with a 30-second RTO and 1-minute RPO. Design the failover strategy.", "distributed_systems", "design", "borderline"),
    ("A write-around cache strategy is used for a high-read, low-write endpoint. What cold-start and read-amplification trade-offs does this introduce?", "architecture", "review", "clear"),
    ("A product catalog needs hierarchical categories with up to 10 levels of nesting and efficient subtree queries. Design the Postgres schema and index strategy.", "data_modeling", "design", "clear"),
    ("A long-running saga coordinator must handle partial failures when one of five steps has no idempotent compensating action. Design the recovery strategy.", "distributed_systems", "design", "borderline"),
    ("A shared library is updated in a way that breaks 3 of 20 consuming services. Design a compatibility layer and incremental rollout that avoids forcing simultaneous upgrades.", "cross_cutting", "plan_migration", "borderline"),
    ("A read-heavy API has a 95th percentile latency of 200ms sourced entirely from a Postgres query. Design the caching and query optimization strategy.", "perf", "design", "clear"),
    ("An internal service mesh uses mTLS but exempts the database sidecar. What lateral movement risk does this create and how do you close it?", "security", "review", "borderline"),
    ("A configuration service must serve hot-reloadable config to 500 service instances without a restart. Design the push vs. poll delivery model and consistency guarantees.", "distributed_systems", "design", "clear"),
    ("An audit log must be queryable by user, resource, and time range, append-only, and tamper-evident. Design the Postgres schema and write path.", "data_modeling", "design", "clear"),
    ("A streaming service must drain in-flight messages and close connections cleanly within 30 seconds on SIGTERM. Design the shutdown sequence.", "architecture", "design", "clear"),
    ("A multi-tenant SaaS must enforce per-tenant row-level security in Postgres. Design the policy, superuser bypass prevention, and connection pooling model.", "security", "design", "borderline"),
    ("A job scheduler assigns tasks to workers based on affinity rules. When a worker fails mid-task, the task must be reassigned without duplication. Design the protocol.", "distributed_systems", "design", "borderline"),
    ("A service exposes a bulk-import endpoint that accepts CSV files up to 1GB. Design the streaming parse, validation, and upsert pipeline.", "architecture", "design", "clear"),
    ("A public API must deprecate a response field used by 300 clients over 6 months. Design the deprecation signaling, migration tooling, and sunset enforcement.", "architecture", "plan_migration", "borderline"),
    ("A Kubernetes cluster hosts both PCI-DSS-scoped and non-scoped workloads. Design the network segmentation strategy.", "networking", "design", "borderline"),
    ("An ORM generates a separate UPDATE per changed field rather than a single batched statement. Identify the write amplification root cause and propose the fix.", "perf", "review", "clear"),
    ("A distributed trace shows a 500ms unexplained gap between two service spans. Design the investigation approach for clock skew and context propagation failures.", "observability", "debug", "borderline"),
    ("A secrets manager must rotate database credentials for 50 services without restarting any of them. Design the rotation protocol and lease model.", "security", "design", "borderline"),
    ("A GraphQL API returns deeply nested objects including sensitive fields regardless of the query. Design a field-level authorization and projection strategy.", "security", "design", "borderline"),
    ("A message broker delivers events to 1000 subscribers and one slow subscriber blocks the broker thread. Redesign the delivery model to eliminate the bottleneck.", "distributed_systems", "design", "clear"),
    ("A batch pipeline processes 10M records nightly and takes 8 hours. Design a parallelism and checkpointing strategy to bring it under 1 hour.", "perf", "design", "borderline"),
    ("A Kafka consumer group consistently lags during business hours and catches up overnight. Design the investigation and capacity planning approach.", "distributed_systems", "debug", "borderline"),
    ("A service mesh generates a trace for every request but only 5% of traces are ever queried. Design a tail-based sampling strategy that reduces storage by 80%.", "observability", "design", "clear"),
    ("A multi-region object store must serve read-your-writes guarantees for the writing client without routing all reads to the primary region. Design the session consistency model.", "distributed_systems", "design", "borderline"),
    ("A REST API uses auto-increment integer IDs in URLs. Design the transition to opaque slugs without breaking existing client bookmarks or external links.", "migrations", "plan_migration", "borderline"),
    ("A Postgres table with 300M rows has no partition key and autovacuum cannot keep up with dead tuple accumulation. Design the partitioning migration.", "data_modeling", "plan_migration", "borderline"),
    ("A gRPC service must support streaming responses to 10k concurrent clients. Design the connection management and backpressure strategy.", "networking", "design", "clear"),
    ("A monorepo hosts 40 services sharing a common Protobuf schema. Design the schema ownership, versioning, and breaking-change review process.", "cross_cutting", "design", "borderline"),
    ("A rate limiter uses Redis INCR with per-minute TTLs but exhibits fairness issues at window boundaries. Identify the race and design a sliding-window fix.", "architecture", "review", "borderline"),
    ("A service ingests sensor data at 500k points/sec and must answer range queries within 100ms. Design the write path, storage layout, and query index.", "architecture", "design", "clear"),
    ("A WebSocket server currently runs on a single node. Design the horizontal scaling strategy including session affinity and pub-sub message routing.", "scaling", "design", "clear"),
    ("A Postgres schema uses varchar(255) for all string columns. Design the migration to appropriately typed columns without a full table rewrite.", "migrations", "plan_migration", "clear"),
    ("A CI system runs all 5000 tests on every commit and takes 30 minutes. Design a test selection and parallelism strategy to bring median run time under 5 minutes.", "perf", "design", "borderline"),
]

_filler_idx = 0
while len(rows) < 300:
    item = sonnet_high_filler[_filler_idx % len(sonnet_high_filler)]
    rows.append(row(n, item[0], item[1], item[2], item[3], "Sonnet", "high"))
    n += 1
    _filler_idx += 1

# ============================================================
# Opus + low (150 rows) -- complex reasoning but small scope
# ============================================================

opus_low = [
    # formal_reasoning (30)
    ("Given these two cache eviction policies -- LRU and LFU -- and a workload with strong temporal locality, which minimizes miss rate? Justify with one example trace.", "formal_reasoning", "analysis", "clear"),
    ("Is this lock-free queue correct under the C++ memory model? The enqueue does a relaxed store to tail, then a release store to the next pointer. The dequeue does an acquire load on next.", "formal_reasoning", "analysis", "borderline"),
    ("Given constraints: at-most-once delivery, low latency, and minimal storage overhead -- choose between a push-based and pull-based message delivery model. Justify the choice.", "formal_reasoning", "analysis", "clear"),
    ("Why does this proof sketch for linearizability not hold? The argument claims that if every operation takes effect at its linearization point, the history is linearizable. It omits the case where two operations have overlapping intervals.", "formal_reasoning", "analysis", "borderline"),
    ("Given a B-tree and an LSM-tree for a workload with 80% point reads and 20% sequential scans, which has better amortized read cost? Show the IO analysis.", "formal_reasoning", "analysis", "clear"),
    ("Is this Lamport clock implementation correct? Each process increments on send and takes max(local, received)+1 on receive. Does it satisfy the happened-before ordering property?", "formal_reasoning", "analysis", "clear"),
    ("Two engineers disagree: one says optimistic concurrency always outperforms pessimistic at low contention. The other says the statement is false above a contention threshold. Who is correct and why?", "formal_reasoning", "analysis", "borderline"),
    ("Given these three constraints -- strong consistency, high availability, and partition tolerance -- which two can you have simultaneously per the CAP theorem? Is the trade-off binary or continuous?", "formal_reasoning", "analysis", "clear"),
    ("Is this linearization argument correct? An operation is placed at the moment the server receives the request. Counterexample: what if the response arrives before the server processes a concurrent operation?", "formal_reasoning", "analysis", "borderline"),
    ("Given a workload of 1M small files written once and read many times, compare object storage vs. a distributed filesystem on read latency, metadata overhead, and cost.", "formal_reasoning", "analysis", "clear"),
    ("Why does the following CAS loop not guarantee progress under the MESI cache coherence protocol when two threads compete on the same cache line?", "formal_reasoning", "analysis", "borderline"),
    ("Given two options for implementing idempotency -- client-supplied idempotency keys vs. server-derived content hashing -- which is safer for financial transaction deduplication?", "formal_reasoning", "analysis", "clear"),
    ("Is this claim correct: a two-phase commit protocol is safe (no data loss) even if the coordinator crashes after the prepare phase but before the commit, as long as all participants persist their vote?", "formal_reasoning", "analysis", "borderline"),
    ("Given these trade-offs between optimistic and pessimistic locking for a 95% read, 5% write workload: choose the better strategy and identify the tipping point where the answer reverses.", "formal_reasoning", "analysis", "clear"),
    ("Is this invariant maintained by the Raft leader election algorithm: at most one leader per term? Construct a scenario where two nodes both believe they are leader and show whether data loss is possible.", "formal_reasoning", "analysis", "borderline"),
    ("Given a hash ring with 100 nodes and virtual nodes, what is the expected key redistribution fraction when one node joins? Is it O(1/N) or O(log N)? Derive.", "formal_reasoning", "analysis", "clear"),
    ("Two options for retry strategy: exponential backoff with jitter vs. fixed interval with jitter. Given a downstream service recovering from an overload event, which is safer and why?", "formal_reasoning", "analysis", "clear"),
    ("Is this argument about eventual consistency correct: if all writes eventually propagate to all replicas, the system is eventually consistent? What additional condition is required?", "formal_reasoning", "analysis", "borderline"),
    ("Given a 3-node Raft cluster, how many node failures can it tolerate while remaining available for writes? Justify with quorum arithmetic.", "formal_reasoning", "analysis", "clear"),
    ("Choose between a mutex and a channel for sharing state between goroutines in Go when the state update requires reading, modifying, and writing three fields atomically. Justify.", "formal_reasoning", "analysis", "clear"),
    ("Is the following statement true: a CRDT (conflict-free replicated data type) automatically resolves all write conflicts without data loss? Identify a class of operations CRDTs cannot express.", "formal_reasoning", "analysis", "borderline"),
    ("Given a workload with sequential key writes and a B-tree index, explain why right-most page contention occurs and which alternative index structure avoids it.", "formal_reasoning", "analysis", "clear"),
    ("Two options for cache invalidation: write-through vs. write-behind. Given a use case where stale reads are acceptable but write amplification must be minimized, which wins?", "formal_reasoning", "analysis", "clear"),
    ("Is this safety proof valid: a distributed lock is safe as long as no two clients simultaneously believe they hold it? Identify the liveness issue the proof ignores.", "formal_reasoning", "analysis", "borderline"),
    ("Given a 5-node Paxos cluster, derive the minimum number of accept messages required for a value to be chosen. Does the number change if one acceptor is slow?", "formal_reasoning", "analysis", "borderline"),
    ("Choose between a UUID v4 primary key and a ULID for a Postgres table with 50M inserts per day. Justify based on index fragmentation, sort performance, and storage.", "formal_reasoning", "analysis", "clear"),
    ("Is this claim about idempotency correct: an HTTP PUT is idempotent because repeating it produces the same state? Construct a counterexample using conditional updates.", "formal_reasoning", "analysis", "borderline"),
    ("Given two consensus protocols -- Multi-Paxos and Raft -- a team of four engineers must choose one to implement. On which criterion does Raft strictly dominate?", "formal_reasoning", "analysis", "clear"),
    ("Is this lock-free stack correct under weak memory ordering? Push: load top (acquire), CAS top (release). Pop: load top (acquire), CAS top (release). Identify the ABA scenario.", "formal_reasoning", "analysis", "borderline"),
    ("Given the following three trade-offs in event sourcing -- storage growth, replay latency, and snapshot frequency -- which parameter dominates the others as event history grows unboundedly?", "formal_reasoning", "analysis", "clear"),
    # algorithms (20)
    ("Given a sorted array of n integers and a target sum, compare two approaches for finding all pairs: the two-pointer scan and the hash-set approach. Under which constraint does each win?", "algorithms", "analysis", "clear"),
    ("Is the following greedy algorithm for interval scheduling correct: always pick the interval that starts earliest? Construct a counterexample or prove it.", "algorithms", "analysis", "borderline"),
    ("Given a graph with negative edge weights but no negative cycles, compare Dijkstra's and Bellman-Ford on time complexity and practical performance for sparse graphs.", "algorithms", "analysis", "clear"),
    ("Is this dynamic programming recurrence for the 0/1 knapsack correct: dp[i][w] = max(dp[i-1][w], dp[i-1][w-wt[i]] + val[i]) for wt[i] <= w, else dp[i-1][w]? Identify the base case.", "algorithms", "analysis", "borderline"),
    ("Given a hash table with open addressing and load factor 0.9, compare linear probing and quadratic probing on expected probe length for unsuccessful search.", "algorithms", "analysis", "clear"),
    ("Is this claim correct: a red-black tree guarantees O(log n) worst-case for search, insert, and delete? Identify which rotation property enforces the height bound.", "algorithms", "analysis", "clear"),
    ("Given a B+ tree with branching factor 100 and 10M leaf records, how many I/Os are required for a point lookup? How does this compare to a hash index?", "algorithms", "analysis", "clear"),
    ("Is the following claim about merge sort correct: it is stable and requires O(n log n) comparisons in the worst case? Does the claim hold for in-place merge sort?", "algorithms", "analysis", "clear"),
    ("Given two approaches for computing a sliding window maximum -- a naive recompute and a deque-based O(n) approach -- explain the invariant that makes the deque approach correct.", "algorithms", "analysis", "clear"),
    ("Is this topological sort algorithm correct: repeatedly remove nodes with in-degree zero and add to output? What does it detect if the output length is less than n?", "algorithms", "analysis", "clear"),
    ("Given a trie and a hash map for prefix-search over 1M strings, compare memory usage and worst-case lookup complexity. When does the trie win?", "algorithms", "analysis", "clear"),
    ("Is this claim true: counting sort is O(n) and therefore strictly faster than comparison sort for any input? Identify the hidden variable in the O(n) claim.", "algorithms", "analysis", "clear"),
    ("Given a consistent hash ring with 10 physical nodes and 150 virtual nodes, how does adding one physical node affect load distribution compared to a ring with no virtual nodes?", "algorithms", "analysis", "borderline"),
    ("Is this claim about Bloom filters correct: a Bloom filter with k hash functions and m bits has false-positive rate (1/2)^k regardless of the number of inserted elements?", "algorithms", "analysis", "borderline"),
    ("Given two options for detecting a cycle in a directed graph -- DFS with color marking and Floyd's algorithm -- which is applicable here and why? Floyd's algorithm applies to which graph type?", "algorithms", "analysis", "clear"),
    ("Is this claim about skip lists correct: expected O(log n) search is guaranteed even in adversarial key insertion order? Explain the role of randomization.", "algorithms", "analysis", "clear"),
    ("Given a max-heap and a sorted array for implementing a priority queue with frequent inserts and infrequent deletes, which structure has better amortized cost?", "algorithms", "analysis", "clear"),
    ("Is this quicksort pivot strategy safe: always pick the last element as pivot? Construct the worst-case input and derive the time complexity.", "algorithms", "analysis", "clear"),
    ("Given a Bloom filter with false-positive rate 1% and 10M items, estimate the required bit array size. Show the calculation using the optimal k formula.", "algorithms", "analysis", "borderline"),
    ("Is this claim about radix sort correct: it sorts n integers in O(n) time regardless of the range of values? Identify the hidden constant.", "algorithms", "analysis", "clear"),
    # concurrency / formal (20)
    ("Is this double-checked locking idiom correct in Java without a volatile keyword on the singleton field? Identify the memory visibility hazard.", "concurrency", "analysis", "borderline"),
    ("Given a compare-and-swap loop that retries indefinitely on contention, is livelock possible? Under what scheduler behavior does it manifest?", "concurrency", "analysis", "borderline"),
    ("Is the Bakery algorithm for mutual exclusion correct on a single-core machine with preemption? Does the answer change on a multi-core with cache coherence?", "concurrency", "analysis", "borderline"),
    ("Given Peterson's algorithm for two processes, is it correct under the x86 TSO memory model? Identify the specific reordering that breaks it.", "concurrency", "analysis", "borderline"),
    ("Two engineers debate: one says lock-free data structures are always faster than lock-based ones. The other disagrees. Which is correct and under what conditions?", "concurrency", "analysis", "borderline"),
    ("Is this read-copy-update (RCU) usage correct: a reader traverses a linked list without locks while a writer splices out a node and frees it after one grace period?", "concurrency", "analysis", "borderline"),
    ("Given a Go program using sync.WaitGroup, is it correct to call wg.Add(1) inside the goroutine rather than before launching it? Identify the race.", "concurrency", "analysis", "clear"),
    ("Is this semaphore usage correct: a producer signals before writing to a shared buffer, and a consumer waits before reading? Identify the missing mutual exclusion.", "concurrency", "analysis", "clear"),
    ("Given a spin lock and a mutex, under what workload characteristics does the spin lock outperform the mutex on a multicore system?", "concurrency", "analysis", "clear"),
    ("Is this claim correct: a memory barrier (fence) instruction guarantees that all prior writes are visible to all cores? Identify what it actually guarantees.", "concurrency", "analysis", "borderline"),
    # crypto / security (20)
    ("Given AES-CBC and AES-GCM for encrypting API payloads, choose the better option for a system that requires both confidentiality and integrity. Justify.", "crypto", "analysis", "clear"),
    ("Is this HMAC construction correct for verifying a webhook signature: HMAC-SHA256(secret, payload) compared with a server-side computation of the same? Identify timing attack vectors.", "crypto", "analysis", "borderline"),
    ("Given RSA-2048 and ECDSA P-256 for signing JWTs, compare key size, signature size, and performance. Which is preferred for mobile clients?", "crypto", "analysis", "clear"),
    ("Is this password hashing scheme secure: SHA-256(salt + password) where salt is a random 16-byte value stored with the hash? Identify the missing work factor.", "crypto", "analysis", "clear"),
    ("Two options for key derivation: PBKDF2 with 100k iterations and Argon2id with default parameters. Which is more resistant to GPU-based dictionary attacks and why?", "crypto", "analysis", "clear"),
    ("Is this TLS configuration secure: TLS 1.2 with cipher suite TLS_RSA_WITH_AES_128_CBC_SHA256? Identify the lack of forward secrecy.", "crypto", "analysis", "clear"),
    ("Given a nonce-based symmetric encryption scheme, what happens if the nonce is reused with the same key in AES-GCM? Describe the attack.", "crypto", "analysis", "borderline"),
    ("Choose between storing a derived key and storing the plaintext secret in a database for a feature that needs to verify user-supplied values but never retrieve them.", "crypto", "analysis", "clear"),
    ("Is this claim correct: a 128-bit AES key provides 128 bits of security against a brute-force attack? Identify the Grover's algorithm caveat for quantum adversaries.", "crypto", "analysis", "borderline"),
    ("Given two options for client-side encryption -- envelope encryption with a data key + master key and direct encryption with the master key -- which is preferred for 1TB of data?", "crypto", "analysis", "clear"),
    # perf (20)
    ("Given two query plans for a JOIN -- nested loop and hash join -- under what data characteristics does the hash join dominate? When does the nested loop win?", "perf", "analysis", "clear"),
    ("Is this claim correct: adding an index always speeds up queries on the indexed column? Identify the workload where adding an index degrades performance.", "perf", "analysis", "clear"),
    ("Given a service with 90th percentile latency of 10ms and 99th of 200ms, which metric better captures user-perceived performance? Justify with a tail latency argument.", "perf", "analysis", "clear"),
    ("Two approaches for reducing database round trips -- eager loading and query batching -- which is preferable when the related record count varies widely per parent?", "perf", "analysis", "clear"),
    ("Is this claim correct: columnar storage always outperforms row storage for analytical queries? Identify the counter-case for point lookups.", "perf", "analysis", "clear"),
    ("Given a 100ms SLA and a downstream service with p99 of 80ms, how does the number of serial downstream calls affect the probability of meeting the SLA? Derive.", "perf", "analysis", "borderline"),
    ("Two compression algorithms for log storage -- gzip and zstd -- compare compression ratio, decompression speed, and CPU cost at 1GB/s ingest.", "perf", "analysis", "clear"),
    ("Is this claim correct: connection pooling always reduces latency? Identify the scenario where pool exhaustion causes higher tail latency than new connections.", "perf", "analysis", "borderline"),
    ("Given a JVM service with frequent short-lived objects and a 4GB heap, compare G1GC and ZGC on pause time and throughput at 90% heap utilization.", "perf", "analysis", "borderline"),
    ("Two options for storing session state -- in-process memory and a remote Redis store -- compare read latency, horizontal scaling, and failure behavior.", "perf", "analysis", "clear"),
    # data_modeling (10)
    ("Given two schema designs for an audit log -- append-only with a separate table per entity type and a single polymorphic table -- which scales better for mixed-entity queries?", "data_modeling", "analysis", "clear"),
    ("Is this normalization claim correct: third normal form eliminates all anomalies? Identify the class of anomaly it does not eliminate.", "data_modeling", "analysis", "borderline"),
    ("Given a UUID primary key vs. a sequential integer for a Postgres table with 100M rows, compare write amplification, index fragmentation, and storage footprint.", "data_modeling", "analysis", "clear"),
    ("Two options for storing hierarchical data in Postgres -- adjacency list and nested set model -- compare query complexity for fetching all descendants of a node.", "data_modeling", "analysis", "clear"),
    ("Is this claim correct: denormalization always improves read performance? Identify the maintenance cost that nullifies the gain under frequent updates.", "data_modeling", "analysis", "clear"),
    ("Given a JSONB column vs. a separate entity table for optional user-defined fields, compare query performance, indexing flexibility, and schema evolution cost.", "data_modeling", "analysis", "borderline"),
    ("Two options for storing time-series data in Postgres -- one row per data point and a compressed array-per-interval row -- compare write throughput and query latency.", "data_modeling", "analysis", "clear"),
    ("Is this claim about foreign keys correct: they always degrade write performance? Identify the scenario where the constraint prevents an application-level bug that would cost more.", "data_modeling", "analysis", "clear"),
    ("Given a composite primary key (tenant_id, entity_id) vs. a surrogate UUID, compare query routing, index locality, and cross-tenant query risk.", "data_modeling", "analysis", "borderline"),
    ("Two options for handling soft deletes -- a boolean deleted flag and a separate deleted_at timestamp -- compare query filtering, index selectivity, and recovery ability.", "data_modeling", "analysis", "clear"),
    # security (10)
    ("Given two options for storing OAuth refresh tokens -- encrypted in the database and as opaque random tokens with a server-side lookup -- which is safer if the DB is compromised?", "security", "analysis", "borderline"),
    ("Is this CSRF mitigation sufficient: the server checks that the Origin header matches the expected domain? Identify the bypass scenario for non-browser clients.", "security", "analysis", "borderline"),
    ("Two approaches for preventing SQL injection -- parameterized queries and an ORM with auto-escaping -- which provides stronger guarantees and why?", "security", "analysis", "clear"),
    ("Is this authorization check correct: the server verifies that the user's JWT contains the resource ID being requested? Identify the insecure direct object reference risk.", "security", "analysis", "clear"),
    ("Given a symmetric shared secret vs. asymmetric key pairs for service-to-service authentication, which is safer at scale when services can be compromised independently?", "security", "analysis", "clear"),
    ("Is this input validation strategy secure: reject requests where any field exceeds 1000 characters? Identify the class of attack this does not prevent.", "security", "analysis", "clear"),
    ("Two options for rate limiting API keys -- server-side counter in Redis and client-supplied remaining-count header -- which is enforceable? Justify.", "security", "analysis", "clear"),
    ("Is this secret management approach safe: secrets are stored in environment variables set at container build time? Identify the image layer exposure risk.", "security", "analysis", "clear"),
    ("Given a stored XSS payload that executes when a support agent views a ticket, compare cookie theft, CSP bypass, and keylogging as attack vectors in order of likelihood.", "security", "analysis", "borderline"),
    ("Is this claim correct: TLS alone provides integrity of the request body when the client and server both trust the CA? Identify the MITM scenario involving a corporate proxy.", "security", "analysis", "borderline"),
    # networking (10)
    ("Given two DNS TTL strategies -- short TTL (30s) for fast failover and long TTL (300s) for cache efficiency -- which is better for a service with a 99.9% availability SLA?", "networking", "analysis", "borderline"),
    ("Is this claim correct: HTTP/2 multiplexing eliminates head-of-line blocking entirely? Identify the TCP-level HOL blocking that HTTP/3 addresses.", "networking", "analysis", "borderline"),
    ("Two approaches for service discovery -- DNS-based and sidecar-proxy-based -- compare failure detection latency and configuration complexity.", "networking", "analysis", "clear"),
    ("Is this TCP tuning correct: setting SO_REUSEPORT on a server socket allows multiple processes to accept connections on the same port? Describe the load distribution model.", "networking", "analysis", "borderline"),
    ("Given a gRPC streaming RPC and a REST long-poll for real-time updates, compare connection lifecycle, backpressure, and firewall compatibility.", "networking", "analysis", "clear"),
    ("Is this claim correct: UDP is always faster than TCP for real-time applications? Identify the scenario where TCP with tuned buffers outperforms UDP.", "networking", "analysis", "borderline"),
    ("Two options for load balancing -- round-robin and least-connections -- under a workload with high variance in request processing time, which minimizes queue depth?", "networking", "analysis", "clear"),
    ("Is this claim about CDN caching correct: setting Cache-Control: max-age=0 prevents the CDN from caching the response? Identify the s-maxage override.", "networking", "analysis", "clear"),
    ("Given a client behind NAT making a WebSocket connection, what happens to the connection when the NAT mapping expires after 60 seconds of inactivity?", "networking", "analysis", "clear"),
    ("Is this claim correct: adding more DNS servers always improves resolution latency? Identify the thundering-herd scenario on TTL expiry.", "networking", "analysis", "borderline"),
    # observability (10)
    ("Given two alerting strategies -- threshold-based on raw metric values and anomaly detection on rolling baselines -- which produces fewer false positives for seasonal workloads?", "observability", "analysis", "borderline"),
    ("Is this sampling strategy correct: sample 1% of all traces uniformly? Identify the rare-event coverage gap and propose a head-based sampling alternative.", "observability", "analysis", "borderline"),
    ("Two options for log retention -- hot storage for 7 days and cold archive for 1 year -- compare query latency and cost for incident investigation 30 days post-incident.", "observability", "analysis", "clear"),
    ("Is this claim correct: a high p99 latency always indicates a performance problem? Identify the scenario where high p99 is expected and acceptable.", "observability", "analysis", "borderline"),
    ("Given a metrics cardinality explosion from high-cardinality labels, compare two mitigations -- label dropping at the agent and pre-aggregation at the source.", "observability", "analysis", "clear"),
    ("Is this SLO definition correct: 99.9% of requests must complete in under 500ms, measured monthly? Identify what this implies for acceptable downtime in minutes per month.", "observability", "analysis", "clear"),
    ("Two approaches for correlating logs and traces -- embedding trace IDs in log lines and using a log-trace join in the backend -- compare query latency and storage cost.", "observability", "analysis", "clear"),
    ("Is this claim correct: increasing log verbosity always helps with incident diagnosis? Identify the log flood scenario that makes the useful signal harder to find.", "observability", "analysis", "clear"),
    ("Given a synthetic canary vs. real-user monitoring for detecting regional degradation, compare detection latency, coverage, and false-positive rate.", "observability", "analysis", "borderline"),
    ("Is this claim about error budgets correct: once the error budget is exhausted, all feature development must stop? Identify what the SRE model actually recommends.", "observability", "analysis", "borderline"),
]

for i, (prompt, domain, task_type, ambiguity) in enumerate(opus_low):
    if len([r for r in rows if r["cheapest_acceptable_route"]["model_tier"] == "Opus" and r["cheapest_acceptable_route"]["effort"] == "low"]) >= 150:
        break
    rows.append(row(n, prompt, domain, task_type, ambiguity, "Opus", "low"))
    n += 1

# fill remaining Opus+low if needed with unique prompts
opus_low_fillers = [
    ("Latency vs. durability in distributed consensus: for a financial write workload, which takes priority? Justify with a failure scenario.", "formal_reasoning", "analysis", "borderline"),
    ("Throughput vs. consistency in a replicated key-value store: for a session cache workload, which trade-off wins and under what access pattern does the answer flip?", "formal_reasoning", "analysis", "borderline"),
    ("Availability vs. partition tolerance for a user-facing search index: which do you sacrifice during a network partition and why?", "formal_reasoning", "analysis", "borderline"),
    ("Ordering vs. throughput in a message queue: when is relaxing global ordering safe and what invariant must producers maintain?", "formal_reasoning", "analysis", "borderline"),
    ("Strong consistency vs. low latency for a leaderboard feature: which do you choose for reads and which for writes? Justify separately.", "formal_reasoning", "analysis", "borderline"),
    ("Compaction frequency vs. read amplification in an LSM-tree: how does increasing compaction interval affect read cost at 10M keys?", "formal_reasoning", "analysis", "clear"),
    ("Fan-out-on-write vs. fan-out-on-read for a social feed with 10M followers per celebrity: which strategy has better p99 read latency and at what follower count does the answer reverse?", "formal_reasoning", "analysis", "borderline"),
    ("Eager vs. lazy evaluation for a streaming pipeline: under what backpressure condition does lazy evaluation produce higher end-to-end latency?", "formal_reasoning", "analysis", "borderline"),
    ("Pull vs. push for health check probes in a service mesh: which detects a crashed instance faster and what is the detection latency formula?", "formal_reasoning", "analysis", "clear"),
    ("Short vs. long lease duration for a distributed lock: derive the trade-off in terms of recovery time after lock-holder crash vs. false expiry rate.", "formal_reasoning", "analysis", "borderline"),
]
opus_low_count = len([r for r in rows if r["cheapest_acceptable_route"]["model_tier"] == "Opus" and r["cheapest_acceptable_route"]["effort"] == "low"])
_filler2_idx = 0
fill_id = 9000
while opus_low_count < 150:
    item = opus_low_fillers[_filler2_idx % len(opus_low_fillers)]
    rows.append(row(fill_id, item[0], item[1], item[2], item[3], "Opus", "low"))
    fill_id += 1
    opus_low_count += 1
    _filler2_idx += 1

# ============================================================
# Opus + medium (50 rows) -- multi-step complex
# ============================================================

opus_medium = [
    ("Walk me through debugging a memory leak in a long-running Python service. I have a flame graph showing 80% allocation in a dict merge inside a request handler. Describe the investigation steps, hypothesis formation, and fix.", "perf", "debug", "borderline"),
    ("Walk me through diagnosing a cascading timeout failure in a microservices call chain. Service A calls B which calls C. C's p99 spiked 5 minutes ago. Logs show B timing out on C. What is your investigation sequence?", "distributed_systems", "debug", "borderline"),
    ("Walk me through debugging a Postgres query that ran in 5ms for a month and now takes 8 seconds. Row count has not changed. Describe the steps from EXPLAIN ANALYZE output to root cause.", "perf", "debug", "borderline"),
    ("Walk me through a JVM heap dump analysis for a service with OutOfMemoryError. The heap dump shows 90% of live objects are byte arrays held by a third-party HTTP client. Describe investigation steps.", "perf", "debug", "borderline"),
    ("Walk me through debugging a race condition in a Go service where two goroutines concurrently modify a shared counter protected by a sync.Mutex, but the counter still produces wrong results.", "concurrency", "debug", "borderline"),
    ("How would you diagnose a split-brain in a 5-node Raft cluster where two nodes both believe they are the leader? What logs and metrics do you examine, and what is the recovery procedure?", "distributed_systems", "debug", "borderline"),
    ("Walk me through debugging a Redis memory growth issue where memory doubles every 24 hours but keyspace analysis shows no growth in key count. Describe investigation steps and likely causes.", "perf", "debug", "borderline"),
    ("Walk me through diagnosing an intermittent 503 error on a Kubernetes service. Errors spike for 30 seconds every 5 minutes. Pod restarts are not observed. Describe the investigation sequence.", "distributed_systems", "debug", "borderline"),
    ("Walk me through debugging a deadlock in a Postgres transaction. Two transactions are stuck. EXPLAIN shows they are waiting on the same row but acquired different row locks. Describe the query reconstruction and fix.", "distributed_systems", "debug", "borderline"),
    ("Walk me through diagnosing a Kafka consumer lag that grows during business hours and recovers overnight. Consumer metrics show normal throughput. Describe the investigation and possible causes.", "distributed_systems", "debug", "borderline"),
    ("Walk me through debugging an HTTPS certificate error that started occurring on a Monday morning after no deployment over the weekend. Describe the certificate chain investigation and renewal steps.", "security", "debug", "borderline"),
    ("Walk me through diagnosing a connection pool exhaustion event on a Postgres-backed service. All threads are blocked on pool acquire. Describe the investigation, short-term mitigation, and long-term fix.", "perf", "debug", "borderline"),
    ("Walk me through debugging a CPU spike in a Node.js service. Flame graph shows 70% of CPU in JSON.parse inside a middleware. Request volume has not changed. Describe investigation steps.", "perf", "debug", "borderline"),
    ("Walk me through diagnosing a data inconsistency where an order is marked paid in the payments service but pending in the orders service. No error logs on either side. Describe the investigation.", "distributed_systems", "debug", "borderline"),
    ("Walk me through debugging an OOM kill in a containerized Go service. The heap profile shows 150MB live objects but the container limit is 512MB. Describe the investigation of RSS vs. heap discrepancy.", "perf", "debug", "borderline"),
    ("Walk me through diagnosing intermittent authentication failures that affect 0.1% of requests. JWT validation passes on retry. Describe clock skew, key rotation, and token caching hypotheses.", "auth", "debug", "borderline"),
    ("Walk me through debugging a slow startup in a Spring Boot service that takes 90 seconds to reach readiness. Startup logs show 60 of those seconds in database schema validation. Describe investigation.", "perf", "debug", "borderline"),
    ("Walk me through diagnosing a load balancer health check failure that affects one instance every 10 minutes for 30 seconds. No application errors during the window. Describe the investigation.", "networking", "debug", "borderline"),
    ("Walk me through debugging a corrupt Avro message in a Kafka topic that causes consumer deserialization failures. Describe schema registry checks, message inspection, and producer-side investigation.", "distributed_systems", "debug", "borderline"),
    ("Walk me through diagnosing a disk space exhaustion event on a Postgres host. Disk fills at 2GB per hour. Neither table data nor WAL growth explains it. Describe the investigation.", "perf", "debug", "borderline"),
    ("Walk me through debugging an intermittent panic in a Rust service where a Vec index-out-of-bounds occurs only under high concurrency. Describe the investigation using thread sanitizer and lock analysis.", "concurrency", "debug", "borderline"),
    ("Stale data after a successful write: the write returns 200 but subsequent reads return the old value for up to 30 seconds. Walk me through the cache and replication investigation.", "distributed_systems", "debug", "borderline"),
    ("Walk me through debugging an AWS Lambda function with cold start latency of 8 seconds. Runtime is Python 3.11 with 20 dependencies. Describe the import profiling and layer optimization investigation.", "perf", "debug", "borderline"),
    ("Walk me through diagnosing a TLS handshake timeout between two internal services. Both services use mTLS with certificates from the same CA. The error is intermittent and affects 0.5% of connections.", "networking", "debug", "borderline"),
    ("Walk me through debugging a gradual performance regression in a React app. Time to interactive increased from 1.5s to 4s over two weeks. No obvious bundle size change. Describe the profiling investigation.", "perf", "debug", "borderline"),
    ("Walk me through diagnosing a Elasticsearch query timeout that occurs only for queries on a specific index with 50M documents. Describe the shard analysis, mapping inspection, and query profiling steps.", "perf", "debug", "borderline"),
    ("Walk me through debugging a webhook delivery failure where 5% of webhooks are not received by the customer endpoint. Retries also fail. Describe the delivery log analysis, DNS investigation, and TLS checks.", "networking", "debug", "borderline"),
    ("Walk me through diagnosing a write amplification issue in a service using an ORM that issues 10 SQL UPDATE statements per request where 1 should suffice. Describe query log analysis and ORM configuration investigation.", "perf", "debug", "borderline"),
    ("Walk me through debugging a session fixation vulnerability discovered in a security audit. The app assigns session IDs before login and does not rotate them post-authentication. Describe the code path, exploit, and fix.", "security", "debug", "borderline"),
    ("Walk me through diagnosing a flapping circuit breaker between two services. The breaker opens and closes every 20 seconds. No errors on the downstream service. Describe the threshold tuning and timeout investigation.", "distributed_systems", "debug", "borderline"),
    ("Walk me through debugging a distributed trace that shows a 500ms gap between a frontend service emitting a span and a backend service receiving it. Both services use OpenTelemetry. Describe the clock skew and propagation investigation.", "observability", "debug", "borderline"),
    ("Walk me through diagnosing a DNS resolution failure that affects 2% of requests to an external API from a Kubernetes pod. CoreDNS logs show no errors. Describe the ndots, search domain, and UDP truncation investigation.", "networking", "debug", "borderline"),
    ("Walk me through debugging a Postgres autovacuum that consistently fails to finish on one large table. Dead tuple count grows between vacuum runs. Describe the long-transaction and lock conflict investigation.", "perf", "debug", "borderline"),
    ("Walk me through diagnosing a memory fragmentation issue in a C++ service where allocated heap stays at 4GB but RSS grows to 16GB over 48 hours. Describe the allocator investigation and jemalloc profiling.", "perf", "debug", "borderline"),
    ("Walk me through debugging a Python asyncio service that stalls under high load. Event loop lag exceeds 500ms. No CPU spike. Describe the blocking-call investigation and profiling with asyncio debug mode.", "concurrency", "debug", "borderline"),
    ("Walk me through diagnosing a Kubernetes pod that enters CrashLoopBackoff with an exit code of 137. No application logs before crash. Describe the OOM kill investigation using kernel logs and cgroup stats.", "perf", "debug", "borderline"),
    ("Walk me through debugging a gRPC streaming RPC that stops receiving messages after exactly 100 messages. Client and server show no error. Describe the flow control and buffer exhaustion investigation.", "networking", "debug", "borderline"),
    ("RabbitMQ publisher confirms are taking 500ms under normal load with no consumer lag. Walk me through the queue depth, connection, and channel analysis.", "distributed_systems", "debug", "borderline"),
    ("Walk me through debugging a permission denied error on a Linux container that runs a Python script as a non-root user. The script worked last week. Describe the filesystem UID mapping and capabilities investigation.", "security", "debug", "borderline"),
    ("Walk me through diagnosing an event sourcing projection that falls behind by 1 hour during business hours and catches up overnight. Consumer CPU is not saturated. Describe the projection rebuild and DB write bottleneck investigation.", "distributed_systems", "debug", "borderline"),
    ("Walk me through debugging a service that returns HTTP 200 but with an empty body for 1% of requests. The response body is populated in application logs. Describe the middleware, compression, and proxy investigation.", "networking", "debug", "borderline"),
    ("Walk me through diagnosing a Postgres sequence exhaustion event on a table using SERIAL primary keys. New inserts fail with duplicate key violations. Describe the sequence reset and bigint migration path.", "data_modeling", "debug", "borderline"),
    ("Walk me through debugging a slow GraphQL mutation that resolves in 2ms on the database but takes 800ms end-to-end. No N+1 detected. Describe the resolver, field middleware, and serialization investigation.", "perf", "debug", "borderline"),
    ("Walk me through diagnosing an auth token that expires before its stated exp claim. Users are logged out prematurely. Describe the clock synchronization, leeway configuration, and token issuance investigation.", "auth", "debug", "borderline"),
    ("Walk me through debugging a Kafka producer that drops messages silently under load. acks=1 is configured. Describe the broker log, replication factor, and ISR investigation.", "distributed_systems", "debug", "borderline"),
    ("Walk me through diagnosing a CDN cache miss rate that jumped from 5% to 60% after a deployment. No cache-control header changes in the diff. Describe the Vary header and query string normalization investigation.", "perf", "debug", "borderline"),
    ("Walk me through debugging a WebSocket connection that disconnects after exactly 60 seconds. The client reconnects successfully. Describe the load balancer idle timeout and keepalive investigation.", "networking", "debug", "borderline"),
    ("CI pipeline went from 10 minutes to 40 with no new tests added. Walk me through the test parallelism, dependency caching, and Docker layer investigation.", "perf", "debug", "borderline"),
    ("Walk me through debugging an authorization bypass discovered in a code review: a middleware checks for an admin claim in the JWT but trusts the alg field in the header to select the verification algorithm.", "security", "debug", "borderline"),
    ("A service handles 100 RPS fine in staging but crashes at 200 RPS in production despite matching load test results. Walk me through the infrastructure difference, connection limit, and file descriptor investigation.", "perf", "debug", "borderline"),
]

for i, (prompt, domain, task_type, ambiguity) in enumerate(opus_medium):
    rows.append(row(n, prompt, domain, task_type, ambiguity, "Opus", "medium"))
    n += 1

# ============================================================
# Write JSONL
# ============================================================

assert len(rows) >= 500, f"Only {len(rows)} rows generated"
rows = rows[:500]

outpath = r"C:\Users\mglenn\.dotfiles\pi\prompt-routing\data\synthetic_shards\genC\chunk.jsonl"
with open(outpath, "w", encoding="utf-8") as f:
    for r in rows:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")

print(f"Wrote {len(rows)} rows")

# Validation summary
from collections import Counter
tier_effort = Counter((r["cheapest_acceptable_route"]["model_tier"], r["cheapest_acceptable_route"]["effort"]) for r in rows)
domains = Counter(r["domain"] for r in rows)
task_types = Counter(r["task_type"] for r in rows)
ids = [r["prompt_id"] for r in rows]
print("Distribution:", dict(tier_effort))
print("Domains:", len(domains), dict(domains))
print("Task types:", len(task_types), dict(task_types))
print("Unique IDs:", len(set(ids)), "of", len(ids))

# Prefix dedup check (no more than 3 share any 30-char prefix)
from collections import defaultdict
prefix_map = defaultdict(list)
for r in rows:
    prefix_map[r["prompt"][:30]].append(r["prompt_id"])
violations = {k: v for k, v in prefix_map.items() if len(v) > 3}
print("Prefix violations (>3 share 30-char prefix):", len(violations))
if violations:
    for k, v in violations.items():
        print(f"  {repr(k)}: {v}")
