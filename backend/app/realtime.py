"""Native WebSocket fan-out for live slot and booking updates.

Deliberately a plain WebSocket (not Socket.IO) so the browser can connect with
the built-in `new WebSocket(...)` -- no client library, no protocol mismatch.
"""
import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)
        logger.info("websocket connected (%d live)", len(self._connections))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)
        logger.info("websocket disconnected (%d live)", len(self._connections))

    async def broadcast(self, event: str, payload: Any) -> None:
        """Send to every live client, dropping any that have gone away.

        Iterates over a copy: a send failure mutates the set, and mutating
        during iteration would raise.
        """
        message = json.dumps({"event": event, "payload": payload})
        async with self._lock:
            targets = list(self._connections)

        dead: list[WebSocket] = []
        for connection in targets:
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)

        if dead:
            async with self._lock:
                for connection in dead:
                    self._connections.discard(connection)

    @property
    def count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()
