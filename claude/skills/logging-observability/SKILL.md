---
name: logging-observability
description: "Structured logging, distributed tracing, and debugging patterns. Triggers: logging, observability, tracing, debugging, structured logging, log aggregation, performance metrics, monitoring, correlation ID, trace ID."
---

# Logging & Observability Skill

Activate when working with logging systems, distributed tracing, debugging, monitoring, or any observability-related tasks across applications.

---

## CRITICAL: Avoid Observability Theater

**Logging everything is easy. Logging what MATTERS is hard.**

Before adding logging, tracing, or metrics, ask:

1. **Will anyone look at this?** - "We log every function entry/exit" -> Who reviews these logs?
2. **Does this help debug real problems?** - What context do I need when something breaks at 3am?
3. **What's the cost?** - Log volume -> storage costs, query latency. Trace spans -> performance overhead.

### The Observability Litmus Test

> "What specific debugging scenario requires this log/trace/metric?"

If the answer is vague ("visibility", "observability", "just in case"), it may be theater.

### Observability Anti-Patterns

| Anti-Pattern | Example | Problem |
|--------------|---------|---------|
| **Log spam** | `logger.debug(f"Processing item {i}")` in tight loop | Buries signal in noise |
| **Trace everything** | Span per helper function call | 100+ spans per request |
| **Metric explosion** | High-cardinality labels (user_id, request_id) | Prometheus OOM |
| **Copy-paste logging** | "Starting X...", "Finished X" everywhere | No actionable info |

### When Full Observability IS Worth It

- Production systems with SLO requirements
- Distributed systems where request flow is complex
- Systems with historical debugging difficulties
- Compliance/audit requirements

---

## 1. Log Levels

| Level | Severity | When to Use |
|-------|----------|------------|
| **DEBUG** | Low | Development only - detailed info, variable states. Use sparingly in production. |
| **INFO** | Low | Application lifecycle events - startup, shutdown, config loaded, key state changes. |
| **WARN** | Medium | Recoverable issues - deprecated usage, resource constraints, handled conditions. |
| **ERROR** | High | Unrecoverable problems - exceptions, failed operations. Requires immediate attention. |
| **FATAL** | Critical | System-level failures - abort conditions, unrecoverable state. System may crash. |

### General Principles

- **Actionable**: Logs should help diagnose problems, not just record events
- **Contextual**: Include enough context without code inspection
- **Consistent**: Same terminology across codebase for same events
- **Sparse**: Don't log everything - unnecessary noise obscures real issues
- **Sampling**: In high-volume scenarios, sample logs (10%, 1%) rather than logging everything
- **Structured**: Always use structured format (JSON) for programmatic parsing

---

## 2. Structured Logging Format

### Required Fields (Always Include)

- `timestamp` - ISO 8601 format
- `level` - DEBUG/INFO/WARN/ERROR/FATAL
- `message` - Human-readable description
- `trace_id` - Unique identifier for request flow
- `service` - Service name
- `environment` - prod/staging/dev

### Optional Fields (When Applicable)

- `span_id` / `parent_span_id` - Distributed tracing
- `user_id` - Any user action
- `request_id` - Any request
- `error` - Object with type, message, stack, code (on ERROR/FATAL)
- `duration_ms` - Operation timing
- `context` - Relevant metadata object

### Example Log Entry

```json
{
  "timestamp": "2025-11-17T10:30:45.123Z",
  "level": "ERROR",
  "message": "Payment processing failed",
  "service": "payment-service",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "user_id": "user-456",
  "error": {"type": "PaymentGatewayError", "message": "Connection timeout", "code": "GATEWAY_TIMEOUT"},
  "context": {"amount": 9999, "currency": "USD", "gateway": "stripe"},
  "duration_ms": 245
}
```

---

## 3. What to Log

### Application Lifecycle
- Service start/stop with version, config source, uptime
- Database/cache connections established
- Shutdown reason (SIGTERM, etc.)

### User Actions
- Login attempts (method, success/failure)
- Data modifications (fields changed, not values)
- Permission checks (resource, permission, granted)

### External API Calls
- Endpoint, method, status_code, duration_ms
- Errors with retry info (retry_after_seconds)

### Performance Metrics
- Slow operations (duration_ms vs threshold_ms)
- Resource usage (memory, CPU percentages)
- Cache statistics (hit_rate)

---

## 4. What NOT to Log (Security)

**NEVER log:**
- Passwords or authentication tokens
- API keys or secrets
- Private keys or certificates
- Database credentials
- OAuth tokens or refresh tokens
- Credit card numbers, SSNs
- Email addresses (without redaction)
- Raw HTTP request/response bodies (contain auth headers)

**Be careful with:**
- PII (name, phone, address) - redact or use anonymized IDs
- Query parameters (may contain secrets)
- Request/response headers
- User input (may contain sensitive data)

**Security rule: When in doubt, DON'T log it**

```python
# BAD - logging credentials
logger.info(f"Login attempt for {username} with password {password}")

# GOOD - logging action without sensitive data
logger.info("Login attempt", extra={"username": username, "method": "password"})
```

