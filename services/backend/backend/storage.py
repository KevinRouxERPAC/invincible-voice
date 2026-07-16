import logging
import os
import re
import uuid
from typing import Literal

import humanize
import pydantic
from cloudpathlib import AnyPath

from backend import kyutai_constants
from backend import openai_realtime_api_events as ora
from backend.app_types import (
    Conversation,
    LLMMessage,
    SpeakerMessage,
    UserSettings,
    WriterMessage,
)
from backend.kyutai_constants import NB_RESPONSES
from backend.llm.system_prompt import BASE_SYSTEM_PROMPT
from backend.memory import (
    MAX_DOCUMENT_CHARS_IN_PROMPT,
    UserMemory,
    prune_conversations,
    select_relevant_past_conversations,
)

logger = logging.getLogger(__name__)


LENGHT_TO_NB_WORDS = {
    "XS": (1, 5),
    "S": (3, 10),
    "M": (5, 15),
    "L": (8, 20),
    "XL": (12, 25),
}

# Cap how many past conversations are replayed into the system prompt. Without
# this, every turn re-sends the user's entire history, so suggestions get slower
# and more expensive the longer the user has used the app — the opposite of the
# product's "fast suggestions" goal. The current conversation is always kept;
# this bounds how many *previous* ones are included. Tunable via env.
MAX_PAST_CONVERSATIONS_IN_PROMPT = int(
    os.environ.get("MAX_PAST_CONVERSATIONS_IN_PROMPT", "10")
)


