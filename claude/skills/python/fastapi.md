# FastAPI Framework Patterns

FastAPI-specific patterns and best practices. For general Python workflow, see SKILL.md

## Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Run dev | Uvicorn | `uvicorn app.main:app --reload` |
| Test | pytest + httpx | `uv run pytest` |
| Docs | Built-in | `/docs` or `/redoc` |
| Lint | Ruff | `uv run ruff check .` |
| Type check | mypy | `uv run mypy .` |

---

## Project Structure

```
project/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app instance
│   ├── config.py            # BaseSettings configuration
│   ├── dependencies.py      # Shared Depends() callables
│   ├── models/
│   │   ├── domain.py        # SQLAlchemy ORM models
│   │   └── schemas.py       # Pydantic schemas
│   ├── routers/
│   │   ├── users.py
│   │   └── items.py
│   ├── services/            # Business logic layer
│   └── db/
│       └── session.py
├── tests/
└── pyproject.toml
```

---

## Dependency Injection

Dependencies MUST use `Depends()`:

```python
from fastapi import Depends, APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session

class UserService:
    def __init__(
        self,
        db: AsyncSession = Depends(get_db),
        settings: Settings = Depends(get_settings),
    ):
        self.db = db
        self.settings = settings

@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    service: UserService = Depends(),
) -> UserResponse:
    return await service.get_user(user_id)
```

---

## Pydantic Validation

```python
from pydantic import BaseModel, Field, EmailStr, ConfigDict

class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=100)
    age: int = Field(..., ge=0, le=150)

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    created_at: datetime
```

### Validation Rules

- MUST define explicit Field constraints for user inputs
- MUST use `from_attributes=True` for ORM model conversion
- MUST NOT expose internal fields in response models

---

## Configuration with BaseSettings

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    database_url: str
    api_prefix: str = "/api/v1"
    debug: bool = False
    secret_key: str

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

---

## Async Database Access

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

engine = create_async_engine(settings.database_url, echo=settings.debug)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### Database Rules

- MUST use async drivers (asyncpg, aiosqlite)
- MUST NOT use synchronous database calls

---

## Router Organization

```python
# app/routers/users.py
from fastapi import APIRouter, status

router = APIRouter(
    prefix="/users",
    tags=["users"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(user: UserCreate) -> UserResponse:
    ...

# app/main.py
app.include_router(users.router, prefix=settings.api_prefix)
```

---

## Exception Handling

```python
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse

class NotFoundError(Exception):
    def __init__(self, resource: str, id: int):
        self.resource = resource
        self.id = id

@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(
        status_code=404,
        content={"detail": f"{exc.resource} with id {exc.id} not found"},
    )
```

---

## Testing

```python
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.config import get_settings, Settings

def get_settings_override() -> Settings:
    return Settings(database_url="sqlite+aiosqlite:///:memory:")

app.dependency_overrides[get_settings] = get_settings_override

@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

@pytest.mark.asyncio
async def test_create_user(client: AsyncClient):
    response = await client.post(
        "/api/v1/users/",
        json={"email": "test@example.com", "name": "Test", "age": 25},
    )
    assert response.status_code == 201
```

---

## Security Patterns

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = await db.get(User, user_id)
    if user is None:
        raise credentials_exception
    return user
```
