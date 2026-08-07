#!/usr/bin/env python3
"""Provision a user account for InvincibleVoice (Cloud Storage / Cloud Run data).

Self-registration via the app is disabled. Prefer creating accounts in the
deployed app: Paramètres → Administration (admin user).

This script writes directly to KYUTAI_USERS_DATA_PATH (typically a GCS bucket
path such as gs://YOUR-PROJECT-invincible-data). It does not run a local API.

Examples:
  # Password login (requires gcloud auth + KYUTAI_USERS_DATA_PATH in the environment)
  uv run python scripts/create_user.py alice@example.com --password 'secret-long-pw' --language fr

  # Google sign-in only (links Google identity on first login)
  uv run python scripts/create_user.py bob@example.com --google-only --language en
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def _load_repo_env() -> None:
    """Load the repo-root `.env` for shared secrets / paths."""
    repo_root = Path(__file__).resolve().parents[3]
    env_file = repo_root / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
            continue
        key, value = trimmed.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def _ensure_minimal_backend_env() -> None:
    """Defaults so importing backend modules does not require audio/LLM services."""
    for key, value in {
        "STT_IS_GRADIUM": "true",
        "KYUTAI_STT_URL": "wss://eu.api.gradium.ai/api/speech/asr",
        "TTS_IS_GRADIUM": "true",
        "TTS_SERVER": "https://eu.api.gradium.ai/api/",
        "KYUTAI_LLM_API_KEY": "unused-for-provisioning",
        "KYUTAI_LLM_URL": "https://api.cerebras.ai/v1",
        "KYUTAI_LLM_MODEL": "unused",
        "JWT_SECRET_KEY": os.environ.get(
            "JWT_SECRET_KEY", "provisioning-script-unused-jwt"
        ),
    }.items():
        os.environ.setdefault(key, value)

    if not os.environ.get("KYUTAI_USERS_DATA_PATH"):
        print(
            "KYUTAI_USERS_DATA_PATH is required (Cloud Storage path used by Cloud Run),\n"
            "e.g. gs://YOUR-PROJECT-invincible-data\n"
            "Or create users in the deployed app: Paramètres → Administration.",
            file=sys.stderr,
        )
        raise SystemExit(1)


_load_repo_env()
_ensure_minimal_backend_env()

from backend.provisioning import get_new_user
from backend.security import hash_password
from backend.storage import InvalidEmailError, get_user_data_path, validate_email

_LANGUAGES = ("en", "fr", "de", "es", "pt")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create an InvincibleVoice user account (Cloud Run data store).",
    )
    parser.add_argument("email", help="User email address")
    parser.add_argument(
        "--password",
        help="Password for email/password login (min. 10 characters)",
    )
    parser.add_argument(
        "--google-only",
        action="store_true",
        help="Allow Google sign-in only (no password)",
    )
    parser.add_argument(
        "--language",
        default="fr",
        choices=_LANGUAGES,
        help="Default UI language for the new account (default: fr)",
    )
    parser.add_argument(
        "--admin",
        action="store_true",
        help="Grant administrator access",
    )
    args = parser.parse_args()

    try:
        email = validate_email(args.email)
    except InvalidEmailError as exc:
        print(exc, file=sys.stderr)
        return 1

    if get_user_data_path(email).exists():
        print(f"User already exists: {email}", file=sys.stderr)
        return 1

    if args.google_only and args.password:
        print("Use either --password or --google-only, not both.", file=sys.stderr)
        return 1

    if not args.google_only and not args.password:
        print("Provide --password or --google-only.", file=sys.stderr)
        return 1

    if args.password and len(args.password) < 10:
        print("Password must be at least 10 characters long.", file=sys.stderr)
        return 1

    hashed_password = hash_password(args.password) if args.password else ""
    user = get_new_user(
        email,
        args.language,
        hashed_password=hashed_password,
        is_admin=args.admin,
    )
    user.save()

    mode = "Google sign-in" if args.google_only else "email + password"
    admin_note = ", admin" if args.admin else ""
    print(f"Created {email} ({mode}{admin_note}, language={args.language})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
