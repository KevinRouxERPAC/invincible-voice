import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing_extensions import Annotated

from backend.admin_access import (
    apply_admin_bootstrap,
    is_admin_user,
    lock_admin_bootstrap,
)
from backend.app_types import Language
from backend.kyutai_constants import USERS_SETTINGS_AND_HISTORY_DIR
from backend.provisioning import get_new_user
from backend.routes.user import get_current_user
from backend.security import hash_password
from backend.storage import (
    ANONYMOUS_EMAIL,
    InvalidEmailError,
    UserData,
    UserDataNotFoundError,
    get_user_data_from_storage,
    get_user_data_path,
    validate_email,
)

logger = logging.getLogger(__name__)
admin_router = APIRouter(prefix="/v1/admin", tags=["Admin"])


def get_current_admin_user(
    user: Annotated[UserData, Depends(get_current_user)],
) -> UserData:
    user = apply_admin_bootstrap(user)
    if not is_admin_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


class AdminUserSummary(BaseModel):
    email: str
    is_admin: bool
    has_password: bool
    has_google: bool
    display_name: str


class AdminCreateUserRequest(BaseModel):
    email: str
    password: str | None = None
    google_only: bool = False
    language: Language = "fr"
    is_admin: bool = False


class AdminUpdateUserRequest(BaseModel):
    is_admin: bool | None = None
    password: str | None = None


def _to_summary(user: UserData) -> AdminUserSummary:
    return AdminUserSummary(
        email=user.email,
        is_admin=is_admin_user(user),
        has_password=bool(user.hashed_password),
        has_google=user.google_sub is not None,
        display_name=user.user_settings.name,
    )


def _list_user_summaries() -> list[AdminUserSummary]:
    summaries: list[AdminUserSummary] = []
    for path in sorted(USERS_SETTINGS_AND_HISTORY_DIR.glob("*.json")):
        email = path.stem
        if email == ANONYMOUS_EMAIL:
            continue
        try:
            user = get_user_data_from_storage(email)
        except (InvalidEmailError, UserDataNotFoundError):
            logger.warning("Skipping unreadable user file: %s", path)
            continue
        summaries.append(_to_summary(user))
    return summaries


@admin_router.get("/users")
def list_users(
    _admin: Annotated[UserData, Depends(get_current_admin_user)],
) -> list[AdminUserSummary]:
    return _list_user_summaries()


@admin_router.post("/users")
def create_user(
    body: AdminCreateUserRequest,
    admin: Annotated[UserData, Depends(get_current_admin_user)],
) -> AdminUserSummary:
    try:
        email = validate_email(body.email)
    except InvalidEmailError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email address",
        ) from None

    if get_user_data_path(email).exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already exists",
        )

    if body.google_only and body.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use either password or google_only, not both",
        )

    if not body.google_only and not body.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide a password or set google_only",
        )

    if body.password and len(body.password) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 10 characters long",
        )

    hashed_password = hash_password(body.password) if body.password else ""
    user = get_new_user(
        email,
        body.language,
        hashed_password=hashed_password,
        is_admin=body.is_admin,
    )
    user.save()
    logger.info("Admin %s created user %s", admin.email, email)
    return _to_summary(user)


@admin_router.patch("/users/{email}")
def update_user(
    email: str,
    body: AdminUpdateUserRequest,
    admin: Annotated[UserData, Depends(get_current_admin_user)],
) -> AdminUserSummary:
    try:
        normalized_email = validate_email(email)
    except InvalidEmailError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email address",
        ) from None

    try:
        user = get_user_data_from_storage(normalized_email)
    except UserDataNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        ) from None

    if body.is_admin is not None:
        if normalized_email.lower() == admin.email.lower() and not body.is_admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot remove your own admin access",
            )
        user.is_admin = body.is_admin
        if not body.is_admin:
            lock_admin_bootstrap(user)

    if body.password is not None:
        if len(body.password) < 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 10 characters long",
            )
        user.hashed_password = hash_password(body.password)

    user.save()
    logger.info("Admin %s updated user %s", admin.email, normalized_email)
    return _to_summary(user)


@admin_router.delete("/users/{email}")
def delete_user(
    email: str,
    admin: Annotated[UserData, Depends(get_current_admin_user)],
) -> dict[str, str]:
    try:
        normalized_email = validate_email(email)
    except InvalidEmailError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email address",
        ) from None

    if normalized_email.lower() == admin.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account",
        )

    user_data_path = get_user_data_path(normalized_email)
    if not user_data_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user_data_path.unlink()
    logger.info("Admin %s deleted user %s", admin.email, normalized_email)
    return {"status": "deleted"}
