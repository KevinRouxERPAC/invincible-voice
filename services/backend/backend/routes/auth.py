import os

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing_extensions import Annotated

from backend.app_types import GoogleAuthRequest
from backend.kyutai_constants import ALLOW_PASSWORD, GOOGLE_CLIENT_ID
from backend.libs.google import verify_google_token
from backend.libs.rate_limit import rate_limit
from backend.provisioning import (
    get_new_user,  # noqa: F401 — re-exported for tests/tools
)
from backend.security import create_access_token, verify_password
from backend.storage import (
    InvalidEmailError,
    UserDataNotFoundError,
    get_user_data_from_storage,
    validate_email,
)

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])

# Per-IP cap on authentication attempts within a 60s window. Tunable via env so
# operators can tighten it on a public deployment. Applied to login, register
# and Google sign-in to blunt brute-force and abuse.
_AUTH_RATE_PER_MINUTE = int(os.environ.get("AUTH_RATE_LIMIT_PER_MINUTE", "10"))
_auth_rate_limit = rate_limit("auth", _AUTH_RATE_PER_MINUTE, 60.0)


@auth_router.post("/login")
def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    _rate_limited: Annotated[None, Depends(_auth_rate_limit)] = None,
):
    if not ALLOW_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password-based login is disabled",
        )
    try:
        user = get_user_data_from_storage(validate_email(form_data.username))
    except (InvalidEmailError, UserDataNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        ) from None

    if not user.hashed_password or not verify_password(
        form_data.password, user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    token = create_access_token({"sub": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
    }


@auth_router.post("/register")
def register(
    _form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    _rate_limited: Annotated[None, Depends(_auth_rate_limit)] = None,
):
    # Accounts are provisioned by an operator (see scripts/create_user.py).
    # End-user self-registration is intentionally disabled.
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Registration is disabled. Contact your administrator.",
    )


@auth_router.post("/google")
def google_login(
    data: GoogleAuthRequest,
    _rate_limited: Annotated[None, Depends(_auth_rate_limit)] = None,
):
    if not GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID == "REPLACE_ME":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on this server",
        )
    google_user = verify_google_token(data.token)

    email = google_user["email"]

    try:
        user = get_user_data_from_storage(email)
    except UserDataNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account not provisioned",
        ) from None

    if user.google_sub is None:
        if user.hashed_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account exists, login with password",
            )
        # Google-only account provisioned by an operator: link on first sign-in.
        user.google_sub = google_user["sub"]
        user.save()
    elif user.google_sub != google_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account mismatch",
        )

    jwt_token = create_access_token({"sub": user.email})

    return {
        "access_token": jwt_token,
        "token_type": "bearer",
    }


@auth_router.get("/allow-password")
def allow_password() -> dict[str, bool]:
    return {"allow_password": ALLOW_PASSWORD}


@auth_router.get("/google-client-id")
def google_client_id() -> dict[str, str]:
    return {"google_client_id": GOOGLE_CLIENT_ID}
