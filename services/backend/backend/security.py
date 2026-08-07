import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from pwdlib import PasswordHash

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", None)
if JWT_SECRET_KEY is None:
    raise Exception("Missing JWT_SECRET_KEY env for JWT encoding")

ALGORITHM = "HS256"
# Access-token lifetime. This is a daily-use AAC tool on the user's personal
# device: a 30-minute token forced a fresh login on almost every launch, which
# is unacceptable for someone who relies on the app to speak. The default now
# matches the client cookie lifetime (90 days) so a single sign-in lasts, and
# any 401 still clears the token and returns the user to login. Tunable via the
# ACCESS_TOKEN_EXPIRE_MINUTES env var for deployments that want a shorter window.
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 90))
)

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