---

## 5. Distributed Tracing

### Trace IDs and Span IDs

- **Trace ID**: Unique identifier for entire request flow across services
- **Span ID**: Unique identifier for single operation/service call
- **Parent Span ID**: Span that initiated current span

```
Request -> [Service A, Trace: abc123]
  +- [Span: span1] Database query
  +- [Span: span2] -> Service B, parent: span2
       +- [Span: span3] Cache lookup
  +- [Span: span4] External API call
```

### Propagation

Pass trace context via headers to downstream services:
- `X-Trace-ID`, `X-Span-ID`, `X-Parent-Span-ID`

### Sampling Strategies

- **Rate sampling**: Log every Nth request (1 in 100)
- **Adaptive sampling**: Based on error rate, latency, or traffic volume
- **Tail sampling**: Always sample errors and slow requests

---

## 6. Performance Logging

### Key Patterns

```python
# Execution time decorator
def log_execution_time(func):
    def wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = func(*args, **kwargs)
            logger.info(f"{func.__name__} completed", extra={"duration_ms": (time.time() - start) * 1000})
            return result
        except Exception as e:
            logger.error(f"{func.__name__} failed", extra={"duration_ms": (time.time() - start) * 1000, "error": str(e)})
            raise
    return wrapper

# Slow query detection
SLOW_QUERY_THRESHOLD_MS = 1000
if duration_ms > SLOW_QUERY_THRESHOLD_MS:
    logger.warn("Slow query detected", extra={"query": query, "duration_ms": duration_ms})
```

---

## 7. Log Management

### Log Rotation

```python
from logging.handlers import RotatingFileHandler
handler = RotatingFileHandler('app.log', maxBytes=10485760, backupCount=5)  # 10MB, keep 5
```

### Retention Policies

| Level | Retention |
|-------|-----------|
| DEBUG | 7 days |
| INFO | 30 days |
| WARN | 90 days |
| ERROR | 1 year |
| FATAL | Indefinite |

### Log Aggregation Tools

| Tool | Best For |
|------|----------|
| **ELK Stack** | On-premise, complex queries, rich dashboards |
| **Grafana Loki** | Cost-effective, integrates with Prometheus |
| **Datadog** | Cloud-first, all-in-one, excellent integrations |
| **Splunk** | Enterprise, security focus, compliance |
| **CloudWatch** | AWS native |
| **Stackdriver** | GCP native |

---

## 8. Metrics and Monitoring

### Metric Types (Prometheus)

```python
from prometheus_client import Counter, Histogram, Gauge

login_attempts = Counter('login_attempts_total', 'Total login attempts', ['status'])
request_duration = Histogram('request_duration_seconds', 'Request duration')
active_connections = Gauge('active_connections', 'Current active connections')
```

### Alerting Rules (YAML)

```yaml
alert: HighErrorRate
expr: rate(requests_total{status="500"}[5m]) > 0.05
for: 5m
annotations:
  summary: "High error rate detected"
```

---

## 9. Common Libraries by Language

### Python
- `logging` - Built-in, basic structured support
- `structlog` - Structured logging, cleaner API
- `python-json-logger` - JSON formatter for standard logging
- `OpenTelemetry` - Distributed tracing standard

### Node.js / TypeScript
- `winston` - Full-featured, very popular
- `pino` - Lightweight, high performance
- `bunyan` - JSON logging, stream-based
- `morgan` - HTTP request logger for Express
- `@opentelemetry/api` - Standard tracing API

### Go
- `zap` - High performance, structured (Uber)
- `logrus` - Popular, JSON output
- `slog` - Standard library (Go 1.21+)

### Java / Kotlin
- `SLF4J` + `Logback` - Standard combo
- `Log4j2` - Enterprise feature-rich
- `Logstash Logback Encoder` - Structured output

### C# / .NET
- `Serilog` - Excellent structured support
- `NLog` - Enterprise logging
- `Microsoft.Extensions.Logging` - Built-in DI support

---

## 10. Quick Reference Checklist

When implementing logging/observability:

- [ ] Use structured JSON logging
- [ ] Include trace_id and span_id in all logs
- [ ] Set appropriate log levels (don't over-log)
- [ ] Never log passwords, keys, tokens, PII
- [ ] Add contextual fields (user_id, request_id, etc.)
- [ ] Implement log rotation to prevent disk overflow
- [ ] Include stack traces for errors
- [ ] Track execution time for performance monitoring
- [ ] Sample high-volume logs
- [ ] Use existing libraries (structlog, pino, zap, etc.)
- [ ] Set up log aggregation (ELK, Loki, Datadog)
- [ ] Create alerting rules for critical errors
- [ ] Review logs regularly to spot issues early

---

**Activate this skill when:** working with logging systems, distributed tracing, debugging, monitoring, performance analysis, or observability-related tasks.

**Combine with:** development-philosophy (fail-fast debugging), security-first-design (never log secrets), testing-workflow (use logs to verify behavior).
