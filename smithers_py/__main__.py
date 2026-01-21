#!/usr/bin/env python3
"""
Smithers Python CLI Entry Point

Provides command-line interface for running Smithers orchestrations.
"""

import sys
import argparse
import logging
import asyncio
from pathlib import Path

from .db import create_async_smithers_db, run_migrations


async def run_script(script_path: str, args: list[str]) -> int:
    """
    Run a Smithers script file

    Args:
        script_path: Path to the Python script to run
        args: Additional arguments to pass to the script

    Returns:
        Exit code (0 for success, non-zero for failure)
    """
    print(f"Running script: {script_path}")

    # TODO: Implement script execution
    # For now, just create DB and run migrations
    db = await create_async_smithers_db()
    await run_migrations(db.connection)

    print("✓ Database initialized")
    print("✓ Migrations complete")

    # Placeholder for actual script execution
    print(f"TODO: Execute {script_path} with args: {args}")

    await db.close()
    return 0


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Smithers Python Orchestration Framework",
        prog="smithers_py"
    )

    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 0.1.0"
    )

    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging"
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # run command
    run_parser = subparsers.add_parser("run", help="Run a Smithers script")
    run_parser.add_argument("script", help="Script file to run")
    run_parser.add_argument("args", nargs="*", help="Arguments to pass to script")

    # Future commands can be added here:
    # - init: Initialize a new Smithers project
    # - list: List executions
    # - resume: Resume an execution
    # - inspect: Inspect execution state

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Execute command
    if args.command == "run":
        if not Path(args.script).exists():
            print(f"Error: Script file not found: {args.script}", file=sys.stderr)
            return 1

        # Run async main
        return asyncio.run(run_script(args.script, args.args))

    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())