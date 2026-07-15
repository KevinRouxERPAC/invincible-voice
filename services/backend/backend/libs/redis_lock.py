import asyncio
import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import HTTPException, status
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


class RedisLockManager:
    """Manages Redis locks for TTS calls on a per-user basis."""

    def __init__(self, redis_url: str, lock_ttl_seconds: int = 300):
        self.redis_url = redis_url
        self.lock_ttl_seconds = lock_ttl_seconds
        self._client: aioredis.Redis | None = None

    async def get_client(self) -> aioredis.Redis:
        """Get or create the Redis client."""
        if self._client is None:
            self._client = await aioredis.from_url(self.redis_url)
        return self._client

    async def close(self):
        """Close the Redis connection."""
        if self._client:
            await self._client.close()
            self._client = None

    @asynccontextmanager
    async def acquire_lock(self, user_id: str, lock_name: str):
        """Acquire a lock for a given user and operation.

        The lock is released when the context manager exits.

        If Redis is unreachable (e.g. a local/dev backend with no Redis server),
        we degrade gracefully and proceed WITHOUT the lock instead of failing the
        whole request. The lock only serialises concurrent per-user STT/TTS
        operations, which is unnecessary for a single-user setup. In production
        (Redis present) the behaviour is unchanged.
        """
        lock_key = f"{lock_name}:lock:{user_id}"

        # Try to acquire the lock with exponential backoff
        max_retries = 7
        base_delay = 0.1  # 100ms
        max_delay = 4.0  # 4 seconds

        # Phase 1: acquire. Only Redis operations run here, so we can safely
        # treat a Redis failure as "no lock available" without ever swallowing
        # an exception raised by the caller's code (which runs during `yield`).
        acquired = False
        degraded = False
        client: aioredis.Redis | None = None
        try:
            client = await self.get_client()
            for attempt in range(max_retries):
                acquired = await client.set(
                    lock_key, "1", nx=True, ex=self.lock_ttl_seconds
                )
                if acquired:
                    break
                # Lock not acquired, wait and retry with exponential backoff
                delay = min(base_delay * (2**attempt), max_delay)
                logger.debug(
                    f"Failed to acquire {lock_name} lock for user {user_id}, "
                    f"attempt {attempt + 1}/{max_retries}, retrying in {delay:.2f}s"
                )
                await asyncio.sleep(delay)
        except (RedisError, OSError) as exc:
            # Redis is down/unreachable: don't take the whole conversation down
            # with it — run without the lock. Note `redis.exceptions.ConnectionError`
            # does NOT subclass the builtin `ConnectionError` (it's a RedisError),
            # so we must catch RedisError explicitly.
            logger.warning(
                f"Redis unavailable ({exc}); proceeding without {lock_name} "
                f"lock for user {user_id}"
            )
            self._client = None
            client = None
            degraded = True

        # Phase 2: run the caller's body, then release. Kept out of the acquire
        # try/except above so caller exceptions propagate normally.
        if degraded:
            yield
            return

        if not acquired:
            # Max retries reached - lock is still held by someone else.
            logger.warning(
                f"Could not acquire {lock_name} lock for user {user_id} after "
                f"{max_retries} attempts"
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Another {lock_name.upper()} operation is currently in progress. Please wait.",
            )

        try:
            logger.info(f"Acquired {lock_name} lock for user {user_id}")
            yield
        finally:
            try:
                await client.delete(lock_key)
                logger.info(f"Released {lock_name} lock for user {user_id}")
            except (RedisError, OSError):
                # Redis died mid-session; the lock will expire via its TTL.
                pass
