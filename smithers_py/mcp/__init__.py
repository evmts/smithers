"""MCP (Machine Control Protocol) server implementation for Smithers.

Provides resources, tools, and prompts for interacting with orchestrations.
"""

from smithers_py.mcp.resources import MCPResourceProvider
from smithers_py.mcp.tools import MCPToolProvider, TOOL_DEFINITIONS

__all__ = ["MCPResourceProvider", "MCPToolProvider", "TOOL_DEFINITIONS"]