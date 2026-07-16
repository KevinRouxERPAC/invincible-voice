import datetime as dt
import uuid
from typing import Literal

import pydantic
from pydantic import computed_field


class LLMMessage(pydantic.BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class SpeakerMessage(pydantic.BaseModel):
    speaker: str
    content: str


class WriterMessage(pydantic.BaseModel):
    content: str
    message_id: uuid.UUID  # useful to find the audio file for this message


class Conversation(pydantic.BaseModel):
    messages: list[SpeakerMessage | WriterMessage]
    start_time: dt.datetime
    # Display-only flag: an archived conversation is hidden from the main
    # history list but is not deleted and keeps feeding the durable memory /
    # prompt exactly like any other. Defaults False so existing stored
    # conversations deserialize unchanged.
    archived: bool = False


class Document(pydantic.BaseModel):
    title: str
    content: str


class QuickPhrase(pydantic.BaseModel):
    """A pre-written phrase the user can speak instantly, without going
    through the LLM. Grouped by free-form category in the UI."""

    text: str
    category: str = ""


class Appointment(pydantic.BaseModel):
    """A prepared script for a specific situation (e.g. a doctor's visit): an
    ordered list of phrases the user steps through one by one."""

    title: str
    phrases: list[str] = pydantic.Field(default_factory=list)


class UserSettings(pydantic.BaseModel):
    name: str
    prompt: str
    additional_keywords: list[str]
    friends: list[str]
    documents: list[Document] = pydantic.Field(default_factory=list)
    quick_phrases: list[QuickPhrase] = pydantic.Field(default_factory=list)
    appointments: list[Appointment] = pydantic.Field(default_factory=list)
    voice: str | None = None
    expected_transcription_language: str | None = None
    accepted_terms_of_services: bool = False
    # When True, the LLM is given examples of the user's past chosen phrasings
    # so its suggestions match their style.
    learn_style: bool = True


# Languages supported by the default user settings, see get_new_user()
Language = Literal["en", "fr", "de", "es", "pt"]


class GoogleAuthRequest(pydantic.BaseModel):
    token: str
    language: Language


class HealthStatus(pydantic.BaseModel):
    stt_up: bool
    llm_up: bool

    @computed_field
    @property
    def ok(self) -> bool:
        # Note that voice cloning is not required for the server to be healthy.
        return self.stt_up and self.llm_up


class TTSRequest(pydantic.BaseModel):
    text: str
    message_id: uuid.UUID
    voice_name: str | None = None


class VoiceSelectionRequest(pydantic.BaseModel):
    voice: str
