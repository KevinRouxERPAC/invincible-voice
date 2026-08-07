import os

from backend.storage import UserData


def get_admin_emails() -> set[str]:
    raw = os.environ.get("ADMIN_EMAILS", "")
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def is_admin_user(user: UserData) -> bool:
    return user.is_admin


def apply_admin_bootstrap(user: UserData) -> UserData:
    """Promote bootstrap admin emails on first authenticated access."""
    if (
        user.email.lower() in get_admin_emails()
        and not user.is_admin
        and not user.admin_bootstrap_locked
    ):
        user.is_admin = True
        user.save()
    return user


def lock_admin_bootstrap(user: UserData) -> None:
    """Prevent ADMIN_EMAILS from re-promoting a user after admin revocation."""
    user.admin_bootstrap_locked = True
