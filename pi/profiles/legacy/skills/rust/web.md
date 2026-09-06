# Web Development with Axum

## Router Setup

### Route Organization
```rust
fn api_routes() -> Router<AppState> {
    Router::new()
        .nest("/users", user_routes())
        .nest("/items", item_routes())
}

fn user_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_users).post(create_user))
        .route("/{id}", get(get_user).put(update_user).delete(delete_user))
}
```

### Router Rules
- MUST use `Router::new()` with `.with_state()` for shared state
- SHOULD organize routes with `.nest()` for logical grouping
- SHOULD define route functions returning `Router<AppState>` for modularity
- MUST NOT put business logic directly in route definitions

---

## Handlers and Extractors

### Basic handlers
Extract state and validated input, delegate to an application service, and return a typed success or `AppError`; do not mix transport and business logic.

### Query and path parameters
Deserialize typed query/path values, apply bounded defaults, and reject malformed or out-of-range input before invoking application logic.

### Custom Extractors
Use `FromRequestParts` for header/query authentication and validation. Return a typed rejection, keep authentication policy in the extractor, and make handler inputs trusted domain values.

### Extractor Rules
- Extractors run in argument order - put fallible ones last
- `Json<T>` consumes the body - only one body extractor per handler
- MUST implement `FromRequestParts` (not `FromRequest`) for header/query extractors
- SHOULD validate input in the extractor, not the handler

---

## Error Handling

### Unified Error Type
```rust
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};

#[derive(Debug)]
enum AppError {
    NotFound,
    Unauthorized,
    Validation(String),
    Database(sqlx::Error),
    Internal(anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "resource not found"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::Database(_) => {
                tracing::error!(error = ?self, "database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            }
            AppError::Internal(_) => {
                tracing::error!(error = ?self, "internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            }
        };

        let body = serde_json::json!({ "error": message });
        (status, Json(body)).into_response()
    }
}

// From impls for ? operator
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Database(err)
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err)
    }
}
```

### Error Handling Rules
- MUST implement `IntoResponse` for all error types
- MUST NOT expose internal error details to clients (log them, return generic message)
- SHOULD use `From` impls for ergonomic `?` usage
- SHOULD log server errors with `tracing::error!` including debug representation

---

## Tower Middleware

### Common Middleware Stack
```rust
use axum::middleware;
use tower::ServiceBuilder;
use tower_http::{
    cors::CorsLayer,
    trace::TraceLayer,
    compression::CompressionLayer,
    timeout::TimeoutLayer,
    limit::RequestBodyLimitLayer,
};

let app = Router::new()
    .nest("/api", api_routes())
    .layer(
        ServiceBuilder::new()
            .layer(TraceLayer::new_for_http())
            .layer(CompressionLayer::new())
            .layer(TimeoutLayer::new(Duration::from_secs(30)))
            .layer(RequestBodyLimitLayer::new(1024 * 1024)) // 1MB
            .layer(CorsLayer::permissive()) // Restrict in production
    )
    .with_state(state);
```

### Custom Middleware
```rust
use axum::{
    middleware::Next,
    extract::Request,
    response::Response,
};

async fn request_id_middleware(
    mut request: Request,
    next: Next,
) -> Response {
    let request_id = uuid::Uuid::new_v4().to_string();
    request.headers_mut().insert(
        "x-request-id",
        request_id.parse().unwrap(),
    );

    let mut response = next.run(request).await;
    response.headers_mut().insert(
        "x-request-id",
        request_id.parse().unwrap(),
    );
    response
}

// Apply to router
let app = Router::new()
    .route("/", get(handler))
    .layer(middleware::from_fn(request_id_middleware));
```

### Middleware Rules
- `ServiceBuilder` layers apply bottom-to-top (last added = outermost)
- SHOULD use `tower-http` crates for standard middleware
- SHOULD use `middleware::from_fn` for simple request/response transforms
- SHOULD implement `tower::Layer` + `tower::Service` for complex stateful middleware

---

## Database Integration with sqlx

### Connection Pool Setup
```rust
use sqlx::postgres::PgPoolOptions;

let pool = PgPoolOptions::new()
    .max_connections(20)
    .min_connections(5)
    .acquire_timeout(Duration::from_secs(3))
    .connect(&database_url)
    .await?;
```

### Queries
```rust
// Compile-time checked query (requires DATABASE_URL at build time)
let user = sqlx::query_as!(
    User,
    "SELECT id, name, email FROM users WHERE id = $1",
    user_id
)
.fetch_optional(&pool)
.await?;

// Runtime query (no compile-time check)
let rows = sqlx::query("SELECT * FROM users WHERE active = $1")
    .bind(true)
    .fetch_all(&pool)
    .await?;

// Insert returning
let user = sqlx::query_as!(
    User,
    r#"INSERT INTO users (name, email) VALUES ($1, $2)
       RETURNING id, name, email"#,
    payload.name,
    payload.email,
)
.fetch_one(&pool)
.await?;
```

### Transactions
```rust
let mut tx = pool.begin().await?;

sqlx::query!("UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, from_id)
    .execute(&mut *tx)
    .await?;

sqlx::query!("UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, to_id)
    .execute(&mut *tx)
    .await?;

tx.commit().await?;
```

### Migrations
```bash
# Create migration
sqlx migrate add create_users_table

# Run migrations
sqlx migrate run

# Revert last migration
sqlx migrate revert
```

```rust
// Run migrations at startup
sqlx::migrate!("./migrations")
    .run(&pool)
    .await?;
```

---

## JWT Authentication

### Token Creation and Validation
Validate signature, issuer, audience, expiry, and algorithm explicitly. Map any invalid token to the same unauthorized response and never log credentials or raw tokens.

---

## Graceful Shutdown

```rust
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("received Ctrl+C"),
        _ = terminate => tracing::info!("received SIGTERM"),
    }
}
```

---

## Testing

### Integration Tests with axum::test
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt; // for oneshot

    fn test_app() -> Router {
        // Build app with test state
        let state = AppState { /* test config */ };
        Router::new()
            .nest("/api", api_routes())
            .with_state(state)
    }

    #[tokio::test]
    async fn test_health() {
        let app = test_app();

        let response = app
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_create_user() {
        let app = test_app();

        let body = serde_json::json!({
            "name": "Alice",
            "email": "alice@example.com"
        });

        let response = app
            .oneshot(
                Request::post("/api/v1/users")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&body).unwrap()))
                    .unwrap()
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);
    }

    #[tokio::test]
    async fn test_not_found() {
        let app = test_app();

        let response = app
            .oneshot(Request::get("/api/v1/users/999").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
```

### OpenAPI with utoipa
```rust
use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    paths(list_users, get_user, create_user),
    components(schemas(User, CreateUserRequest, PaginationParams)),
    tags((name = "users", description = "User management"))
)]
struct ApiDoc;

// Serve OpenAPI spec
let app = Router::new()
    .route("/api-docs/openapi.json", get(|| async {
        Json(ApiDoc::openapi())
    }));
```