class UserData(pydantic.BaseModel):
    user_id: uuid.UUID
    email: str
    hashed_password: str | None
    google_sub: str | None

    user_settings: UserSettings
    conversations: list[Conversation]
    # Durable, distilled memory layer: personal facts, contextual style
    # exchanges, and the LLM-generated tone profile. Derived from
    # conversations, so it can always be rebuilt. Older conversations can be
    # pruned from `conversations` without losing their distilled knowledge.
    memory: UserMemory = pydantic.Field(default_factory=UserMemory)

    def save(self) -> None:
        # Prune raw history before persisting. The distilled facts and style
        # live in self.memory, so dropping old transcripts loses no knowledge
        # but keeps save()/load() fast as the user accumulates history.
        self.conversations = prune_conversations(self.conversations)
        user_data_path = get_user_data_path(self.email)
        user_data_path.parent.mkdir(parents=True, exist_ok=True)
        with user_data_path.open("w") as f:
            f.write(self.model_dump_json(indent=4))
        logger.info(f"User data saved to {user_data_path}")

    def to_llm_ready_conversation(
        self,
        user_text_hint: str | None,
        desired_responses_length: ora.ResponsesLenght,
        initiating: bool = False,
        user_intent: str | None = None,
        initiating_topic: str | None = None,
    ) -> list[LLMMessage]:
        result = []

        prompt = BASE_SYSTEM_PROMPT + "\n"
        prompt += "\n"
        prompt += "## Nom de l'utilisateur\n"
        prompt += f"L'utilisateur est {self.user_settings.name}.\n\n"
        prompt += "## Prompt de l'utilisateur\n"
        prompt += self.user_settings.prompt + "\n\n"
        prompt += "## Amis de l'utilisateur\n"
        prompt += f"Les amis de l'utilisateur sont : {self.user_settings.friends}\n\n"
        if self.user_settings.additional_keywords:
            prompt += "## Mots-clés fréquemment utilisés par l'utilisateur\n"
            prompt += (
                "Ce sont des mots que l'utilisateur emploie souvent au quotidien. Prenez-les "
                "en compte quand ils sont pertinents pour la conversation : "
                f"{', '.join(self.user_settings.additional_keywords)}\n\n"
            )

        # --- Durable memory layer ------------------------------------------------
        # Personal facts and the tone profile are distilled from ALL past
        # conversations, not just the bounded window replayed below. They are
        # what keeps the user's identity intact once raw transcripts scroll
        # out of the prompt. This is the core of "same tone, same knowledge".
        if self.memory.facts:
            prompt += "## Ce que vous savez de façon durable sur l'utilisateur\n"
            prompt += (
                "Ces faits ont été extraits des conversations passées et restent vrais "
                "d'une session à l'autre. Utilisez-les pour que vos réponses reflètent "
                "qui est l'utilisateur :\n"
            )
            for fact in self.memory.facts:
                prompt += f"* {fact.text}\n"
            prompt += "\n"

        if self.user_settings.learn_style and self.memory.tone_profile.summary:
            prompt += "## Portrait du style de l'utilisateur\n"
            prompt += (
                "Voici la voix de l'utilisateur, caractérisée à partir de ce qu'il a "
                "réellement choisi de dire par le passé. Imitez ce style dans chaque "
                "réponse suggérée — ton, vocabulaire, longueur des phrases, registre :\n"
            )
            prompt += f"{self.memory.tone_profile.summary}\n\n"

        prompt += "## Documents de l'utilisateur\n"
        prompt += "Les documents sont là pour mieux comprendre l'utilisateur\n\n"
        for i, document in enumerate(self.user_settings.documents):
            prompt += f"### Document {i + 1} « {document.title} »\n"
            # Cap each document's content so a single huge document can't
            # blow up every prompt. The on-device builder already does this;
            # the server path now matches it.
            content = document.content
            if len(content) > MAX_DOCUMENT_CHARS_IN_PROMPT:
                content = content[:MAX_DOCUMENT_CHARS_IN_PROMPT] + " […]"
            prompt += f"{content}\n\n"
        if self.user_settings.learn_style:
            # Contextual exchanges: each user reply is paired with the speaker
            # turn it answered, so the LLM learns the *relation* (how the
            # user reacts), not just isolated sentences. Falls back to the
            # legacy decontextualized examples if no exchanges have been
            # consolidated yet.
            exchanges = self.memory.style_exchanges
            if len(exchanges) >= 3:
                prompt += "## Comment l'utilisateur aime formuler les choses\n"
                prompt += (
                    "Voici des échanges réels : ce que le locuteur a dit, suivi de la "
                    "réponse que l'utilisateur a choisie. Reproduisez son ton, son "
                    "vocabulaire et la longueur habituelle de ses phrases — sans copier "
                    "mot pour mot, sauf si cela convient à la conversation en cours.\n"
                )
                for exchange in exchanges:
                    prompt += (
                        f"* Locuteur : « {exchange.speaker_turn} » → "
                        f"{self.user_settings.name} : « {exchange.user_reply} »\n"
                    )
                prompt += "\n"
            else:
                style_examples = self._chosen_style_examples()
                if len(style_examples) >= 3:
                    prompt += "## Comment l'utilisateur aime formuler les choses\n"
                    prompt += (
                        "Voici des phrases que l'utilisateur a réellement choisies de dire par le passé. "
                        "Utilisez-les pour reproduire son ton, son vocabulaire et la longueur habituelle "
                        "de ses phrases quand vous écrivez les réponses suggérées — sans les copier "
                        "mot pour mot, sauf si cela convient à la conversation en cours.\n"
                    )
                    for example in style_examples:
                        prompt += f"* {example}\n"
                    prompt += "\n"
        prompt += "## Conversations passées avec dates\n"
        prompt += "Les conversations ici ont eu lieu avec le logiciel et sont montrées pour vous donner"
        prompt += "du contexte sur l'utilisateur\n\n"

        # Keep the current conversation (always the last one) plus a bounded
        # set of previous ones. Selection is relevance-based (keyword overlap
        # with the current conversation) so past discussions of the *same
        # topic* surface even if they're older than the chronological window.
        current_conversation = self.conversations[-1] if self.conversations else None
        if current_conversation is not None:
            past_for_prompt = select_relevant_past_conversations(
                self.conversations,
                current_conversation,
                max_count=MAX_PAST_CONVERSATIONS_IN_PROMPT,
            )
            # Present oldest-to-newest for natural reading, then the current.
            ordered = list(past_for_prompt) + [current_conversation]
        else:
            ordered = []
        for conversation in ordered:
            if len(conversation.messages) == 0:
                continue
            readable_datetime = conversation.start_time.strftime(
                "%A, %B %d, %Y at %H:%M"  # Monday, July 07, 2025 at 14:56
            )
            if conversation is self.conversations[-1]:
                prompt += "## Conversation en cours avec l'utilisateur\n\n"
            else:
                delta = self.conversations[-1].start_time - conversation.start_time
                readable_delta = f"(il y a {humanize.naturaldelta(delta)})"
                prompt += (
                    f"### Conversation du {readable_datetime} {readable_delta}\n\n"
                )

            for message in conversation.messages:
                if isinstance(message, SpeakerMessage):
                    prompt += f"* Locuteur : {message.content.strip()}\n"
                else:
                    prompt += (
                        f"* {self.user_settings.name} dit : {message.content.strip()}\n"
                    )

        prompt += "## Longueur souhaitée des réponses\n"

        min_nb_words, max_nb_words = LENGHT_TO_NB_WORDS[desired_responses_length]
        prompt += f"Chaque réponse doit comporter entre {min_nb_words} et {max_nb_words} mots.\n\n"
        prompt += (
            "## Mots-clés et directives de l'utilisateur pour orienter vos réponses\n\n"
        )
        if user_intent == "directive":
            prompt += f"L'utilisateur vous a donné une instruction directe pour les prochaines réponses : « {user_text_hint} ». Suivez cette instruction de près pour générer {NB_RESPONSES} réponses suggérées.\n\n"
        elif user_text_hint is not None or user_intent is not None:
            prompt += "L'utilisateur a choisi les mots-clés et intentions suivants pour orienter les réponses :\n"
            if user_text_hint:
                prompt += f"- Mots-clés : {user_text_hint}\n"
            if user_intent:
                prompt += f"- Intention/Action : {user_intent} (vous DEVEZ formuler vos réponses pour correspondre à cette intention précise, à partir des mots-clés).\n"
            prompt += f"Utilisez ces concepts dans **toutes** vos {NB_RESPONSES} réponses suggérées.\n\n"

        if initiating:
            prompt += "\n\n## Mode initiation\n"
            prompt += (
                "L'utilisateur veut PRENDRE LA PAROLE plutôt que répondre. Oubliez l'idée "
                f"de répondre à un locuteur : proposez plutôt {NB_RESPONSES} choses que l'utilisateur pourrait DIRE "
                "pour démarrer ou orienter la conversation — salutations, questions, requêtes "
                "ou affirmations qui ouvrent un sujet. "
            )
            if initiating_topic:
                prompt += f"L'utilisateur veut SPÉCIFIQUEMENT aborder le sujet : {initiating_topic}. Assurez-vous que vos {NB_RESPONSES} suggestions soient des amorces liées à ce sujet. "
            prompt += (
                "Suivez les mots-clés, le persona "
                "et les documents de l'utilisateur quand ils indiquent une direction. Gardez les "
                "suggestions de mots-clés comme des sujets liés que l'utilisateur pourrait vouloir aborder.\n"
            )

        _add_to_llm_ready_conversation(result, "system", prompt)
        return result

    def _chosen_style_examples(self, limit: int = 12) -> list[str]:
        """The most recent sentences the user actually chose to say, across past
        conversations (deduplicated, oldest-to-newest). Used to teach the LLM the
        user's phrasing style."""
        seen: set[str] = set()
        examples: list[str] = []
        # Skip the current (last) conversation: it has no finalized choices yet.
        for conversation in self.conversations[:-1]:
            for message in conversation.messages:
                if not isinstance(message, WriterMessage):
                    continue
                text = message.content.strip()
                if not text or text in seen:
                    continue
                seen.add(text)
                examples.append(text)
        return examples[-limit:]


