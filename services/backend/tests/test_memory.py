"""Tests for the durable memory layer (`backend.memory`).

Covers the core product guarantee: a person who can no longer speak must keep
the **same tone** and the **same knowledge**. The memory module distills
facts and style exchanges from conversations so they survive past the bounded
prompt replay window.
"""

import datetime as dt
import types
import uuid

import pytest

from backend.app_types import (
    Conversation,
    SpeakerMessage,
    WriterMessage,
)
from backend.memory import (
    MAX_FACTS,
    MAX_STYLE_EXCHANGES,
    UserMemory,
    extract_style_exchanges_from_conversation,
    has_minimal_signal,
    prune_conversations,
    select_relevant_past_conversations,
    update_memory_from_conversation,
)


def _when(days_ago: int = 0) -> dt.datetime:
    base = dt.datetime(2025, 1, 1, tzinfo=dt.timezone.utc)
    return base + dt.timedelta(days=days_ago)


def _writer(text: str) -> WriterMessage:
    return WriterMessage(message_id=uuid.uuid4(), content=text)


def _conv(messages: list, when: dt.datetime) -> Conversation:
    return Conversation(messages=messages, start_time=when)


# --- Style exchange extraction ------------------------------------------------


def test_pairs_speaker_turn_with_user_reply():
    messages = [
        SpeakerMessage(speaker="Friend", content="Tu veux un café ?"),
        _writer("Oui, volontiers, un petit noir."),
        SpeakerMessage(speaker="Friend", content="On y va ?"),
        _writer("J'arrive de suite."),
    ]
    exchanges = extract_style_exchanges_from_conversation(messages)
    assert len(exchanges) == 2
    assert exchanges[0].speaker_turn == "Tu veux un café ?"
    assert exchanges[0].user_reply == "Oui, volontiers, un petit noir."
    # Two consecutive speaker lines fuse into one turn.
    assert exchanges[1].speaker_turn == "On y va ?"


def test_consecutive_speaker_lines_fuse_into_one_turn():
    messages = [
        SpeakerMessage(speaker="Friend", content="Salut."),
        SpeakerMessage(speaker="Friend", content="Comment ça va ?"),
        _writer("Ça va bien, merci."),
    ]
    exchanges = extract_style_exchanges_from_conversation(messages)
    assert len(exchanges) == 1
    assert exchanges[0].speaker_turn == "Salut. Comment ça va ?"


def test_writer_without_preceding_speaker_yields_no_exchange():
    # A reply with no speaker turn to anchor it carries no relational signal.
    messages = [_writer("Bonjour à tous.")]
    assert extract_style_exchanges_from_conversation(messages) == []


# --- update_memory_from_conversation ------------------------------------------


def test_update_memory_is_idempotent():
    memory = UserMemory()
    conv = _conv(
        [
            SpeakerMessage(speaker="Friend", content="Tu viens ce soir ?"),
            _writer("Oui, je serai là à huit heures."),
        ],
        _when(1),
    )
    assert update_memory_from_conversation(memory, conv) is True
    assert update_memory_from_conversation(memory, conv) is False
    assert len(memory.style_exchanges) == 1


def test_update_memory_skips_trivial_replies():
    memory = UserMemory()
    conv = _conv(
        [
            SpeakerMessage(speaker="Friend", content="Tu veux un café ?"),
            _writer("Oui"),  # 1 word, skipped
        ],
        _when(1),
    )
    update_memory_from_conversation(memory, conv)
    assert memory.style_exchanges == []


def test_update_memory_marks_conversation_processed_even_without_signal():
    memory = UserMemory()
    conv = _conv([], _when(1))  # empty conversation
    update_memory_from_conversation(memory, conv)
    assert memory.is_processed(conv.start_time)


# --- Fact dedup and capping --------------------------------------------------


def test_add_fact_deduplicates_case_insensitively():
    memory = UserMemory()
    now = _when(0)
    memory.add_fact("Je suis allergique à la pénicilline.", now)
    memory.add_fact("je suis allergique à la pénicilline", now)
    assert len(memory.facts) == 1


def test_add_fact_caps_at_max():
    memory = UserMemory()
    now = _when(0)
    for i in range(MAX_FACTS + 10):
        memory.add_fact(f"Fact number {i}", now)
    assert len(memory.facts) == MAX_FACTS
    # The most recent ones are kept.
    assert memory.facts[-1].text == f"Fact number {MAX_FACTS + 9}"


def test_add_style_exchange_caps_at_max():
    memory = UserMemory()
    for i in range(MAX_STYLE_EXCHANGES + 5):
        memory.add_style_exchange(
            f"Speaker turn {i}", f"User reply with enough words {i}"
        )
    assert len(memory.style_exchanges) == MAX_STYLE_EXCHANGES


# --- prune_conversations -----------------------------------------------------


def test_prune_keeps_most_recent():
    convs = [
        _conv([SpeakerMessage(speaker="X", content=str(i))], _when(i))
        for i in range(10)
    ]
    pruned = prune_conversations(convs)
    assert len(pruned) == 10  # under cap


