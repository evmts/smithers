"""stdio Transport for MCP Server.

Implements the stdio transport for MCP, reading NDJSON from stdin
and writing responses to stdout.

Per PRD section 7.8.1: StdioTransport uses NDJSON on stdio for CLI usage.
"""

import asyncio
import json
import sys
import logging
from typing import Optional, TextIO

from .server import McpCore


logger = logging.getLogger(__name__)


class StdioTransport:
    """stdio transport for MCP server.
    
    Reads JSON-RPC messages from stdin (NDJSON format),
    processes them through McpCore, and writes responses to stdout.
    """
    
    def __init__(
        self,
        core: McpCore,
        stdin: Optional[TextIO] = None,
        stdout: Optional[TextIO] = None
    ):
        self.core = core
        self._stdin = stdin or sys.stdin
        self._stdout = stdout or sys.stdout
        self._running = False
        self._session_id: Optional[str] = None
    
    async def run(self) -> None:
        """Run the stdio transport loop.
        
        Reads lines from stdin, parses as JSON-RPC, handles via core,
        and writes responses to stdout.
        """
        self._running = True
        logger.info("Starting stdio MCP transport")
        
        # Use asyncio stream reader for non-blocking reads
        loop = asyncio.get_event_loop()
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        
        await loop.connect_read_pipe(lambda: protocol, self._stdin)
        
        try:
            while self._running:
                line = await reader.readline()
                if not line:
                    # EOF
                    break
                
                await self._handle_line(line.decode('utf-8').strip())
                
        except asyncio.CancelledError:
            logger.info("stdio transport cancelled")
        except Exception as e:
            logger.exception(f"stdio transport error: {e}")
        finally:
            self._running = False
            logger.info("stdio transport stopped")
    
    def run_sync(self) -> None:
        """Run the stdio transport synchronously (blocking).
        
        For use in CLI contexts where async is not available.
        """
        self._running = True
        logger.info("Starting stdio MCP transport (sync)")
        
        try:
            while self._running:
                try:
                    line = self._stdin.readline()
                    if not line:
                        break
                    
                    # Run async handler in event loop
                    asyncio.run(self._handle_line(line.strip()))
                    
                except KeyboardInterrupt:
                    break
                    
        finally:
            self._running = False
            logger.info("stdio transport stopped")
    
    async def _handle_line(self, line: str) -> None:
        """Handle a single line of input."""
        if not line:
            return
        
        try:
            message = json.loads(line)
        except json.JSONDecodeError as e:
            error_response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {
                    "code": -32700,
                    "message": f"Parse error: {str(e)}"
                }
            }
            self._write_response(error_response)
            return
        
        # Handle the message
        response = await self.core.handle(message, self._session_id)
        
        # Extract session ID from initialize response
        if message.get("method") == "initialize":
            result = response.get("result", {})
            self._session_id = result.get("sessionId")
        
        self._write_response(response)
    
    def _write_response(self, response: dict) -> None:
        """Write JSON-RPC response to stdout."""
        try:
            line = json.dumps(response, separators=(',', ':'))
            self._stdout.write(line + "\n")
            self._stdout.flush()
        except Exception as e:
            logger.error(f"Failed to write response: {e}")
    
    def stop(self) -> None:
        """Stop the transport."""
        self._running = False


async def run_stdio_server(db_path: str, auth_token: Optional[str] = None) -> None:
    """Run MCP server with stdio transport.
    
    Args:
        db_path: Path to SQLite database
        auth_token: Optional auth token (printed to stderr)
    """
    core = McpCore(db_path, auth_token)
    
    # Print auth token to stderr for parent process to capture
    print(f"AUTH_TOKEN={core.auth_token}", file=sys.stderr)
    sys.stderr.flush()
    
    transport = StdioTransport(core)
    
    try:
        await transport.run()
    finally:
        core.cleanup()


def main():
    """CLI entry point for stdio MCP server."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Smithers MCP Server (stdio)")
    parser.add_argument(
        "--db", 
        default=".smithers/db.sqlite",
        help="Path to SQLite database"
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
    
    asyncio.run(run_stdio_server(args.db, args.auth_token))


if __name__ == "__main__":
    main()
