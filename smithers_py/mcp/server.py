"""MCP Server Core Implementation.

Implements the core MCP (Model Context Protocol) server that handles
JSON-RPC messages and manages sessions. Transport-agnostic - works with
stdio and HTTP transports.

Per PRD section 7.8.1:
- McpCore handles JSON-RPC request/response
- Composes resources and tools
- Session management
"""

import asyncio
import json
import secrets
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Callable, AsyncIterator
from collections import deque
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict

from .resources import MCPResourceProvider
from .tools import MCPToolProvider, TOOL_DEFINITIONS


logger = logging.getLogger(__name__)


class JsonRpcError(Exception):
    """JSON-RPC error with code and message."""
    
    def __init__(self, code: int, message: str, data: Any = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(message)


class ErrorCode(Enum):
    """Standard JSON-RPC and MCP error codes."""
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603
    # MCP-specific errors
    RESOURCE_NOT_FOUND = -32000
    UNAUTHORIZED = -32001
    SESSION_EXPIRED = -32002


@dataclass
class McpSession:
    """Session state for an MCP connection.
    
    Per PRD section 7.8.3: Track session for resumable event streams.
    """
    session_id: str
    created_at: datetime = field(default_factory=datetime.now)
    last_seen_at: datetime = field(default_factory=datetime.now)
    event_cursor: int = 0
    subscriptions: List[str] = field(default_factory=list)


class EventBuffer:
    """Buffer for server-to-client events with backpressure.
    
    Per PRD section 7.8.4: Bounded buffer with drop policy.
    """
    
    def __init__(self, max_size: int = 1000, drop_policy: str = "oldest"):
        self._buffer: deque = deque(maxlen=max_size)
        self._event_id = 0
        self._drop_policy = drop_policy
        self._lock = asyncio.Lock()
    
    async def push(self, event_type: str, data: Dict[str, Any]) -> int:
        """Add event to buffer. Returns event ID."""
        async with self._lock:
            self._event_id += 1
            event = {
                "id": self._event_id,
                "type": event_type,
                "data": data,
                "timestamp": datetime.now().isoformat()
            }
            
            if len(self._buffer) >= self._buffer.maxlen:
                if self._drop_policy == "newest":
                    return -1
                # oldest: deque handles automatically
            
            self._buffer.append(event)
            return self._event_id
    
    async def get_since(self, cursor: int) -> List[Dict[str, Any]]:
        """Get all events since cursor ID."""
        async with self._lock:
            return [e for e in self._buffer if e["id"] > cursor]
    
    @property
    def last_event_id(self) -> int:
        return self._event_id


class McpCore:
    """Core MCP server handling JSON-RPC protocol.
    
    Transport-agnostic: receives messages and returns responses.
    """
    
    MCP_PROTOCOL_VERSION = "2025-11-25"
    
    def __init__(
        self,
        db_path: str,
        auth_token: Optional[str] = None
    ):
        self.db_path = db_path
        self.auth_token = auth_token or secrets.token_urlsafe(32)
        
        # Providers
        self.resource_provider = MCPResourceProvider(db_path)
        self.tool_provider = MCPToolProvider(db_path)
        
        # Session management
        self._sessions: Dict[str, McpSession] = {}
        self._session_timeout_ms = 300_000  # 5 minutes
        
        # Event buffer for SSE
        self._event_buffer = EventBuffer()
        
        # Method handlers
        self._handlers: Dict[str, Callable] = {
            "initialize": self._handle_initialize,
            "ping": self._handle_ping,
            "resources/list": self._handle_list_resources,
            "resources/read": self._handle_read_resource,
            "tools/list": self._handle_list_tools,
            "tools/call": self._handle_call_tool,
            "prompts/list": self._handle_list_prompts,
            "notifications/subscribe": self._handle_subscribe,
            "notifications/unsubscribe": self._handle_unsubscribe,
        }
    
    async def handle(
        self,
        message: Dict[str, Any],
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Handle a JSON-RPC message.
        
        Args:
            message: Parsed JSON-RPC request
            session_id: Optional session ID from header
            
        Returns:
            JSON-RPC response dict
        """
        try:
            # Validate JSON-RPC structure
            if "jsonrpc" not in message or message.get("jsonrpc") != "2.0":
                raise JsonRpcError(
                    ErrorCode.INVALID_REQUEST.value,
                    "Invalid JSON-RPC version"
                )
            
            method = message.get("method")
            if not method:
                raise JsonRpcError(
                    ErrorCode.INVALID_REQUEST.value,
                    "Missing method"
                )
            
            params = message.get("params", {})
            msg_id = message.get("id")
            
            # Get or create session
            session = self._get_or_create_session(session_id)
            session.last_seen_at = datetime.now()
            
            # Dispatch to handler
            handler = self._handlers.get(method)
            if not handler:
                raise JsonRpcError(
                    ErrorCode.METHOD_NOT_FOUND.value,
                    f"Method not found: {method}"
                )
            
            result = await handler(params, session)
            
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": result
            }
            
        except JsonRpcError as e:
            return {
                "jsonrpc": "2.0",
                "id": message.get("id"),
                "error": {
                    "code": e.code,
                    "message": e.message,
                    "data": e.data
                }
            }
        except Exception as e:
            logger.exception("Internal error handling MCP message")
            return {
                "jsonrpc": "2.0",
                "id": message.get("id"),
                "error": {
                    "code": ErrorCode.INTERNAL_ERROR.value,
                    "message": str(e)
                }
            }
    
    def _get_or_create_session(self, session_id: Optional[str]) -> McpSession:
        """Get existing session or create new one."""
        if session_id and session_id in self._sessions:
            return self._sessions[session_id]
        
        # Create new session
        new_id = session_id or secrets.token_urlsafe(16)
        session = McpSession(session_id=new_id)
        self._sessions[new_id] = session
        return session
    
    async def _handle_initialize(
        self,
        params: Dict[str, Any],
        session: McpSession
    ) -> Dict[str, Any]:
        """Handle initialize request."""
        return {
            "protocolVersion": self.MCP_PROTOCOL_VERSION,
            "capabilities": {
                "resources": {"subscribe": True, "listChanged": True},
                "tools": {},
                "prompts": {},
                "logging": {}
            },
            "serverInfo": {
                "name": "smithers-py",
                "version": "0.1.0"
            },
            "sessionId": session.session_id
        }
    
    async def _handle_ping(
        self,
        params: Dict[str, Any],
        session: McpSession
    ) -> Dict[str, Any]:
        """Handle ping request."""
        return {"pong": True}
    
    async def _handle_list_resources(
        self,
        params: Dict[str, Any],
        session: McpSession
    ) -> Dict[str, Any]:
        """List available resources."""
        return {
            "resources": [
                {
                    "uri": "smithers://executions",
                    "name": "Executions",
                    "description": "List all orchestration executions",
                    "mimeType": "application/json"
                },
                {
                    "uri": "smithers://scripts",
                    "name": "Scripts",
                    "description": "Available orchestration scripts",
                    "mimeType": "application/json"
                },
                {
                    "uri": "smithers://health",
                    "name": "Health",
                    "description": "Server health and rate limit status",
                    "mimeType": "application/json"
                }
            ]
        }
    
    async def _handle_read_resource(
        self,
        params: Dict[str, Any],
        session: McpSession
    ) -> Dict[str, Any]:
        """Read a resource by URI."""
        uri = params.get("uri")
        if not uri:
            raise JsonRpcError(
                ErrorCode.INVALID_PARAMS.value,
                "Missing uri parameter"
            )
        
        resource = self.resource_provider.resolve(uri)
        if resource is None:
            raise JsonRpcError(
                ErrorCode.RESOURCE_NOT_FOUND.value,
                f"Resource not found: {uri}"
            )
        
        return resource.to_response()
    
    async def _handle_list_tools(
        self,
        params: Dict[str, Any],
        session: McpSession
    ) -> Dict[str, Any]:
        """List available tools."""
        return {"tools": TOOL_DEFINITIONS}
    
    async def _handle_call_tool(
        self,
        params: Dict[str, Any],
        session: McpSession
    ) -> Dict[str, Any]:
        """Call a tool."""
        tool_name = params.get("name")
        if not tool_name:
            raise JsonRpcError(
                ErrorCode.INVALID_PARAMS.value,
                "Missing tool name"
            )
        
        arguments = params.get("arguments", {})
        
        # Map tool name to provider method
        tool_method = getattr(self.tool_provider, tool_name, None)
        if not tool_method:
            raise JsonRpcError(
                ErrorCode.METHOD_NOT_FOUND.value,
                f"Unknown tool: {tool_name}"
            )
        
        try:
            # Create params model from tool definitions
            from . import tools as tool_module
            
            # Get parameter class by convention: ToolNameParams
            param_class_name = "".join(
                word.capitalize() for word in tool_name.split("_")
            ) + "Params"
            param_class = getattr(tool_module, param_class_name, None)
            
            if param_class:
                tool_params = param_class(**arguments)
                result = tool_method(tool_params)
            else:
                result = tool_method(**arguments)
            
            # Serialize result
            if hasattr(result, "model_dump"):
                return {"content": [{"type": "json", "json": result.model_dump()}]}
            else:
                return {"content": [{"type": "json", "json": result}]}
                
        except Exception as e:
            logger.exception(f"Tool {tool_name} failed")
            raise JsonRpcError(
                ErrorCode.INTERNAL_ERROR.value,
                f"Tool execution failed: {str(e)}"
            )
    
    async def _handle_list_prompts(
        self,
        params: Dict[str, Any],
        session: McpSession
    ) -> Dict[str, Any]:
        """List available prompts."""
        return {"prompts": []}
    
    async def _handle_subscribe(
        self,
        params: Dict[str, Any],
        session: McpSession
    ) -> Dict[str, Any]:
        """Subscribe to resource changes."""
        uri = params.get("uri")
        if uri and uri not in session.subscriptions:
            session.subscriptions.append(uri)
        return {"subscribed": True}
    
    async def _handle_unsubscribe(
        self,
        params: Dict[str, Any],
        session: McpSession
    ) -> Dict[str, Any]:
        """Unsubscribe from resource changes."""
        uri = params.get("uri")
        if uri and uri in session.subscriptions:
            session.subscriptions.remove(uri)
        return {"unsubscribed": True}
    
    async def emit_event(self, event_type: str, data: Dict[str, Any]) -> int:
        """Emit a server event to all subscribers.
        
        Returns event ID.
        """
        return await self._event_buffer.push(event_type, data)
    
    async def get_events_since(
        self,
        cursor: int,
        session: McpSession
    ) -> List[Dict[str, Any]]:
        """Get events since cursor for session."""
        events = await self._event_buffer.get_since(cursor)
        session.event_cursor = self._event_buffer.last_event_id
        return events
    
    def cleanup(self):
        """Cleanup resources."""
        self.tool_provider.cleanup()
        self._sessions.clear()
