class SessionCache:
    """Redis-backed cache boundary used only as a test-authoring fixture."""

    def __init__(self, redis_client):
        self._redis_client = redis_client

    def save(self, session_id: str, payload: str, ttl_seconds: int) -> None:
        self._redis_client.set(session_id, payload, ex=ttl_seconds)

    def find(self, session_id: str):
        return self._redis_client.get(session_id)
