"""MCP (Machine Control Protocol) server implementation for Smithers.

Provides resources, tools, and prompts for interacting with orchestrations.

Per PRD section 7.8:
- McpCore: Transport-agnostic JSON-RPC handler
- StdioTransport: NDJSON on stdin/stdout for CLI
- HttpTransport: Streamable HTTP with SSE for UI

Security (per PRD 7.8.2):
- Localhost binding only
- Origin header validation
- Bearer token authentication
"""

from smithers_py.mcp.resources import MCPResourceProvider
from smithers_py.mcp.tools import MCPToolProvider, TOOL_DEFINITIONS
from smithers_py.mcp.server import McpCore, McpSession, EventBuffer, JsonRpcError, ErrorCode
from smithers_py.mcp.stdio import StdioTransport, run_stdio_server
from smithers_py.mcp.http import HttpTransport, HttpTransportSecurity, run_http_server
from smithers_py.mcp.notifications import (
    NotificationEmitter,
    FrameCreatedEvent,
    NodeUpdatedEvent,
    TaskUpdatedEvent,
    AgentStreamEvent,
    ApprovalRequestedEvent,
    ExecutionStatusEvent,
)

__all__ = [
    # Resources & Tools
    "MCPResourceProvider",
    "MCPToolProvider", 
    "TOOL_DEFINITIONS",
    # Server Core
    "McpCore",
    "McpSession",
    "EventBuffer",
    "JsonRpcError",
    "ErrorCode",
    # Transports
    "StdioTransport",
    "HttpTransport",
    "HttpTransportSecurity",
    # Notifications
    "NotificationEmitter",
    "FrameCreatedEvent",
    "NodeUpdatedEvent",
    "TaskUpdatedEvent",
    "AgentStreamEvent",
    "ApprovalRequestedEvent",
    "ExecutionStatusEvent",
    # Run functions
    "run_stdio_server",
    "run_http_server",
]