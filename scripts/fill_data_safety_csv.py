"""Fill Google Play Data Safety CSV for InvincibleVoice.

Output matches Play Console sample format:
- no UTF-8 BOM
- CRLF line endings
- TRUE / FALSE (uppercase) in Response value
"""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data_safety_sample.csv"
OUT = ROOT / "data_safety_sample_filled.csv"
PRIVACY = "https://invinciblevoice-81c67.web.app/privacy"


def main() -> None:
    with SRC.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise SystemExit("CSV has no header")
        rows = list(reader)

    for row in rows:
        row["Response value"] = ""

    def set_answer(question_id: str, response_id: str, value: str) -> None:
        for row in rows:
            if row["Question ID (machine readable)"] != question_id:
                continue
            if (
                response_id == ""
                or row["Response ID (machine readable)"] == response_id
            ):
                row["Response value"] = value
                return
        raise KeyError(f"Missing row: {question_id} / {response_id!r}")

    def set_mc(question_id: str, response_ids: set[str]) -> None:
        for row in rows:
            if row["Question ID (machine readable)"] != question_id:
                continue
            rid = row["Response ID (machine readable)"]
            row["Response value"] = "TRUE" if rid in response_ids else ""

    set_answer("PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA", "", "TRUE")
    set_answer("PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT", "", "TRUE")
    set_mc("PSL_SUPPORTED_ACCOUNT_CREATION_METHODS", {"PSL_ACM_NONE"})
    set_mc("PSL_SUPPORT_DATA_DELETION_BY_USER", {"DATA_DELETION_YES"})
    # PSL_ACCOUNT_DELETION_URL only applies when users can create accounts in-app.
    # With PSL_ACM_NONE, leave it blank.
    set_answer("PSL_DATA_DELETION_URL", "", PRIVACY)
    set_answer("PSL_HAS_OUTSIDE_APP_ACCOUNTS", "", "TRUE")
    set_mc("PSL_OUTSIDE_APP_ACCOUNT_TYPES", {"PSL_OUTSIDE_APP_ACCOUNT_TYPE_OTHER"})
    set_answer(
        "PSL_OUTSIDE_APP_ACCOUNT_TYPE_SPECIFY",
        "",
        "Accounts are provisioned by an administrator outside the app. "
        "Users then sign in with email/password or Google OAuth.",
    )

    collected: dict[str, set[str]] = {
        "PSL_DATA_TYPES_PERSONAL": {"PSL_NAME", "PSL_EMAIL", "PSL_USER_ACCOUNT"},
        "PSL_DATA_TYPES_AUDIO": {"PSL_AUDIO"},
        "PSL_DATA_TYPES_EMAIL_AND_TEXT": {"PSL_OTHER_MESSAGES"},
    }
    for question in [
        "PSL_DATA_TYPES_PERSONAL",
        "PSL_DATA_TYPES_FINANCIAL",
        "PSL_DATA_TYPES_LOCATION",
        "PSL_DATA_TYPES_SEARCH_AND_BROWSING",
        "PSL_DATA_TYPES_EMAIL_AND_TEXT",
        "PSL_DATA_TYPES_PHOTOS_AND_VIDEOS",
        "PSL_DATA_TYPES_AUDIO",
        "PSL_DATA_TYPES_HEALTH_AND_FITNESS",
        "PSL_DATA_TYPES_CONTACTS",
        "PSL_DATA_TYPES_CALENDAR",
        "PSL_DATA_TYPES_APP_PERFORMANCE",
        "PSL_DATA_TYPES_FILES_AND_DOCS",
        "PSL_DATA_TYPES_APP_ACTIVITY",
        "PSL_DATA_TYPES_IDENTIFIERS",
    ]:
        set_mc(question, collected.get(question, set()))

    def fill_data_type(
        dtype: str,
        *,
        ephemeral: bool,
        required: bool,
        purposes: list[str],
    ) -> None:
        prefix = f"PSL_DATA_USAGE_RESPONSES:{dtype}:"
        set_mc(
            prefix + "PSL_DATA_USAGE_COLLECTION_AND_SHARING",
            {"PSL_DATA_USAGE_ONLY_COLLECTED"},
        )
        set_answer(
            prefix + "PSL_DATA_USAGE_EPHEMERAL",
            "",
            "TRUE" if ephemeral else "FALSE",
        )
        control = (
            "PSL_DATA_USAGE_USER_CONTROL_REQUIRED"
            if required
            else "PSL_DATA_USAGE_USER_CONTROL_OPTIONAL"
        )
        set_mc(prefix + "DATA_USAGE_USER_CONTROL", {control})
        set_mc(prefix + "DATA_USAGE_COLLECTION_PURPOSE", set(purposes))
        for row in rows:
            if (
                row["Question ID (machine readable)"]
                == prefix + "DATA_USAGE_SHARING_PURPOSE"
            ):
                row["Response value"] = ""

    fill_data_type(
        "PSL_NAME",
        ephemeral=False,
        required=False,
        purposes=[
            "PSL_APP_FUNCTIONALITY",
            "PSL_PERSONALIZATION",
            "PSL_ACCOUNT_MANAGEMENT",
        ],
    )
    fill_data_type(
        "PSL_EMAIL",
        ephemeral=False,
        required=True,
        purposes=[
            "PSL_APP_FUNCTIONALITY",
            "PSL_ACCOUNT_MANAGEMENT",
            "PSL_FRAUD_PREVENTION_SECURITY",
        ],
    )
    fill_data_type(
        "PSL_USER_ACCOUNT",
        ephemeral=False,
        required=True,
        purposes=[
            "PSL_APP_FUNCTIONALITY",
            "PSL_ACCOUNT_MANAGEMENT",
            "PSL_FRAUD_PREVENTION_SECURITY",
        ],
    )
    fill_data_type(
        "PSL_AUDIO",
        ephemeral=False,
        required=True,
        purposes=["PSL_APP_FUNCTIONALITY"],
    )
    fill_data_type(
        "PSL_OTHER_MESSAGES",
        ephemeral=False,
        required=True,
        purposes=["PSL_APP_FUNCTIONALITY", "PSL_PERSONALIZATION"],
    )

    with OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)

    raw = OUT.read_bytes()
    sample_header = SRC.read_bytes().splitlines()[0]
    filled_header = raw.splitlines()[0]
    print(f"Wrote {OUT}")
    print(f"Header matches sample: {sample_header == filled_header}")
    print(f"Has BOM: {raw.startswith(bytes([0xEF, 0xBB, 0xBF]))}")
    print(f"Uses CRLF: {chr(13).encode() + chr(10).encode() in raw}")
    print(f"Filled cells: {sum(1 for r in rows if r['Response value'])}")


if __name__ == "__main__":
    main()
