"""
SSE Manager - DKON Standard Pattern
Server-Sent Events connection management and broadcasting
"""

import asyncio
import json
import logging
from typing import Dict, Set, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)


@dataclass
class SSEClient:
    """Represents a connected SSE client"""
    client_id: str
    queue: asyncio.Queue
    connected_at: datetime = field(default_factory=datetime.now)
    
    async def send(self, event: str, data: Any) -> None:
        """Send event to this client"""
        message = {
            "event": event,
            "data": data,
            "id": str(datetime.now().timestamp())
        }
        await self.queue.put(message)


class SSEManager:
    """Manages SSE connections and broadcasts"""
    
    def __init__(self):
        self._clients: Dict[str, SSEClient] = {}
        self._event_handlers: Dict[str, Set[str]] = {}  # event -> client_ids
        self._lock = asyncio.Lock()
        
    async def connect(self, client_id: str) -> SSEClient:
        """Register new SSE client"""
        async with self._lock:
            if client_id in self._clients:
                # Disconnect existing client with same ID
                await self.disconnect(client_id)
            
            client = SSEClient(
                client_id=client_id,
                queue=asyncio.Queue(maxsize=100)
            )
            self._clients[client_id] = client
            
            logger.info(f"SSE client connected: {client_id}")
            
            # Send connection confirmation
            await client.send("connected", {"client_id": client_id})
            
            return client
    
    async def disconnect(self, client_id: str) -> None:
        """Remove SSE client"""
        async with self._lock:
            if client_id in self._clients:
                del self._clients[client_id]
                
                # Remove from all event subscriptions
                for event_clients in self._event_handlers.values():
                    event_clients.discard(client_id)
                
                logger.info(f"SSE client disconnected: {client_id}")
    
    async def subscribe(self, client_id: str, event: str) -> None:
        """Subscribe client to specific event type"""
        async with self._lock:
            if client_id not in self._clients:
                raise ValueError(f"Client {client_id} not connected")
            
            if event not in self._event_handlers:
                self._event_handlers[event] = set()
            
            self._event_handlers[event].add(client_id)
            logger.debug(f"Client {client_id} subscribed to {event}")
    
    async def unsubscribe(self, client_id: str, event: str) -> None:
        """Unsubscribe client from event type"""
        async with self._lock:
            if event in self._event_handlers:
                self._event_handlers[event].discard(client_id)
    
    async def send_to_client(self, client_id: str, event: str, data: Any) -> None:
        """Send event to specific client"""
        async with self._lock:
            if client_id in self._clients:
                await self._clients[client_id].send(event, data)
    
    async def broadcast(self, event: str, data: Any, exclude: Optional[Set[str]] = None) -> None:
        """Broadcast event to all subscribed clients"""
        exclude = exclude or set()
        
        async with self._lock:
            # Get clients subscribed to this event or to "*" (all events)
            target_clients = set()
            
            if event in self._event_handlers:
                target_clients.update(self._event_handlers[event])
            
            if "*" in self._event_handlers:
                target_clients.update(self._event_handlers["*"])
            
            # Send to all target clients
            for client_id in target_clients:
                if client_id not in exclude and client_id in self._clients:
                    await self._clients[client_id].send(event, data)
        
        logger.debug(f"Broadcasted {event} to {len(target_clients)} clients")
    
    async def broadcast_to_all(self, event: str, data: Any) -> None:
        """Broadcast to ALL connected clients regardless of subscription"""
        async with self._lock:
            for client in self._clients.values():
                await client.send(event, data)
    
    @asynccontextmanager
    async def client_handler(self, client_id: str):
        """Context manager for handling client lifecycle"""
        client = await self.connect(client_id)
        try:
            yield client
        finally:
            await self.disconnect(client_id)
    
    def format_sse(self, message: Dict[str, Any]) -> str:
        """Format message for SSE protocol"""
        lines = []
        
        if "id" in message:
            lines.append(f"id: {message['id']}")
        
        if "event" in message:
            lines.append(f"event: {message['event']}")
        
        if "data" in message:
            data = message["data"]
            if isinstance(data, (dict, list)):
                data = json.dumps(data)
            
            for line in str(data).split('\n'):
                lines.append(f"data: {line}")
        
        lines.append("")  # Empty line to end message
        return "\n".join(lines) + "\n"
    
    @property
    def client_count(self) -> int:
        """Get current number of connected clients"""
        return len(self._clients)
    
    @property
    def clients(self) -> Dict[str, SSEClient]:
        """Get connected clients (read-only)"""
        return self._clients.copy()


# Global instance
sse_manager = SSEManager()
