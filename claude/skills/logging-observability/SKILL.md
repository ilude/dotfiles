---
name: logging-observability
description: "Structured logging, distributed tracing, and debugging patterns. Triggers: logging, observability, tracing, debugging, structured logging, log aggregation, performance metrics, monitoring, correlation ID, trace ID."
---

# Logging & Observability Skill

Activate when working with logging systems, distributed tracing, debugging, monitoring, or any observability-related tasks.

---

## Core Principle: Inferring Internal State from External Signals

**From control theory**: A system is *observable* if its internal state can be determined from external outputs. This explains WHY observability matters in software:

> **You cannot debug what you cannot infer.**

The goal is not maximum data collection but **minimum data required to diagnose any failure**. This is why logging everything is easy but logging what matters is hard.

---

## The Three Pillars of Observability

Each pillar serves a distinct purpose in the **Detection → Diagnosis → Optimization** workflow:

| Pillar | Purpose | Question Answered | Cardinality |
|--------|---------|-------------------|-------------|
| **Metrics** | Detect anomalies | "Is something wrong?" | Low (aggregated) |
| **Traces** | Locate problems | "Where is the bottleneck?" | Medium (per-request) |
| **Logs** | Explain causes | "Why did it fail?" | High (detailed context) |

**The Investigation Funnel:**
1. **Metrics alert** → error rate spike detected
2. **Traces isolate** → payment-service→inventory-service call slow
3. **Logs explain** → database connection timeout, pool exhausted

### Correlation Is Key

The pillars' power comes from **correlation through context propagation**:
- Embed `trace_id` in all logs → link logs to traces
- Attach exemplars to metrics → link metrics to specific traces
- Use W3C Trace Context headers → maintain correlation across services

---

## Canonical Metric Frameworks

### Four Golden Signals (Google SRE)

Monitor these four signals for any user-facing service:

| Signal | What to Measure | Example |
|--------|-----------------|---------|
| **Latency** | Request duration (separate success/failure) | p50, p95, p99 response times |
| **Traffic** | Demand on the system | Requests/second, QPS |
| **Errors** | Failed request rate | 5xx responses / total |
| **Saturation** | Resource capacity used | CPU%, memory%, queue depth |

### RED Method (Service-Level)

For microservices, measure:
- **R**ate: Requests per second
- **E**rrors: Failed requests per second
- **D**uration: Latency distribution

*"RED metrics are a proxy for user happiness."*

### USE Method (Resource-Level)

For infrastructure resources:
- **U**tilization: % of capacity in use
- **S**aturation: Queued work waiting
- **E**rrors: Resource-level faults

**Combine both**: RED for services, USE for infrastructure.

---

## SLO-Driven Alerting

### Key Definitions

- **SLI** (Service Level Indicator): Measured behavior (e.g., latency, error rate)
- **SLO** (Service Level Objective): Target for an SLI (e.g., 99.9% success rate)
- **Error Budget**: 100% - SLO (e.g., 0.1% allowed failures)

### Alert on Error Budget Burn Rate, Not Individual Failures

**Why**: Alerting on every error causes alert fatigue. Research shows teams receive 2,000+ alerts weekly with only 3% requiring action.

**Better approach**: Alert when error budget consumption accelerates:

```yaml
# Alert when burning 30-day budget in 6 hours (120x normal rate)
alert: HighErrorBudgetBurn
expr: |
  rate(http_requests_total{status=~"5.."}[1h])
  / rate(http_requests_total[1h]) > 0.001 * 120
for: 5m
annotations:
  summary: "Error budget burning too fast"
```

### Actionable Alert Criteria

Pages should be:
- **Urgent**: Requires immediate attention
- **User-visible**: Impacts real users
- **Actionable**: Human can meaningfully respond
- **Novel**: Not a recurring pattern with known fix

Target: **30-50% actionable alert rate**. If <10%, significant noise exists.

---

## Structured Logging

### Why Structured?

Research shows structured logs are **10-1000x faster to parse** than unstructured text. Structured formats enable:
- Direct database-style queries
- Automated anomaly detection
- Cross-service correlation