def test_prune_drops_oldest_over_cap(monkeypatch):
    monkeypatch.setattr("backend.memory.MAX_STORED_CONVERSATIONS", 3)
    convs = [
        _conv([SpeakerMessage(speaker="X", content=str(i))], _when(i)) for i in range(5)
    ]
    pruned = prune_conversations(convs)
    assert len(pruned) == 3
    # Oldest dropped, newest kept.
    assert pruned[0].messages[0].content == "2"
    assert pruned[-1].messages[0].content == "4"


# --- Relevance-based retrieval -----------------------------------------------


def test_relevance_prefers_same_topic_over_more_recent():
    current = _conv(
        [
            SpeakerMessage(
                speaker="Doc", content="On va parler jardinage aujourd'hui."
            ),
            _writer("Parfait, mes tomates poussent bien."),
        ],
        _when(10),
    )
    # An old conversation about gardening.
    gardening = _conv(
        [
            SpeakerMessage(speaker="Friend", content="Comment va ton jardin ?"),
            _writer("Les tomates sont magnifiques cette année."),
        ],
        _when(1),
    )
    # A more recent but unrelated conversation.
    weather = _conv(
        [
            SpeakerMessage(speaker="Friend", content="Il fait beau aujourd'hui."),
            _writer("Oui le soleil est radieux."),
        ],
        _when(9),
    )
    selected = select_relevant_past_conversations(
        [gardening, weather, current], current, max_count=1
    )
    assert gardening in selected
    assert weather not in selected


def test_relevance_tops_up_with_recent_when_no_overlap():
    current = _conv(
        [
            SpeakerMessage(speaker="X", content="Quantique physique"),
            _writer("Très intéressant tout ça."),
        ],
        _when(5),
    )
    other = _conv(
        [
            SpeakerMessage(speaker="Y", content="Recette de cuisine italienne"),
            _writer("J adore les pâtes fraiches."),
        ],
        _when(4),
    )
    selected = select_relevant_past_conversations(
        [other, current], current, max_count=1
    )
    # No overlap, but we still return one conversation (the recent fallback).
    assert len(selected) == 1


def test_relevance_excludes_current_conversation():
    current = _conv(
        [
            SpeakerMessage(speaker="X", content="jardinage tomates"),
            _writer("mes tomates sont superbes"),
        ],
        _when(5),
    )
    selected = select_relevant_past_conversations([current], current, max_count=5)
    assert selected == []


def test_has_minimal_signal():
    assert not has_minimal_signal([])
    assert not has_minimal_signal([SpeakerMessage(speaker="X", content="Hello")])
    assert has_minimal_signal(
        [
            SpeakerMessage(speaker="X", content="Hello"),
            _writer("Salut toi"),
        ]
    )


# --- Prompt integration -------------------------------------------------------


def test_prompt_includes_facts_when_present():
    from backend.routes.auth import get_new_user

    user = get_new_user("facts@example.com", "fr")
    user.memory.add_fact("Je suis allergique à la pénicilline.", _when(0))
    messages = user.to_llm_ready_conversation(None, "M")
    prompt = messages[0].content
    assert "allergique à la pénicilline" in prompt
    assert "Ce que vous savez de façon durable" in prompt


def test_prompt_includes_tone_profile_when_present():
    from backend.routes.auth import get_new_user

    user = get_new_user("tone@example.com", "fr")
    user.memory.tone_profile.summary = (
        "L'utilisateur parle de manière directe et concise."
    )
    messages = user.to_llm_ready_conversation(None, "M")
    prompt = messages[0].content
    assert "directe et concise" in prompt
    assert "Portrait du style" in prompt


def test_prompt_includes_contextual_exchanges_when_available():
    from backend.routes.auth import get_new_user

    user = get_new_user("exch@example.com", "fr")
    user.memory.add_style_exchange(
        "Tu veux un café ?", "Oui, un petit noir s'il te plaît."
    )
    user.memory.add_style_exchange("On sort ?", "Avec plaisir, laisse-moi mon manteau.")
    user.memory.add_style_exchange(
        "Ça va ?", "Plutôt bien aujourd'hui, merci beaucoup."
    )
    messages = user.to_llm_ready_conversation(None, "M")
    prompt = messages[0].content
    assert "Tu veux un café ?" in prompt
    assert "Oui, un petit noir s'il te plaît." in prompt


def test_prompt_caps_document_content_length(monkeypatch):
    from backend.app_types import Document
    from backend.routes.auth import get_new_user

    user = get_new_user("doc@example.com", "fr")
    user.user_settings.documents = [
        Document(title="Big", content="x" * 10000),
    ]
    # storage.py imported the constant by value, so patch it there.
    monkeypatch.setattr("backend.storage.MAX_DOCUMENT_CHARS_IN_PROMPT", 100)
    messages = user.to_llm_ready_conversation(None, "M")
    prompt = messages[0].content
    # The cap + the ellipsis marker.
    assert "x" * 101 not in prompt
    assert " […]" in prompt


