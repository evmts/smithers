"""Streamable HTTP Transport for MCP Server.

Implements the Streamable HTTP transport for MCP with security requirements:
- Localhost binding only
- Origin header validation  
- Bearer token authentication

Per PRD sections 7.8.1, 7.8.2, 10.1:
- Single /mcp endpoint
- POST for JSON-RPC requests (responds JSON or SSE)
- GET for SSE event stream
"""

import asyncio
import json
import secrets
import logging
import fnmatch
import re
from dataclasses import dataclass
from datetime import datetime
from http import HTTPStatus
from typing import Any, Dict, List, Optional, AsyncIterator
from urllib.parse import urlparse

from .server import McpCore, JsonRpcError, ErrorCode


logger = logging.getLogger(__name__)


class SecurityError(Exception):
    """Security validation error."""
    pass


class AuthError(Exception):
    """Authentication error."""
    pass


@dataclass
class HttpRequest:
    """HTTP request representation."""
    method: str
    path: str
    headers: Dict[str, str]
    body: bytes
    query_params: Dict[str, str]


@dataclass
class HttpResponse:
    """HTTP response representation."""
    status: int
    headers: Dict[str, str]
    body: bytes
    
    @classmethod
    def json(cls, data: Any, status: int = 200) -> "HttpResponse":
        """Create JSON response."""
        body = json.dumps(data).encode('utf-8')
        return cls(
            status=status,
            headers={
                "Content-Type": "application/json",
                "Content-Length": str(len(body))
            },
            body=body
        )
    
    @classmethod
    def error(cls, message: str, status: int = 400) -> "HttpResponse":
        """Create error response."""
        return cls.json({"error": message}, status)


class HttpTransportSecurity:
    """Security validation for HTTP transport.
    
    Per PRD section 7.8.2:
    - Must bind to localhost only
    - Must validate Origin header
    - Auth: random bearer token
    """
    
    def __init__(self, auth_token: str):
        self.bind_address = "127.0.0.1"
        self.allowed_origins = [
            "http://localhost:*",
            "http://127.0.0.1:*",
            "null"  # For file:// or Electron apps
        ]
        self.auth_token = auth_token
    
    def validate_request(self, request: HttpRequest) -> None:
        """Validate request security.
        
        Raises:
            SecurityError: If origin not allowed
            AuthError: If auth invalid
        """
        # Check Origin header
        origin = request.headers.get("origin") or request.headers.get("Origin")
        if origin and not self._origin_allowed(origin):
            raise SecurityError(f"Origin {origin} not allowed")
        
        # Check auth token
        auth = request.headers.get("authorization") or request.headers.get("Authorization")
        if not auth or auth != f"Bearer {self.auth_token}":
            raise AuthError("Invalid or missing auth token")
    
    def _origin_allowed(self, origin: str) -> bool:
        """Check if origin matches allowed patterns."""
        for pattern in self.allowed_origins:
            if pattern == origin:
                return True
            # Handle wildcard patterns like http://localhost:*
            if "*" in pattern:
                regex = pattern.replace("*", ".*")
                if re.match(regex, origin):
                    return True
        return False


class SseStream:
    """Server-Sent Events stream writer."""
    
    def __init__(self, write_fn):
        self._write = write_fn
        self._closed = False
    
    async def send_event(
        self,
        data: Dict[str, Any],
        event_type: Optional[str] = None,
        event_id: Optional[int] = None
    ) -> None:
        """Send an SSE event."""
        if self._closed:
            return
        
        lines = []
        if event_id is not None:
            lines.append(f"id: {event_id}")
        if event_type:
            lines.append(f"event: {event_type}")
        
        # Data must be on its own line(s)
        data_str = json.dumps(data)
        lines.append(f"data: {data_str}")
        lines.append("")  # Blank line to end event
        
        message = "\n".join(lines) + "\n"
        await self._write(message.encode('utf-8'))
    
    async def send_comment(self, text: str) -> None:
        """Send an SSE comment (for keepalive)."""
        if self._closed:
            return
        await self._write(f": {text}\n".encode('utf-8'))
    
    def close(self) -> None:
        """Close the stream."""
        self._closed = True