### Required Fields (OpenTelemetry-Aligned)

```json
{
  "timestamp": "2025-11-17T10:30:45.123Z",
  "severity": "ERROR",
  "severityNumber": 17,
  "body": "Payment processing failed",
  "resource": {
    "service.name": "payment-service",
    "service.version": "1.2.3",
    "deployment.environment": "production"
  },
  "attributes": {
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "00f067aa0ba902b7",
    "user.id": "user-456",
    "error.type": "PaymentGatewayError",
    "error.message": "Connection timeout"
  }
}
```

### Severity Levels (Syslog-Aligned)

| Level | Number | When to Use |
|-------|--------|-------------|
| **DEBUG** | 7 | Development details, variable states |
| **INFO** | 6 | Application lifecycle, state changes |
| **WARN** | 4 | Recoverable issues, resource constraints |
| **ERROR** | 3 | Unrecoverable problems, exceptions |
| **FATAL** | 1-2 | System-level failures, abort conditions |

### Field Naming Conventions (ECS/OTel)

- Lowercase with dots as namespace separators (`http.method`, `user.id`)
- Singular names for single values
- Include units in numeric field names (`duration_ms`, `size_bytes`)
- No stuttering (`host.ip` not `host.host_ip`)

---

## Distributed Tracing

### W3C Trace Context (Standard)

Use standard headers for context propagation:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ^^-^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^-^^^^^^^^^^^^^^^^-^^
             version    trace_id (32 hex)      parent_id (16 hex)  flags
```

- **trace_id**: Unique identifier for entire request flow
- **parent_id/span_id**: Identifies current operation
- **flags**: Sampling decision (01 = sampled)

Optional vendor-specific data via `tracestate`:
```
tracestate: congo=ucfJifl5GOE,rojo=00f067aa0ba902b7
```

### Sampling Strategies

| Strategy | When to Use | Trade-offs |
|----------|-------------|------------|
| **Head-based** | High volume, cost reduction | Simple but misses anomalies |
| **Tail-based** | Capture errors/slow requests | Complex, higher overhead |
| **Adaptive** | Variable traffic patterns | Best coverage, more config |

**Recommended Composite Strategy:**

```
IF (error OR status >= 500): sample_rate = 100%
ELSE IF (latency > p99): sample_rate = 50%
ELSE IF (critical_endpoint): sample_rate = 20%
ELSE: sample_rate = adaptive (1-5% based on volume)
```

**Target-based approach**: Set target throughput (e.g., 10 traces/sec/service) rather than fixed percentages.

---

## What NOT to Log (Security)

**NEVER log:**
- Passwords, authentication tokens, API keys
- Private keys, certificates, OAuth tokens
- Credit card numbers, SSNs, full PII
- Raw HTTP bodies (may contain auth headers)

**Redact or anonymize:**
- Email addresses, phone numbers
- Query parameters (may contain secrets)
- User input (may contain sensitive data)

```python
# BAD
logger.info(f"Login for {username} with password {password}")

# GOOD
logger.info("Login attempt", extra={"user.id": user_id, "auth.method": "password"})
```

---

## Cardinality: The Decision Principle

**Cardinality** = number of unique values a dimension can have.

| Cardinality | Use | Example |
|-------------|-----|---------|
| **Low** (<100 values) | Metrics | status_code, region, method |
| **High** (unbounded) | Logs/Traces | user_id, request_id, trace_id |

**Anti-pattern**: High-cardinality metric labels cause storage explosion:

```python
# BAD - user_id has millions of values
counter.labels(user_id=user_id).inc()