def test_prompt_uses_relevance_for_past_conversations():
    from backend.routes.auth import get_new_user

    user = get_new_user("rel@example.com", "fr")
    base = _when(0)
    # Current conversation about gardening.
    user.conversations.append(
        _conv(
            [
                SpeakerMessage(speaker="Friend", content="Comment va ton jardin ?"),
                _writer("Les tomates poussent bien."),
            ],
            base + dt.timedelta(days=10),
        )
    )
    # Old, topically related conversation.
    user.conversations.insert(
        0,
        _conv(
            [
                SpeakerMessage(speaker="Friend", content="Tu arroses ton jardin ?"),
                _writer("Oui les tomates chaque soir."),
            ],
            base,
        ),
    )
    # Recent, unrelated conversation.
    user.conversations.insert(
        1,
        _conv(
            [
                SpeakerMessage(speaker="Friend", content="Il pleut beaucoup."),
                _writer("Oui c'est l'automne."),
            ],
            base + dt.timedelta(days=9),
        ),
    )
    messages = user.to_llm_ready_conversation(None, "M")
    prompt = messages[0].content
    # The gardening conversation is preferred over the weather one.
    assert "arroses ton jardin" in prompt


# --- LLM consolidation integration -------------------------------------------
#
# These exercise the full flow the handlers run: the synchronous style pass at
# cleanup, then the background LLM pass. They guard the regression where the
# sync pass marked a conversation "processed" and thereby locked the LLM pass
# out, so no fact was ever extracted for a new conversation.


class _FakeCompletions:
    def __init__(self, content: str | None):
        self._content = content
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        message = types.SimpleNamespace(content=self._content)
        choice = types.SimpleNamespace(message=message)
        return types.SimpleNamespace(choices=[choice])


class _FakeOpenAIClient:
    """Minimal stand-in for AsyncOpenAI returning a fixed completion body."""

    def __init__(self, content: str | None):
        self.chat = types.SimpleNamespace(completions=_FakeCompletions(content))


@pytest.mark.asyncio
async def test_facts_extracted_after_synchronous_style_pass():
    from backend.memory_llm import consolidate_memory
    from backend.routes.auth import get_new_user

    user = get_new_user("integration@example.com", "fr")
    conv = _conv(
        [
            SpeakerMessage(speaker="Doc", content="Parlez-moi de votre parcours."),
            _writer("J'ai enseigné les mathématiques pendant vingt ans."),
        ],
        _when(1),
    )
    user.conversations.append(conv)

    # 1. The synchronous cleanup pass marks the conversation STYLE-processed.
    update_memory_from_conversation(user.memory, conv)
    assert user.memory.is_processed(conv.start_time)
    assert not user.memory.is_facts_processed(conv.start_time)

    # 2. The background LLM pass must still mine it for facts — the regression
    #    was that it skipped every already-style-processed conversation.
    client = _FakeOpenAIClient(
        '{"facts": ["A enseigné les mathematiques pendant 20 ans"]}'
    )
    changed = await consolidate_memory(client, "fake-model", user)

    assert changed is True
    assert any("math" in fact.text.lower() for fact in user.memory.facts)
    assert user.memory.is_facts_processed(conv.start_time)


@pytest.mark.asyncio
async def test_fact_pass_retries_when_llm_unavailable():
    from backend.memory_llm import consolidate_memory
    from backend.routes.auth import get_new_user

    user = get_new_user("retry@example.com", "fr")
    conv = _conv(
        [
            SpeakerMessage(speaker="Doc", content="Comment allez-vous ?"),
            _writer("Je me sens plutôt bien aujourd'hui, merci."),
        ],
        _when(1),
    )
    user.conversations.append(conv)
    update_memory_from_conversation(user.memory, conv)

    # Empty LLM response == service unavailable. The conversation must NOT be
    # marked fact-processed, so it is retried next session.
    client = _FakeOpenAIClient(None)
    await consolidate_memory(client, "fake-model", user)

    assert user.memory.facts == []
    assert not user.memory.is_facts_processed(conv.start_time)


@pytest.mark.asyncio
async def test_tone_profile_refreshes_after_enough_conversations():
    from backend.memory_llm import TONE_PROFILE_REFRESH_EVERY, consolidate_memory
    from backend.routes.auth import get_new_user

    user = get_new_user("tone-refresh@example.com", "fr")
    # Enough exchanges already distilled for a profile to be meaningful.
    for i in range(3):
        user.memory.add_style_exchange(
            f"Question numéro {i} posée ?", f"Réponse construite numéro {i} donnée."
        )
    # The cumulative counter has reached the threshold across past sessions.
    user.memory.conversations_since_tone_refresh = TONE_PROFILE_REFRESH_EVERY

    client = _FakeOpenAIClient("Portrait : l'utilisateur parle de façon posée.")
    changed = await consolidate_memory(client, "fake-model", user)

    assert changed is True
    assert user.memory.tone_profile.summary is not None
    assert "posée" in user.memory.tone_profile.summary
    # Counter reset so the profile isn't regenerated every single session.
    assert user.memory.conversations_since_tone_refresh == 0