class HttpTransport:
    """Streamable HTTP transport for MCP server.
    
    Implements MCP Streamable HTTP spec:
    - POST /mcp: JSON-RPC requests
    - GET /mcp: SSE event stream
    """
    
    def __init__(
        self,
        core: McpCore,
        port: int = 8080,
        host: str = "127.0.0.1"
    ):
        self.core = core
        self.port = port
        self.host = host
        
        self.security = HttpTransportSecurity(core.auth_token)
        self._server: Optional[asyncio.AbstractServer] = None
        self._sse_clients: List[SseStream] = []
    
    async def handle_request(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter
    ) -> None:
        """Handle an HTTP request."""
        try:
            # Read request line
            request_line = await reader.readline()
            if not request_line:
                return
            
            parts = request_line.decode('utf-8').strip().split(' ')
            if len(parts) < 2:
                await self._send_response(writer, HttpResponse.error("Bad request", 400))
                return
            
            method, path = parts[0], parts[1]
            
            # Parse query params from path
            query_params = {}
            if '?' in path:
                path, query_string = path.split('?', 1)
                for param in query_string.split('&'):
                    if '=' in param:
                        k, v = param.split('=', 1)
                        query_params[k] = v
            
            # Read headers
            headers = {}
            while True:
                line = await reader.readline()
                if line == b'\r\n' or line == b'\n':
                    break
                if b':' in line:
                    key, value = line.decode('utf-8').strip().split(':', 1)
                    headers[key.strip().lower()] = value.strip()
            
            # Read body if Content-Length present
            body = b''
            content_length = headers.get('content-length')
            if content_length:
                body = await reader.read(int(content_length))
            
            request = HttpRequest(
                method=method,
                path=path,
                headers=headers,
                body=body,
                query_params=query_params
            )
            
            # Route request
            response = await self._route_request(request, writer)
            if response:
                await self._send_response(writer, response)
                
        except Exception as e:
            logger.exception(f"Request handling error: {e}")
            try:
                await self._send_response(
                    writer,
                    HttpResponse.error(str(e), 500)
                )
            except:
                pass
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except:
                pass
    
    async def _route_request(
        self,
        request: HttpRequest,
        writer: asyncio.StreamWriter
    ) -> Optional[HttpResponse]:
        """Route request to appropriate handler."""
        # Health check (no auth required)
        if request.path == "/health":
            return HttpResponse.json({"status": "ok"})
        
        # Validate security for all other endpoints
        try:
            self.security.validate_request(request)
        except SecurityError as e:
            return HttpResponse.error(str(e), 403)
        except AuthError as e:
            return HttpResponse(
                status=401,
                headers={
                    "Content-Type": "application/json",
                    "WWW-Authenticate": "Bearer"
                },
                body=json.dumps({"error": str(e)}).encode('utf-8')
            )
        
        # MCP endpoint
        if request.path == "/mcp":
            if request.method == "POST":
                return await self._handle_mcp_post(request)
            elif request.method == "GET":
                return await self._handle_mcp_get(request, writer)
            else:
                return HttpResponse.error("Method not allowed", 405)
        
        return HttpResponse.error("Not found", 404)
    
    async def _handle_mcp_post(self, request: HttpRequest) -> HttpResponse:
        """Handle POST /mcp - JSON-RPC request."""
        session_id = request.headers.get("mcp-session-id")
        
        try:
            message = json.loads(request.body.decode('utf-8'))
        except json.JSONDecodeError as e:
            return HttpResponse.json({
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {e}"}
            })
        
        response = await self.core.handle(message, session_id)
        
        # Add session ID header if present in response
        result = response.get("result", {})
        resp_session_id = result.get("sessionId") if isinstance(result, dict) else None
        
        http_response = HttpResponse.json(response)
        if resp_session_id:
            http_response.headers["MCP-Session-Id"] = resp_session_id
        
        return http_response
    
    async def _handle_mcp_get(
        self,
        request: HttpRequest,
        writer: asyncio.StreamWriter
    ) -> Optional[HttpResponse]:
        """Handle GET /mcp - SSE event stream."""
        session_id = request.headers.get("mcp-session-id")
        last_event_id = request.headers.get("last-event-id")
        
        session = self.core._get_or_create_session(session_id)
        
        # Parse Last-Event-ID for resumption
        cursor = 0
        if last_event_id:
            try:
                cursor = int(last_event_id)
            except ValueError:
                pass
        
        # Send SSE headers
        headers = [
            "HTTP/1.1 200 OK",
            "Content-Type: text/event-stream",
            "Cache-Control: no-cache",
            "Connection: keep-alive",
            f"MCP-Session-Id: {session.session_id}",
            "",
            ""
        ]
        writer.write("\r\n".join(headers).encode('utf-8'))
        await writer.drain()
        
        # Create SSE stream
        async def write_fn(data: bytes):
            writer.write(data)
            await writer.drain()
        
        stream = SseStream(write_fn)
        self._sse_clients.append(stream)
        
        try:
            # Send any missed events
            missed_events = await self.core.get_events_since(cursor, session)
            for event in missed_events:
                await stream.send_event(
                    event["data"],
                    event_type=event["type"],
                    event_id=event["id"]
                )
            
            # Keep connection alive
            while not stream._closed:
                # Send keepalive every 30s
                await asyncio.sleep(30)
                await stream.send_comment("keepalive")
                
        except (ConnectionError, asyncio.CancelledError):
            pass
        finally:
            stream.close()
            if stream in self._sse_clients:
                self._sse_clients.remove(stream)
        
        return None  # Response already sent
    
    async def _send_response(
        self,
        writer: asyncio.StreamWriter,
        response: HttpResponse
    ) -> None:
        """Send HTTP response."""
        status_text = HTTPStatus(response.status).phrase
        lines = [f"HTTP/1.1 {response.status} {status_text}"]
        
        for key, value in response.headers.items():
            lines.append(f"{key}: {value}")
        
        lines.append("")
        
        header_bytes = "\r\n".join(lines).encode('utf-8') + b"\r\n"
        writer.write(header_bytes)
        writer.write(response.body)
        await writer.drain()
    
    async def broadcast_event(
        self,
        event_type: str,
        data: Dict[str, Any]
    ) -> None:
        """Broadcast event to all SSE clients."""
        event_id = await self.core.emit_event(event_type, data)
        
        for stream in self._sse_clients[:]:  # Copy to avoid mutation during iteration
            try:
                await stream.send_event(data, event_type=event_type, event_id=event_id)
            except:
                stream.close()
                if stream in self._sse_clients:
                    self._sse_clients.remove(stream)
    
    async def start(self) -> None:
        """Start the HTTP server."""
        self._server = await asyncio.start_server(
            self.handle_request,
            self.host,
            self.port
        )
        
        logger.info(f"MCP HTTP server listening on http://{self.host}:{self.port}/mcp")
        logger.info(f"Auth token: {self.core.auth_token}")
        
        async with self._server:
            await self._server.serve_forever()
    
    async def stop(self) -> None:
        """Stop the HTTP server."""
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        
        # Close all SSE clients
        for stream in self._sse_clients:
            stream.close()
        self._sse_clients.clear()
        
        self.core.cleanup()


