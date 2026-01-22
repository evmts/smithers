#!/usr/bin/env python3
"""
Smithers Python CLI Entry Point

Provides command-line interface for running Smithers orchestrations.
"""

import sys
import argparse
import logging
import asyncio
import uuid
import importlib.util
from pathlib import Path
from typing import Any, Callable, Optional

from .db import create_async_smithers_db, run_migrations, SmithersDB
from .engine import TickLoop
from .state import VolatileStore


async def run_script(script_path: str, args: list[str]) -> int:
    """
    Run a Smithers script file.

    Args:
        script_path: Path to the Python script to run
        args: Additional arguments to pass to the script

    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    print(f"🚀 Running script: {script_path}")

    # Initialize database
    db = await create_async_smithers_db()
    await run_migrations(db.connection)
    print("✓ Database initialized")

    # Generate execution ID
    execution_id = str(uuid.uuid4())
    print(f"✓ Execution ID: {execution_id}")

    # Load the user script
    app_component = load_script(script_path)
    if app_component is None:
        print(f"❌ Failed to load script: {script_path}", file=sys.stderr)
        await db.close()
        return 1

    print(f"✓ Loaded component: {getattr(app_component, '__name__', 'app')}")

    # Create execution record in DB
    await create_execution_record(db, execution_id, script_path)

    # Create volatile state store
    volatile_state = VolatileStore()

    # Create and run tick loop
    tick_loop = TickLoop(
        db=db,
        volatile_state=volatile_state,
        app_component=app_component,
        execution_id=execution_id
    )

    try:
        await tick_loop.run()
        await update_execution_status(db, execution_id, "completed")
        print("✅ Execution completed successfully")
        return 0
    except Exception as e:
        await update_execution_status(db, execution_id, "failed", str(e))
        print(f"❌ Execution failed: {e}", file=sys.stderr)
        return 1
    finally:
        await db.close()


def load_script(script_path: str) -> Optional[Callable]:
    """
    Load a user script and extract the app component.

    Looks for:
    1. A function named 'app' or 'App'
    2. A function decorated with @component
    3. Any callable assigned to module-level 'app'

    Args:
        script_path: Path to the Python script

    Returns:
        The app component function, or None if not found
    """
    path = Path(script_path).resolve()
    
    # Handle .px files (JSX Python)
    if path.suffix == '.px':
        return load_px_script(path)
    
    # Load regular Python file
    spec = importlib.util.spec_from_file_location("user_script", path)
    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)
    sys.modules["user_script"] = module

    try:
        spec.loader.exec_module(module)
    except Exception as e:
        print(f"❌ Error executing script: {e}", file=sys.stderr)
        return None

    # Look for app component
    for name in ['app', 'App', 'main', 'Main']:
        if hasattr(module, name):
            candidate = getattr(module, name)
            if callable(candidate):
                return candidate

    # Look for @component decorated functions
    for name in dir(module):
        obj = getattr(module, name)
        if callable(obj) and getattr(obj, '_smithers_component', False):
            return obj

    print("❌ No app component found. Define 'app(ctx)' or use @component decorator.", file=sys.stderr)
    return None


def load_px_script(path: Path) -> Optional[Callable]:
    """
    Load a .px (Python JSX) file by transpiling it first.

    Args:
        path: Path to the .px file

    Returns:
        The app component function, or None if transpilation fails
    """
    try:
        from python_jsx import transpile
    except ImportError:
        print("❌ python-jsx not installed. Cannot process .px files.", file=sys.stderr)
        print("   Install with: pip install python-jsx", file=sys.stderr)
        return None

    try:
        source = path.read_text()
        transpiled = transpile(source)
        
        # Execute transpiled code
        module_dict: dict[str, Any] = {
            '__name__': 'user_script',
            '__file__': str(path),
        }
        
        # Inject jsx runtime
        from . import jsx, Fragment, component
        module_dict['jsx'] = jsx
        module_dict['Fragment'] = Fragment
        module_dict['component'] = component
        
        exec(transpiled, module_dict)
        
        # Look for app component
        for name in ['app', 'App', 'main', 'Main']:
            if name in module_dict and callable(module_dict[name]):
                return module_dict[name]

        # Look for @component decorated functions
        for name, obj in module_dict.items():
            if callable(obj) and getattr(obj, '_smithers_component', False):
                return obj

        print("❌ No app component found in .px file.", file=sys.stderr)
        return None

    except Exception as e:
        print(f"❌ Failed to transpile .px file: {e}", file=sys.stderr)
        return None


async def create_execution_record(db: SmithersDB, execution_id: str, script_path: str) -> None:
    """Create an execution record in the database."""
    try:
        await db.connection.execute(
            """
            INSERT INTO executions (id, name, source_file, status, created_at)
            VALUES (?, ?, ?, 'running', datetime('now'))
            """,
            (execution_id, Path(script_path).stem, script_path)
        )
        await db.connection.commit()
    except Exception:
        # Table might not exist yet, that's ok
        pass


async def update_execution_status(db: SmithersDB, execution_id: str, status: str, error: str = None) -> None:
    """Update an execution's status in the database."""
    try:
        if error:
            await db.connection.execute(
                """
                UPDATE executions 
                SET status = ?, error = ?, completed_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ?
                """,
                (status, error, execution_id)
            )
        else:
            await db.connection.execute(
                """
                UPDATE executions 
                SET status = ?, completed_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ?
                """,
                (status, execution_id)
            )
        await db.connection.commit()
    except Exception:
        # Table might not exist, that's ok
        pass


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Smithers Python Orchestration Framework",
        prog="smithers_py"
    )

    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 1.0.0"
    )

    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging"
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # run command
    run_parser = subparsers.add_parser("run", help="Run a Smithers script")
    run_parser.add_argument("script", help="Script file to run (.py or .px)")
    run_parser.add_argument("args", nargs="*", help="Arguments to pass to script")

    # serve command
    serve_parser = subparsers.add_parser("serve", help="Start the MCP HTTP server")
    serve_parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="Port to listen on (default: 8080)"
    )
    serve_parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1)"
    )
    serve_parser.add_argument(
        "--auth-token",
        help="Auth token (generated if not provided)"
    )
    serve_parser.add_argument(
        "--db",
        default=".smithers/db.sqlite",
        help="Path to SQLite database (default: .smithers/db.sqlite)"
    )

    # list command
    list_parser = subparsers.add_parser("list", help="List executions")

    # inspect command
    inspect_parser = subparsers.add_parser("inspect", help="Inspect execution")
    inspect_parser.add_argument("execution_id", help="Execution ID to inspect")

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Execute command
    if args.command == "run":
        script = Path(args.script)
        if not script.exists():
            print(f"Error: Script file not found: {args.script}", file=sys.stderr)
            return 1

        if script.suffix not in ('.py', '.px'):
            print(f"Error: Script must be .py or .px file: {args.script}", file=sys.stderr)
            return 1

        return asyncio.run(run_script(args.script, args.args))

    elif args.command == "serve":
        from .mcp.http import run_http_server
        asyncio.run(run_http_server(args.db, args.port, args.host, args.auth_token))
        return 0

    elif args.command == "list":
        print("Not yet implemented")
        return 0

    elif args.command == "inspect":
        print("Not yet implemented")
        return 0

    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
