# Flask Framework Patterns

Flask-specific patterns and best practices. For general Python workflow, see SKILL.md

## Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Run dev | Flask CLI | `flask run --debug` |
| Test | pytest | `uv run pytest` |
| Lint | Ruff | `uv run ruff check .` |
| Format | Ruff | `uv run ruff format .` |
| Migrate | Flask-Migrate | `flask db upgrade` |

---

## Application Factory Pattern

All Flask applications MUST use the application factory pattern:

```python
# app/__init__.py
from flask import Flask

def create_app(config_name: str = "default") -> Flask:
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    # Register blueprints
    from app.main import main_bp
    from app.auth import auth_bp
    from app.api import api_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(api_bp, url_prefix="/api/v1")

    register_error_handlers(app)
    return app
```

---

## Blueprint Organization

Routes MUST be organized using Blueprints. NEVER define routes directly on the app object.

```
app/
├── __init__.py          # create_app() factory
├── extensions.py        # Extension instances
├── models/
│   └── user.py
├── main/                # Main blueprint
│   ├── __init__.py
│   └── routes.py
├── auth/                # Auth blueprint
│   ├── __init__.py
│   └── routes.py
└── api/                 # API blueprint
    ├── __init__.py
    └── routes.py
```

```python
# app/main/__init__.py
from flask import Blueprint

main_bp = Blueprint("main", __name__)
from app.main import routes  # noqa: E402, F401
```

---

## Configuration

```python
# config.py
import os
from pathlib import Path

basedir = Path(__file__).parent

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-key-change-in-prod"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get("DEV_DATABASE_URL") or \
        f"sqlite:///{basedir / 'dev.db'}"

class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False

class ProductionConfig(Config):
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")

config = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
```

---

## Extensions Pattern

Extensions MUST be instantiated separately, then initialized in the factory:

```python
# app/extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager

db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
login_manager.login_view = "auth.login"
```

---

## Flask-SQLAlchemy Patterns

```python
# app/models/user.py
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from app.extensions import db, login_manager

class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

@login_manager.user_loader
def load_user(user_id: str) -> User | None:
    return db.session.get(User, int(user_id))
```

### Query Patterns

```python
# RECOMMENDED: Use db.session for queries
user = db.session.get(User, user_id)  # By primary key
users = db.session.scalars(db.select(User).filter_by(active=True)).all()

# AVOID deprecated Model.query
```

---

## Context Management

### Application Context

```python
with app.app_context():
    db.create_all()
    user = db.session.get(User, 1)
```

### Request Context

```python
from flask import g, request

@app.before_request
def before_request():
    g.user = current_user
    g.locale = request.accept_languages.best_match(["en", "es"])
```

---

## Error Handlers

```python
# app/errors.py
from flask import render_template, jsonify, request

def register_error_handlers(app):
    @app.errorhandler(404)
    def not_found_error(error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Not found"}), 404
        return render_template("errors/404.html"), 404

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        if request.path.startswith("/api/"):
            return jsonify({"error": "Internal server error"}), 500
        return render_template("errors/500.html"), 500
```

---

## Testing

```python
# tests/conftest.py
import pytest
from app import create_app
from app.extensions import db

@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

# tests/test_auth.py
def test_login_page(client):
    response = client.get("/auth/login")
    assert response.status_code == 200
    assert b"Login" in response.data
```

---

## Security Checklist

- [ ] SECRET_KEY from environment in production
- [ ] CSRF protection enabled for forms
- [ ] Passwords hashed with werkzeug.security
- [ ] SQL queries use parameterized statements
- [ ] Debug mode disabled in production
