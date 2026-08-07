import uuid

from backend.app_types import Language, QuickPhrase, UserSettings
from backend.storage import UserData

DEFAULT_USER_NAMES: dict[str, str] = {
    "en": "New user",
    "fr": "Nouvel utilisateur",
    "de": "Neuer Benutzer",
    "es": "Nuevo usuario",
    "pt": "Novo usuário",
}


def is_default_user_name(name: str | None) -> bool:
    if not name:
        return True
    return name.strip() in DEFAULT_USER_NAMES.values()


def get_new_user(
    email: str,
    language: Language,
    hashed_password: str = "",
    google_sub: str | None = None,
    is_admin: bool = False,
) -> UserData:
    # Default name and keywords based on language
    default_names = DEFAULT_USER_NAMES

    default_keywords = {
        "en": [
            "eat",
            "sleep",
            "go out",
            "discuss",
            "think",
            "cinema",
            "theater",
            "yes",
            "no",
            "hello",
            "goodbye",
        ],
        "fr": [
            "manger",
            "dormir",
            "sortir",
            "discuter",
            "réfléchir",
            "cinéma",
            "théâtre",
            "oui",
            "non",
            "bonjour",
            "au revoir",
        ],
        "de": [
            "essen",
            "schlafen",
            "ausgehen",
            "diskutieren",
            "nachdenken",
            "kino",
            "theater",
            "ja",
            "nein",
            "hallo",
            "auf wiedersehen",
        ],
        "es": [
            "comer",
            "dormir",
            "salir",
            "discutir",
            "pensar",
            "cine",
            "teatro",
            "sí",
            "no",
            "hola",
            "adiós",
        ],
        "pt": [
            "comer",
            "dormir",
            "sair",
            "discutir",
            "pensar",
            "cinema",
            "teatro",
            "sim",
            "não",
            "olá",
            "tchau",
        ],
    }

    # (text, category) pairs; the user can edit them freely in the settings
    default_quick_phrases: dict[str, list[tuple[str, str]]] = {
        "en": [
            ("I need help, please.", "Needs"),
            ("I'm thirsty.", "Needs"),
            ("I'm hungry.", "Needs"),
            ("Could you make me more comfortable?", "Comfort"),
            ("Thank you so much!", "Social"),
            ("I'm fine, don't worry.", "Social"),
        ],
        "fr": [
            ("J'ai besoin d'aide, s'il te plaît.", "Besoins"),
            ("J'ai soif.", "Besoins"),
            ("J'ai faim.", "Besoins"),
            ("Peux-tu m'installer plus confortablement ?", "Confort"),
            ("Merci beaucoup !", "Social"),
            ("Ça va, ne t'inquiète pas.", "Social"),
        ],
        "de": [
            ("Ich brauche bitte Hilfe.", "Bedürfnisse"),
            ("Ich habe Durst.", "Bedürfnisse"),
            ("Ich habe Hunger.", "Bedürfnisse"),
            ("Kannst du mich bequemer hinsetzen?", "Komfort"),
            ("Vielen Dank!", "Soziales"),
            ("Mir geht es gut, keine Sorge.", "Soziales"),
        ],
        "es": [
            ("Necesito ayuda, por favor.", "Necesidades"),
            ("Tengo sed.", "Necesidades"),
            ("Tengo hambre.", "Necesidades"),
            ("¿Puedes ponerme más cómodo?", "Comodidad"),
            ("¡Muchas gracias!", "Social"),
            ("Estoy bien, no te preocupes.", "Social"),
        ],
        "pt": [
            ("Preciso de ajuda, por favor.", "Necessidades"),
            ("Estou com sede.", "Necessidades"),
            ("Estou com fome.", "Necessidades"),
            ("Podes pôr-me mais confortável?", "Conforto"),
            ("Muito obrigado!", "Social"),
            ("Estou bem, não te preocupes.", "Social"),
        ],
    }

    return UserData(
        user_id=uuid.uuid4(),
        email=email,
        google_sub=google_sub,
        hashed_password=hashed_password,
        is_admin=is_admin,
        user_settings=UserSettings(
            # Fall back to English in case an unsupported language slips through
            name=default_names.get(language, default_names["en"]),
            prompt="",
            additional_keywords=default_keywords.get(language, default_keywords["en"]),
            friends=[],
            quick_phrases=[
                QuickPhrase(text=text, category=category)
                for text, category in default_quick_phrases.get(
                    language, default_quick_phrases["en"]
                )
            ],
        ),
        conversations=[],
    )
