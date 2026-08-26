from x_research.models import XUser


def test_user_normalizes_handle() -> None:
    user = XUser(id="1", handle="@Example")
    assert user.handle == "example"