# GOOD - log the user_id, aggregate by status
counter.labels(status=status_code).inc()
logger.info("Request completed", extra={"user.id": user_id})
```

---

## Observability Anti-Patterns

| Anti-Pattern | Example | Problem |
|--------------|---------|---------|
| **Log spam** | `logger.debug(f"Item {i}")` in tight loop | Buries signal in noise |
| **Trace everything** | Span per helper function | 100+ spans per request |
| **Metric explosion** | High-cardinality labels (user_id) | Prometheus OOM |
| **Copy-paste logging** | "Starting X...", "Finished X" | No actionable info |
| **Alert fatigue** | Alert on every error | 97% alerts ignored |
| **Observability theater** | "We log everything for visibility" | Cost without value |

### The Litmus Test

> "What specific debugging scenario requires this log/trace/metric?"

If the answer is vague ("visibility", "just in case"), reconsider.

### When Full Observability IS Worth It

- Production systems with SLO requirements
- Distributed systems with complex request flows
- Systems with historical debugging difficulties
- Compliance/audit requirements

---

## Log Management

### Rotation

```python
from logging.handlers import RotatingFileHandler
handler = RotatingFileHandler('app.log', maxBytes=10485760, backupCount=5)
```

### Retention by Severity

| Level | Retention | Rationale |
|-------|-----------|-----------|
| DEBUG | 7 days | High volume, short-term debugging |
| INFO | 30 days | Operational context |
| WARN | 90 days | Trend analysis |
| ERROR | 1 year | Incident investigation |
| FATAL | Indefinite | Root cause reference |

### Aggregation Tools

| Tool | Best For |
|------|----------|
| **ELK Stack** | On-premise, complex queries |
| **Grafana Loki** | Cost-effective, Prometheus integration |
| **Datadog** | Cloud-first, all-in-one |
| **Splunk** | Enterprise, security focus |
| **CloudWatch/Stackdriver** | AWS/GCP native |

---

## Metrics (Prometheus Patterns)

```python
from prometheus_client import Counter, Histogram, Gauge

# RED metrics
request_count = Counter('http_requests_total', 'Total requests', ['method', 'status'])
request_duration = Histogram('http_request_duration_seconds', 'Request duration',
                             buckets=[.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10])

# USE metrics
cpu_utilization = Gauge('process_cpu_percent', 'CPU utilization')
queue_saturation = Gauge('queue_depth', 'Pending items in queue')
```

---

## Libraries by Language

### Python
- `structlog` - Structured logging, clean API
- `opentelemetry-api` - Distributed tracing standard

### Node.js/TypeScript
- `pino` - High performance, JSON logging
- `@opentelemetry/api` - Standard tracing API

### Go
- `slog` - Standard library (Go 1.21+)
- `zap` - High performance (Uber)

### Java/Kotlin
- `SLF4J` + `Logback` - Standard combo
- `Logstash Logback Encoder` - Structured output

### C#/.NET
- `Serilog` - Excellent structured support
- `Microsoft.Extensions.Logging` - Built-in DI

---

## Quick Reference

### Checklist

- [ ] Structured JSON logging with OTel-aligned fields
- [ ] trace_id/span_id in all logs
- [ ] Appropriate log levels (not over-logging)
- [ ] No secrets in logs (passwords, keys, tokens, PII)
- [ ] Low-cardinality metric labels
- [ ] Log rotation configured
- [ ] SLO-based alerting (not individual errors)
- [ ] Sampling strategy for high-volume traces
- [ ] W3C Trace Context for propagation

### Decision Flow

```
Need real-time alerting? → Metrics
Need to track request flow? → Traces
Need to understand why? → Logs
Unbounded dimension values? → Logs (not metrics)
```

---

## Sources

### Academic Foundations
- [Distributed Systems Observability](https://www.oreilly.com/library/view/distributed-systems-observability/9781492033431/) - Cindy Sridharan (origin of "three pillars")
- [Dapper: Large-Scale Distributed Tracing](https://research.google/pubs/dapper-a-large-scale-distributed-systems-tracing-infrastructure/) - Google Research
- [TraStrainer: Adaptive Sampling](https://dl.acm.org/doi/10.1145/3643748) - ACM FSE 2024

### Industry Standards
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [Elastic Common Schema](https://www.elastic.co/guide/en/ecs/current/)
- [Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)

### Best Practices
- [Microsoft Engineering Playbook: Correlation IDs](https://microsoft.github.io/code-with-engineering-playbook/observability/correlation-id/)
- [Better Stack: Structured Logging](https://betterstack.com/community/guides/logging/structured-logging/)
- [OpenTelemetry Sampling](https://opentelemetry.io/docs/concepts/sampling/)