async def run_http_server(
    db_path: str,
    port: int = 8080,
    host: str = "127.0.0.1",
    auth_token: Optional[str] = None
) -> None:
    """Run MCP server with HTTP transport.
    
    Args:
        db_path: Path to SQLite database
        port: Port to listen on (default 8080)
        host: Host to bind to (default localhost only)
        auth_token: Optional auth token (generated if not provided)
    """
    import sys
    
    core = McpCore(db_path, auth_token)
    
    # Print auth token to stderr for parent process
    print(f"AUTH_TOKEN={core.auth_token}", file=sys.stderr)
    print(f"MCP_URL=http://{host}:{port}/mcp", file=sys.stderr)
    sys.stderr.flush()
    
    transport = HttpTransport(core, port, host)
    
    try:
        await transport.start()
    except asyncio.CancelledError:
        pass
    finally:
        await transport.stop()


def main():
    """CLI entry point for HTTP MCP server."""
    import argparse
    import sys
    
    parser = argparse.ArgumentParser(description="Smithers MCP Server (HTTP)")
    parser.add_argument(
        "--db",
        default=".smithers/db.sqlite",
        help="Path to SQLite database"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="Port to listen on"
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to bind to (default: localhost only)"
    )
    parser.add_argument(
        "--auth-token",
        help="Auth token (generated if not provided)"
    )
    
    args = parser.parse_args()
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        stream=sys.stderr
    )
    
    asyncio.run(run_http_server(args.db, args.port, args.host, args.auth_token))


if __name__ == "__main__":
    main()
