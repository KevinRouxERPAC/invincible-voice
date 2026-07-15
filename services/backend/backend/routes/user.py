import datetime as dt
import logging

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing_extensions import Annotated

from backend import metrics as mt
from backend.app_types import UserSettings
from backend.kyutai_constants import BACKEND_MODE, REDIS_URL, STT_LOCK_TTL_SECONDS
from backend.libs.redis_lock import RedisLockManager
from backend.libs.websockets import report_websocket_exception, run_route
from backend.security import decode_access_token
from backend.storage import (
    UserData,
    get_or_create_anonymous_user,
    get_user_data_from_storage,
)
from backend.text_only_handler import TextOnlyHandler
from backend.timer import Stopwatch

_stt_lock_manager = RedisLockManager(REDIS_URL, STT_LOCK_TTL_SECONDS)

_current_profile = None

PROFILE_ACTIVE = False


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)


bearer_scheme = HTTPBearer()
user_router = APIRouter(prefix="/v1/user", tags=["User"], redirect_slashes=False)


def get_current_user_from_bearer(bearer: str) -> UserData:
    try:
        payload = decode_access_token(bearer)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from None

    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = get_user_data_from_storage(email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> UserData:
    return get_current_user_from_bearer(credentials.credentials)


@user_router.get("/")
def get_me(
    user: Annotated[UserData, Depends(get_current_user)],
) -> UserData:
    return user


@user_router.post("/accept_terms_of_services")
def accept_terms_of_services(user: Annotated[UserData, Depends(get_current_user)]):
    user.user_settings.accepted_terms_of_services = True
    user.save()


@user_router.post("/settings")
def update_user_settings(
    settings: UserSettings,
    user: Annotated[UserData, Depends(get_current_user)],
):
    user.user_settings = settings
    user.save()


@user_router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    user: Annotated[UserData, Depends(get_current_user)],
):
    # conversation_id is client-controlled: reject out-of-range and negative
    # indices so we never raise a 500 or silently delete the wrong conversation
    # (del list[-1] would drop the most recent one).
    if conversation_id < 0 or conversation_id >= len(user.conversations):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    del user.conversations[conversation_id]
    user.save()


@user_router.websocket("/new-conversation")
async def websocket_route(
    websocket: WebSocket,
    local_time: dt.datetime,
    client_stt: bool = False,
):
    user = None
    for protocol in websocket.scope["subprotocols"]:
        if protocol.startswith("Bearer."):
            token = protocol.replace("Bearer.", "")
            user = get_current_user_from_bearer(token)
            break

    if user is None:
        user = get_or_create_anonymous_user()

    logger.info("New WebSocket connection")
    if local_time.tzinfo is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="local_time must be timezone-aware",
        )
    global _last_profile, _current_profile
    mt.SESSIONS.inc()
    mt.ACTIVE_SESSIONS.inc()
    session_watch = Stopwatch()
    if PROFILE_ACTIVE and _current_profile is None:
        from pyinstrument import Profiler

        logger.info("Profiler started.")
        _current_profile = Profiler(interval=0.0001, async_mode="disabled")
        import inspect

        frame = inspect.currentframe()
        while frame is not None and frame.f_back:
            frame = frame.f_back
        _current_profile.start(caller_frame=frame)

    async with _stt_lock_manager.acquire_lock(str(user.email), "stt"):
        try:
            # The `subprotocol` argument is important because the client specifies what
            # protocol(s) it supports and OpenAI uses "realtime" as the value. If we
            # don't set this, the client will think this is not the right endpoint and
            # will not connect.
            await websocket.accept(subprotocol="realtime")

            # When the client does its own STT (Android native path) we can run a
            # lightweight "text-only" backend that doesn't require audio deps.
            if BACKEND_MODE == "text_only" or client_stt:
                handler = TextOnlyHandler(str(user.email), local_time)
            else:
                from backend.unmute_handler import UnmuteHandler

                handler = UnmuteHandler(str(user.email), local_time, client_stt=client_stt)
            async with handler:
                await handler.start_up()
                await run_route(websocket, handler)

        except Exception as exc:
            await report_websocket_exception(websocket, exc)
        finally:
            if _current_profile is not None:
                _current_profile.stop()
                logger.info("Profiler saved.")
                _last_profile = _current_profile
                _current_profile = None

            mt.ACTIVE_SESSIONS.dec()
            mt.SESSION_DURATION.observe(session_watch.time())


@user_router.get("/anonymous")
def get_anonymous_user() -> UserData:
    return get_or_create_anonymous_user()