def _add_to_llm_ready_conversation(
    llm_ready_conversation: list[LLMMessage],
    role: Literal["user", "assistant", "system"],
    content: str,
) -> None:
    if len(llm_ready_conversation) == 0 or llm_ready_conversation[-1].role != role:
        llm_ready_conversation.append(LLMMessage(role=role, content=content))
    else:
        llm_ready_conversation[-1].content += f"\n{content}"


# Strict allowlist of email characters: the email is user-controlled and used to
# build a file path, so anything that could escape USERS_SETTINGS_AND_HISTORY_DIR
# (path separators, "..", URL schemes for AnyPath, ...) must be rejected.
_EMAIL_REGEX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+")


class InvalidEmailError(ValueError):
    pass


def validate_email(email: str) -> str:
    if ".." in email or not _EMAIL_REGEX.fullmatch(email):
        raise InvalidEmailError(f"Invalid email address: {email!r}")
    return email


def get_user_data_path(email: str) -> AnyPath:
    validate_email(email)
    return kyutai_constants.USERS_SETTINGS_AND_HISTORY_DIR / f"{email}.json"


class UserDataNotFoundError(Exception):
    pass


def get_user_data_from_storage(user_email: str) -> UserData:
    user_data_path = get_user_data_path(user_email)
    if not user_data_path.exists():
        raise UserDataNotFoundError(f"No user data found for email: {user_email}")
    else:
        return UserData.model_validate_json(user_data_path.read_text())


ANONYMOUS_EMAIL = "anonymous@invincible-voice.local"


def get_or_create_anonymous_user() -> UserData:
    try:
        return get_user_data_from_storage(ANONYMOUS_EMAIL)
    except UserDataNotFoundError:
        user = UserData(
            user_id=uuid.uuid4(),
            email=ANONYMOUS_EMAIL,
            hashed_password=None,
            google_sub=None,
            # UserSettings' first four fields are required (no defaults), so an
            # anonymous user needs explicit empty values, mirroring the app's
            # DEFAULT_SETTINGS.
            user_settings=UserSettings(
                name="",
                prompt="",
                additional_keywords=[],
                friends=[],
            ),
            conversations=[],
        )
        user.save()
        return user
