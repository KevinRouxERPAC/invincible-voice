from backend.routes.auth import get_new_user
from backend.typing import QuickPhrase, UserSettings


def test_user_settings_parses_without_quick_phrases():
    # Data saved before the quick_phrases field existed must still load
    settings = UserSettings.model_validate(
        {
            "name": "Alice",
            "prompt": "",
            "additional_keywords": [],
            "friends": [],
        }
    )
    assert settings.quick_phrases == []


def test_user_settings_round_trips_quick_phrases():
    settings = UserSettings(
        name="Alice",
        prompt="",
        additional_keywords=[],
        friends=[],
        quick_phrases=[QuickPhrase(text="J'ai soif.", category="Besoins")],
    )
    reloaded = UserSettings.model_validate(settings.model_dump())
    assert reloaded.quick_phrases == settings.quick_phrases


def test_new_user_gets_localized_quick_phrases():
    user_fr = get_new_user("alice@example.com", "fr")
    assert user_fr.user_settings.quick_phrases
    assert any("aide" in phrase.text for phrase in user_fr.user_settings.quick_phrases)

    user_unknown = get_new_user("bob@example.com", "xx")  # type: ignore[arg-type]
    assert user_unknown.user_settings.quick_phrases
    assert any(
        "help" in phrase.text for phrase in user_unknown.user_settings.quick_phrases
    )
