"""LLM-driven memory refinement.

`memory.py` does the deterministic, synchronous part: pairing speaker turns
with user replies, capping storage. This module does the part that *requires*
understanding language:

1. **Tone profile** — ask the LLM to characterize the user's speaking style
   from a sample of their chosen replies, producing a compact paragraph that
   is injected into every future prompt. This is far cheaper than replaying
   hundreds of past replies, and far more faithful than the old decontextualized
   examples.

2. **Fact extraction** — ask the LLM to pull durable personal facts out of a
   finished conversation ("allergic to penicillin", "was a maths teacher").

Both run **after** a conversation is saved, as a best-effort background task.
They must never block the user from speaking: if the LLM is down, the
existing memory is simply left untouched and retried next time.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
from typing import TYPE_CHECKING

from backend.app_types import SpeakerMessage, WriterMessage
from backend.memory import MAX_FACTS, ToneProfile, UserMemory

if TYPE_CHECKING:
    from openai import AsyncOpenAI

    from backend.storage import UserData

logger = logging.getLogger(__name__)

# Refresh the tone profile at most every N newly-processed conversations.
# Generating it on every single conversation would be wasteful and noisy.
TONE_PROFILE_REFRESH_EVERY = 3

# How many contextual exchanges to feed the tone profiler. More = richer
# profile but slower/costlier. These are already capped in memory, this just
# trims the sample sent to the LLM.
TONE_PROFILE_SAMPLE_SIZE = 12

# How many recent messages from a conversation to send to the fact extractor.
# Facts are usually stated once; sending the whole conversation is overkill.
FACT_EXTRACTION_MESSAGE_CAP = 40


async def _safe_chat_completion(
    client: "AsyncOpenAI",
    messages: list[dict[str, str]],
    *,
    model: str,
    temperature: float = 0.2,
    max_tokens: int = 600,
) -> str | None:
    """Call the LLM, returning None on any failure.

    Memory refinement is best-effort: a failure here must never crash the
    session or prevent the user from speaking. We log and move on.
    """
    try:
        completion = await client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
        )
        return (completion.choices[0].message.content or "").strip() or None
    except Exception as exc:
        logger.warning("Memory refinement LLM call failed: %s", exc)
        return None


async def refresh_tone_profile(
    client: "AsyncOpenAI",
    model: str,
    memory: UserMemory,
    *,
    user_name: str,
    now: dt.datetime | None = None,
) -> bool:
    """Regenerate the textual tone profile from the stored style exchanges.

    Returns True if the profile was updated. The profile is a short paragraph
    in the user's own language describing *how* they speak — vocabulary,
    sentence length, register, recurring formulas — so future suggestions can
    match their voice even when the raw exchanges have scrolled out of the
    prompt window.
    """
    if now is None:
        now = dt.datetime.now(dt.timezone.utc)

    sample = memory.style_exchanges[-TONE_PROFILE_SAMPLE_SIZE:]
    if len(sample) < 3:
        # Not enough signal to characterize a style. Don't overwrite an
        # existing profile with an empty one.
        return False

    examples_block = "\n".join(
        "- Interlocuteur : « "
        + e.speaker_turn
        + " » -> "
        + (user_name or "l'utilisateur")
        + " : « "
        + e.user_reply
        + " »"
        for e in sample
    )

    existing = memory.tone_profile.summary
    prompt = (
        "Tu es un analyste de style. À partir des échanges ci-dessous, "
        "rédige un portrait court (5 à 8 phrases) du style d'expression "
        f"de {user_name or 'cet utilisateur'} : ton, registre, vocabulaire "
        "récurrent, longueur des phrases, tics de langage, niveau de "
        "formalité, humour éventuel. Sois concret et utile pour qu'un "
        "autre modèle puisse imiter cette voix. N'invente rien qui ne "
        "se déduit des exemples. Réponds uniquement avec le portrait, "
        "sans préambule.\n\n"
        f"## Échanges observés\n{examples_block}"
    )
    if existing:
        prompt += f"\n\n## Portrait précédent (à affiner si pertinent)\n{existing}"

    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": "Génère le portrait du style maintenant."},
    ]
    summary = await _safe_chat_completion(
        client, messages, model=model, temperature=0.3, max_tokens=500
    )
    if not summary:
        return False

    memory.tone_profile = ToneProfile(summary=summary, updated_at=now)
    return True


async def extract_facts_from_conversation(
    client: "AsyncOpenAI",
    model: str,
    conversation,
    memory: UserMemory,
) -> bool | None:
    """Pull durable personal facts out of one conversation.

    We feed the LLM a bounded transcript and ask it to return a JSON list of
    short factual statements about the user. Each statement is then folded
    into `memory.facts` (deduplicated by the memory layer).

    Returns:
        - True if at least one new fact was added,
        - False if extraction ran but found nothing new,
        - None if the LLM could not be reached or produced unusable output —
          the caller must NOT mark the conversation processed in that case, so
          it is retried next session.
    """
    messages = conversation.messages[-FACT_EXTRACTION_MESSAGE_CAP:]
    if not messages:
        return False

    transcript_lines: list[str] = []
    for message in messages:
        if isinstance(message, SpeakerMessage):
            transcript_lines.append(f"Locuteur : {message.content.strip()}")
        elif isinstance(message, WriterMessage):
            transcript_lines.append(f"Utilisateur : {message.content.strip()}")
    transcript = "\n".join(transcript_lines)
    if not transcript.strip():
        return False

    prompt = (
        "Analyse la conversation suivante. Extrais les FAITS PERSONNELS "
        "DURABLES sur l'utilisateur (identité, profession, famille, goûts, "
        "santé, habitudes, opinions marquantes). Ignore ce qui est "
        "purement contextuel ou éphémère (ce qu'on mange ce midi, la "
        "météo du jour). Réponds en JSON strict : "
        '{"facts": ["court fait 1", "court fait 2"]}. '
        'Si aucun fait durable n\'apparaît, réponds {"facts": []}.\n\n'
        f"## Conversation\n{transcript}"
    )

    raw = await _safe_chat_completion(
        client,
        [{"role": "system", "content": prompt}],
        model=model,
        temperature=0.1,
        max_tokens=400,
    )
    if not raw:
        # LLM unreachable / empty response: signal "retry", don't swallow it.
        return None

    try:
        # The LLM may wrap JSON in prose or markdown fences; extract the
        # first {...} block defensively.
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        payload = json.loads(raw[start : end + 1])
    except (ValueError, json.JSONDecodeError):
        logger.warning("Fact extraction produced unparseable output: %s", raw)
        return None

    facts = payload.get("facts") if isinstance(payload, dict) else None
    if not isinstance(facts, list):
        # Ran but the shape is wrong (no "facts" list): treat as retryable.
        return None

    now = dt.datetime.now(dt.timezone.utc)
    added = False
    for fact in facts:
        if isinstance(fact, str) and fact.strip():
            before = len(memory.facts)
            memory.add_fact(fact, now)
            if len(memory.facts) > before:
                added = True
    # Hard cap, enforced inside add_fact, but also here in case the list was
    # mutated concurrently.
    if len(memory.facts) > MAX_FACTS:
        memory.facts = memory.facts[-MAX_FACTS:]
    return added


async def consolidate_memory(
    client: "AsyncOpenAI",
    model: str,
    user_data: "UserData",
    *,
    force: bool = False,
) -> bool:
    """Refresh the durable memory for one user.

    Processes any conversations not yet mined (fact extraction), and refreshes
    the tone profile when enough new exchanges have accumulated. Best-effort:
    any LLM failure is logged and swallowed so the caller (a background task
    after `save()`) never crashes.

    Returns True if anything in `user_data.memory` changed, so the caller can
    decide whether to persist.
    """
    from backend.memory import update_memory_from_conversation

    memory = user_data.memory
    changed = False

    for conversation in user_data.conversations:
        # Gate on the FACT marker, not the style marker: cleanup's synchronous
        # style pass already marked this conversation `is_processed`, so gating
        # on that here would skip every conversation and never mine a fact. The
        # two markers are deliberately independent.
        if memory.is_facts_processed(conversation.start_time):
            continue
        try:
            fact_result = await extract_facts_from_conversation(
                client, model, conversation, memory
            )
            # Pair speaker/user turns too, so a conversation that reaches the
            # LLM pass before the sync pass (e.g. a historical backlog) still
            # contributes its style exchanges. Idempotent via its own marker.
            style_changed = update_memory_from_conversation(memory, conversation)
            if fact_result or style_changed:
                changed = True
            if fact_result is None:
                # LLM unavailable: leave the fact marker UNSET so this
                # conversation is retried next session. The style pass has its
                # own marker and won't be redone.
                continue
            memory.mark_facts_processed(conversation.start_time)
            memory.conversations_since_tone_refresh += 1
        except Exception as exc:
            # An unexpected crash — not a transient LLM outage, which
            # `extract_facts_from_conversation` reports as None. Mark the
            # conversation mined so one poison record can't wedge the loop, but
            # still salvage the LLM-free style pairing.
            logger.warning(
                "Failed to process conversation started at %s: %s",
                conversation.start_time,
                exc,
            )
            try:
                if update_memory_from_conversation(memory, conversation):
                    changed = True
            except Exception:
                logger.exception(
                    "Synchronous memory update also failed for conversation "
                    "started at %s; skipping.",
                    conversation.start_time,
                )
            memory.mark_facts_processed(conversation.start_time)
            memory.conversations_since_tone_refresh += 1

    # Refresh the tone profile once enough new conversations have accumulated
    # since the last refresh (cumulative across sessions — see the counter's
    # definition), or when forced (e.g. the user explicitly cleared it).
    needs_refresh = force or (
        memory.conversations_since_tone_refresh >= TONE_PROFILE_REFRESH_EVERY
        and len(memory.style_exchanges) >= 3
    )
    if needs_refresh:
        try:
            if await refresh_tone_profile(
                client,
                model,
                memory,
                user_name=user_data.user_settings.name,
            ):
                changed = True
                memory.conversations_since_tone_refresh = 0
        except Exception as exc:
            logger.warning("Tone profile refresh failed: %s", exc)

    return changed


async def consolidate_memory_background(
    user_email: str,
    *,
    force: bool = False,
) -> None:
    """Fire-and-forget memory consolidation after a session ends.

    Loads the user data fresh (the in-memory copy held by the handler may be
    stale by the time this runs), runs LLM-driven refinement, and persists if
    anything changed. Designed to be scheduled as a background task so it
    never blocks the WebSocket teardown or the next session.

    All failures are caught and logged: this is strictly best-effort. If the
    LLM is unreachable, the user simply keeps their previously consolidated
    memory, and the conversation will be retried next time.
    """
    import logging as _logging

    _log = _logging.getLogger(__name__)
    try:
        from backend.kyutai_constants import LLM_MODEL
        from backend.llm.llm_utils import get_openai_client
        from backend.storage import get_user_data_from_storage

        user_data = get_user_data_from_storage(user_email)
        client = get_openai_client()
        if await consolidate_memory(client, LLM_MODEL, user_data, force=force):
            user_data.save()
            _log.info("Memory consolidated and saved for %s", user_email)
    except Exception:
        _log.exception(
            "Background memory consolidation failed for %s; the existing "
            "memory is unchanged.",
            user_email,
        )
