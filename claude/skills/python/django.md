# Django Framework Patterns

Django-specific patterns and best practices. For general Python workflow, see SKILL.md

## Tool Grid

| Task | Tool | Command |
|------|------|---------|
| Lint | Ruff | `uv run ruff check .` |
| Format | Ruff | `uv run ruff format .` |
| Type check | django-stubs + mypy | `uv run mypy .` |
| Test | pytest-django | `uv run pytest` |
| Dev server | Django | `uv run python manage.py runserver` |

---

## Django 5.x Features

### Composite Primary Keys (Django 5.2+)

```python
from django.db import models

class OrderItem(models.Model):
    order = models.ForeignKey("Order", on_delete=models.CASCADE)
    product = models.ForeignKey("Product", on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.CompositePrimaryKey("order", "product"),
        ]
```

### Async Views

```python
from django.http import JsonResponse

async def fetch_items(request):
    items = [item async for item in Item.objects.filter(active=True)]
    return JsonResponse({"items": [i.name for i in items]})
```

Key async patterns:
- Use `async for` with QuerySets
- Use `await` with `aget()`, `afirst()`, `acount()`, `aexists()`
- Sync ORM calls in async views trigger `SynchronousOnlyOperation` exceptions

---

## Architecture Patterns

### Services Pattern

Business logic MUST NOT reside in views:

```python
# services/order_service.py
from dataclasses import dataclass
from decimal import Decimal
from django.db import transaction

@dataclass
class OrderService:
    @staticmethod
    @transaction.atomic
    def create_order(user, cart_items: list) -> "Order":
        order = Order.objects.create(user=user, status=Order.Status.PENDING)
        for item in cart_items:
            if item.product.stock < item.quantity:
                raise InsufficientStockError(item.product)
            OrderItem.objects.create(
                order=order,
                product=item.product,
                quantity=item.quantity,
                price=item.product.price,
            )
            item.product.stock -= item.quantity
            item.product.save(update_fields=["stock"])
        return order
```

### Selectors Pattern

Query logic MUST be encapsulated in selectors:

```python
# selectors/product_selectors.py
from django.db.models import QuerySet, Q, Prefetch

class ProductSelectors:
    @staticmethod
    def get_active_products() -> QuerySet:
        return Product.objects.filter(
            is_active=True,
            stock__gt=0,
        ).select_related("category")

    @staticmethod
    def search_products(query: str) -> QuerySet:
        return Product.objects.filter(
            Q(name__icontains=query) | Q(description__icontains=query),
            is_active=True,
        )
```

---

## Model Organization

Models MUST follow this field ordering:

```python
from django.db import models
from django.utils.translation import gettext_lazy as _

class Product(models.Model):
    # 1. Primary key (if custom)
    # 2. Foreign keys and relations
    category = models.ForeignKey("Category", on_delete=models.PROTECT, related_name="products")

    # 3. Required fields
    name = models.CharField(_("name"), max_length=200)
    slug = models.SlugField(_("slug"), max_length=200, unique=True)
    price = models.DecimalField(_("price"), max_digits=10, decimal_places=2)

    # 4. Optional fields
    description = models.TextField(_("description"), blank=True)

    # 5. Boolean flags
    is_active = models.BooleanField(_("active"), default=True)

    # 6. Timestamps
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    # 7. Meta class
    class Meta:
        verbose_name = _("product")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["slug"])]

    # 8. String representation
    def __str__(self) -> str:
        return self.name

    # 9. Properties and methods
    @property
    def is_in_stock(self) -> bool:
        return self.stock > 0
```

---

## Settings Organization

```
config/
├── settings/
│   ├── __init__.py      # Imports from environment-specific module
│   ├── base.py          # Shared settings
│   ├── local.py         # Local development
│   ├── production.py    # Production settings
│   └── test.py          # Test settings
```

```python
# config/settings/base.py
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = ["rest_framework", "django_extensions"]
LOCAL_APPS = ["apps.users", "apps.products"]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS
```

---

## URL Patterns

URLs MUST use `include()` and namespacing:

```python
# config/urls.py
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.api.urls", namespace="api-v1")),
    path("products/", include("apps.products.urls", namespace="products")),
]

# apps/products/urls.py
app_name = "products"
urlpatterns = [
    path("", views.ProductListView.as_view(), name="list"),
    path("<slug:slug>/", views.ProductDetailView.as_view(), name="detail"),
]
```

---

## Migrations

1. Migrations MUST be small and focused
2. Migrations MUST be reversible when possible
3. Data migrations MUST be separate from schema migrations

### Making Field Non-Nullable

MUST be done in three migrations:
1. Add nullable field
2. Data migration to populate
3. Alter to non-nullable

---

## Testing

```python
# tests/test_services/test_order_service.py
import pytest
from apps.orders.services import OrderService

@pytest.mark.django_db
class TestOrderService:
    def test_create_order_success(self, user, cart_with_items):
        order = OrderService.create_order(user, cart_with_items)
        assert order.user == user
        assert order.items.count() == len(cart_with_items)

    def test_create_order_insufficient_stock(self, user, cart_with_unavailable_item):
        with pytest.raises(InsufficientStockError):
            OrderService.create_order(user, cart_with_unavailable_item)
```

---

## Security Checklist

- [ ] `DEBUG = False` in production
- [ ] `SECRET_KEY` from environment variable
- [ ] `ALLOWED_HOSTS` configured
- [ ] HTTPS enforced (`SECURE_SSL_REDIRECT = True`)
- [ ] CSRF protection enabled
- [ ] SQL injection prevented (use ORM, not raw SQL)
