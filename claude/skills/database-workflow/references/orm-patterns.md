---
name: database-workflow/orm-patterns
description: ORM best practices, query patterns, relationship handling, and N+1 prevention.
---

# ORM Patterns

Object-Relational Mapping best practices, query patterns, and relationship handling.

## Active Record vs Data Mapper

**Active Record:**
- Model contains both data and database logic
- Simple for small projects
- Model directly calls database
- Example: Rails, Django ORM

```python
# Active Record pattern
class User(Model):
    name = CharField()
    email = CharField()

    def save(self):
        # Object knows how to save itself
        db.insert('users', {...})

    @staticmethod
    def find_by_email(email):
        return db.query('SELECT * FROM users WHERE email = ?', email)

# Usage
user = User(name='John', email='john@example.com')
user.save()
found_user = User.find_by_email('john@example.com')
```

**Data Mapper:**
- Model contains only data; repository handles database logic
- Better separation of concerns
- Model is a plain object
- Example: SQLAlchemy, TypeORM

```python
# Data Mapper pattern
class User:
    def __init__(self, name, email):
        self.name = name
        self.email = email

class UserRepository:
    def save(self, user):
        # Repository handles persistence
        db.insert('users', {'name': user.name, 'email': user.email})

    def find_by_email(self, email):
        row = db.query('SELECT * FROM users WHERE email = ?', email)
        return User(row['name'], row['email']) if row else None

# Usage
user = User('John', 'john@example.com')
repo = UserRepository()
repo.save(user)
found_user = repo.find_by_email('john@example.com')
```

**Choose based on project scale:**
- Small apps: Active Record (simpler)
- Medium to large: Data Mapper (more flexible)

## Query Builders

**Use query builders to avoid string concatenation and SQL injection:**

```python
# Vulnerable to SQL injection
query = f"SELECT * FROM users WHERE email = '{email}'"
result = db.execute(query)

# Safe: Parameterized query
result = db.query('SELECT * FROM users WHERE email = ?', [email])

# Better: Query builder
result = (
    db.select(User)
    .where(User.email == email)
    .where(User.active == True)
    .order_by(User.created_at.desc())
    .limit(10)
    .execute()
)
```

**Benefits of query builders:**
- Prevent SQL injection
- Cleaner, more maintainable code
- Database-agnostic (can switch databases)
- Compose queries dynamically

## Eager Loading vs Lazy Loading

**Lazy Loading (default, but can cause N+1):**
```python
# Each user fetch triggers a separate query for posts
users = db.query(User).limit(10).all()
for user in users:
    print(user.posts)  # Additional query per user = 10+ queries!
```

**Eager Loading (prevent N+1):**
```python
# Single query with JOIN
users = db.query(User).join(Post).limit(10).all()
for user in users:
    print(user.posts)  # No additional queries

# Or use explicit eager loading
users = db.query(User).options(joinedload(User.posts)).limit(10).all()
```

## N+1 Query Problem

**Recognize and fix N+1 problems:**

```python
# N+1 Problem: 1 query for users + N queries for posts
users = db.query(User).all()  # 1 query
for user in users:
    posts = db.query(Post).filter(Post.user_id == user.id).all()  # N more queries

# Fix 1: Eager loading with JOIN
users = db.query(User).join(Post).distinct().all()

# Fix 2: Use IN clause for batch loading
user_ids = [u.id for u in users]
posts = db.query(Post).filter(Post.user_id.in_(user_ids)).all()
# Now merge posts back to users in memory

# Fix 3: Use ORM eager loading
users = db.query(User).options(selectinload(User.posts)).all()
```

## Transactions

**Use transactions for data consistency:**

```python
# No transaction - inconsistent state if error occurs
user = db.query(User).get(123)
user.balance -= 50
db.commit()

account = db.query(Account).get(456)
account.balance += 50
db.commit()  # If this fails, money disappears!

# Transaction - all-or-nothing
try:
    with db.transaction():
        user = db.query(User).get(123)
        user.balance -= 50

        account = db.query(Account).get(456)
        account.balance += 50

        db.flush()
except Exception:
    # Everything rolls back automatically
    raise
```

## Testing with ORMs

### Test Databases

**Use separate test database:**

```python
# config.py
if os.getenv('ENV') == 'test':
    DATABASE_URL = 'postgresql://test_user:test_pass@localhost/test_db'
else:
    DATABASE_URL = os.getenv('DATABASE_URL')

# conftest.py (pytest)
@pytest.fixture(autouse=True)
def setup_test_db():
    """Create test database and tables before each test."""
    # Create tables
    db.create_all()
    yield
    # Cleanup
    db.drop_all()
```

### Fixtures and Seeds

**Use fixtures for test data:**

```python
# conftest.py
import pytest
from app.models import User, Order

@pytest.fixture
def sample_user(db):
    """Create a test user."""
    user = User(name='John Doe', email='john@example.com')
    db.add(user)
    db.commit()
    return user

@pytest.fixture
def sample_orders(db, sample_user):
    """Create orders for test user."""
    orders = [
        Order(user_id=sample_user.id, total_amount=100.00),
        Order(user_id=sample_user.id, total_amount=200.00),
    ]
    db.add_all(orders)
    db.commit()
    return orders

# test_orders.py
def test_get_user_orders(sample_user, sample_orders):
    """Test fetching user orders."""
    orders = Order.query.filter_by(user_id=sample_user.id).all()
    assert len(orders) == 2
    assert sum(o.total_amount for o in orders) == 300.00
```

### Transaction Rollback

**Rollback transactions to isolate tests:**

```python
# conftest.py - Automatic rollback after each test
@pytest.fixture(autouse=True)
def db_transaction(db):
    """Wrap each test in a transaction that rolls back."""
    transaction = db.begin_nested()
    yield
    transaction.rollback()  # Undo all changes from this test

# Or use explicit rollback
def test_create_user():
    db.begin()
    user = User(name='John', email='john@example.com')
    db.add(user)
    db.commit()
    assert user.id is not None

    db.rollback()
    # Changes are undone, database is clean for next test
```
