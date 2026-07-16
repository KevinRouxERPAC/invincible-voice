import asyncio
import datetime as dt
import uuid
from typing import Any

import pydantic_core

import backend.openai_realtime_api_events as ora
from backend import metrics as mt
from backend.llm.chatbot import Chatbot
from backend.llm.llm_utils import VLLMStream, get_openai_client
from backend.quest_manager import Quest, QuestManager
from backend.storage import UserData, get_user_data_from_storage

FIRST_MESSAGE_TEMPERATURE = 0.7
FURTHER_MESSAGES_TEMPERATURE = 0.3


class TextOnlyHandler:
    """
    Backend handler for the Android "client_stt=true" path.

    In this mode:
    - No audio decoding/encoding is needed.
    - We only process the text events (speaker.text.append, keywords, selection).
    - Output is limited to structured server events like `one.response` and `one.keyword`.

    This exists so the backend can run without the optional audio dependency
    stack (notably `fastrtc` / Opus).
    """

    def __init__(self, user_email_or_data: str | UserData, local_time: dt.datetime):
        self.client_stt = True
        self.output_queue: asyncio.Queue[ora.ServerEvent] = asyncio.Queue()
        self.quest_manager = QuestManager()

        if isinstance(user_email_or_data, str):
            self.user_data = get_user_data_from_storage(user_email_or_data)
        else:
            self.user_data = user_email_or_data

        self.chatbot = Chatbot(self.user_data, start_time=local_time)

        self.tts_voice: str | None = None
        self.last_llm_call_chatbot_proxy_hash: int | None = None

    @property
    def audio_enabled(self) -> bool:
        return False

    async def start_up(self):
        # No-op: text-only mode doesn't require STT/audio pipelines.
        return None

    async def cleanup(self):
        # Mirror UnmuteHandler.cleanup: fold the conversation into the
        # durable memory before persisting.
        from backend.memory import update_memory_from_conversation

        current_convo = self.user_data.conversations[-1]
        update_memory_from_conversation(self.user_data.memory, current_convo)
        self.user_data.save()
        # Schedule LLM-driven refinement in the background (facts + tone).
        try:
            import asyncio

            from backend.memory_llm import consolidate_memory_background

            asyncio.create_task(consolidate_memory_background(self.user_data.email))
        except Exception:
            pass

    def _get_or_create_openai_client(self):
        return get_openai_client()

    async def add_speaker_text(self, message: ora.SpeakerTextAppend) -> None:
        text = message.text.strip()
        if not text:
            return

        # Mirror UnmuteHandler.add_speaker_text
        self.chatbot.add_chat_message_delta(text, "user")

        if self.chatbot.conversation_state_override == "waiting_for_user":
            self.chatbot.conversation_state_override = None

        started_generating_response = await self._generate_response()
        if started_generating_response:
            await self.output_queue.put(ora.InputAudioBufferSpeechStopped())

    async def add_keywords(self, message: ora.CurrentKeywords) -> None:
        self.chatbot.current_keywords = message.keywords
        self.chatbot.current_intent = message.intent
        if (
            self.chatbot.current_keywords is not None
            or self.chatbot.current_intent is not None
        ):
            await self._generate_response()

    async def set_desired_responses_length(
        self, message: ora.DesiredResponsesLenght
    ) -> None:
        self.chatbot.desired_responses_length = message.length
        await self._generate_response()

    async def set_initiating(self, message: ora.InitiateConversation) -> None:
        self.chatbot.initiating = message.active
        self.chatbot.initiating_topic = message.topic
        await self._generate_response()

    async def select_response(self, message_content: str, id_: uuid.UUID):
        self.chatbot.select_response(message_content, id_)
        await self._generate_response()

    async def _generate_response(self) -> bool:
        current_chatbot_proxy_hash = self.chatbot.proxy_hash()
        if self.last_llm_call_chatbot_proxy_hash == current_chatbot_proxy_hash:
            return False
        self.last_llm_call_chatbot_proxy_hash = current_chatbot_proxy_hash

        quest = Quest.from_run_step(
            "llm" + str(dt.datetime.now()), self._generate_response_task
        )
        await self.quest_manager.add(quest)
        return True

    async def _generate_response_task(self):
        # Create timestamp at the start of response generation
        response_generation_timestamp = dt.datetime.now()

        self.chatbot.conversation_state_override = "bot_speaking"
        generating_message_i = len(self.chatbot.current_conversation)

        await self.output_queue.put(
            ora.ResponseCreated(
                response=ora.Response(
                    status="in_progress",
                    voice=self.tts_voice or "missing",
                )
            )
        )

        llm = VLLMStream(
            self._get_or_create_openai_client(),
            temperature=(
                FIRST_MESSAGE_TEMPERATURE
                if generating_message_i == 2
                else FURTHER_MESSAGES_TEMPERATURE
            ),
        )
        messages = self.chatbot.preprocessed_messages()
        start_chatbot_proxy_hash = self.chatbot.proxy_hash()

        all_words: list[str] = []
        number_of_responses_sent = 0
        nb_keywords_sent = 0

        mt.VLLM_ACTIVE_SESSIONS.inc()

        try:
            async for delta in llm.chat_completion(messages):
                current_chatbot_proxy_hash = self.chatbot.proxy_hash()
                if start_chatbot_proxy_hash != current_chatbot_proxy_hash:
                    # State changed; abandon current generation.
                    break

                all_words.append(delta)
                all_text = "".join(all_words)
                if not all_text:
                    continue

                try:
                    json_decoded: Any = pydantic_core.from_json(
                        all_text, allow_partial=True
                    )
                except Exception:
                    continue

                if "suggested_keywords" in json_decoded:
                    for i, keyword in enumerate(json_decoded["suggested_keywords"]):
                        if i < nb_keywords_sent:
                            continue
                        await self.output_queue.put(
                            ora.OneKeyword(
                                content=keyword.strip(),
                                timestamp=response_generation_timestamp,
                                index=nb_keywords_sent,
                            )
                        )
                        nb_keywords_sent += 1

                if "suggested_answers" in json_decoded:
                    for i, answer in enumerate(json_decoded["suggested_answers"]):
                        if i < number_of_responses_sent:
                            continue
                        await self.output_queue.put(
                            ora.OneResponse(
                                content=answer.strip(),
                                timestamp=response_generation_timestamp,
                                index=number_of_responses_sent,
                            )
                        )
                        number_of_responses_sent += 1
        except asyncio.CancelledError:
            mt.VLLM_INTERRUPTS.inc()
            raise
        except Exception:
            mt.VLLM_HARD_ERRORS.inc()
            raise
        finally:
            self.chatbot.conversation_state_override = "waiting_for_user"
            mt.VLLM_ACTIVE_SESSIONS.dec()

    async def __aenter__(self) -> None:
        await self.quest_manager.__aenter__()

    async def __aexit__(self, *exc: Any) -> None:
        await self.quest_manager.__aexit__(*exc)

    async def emit(self) -> ora.ServerEvent | None:
        """Pop the next queued server event, or return None.

        Must actually await (not just get_nowait): emit_loop() calls this in a
        tight `while True`, so a synchronous return would starve the event
        loop and the receive loop would never process incoming messages.
        """
        try:
            return await asyncio.wait_for(self.output_queue.get(), timeout=0.1)
        except (asyncio.TimeoutError, TimeoutError):
            return None
