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
import json
import zipfile
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

from .db import create_async_smithers_db, run_migrations, SmithersDB
from .engine import TickLoop
from .state import VolatileStore


# ─────────────────────────────────────────────────────────────────────────────
# Pretty Printing Helpers
# ─────────────────────────────────────────────────────────────────────────────

def format_timestamp(ts: Optional[str]) -> str:
    """Format ISO timestamp for display"""
    if not ts:
        return "-"
    try:
        dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except:
        return ts[:19] if len(ts) > 19 else ts


def format_duration(start: Optional[str], end: Optional[str]) -> str:
    """Calculate and format duration between timestamps"""
    if not start or not end:
        return "-"
    try:
        s = datetime.fromisoformat(start.replace('Z', '+00:00'))
        e = datetime.fromisoformat(end.replace('Z', '+00:00'))
        delta = e - s
        secs = delta.total_seconds()
        if secs < 60:
            return f"{secs:.1f}s"
        elif secs < 3600:
            return f"{int(secs // 60)}m {int(secs % 60)}s"
        else:
            return f"{int(secs // 3600)}h {int((secs % 3600) // 60)}m"
    except:
        return "-"


def format_status(status: str) -> str:
    """Format status with color indicators"""
    icons = {
        'pending': '⏳',
        'running': '🔄',
        'completed': '✅',
        'failed': '❌',
        'cancelled': '🚫',
    }
    return f"{icons.get(status, '?')} {status}"


def print_table(headers: list[str], rows: list[list[str]], max_widths: Optional[list[int]] = None) -> None:
    """Print a formatted table"""
    if not rows:
        print("  (no data)")
        return
    
    # Calculate column widths
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(str(cell)))
    
    # Apply max widths
    if max_widths:
        widths = [min(w, m) if m else w for w, m in zip(widths, max_widths + [None] * len(widths))]
    
    # Print header
    header_line = " | ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(f"  {header_line}")
    print(f"  {'-' * len(header_line)}")
    
    # Print rows
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            s = str(cell)
            if len(s) > widths[i]:
                s = s[:widths[i]-2] + ".."
            cells.append(s.ljust(widths[i]))
        print(f"  {' | '.join(cells)}")


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


# ─────────────────────────────────────────────────────────────────────────────
# CLI Command Handlers
# ─────────────────────────────────────────────────────────────────────────────

async def cmd_list(args: argparse.Namespace) -> int:
    """List all executions"""
    db_path = args.db if hasattr(args, 'db') and args.db else ".smithers/db.sqlite"
    
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        return 1
    
    db = await create_async_smithers_db(db_path)
    await run_migrations(db.connection)
    
    try:
        limit = args.limit if hasattr(args, 'limit') and args.limit else 20
        rows = await db.query(
            """
            SELECT id, name, source_file, status, created_at, completed_at
            FROM executions
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,)
        )
        
        print(f"\n📋 Executions (showing {len(rows)}):\n")
        
        table_rows = []
        for row in rows:
            exec_id, name, source_file, status, created_at, completed_at = row
            table_rows.append([
                exec_id[:8] + "..",
                name or Path(source_file or "").stem or "-",
                format_status(status or "pending"),
                format_timestamp(created_at),
                format_duration(created_at, completed_at),
            ])
        
        print_table(["ID", "Name", "Status", "Created", "Duration"], table_rows, [12, 20, 15, 20, 10])
        print()
        return 0
    finally:
        await db.close()


async def cmd_inspect(args: argparse.Namespace) -> int:
    """Inspect execution details"""
    db_path = args.db if hasattr(args, 'db') and args.db else ".smithers/db.sqlite"
    exec_id = args.execution_id
    
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        return 1
    
    db = await create_async_smithers_db(db_path)
    await run_migrations(db.connection)
    
    try:
        # Get execution
        row = await db.query_one(
            """
            SELECT id, name, source_file, status, config, result, error,
                   started_at, completed_at, created_at,
                   total_iterations, total_agents, total_tool_calls, total_tokens_used
            FROM executions WHERE id = ? OR id LIKE ?
            """,
            (exec_id, f"{exec_id}%")
        )
        
        if not row:
            print(f"Execution not found: {exec_id}")
            return 1
        
        (exec_id, name, source_file, status, config, result, error,
         started_at, completed_at, created_at,
         total_iterations, total_agents, total_tool_calls, total_tokens_used) = row
        
        print(f"\n🔍 Execution: {exec_id}\n")
        print(f"  Name:        {name or '-'}")
        print(f"  Source:      {source_file or '-'}")
        print(f"  Status:      {format_status(status or 'pending')}")
        print(f"  Created:     {format_timestamp(created_at)}")
        print(f"  Started:     {format_timestamp(started_at)}")
        print(f"  Completed:   {format_timestamp(completed_at)}")
        print(f"  Duration:    {format_duration(started_at, completed_at)}")
        print()
        print(f"  Iterations:  {total_iterations or 0}")
        print(f"  Agents:      {total_agents or 0}")
        print(f"  Tool Calls:  {total_tool_calls or 0}")
        print(f"  Tokens:      {total_tokens_used or 0}")
        
        if error:
            print(f"\n  ❌ Error:\n    {error}")
        
        if config and config != '{}':
            try:
                print(f"\n  Config: {json.loads(config)}")
            except:
                pass
        
        if result:
            try:
                print(f"\n  Result: {json.loads(result)}")
            except:
                print(f"\n  Result: {result[:200]}...")
        
        # Get agents summary
        agents = await db.query(
            """
            SELECT id, model, status, tokens_input, tokens_output
            FROM agents WHERE execution_id = ?
            ORDER BY created_at
            """,
            (exec_id,)
        )
        
        if agents:
            print(f"\n  📦 Agents ({len(agents)}):")
            for agent in agents[:10]:
                agent_id, model, agent_status, t_in, t_out = agent
                print(f"    - {agent_id[:8]}.. ({model}) {format_status(agent_status)} tokens:{t_in or 0}/{t_out or 0}")
            if len(agents) > 10:
                print(f"    ... and {len(agents) - 10} more")
        
        print()
        return 0
    finally:
        await db.close()


async def cmd_db_state(args: argparse.Namespace) -> int:
    """Dump current state snapshot"""
    db_path = args.db if hasattr(args, 'db') and args.db else ".smithers/db.sqlite"
    exec_id = args.execution_id
    
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        return 1
    
    db = await create_async_smithers_db(db_path)
    await run_migrations(db.connection)
    
    try:
        # Get all state
        rows = await db.query("SELECT key, value, updated_at FROM state ORDER BY key")
        
        print(f"\n📊 State Snapshot (execution: {exec_id[:8]}..)\n")
        
        for key, value, updated_at in rows:
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict) or isinstance(parsed, list):
                    value_str = json.dumps(parsed, indent=2)
                    # Indent multiline values
                    value_str = "\n      ".join(value_str.split("\n"))
                else:
                    value_str = str(parsed)
            except:
                value_str = value[:100] if len(value) > 100 else value
            
            print(f"  {key}: {value_str}")
        
        print()
        return 0
    finally:
        await db.close()


async def cmd_db_transitions(args: argparse.Namespace) -> int:
    """Show state change history with triggers"""
    db_path = args.db if hasattr(args, 'db') and args.db else ".smithers/db.sqlite"
    exec_id = args.execution_id
    last_n = args.last if hasattr(args, 'last') and args.last else 20
    
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        return 1
    
    db = await create_async_smithers_db(db_path)
    await run_migrations(db.connection)
    
    try:
        rows = await db.query(
            """
            SELECT id, key, old_value, new_value, trigger, trigger_agent_id, created_at
            FROM transitions
            WHERE execution_id = ? OR execution_id IS NULL
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (exec_id, last_n)
        )
        
        print(f"\n🔄 Transitions (last {last_n}, execution: {exec_id[:8]}..)\n")
        
        if not rows:
            print("  (no transitions recorded)")
        else:
            for row in reversed(rows):  # Show oldest first
                trans_id, key, old_val, new_val, trigger, trigger_agent, created_at = row
                
                # Truncate values for display
                def truncate(v: Optional[str], max_len: int = 40) -> str:
                    if not v:
                        return "null"
                    try:
                        parsed = json.loads(v)
                        s = json.dumps(parsed)
                    except:
                        s = v
                    return s[:max_len] + ".." if len(s) > max_len else s
                
                print(f"  {format_timestamp(created_at)} | {key}")
                print(f"    {truncate(old_val)} → {truncate(new_val)}")
                if trigger:
                    trigger_info = f"trigger: {trigger}"
                    if trigger_agent:
                        trigger_info += f" (agent: {trigger_agent[:8]}..)"
                    print(f"    {trigger_info}")
                print()
        
        return 0
    finally:
        await db.close()


async def cmd_db_frames(args: argparse.Namespace) -> int:
    """List frames with plan tree info"""
    db_path = args.db if hasattr(args, 'db') and args.db else ".smithers/db.sqlite"
    exec_id = args.execution_id
    from_seq = args.from_seq if hasattr(args, 'from_seq') and args.from_seq else 0
    to_seq = args.to_seq if hasattr(args, 'to_seq') and args.to_seq else 999999
    
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        return 1
    
    db = await create_async_smithers_db(db_path)
    await run_migrations(db.connection)
    
    try:
        # Try MCP frames table first
        rows = await db.query(
            """
            SELECT id, sequence, status, phase_path, step_index, plan_tree, created_at
            FROM frames
            WHERE execution_id = ?
              AND sequence >= ? AND sequence <= ?
            ORDER BY sequence
            """,
            (exec_id, from_seq, to_seq)
        )
        
        if rows:
            print(f"\n🎞️ Frames (execution: {exec_id[:8]}..)\n")
            
            table_rows = []
            for row in rows:
                frame_id, seq, status, phase_path, step_idx, plan_tree, created_at = row
                
                # Parse plan_tree for summary
                tree_summary = "-"
                if plan_tree:
                    try:
                        tree = json.loads(plan_tree)
                        if isinstance(tree, dict):
                            tree_summary = f"{len(tree)} nodes"
                    except:
                        tree_summary = f"{len(plan_tree)} chars"
                
                table_rows.append([
                    str(seq),
                    format_status(status or "pending"),
                    phase_path or "-",
                    str(step_idx) if step_idx is not None else "-",
                    tree_summary,
                    format_timestamp(created_at),
                ])
            
            print_table(["Seq", "Status", "Phase", "Step", "Tree", "Time"], table_rows)
        else:
            # Fall back to render_frames
            rows = await db.query(
                """
                SELECT id, sequence_number, ralph_count, xml_content, timestamp
                FROM render_frames
                WHERE execution_id = ?
                  AND sequence_number >= ? AND sequence_number <= ?
                ORDER BY sequence_number
                """,
                (exec_id, from_seq, to_seq)
            )
            
            print(f"\n🎞️ Render Frames (execution: {exec_id[:8]}..)\n")
            
            if not rows:
                print("  (no frames recorded)")
            else:
                table_rows = []
                for row in rows:
                    frame_id, seq, ralph_count, xml_content, timestamp = row
                    xml_len = len(xml_content) if xml_content else 0
                    table_rows.append([
                        str(seq),
                        str(ralph_count or 0),
                        f"{xml_len} chars",
                        format_timestamp(timestamp),
                    ])
                
                print_table(["Seq", "Ralph#", "XML Size", "Time"], table_rows)
        
        print()
        return 0
    finally:
        await db.close()


async def cmd_logs(args: argparse.Namespace) -> int:
    """Live tail logs or cat log files"""
    exec_id = args.execution_id
    follow = args.follow if hasattr(args, 'follow') else False
    level = args.level if hasattr(args, 'level') else "info"
    
    # Look for log files in standard locations
    log_paths = [
        Path(f".smithers/executions/{exec_id}/logs"),
        Path(f".smithers/logs/{exec_id}"),
        Path(".smithers/logs"),
    ]
    
    log_files = []
    for log_dir in log_paths:
        if log_dir.exists():
            log_files.extend(log_dir.glob("*.log"))
            log_files.extend(log_dir.glob("*.ndjson"))
            log_files.extend(log_dir.glob("*.txt"))
    
    # Also check for agent log files
    db_path = args.db if hasattr(args, 'db') and args.db else ".smithers/db.sqlite"
    if Path(db_path).exists():
        db = await create_async_smithers_db(db_path)
        await run_migrations(db.connection)
        
        try:
            rows = await db.query(
                "SELECT log_path FROM agents WHERE execution_id = ? AND log_path IS NOT NULL",
                (exec_id,)
            )
            for (log_path,) in rows:
                if log_path and Path(log_path).exists():
                    log_files.append(Path(log_path))
        finally:
            await db.close()
    
    if not log_files:
        print(f"No log files found for execution: {exec_id}")
        return 1
    
    # Deduplicate
    log_files = list(set(log_files))
    
    print(f"\n📜 Logs for execution: {exec_id[:8]}..\n")
    print(f"  Found {len(log_files)} log file(s):")
    for lf in log_files:
        print(f"    - {lf}")
    print()
    
    if follow:
        # Live tail mode - use subprocess
        import subprocess
        try:
            print("  (Press Ctrl+C to stop)\n")
            subprocess.run(["tail", "-f"] + [str(lf) for lf in log_files])
        except KeyboardInterrupt:
            print("\n  Stopped.")
    else:
        # Cat mode - read and print
        level_priority = {"debug": 0, "info": 1, "warn": 2, "error": 3}
        min_level = level_priority.get(level.lower(), 1)
        
        for log_file in log_files:
            print(f"  ─── {log_file} ───\n")
            try:
                content = log_file.read_text()
                
                # If NDJSON, parse and filter
                if log_file.suffix == ".ndjson":
                    for line in content.strip().split("\n"):
                        if not line:
                            continue
                        try:
                            entry = json.loads(line)
                            entry_level = entry.get("level", "info").lower()
                            if level_priority.get(entry_level, 1) >= min_level:
                                ts = entry.get("timestamp", entry.get("ts", ""))
                                msg = entry.get("message", entry.get("msg", line))
                                print(f"  [{entry_level.upper():5}] {ts} - {msg}")
                        except:
                            print(f"  {line}")
                else:
                    print(content)
            except Exception as e:
                print(f"  Error reading: {e}")
            print()
    
    return 0


async def cmd_export(args: argparse.Namespace) -> int:
    """Export execution for offline analysis"""
    db_path = args.db if hasattr(args, 'db') and args.db else ".smithers/db.sqlite"
    exec_id = args.execution_id
    output_path = args.output if hasattr(args, 'output') and args.output else f"{exec_id[:8]}_export.zip"
    
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        return 1
    
    db = await create_async_smithers_db(db_path)
    await run_migrations(db.connection)
    
    try:
        # Verify execution exists
        row = await db.query_one("SELECT id, name FROM executions WHERE id = ? OR id LIKE ?", (exec_id, f"{exec_id}%"))
        if not row:
            print(f"Execution not found: {exec_id}")
            return 1
        
        full_exec_id = row[0]
        exec_name = row[1] or "execution"
        
        print(f"\n📦 Exporting execution: {full_exec_id}\n")
        
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Export execution metadata
            exec_row = await db.query_one(
                """SELECT * FROM executions WHERE id = ?""",
                (full_exec_id,)
            )
            if exec_row:
                # Get column names
                cols = await db.query("PRAGMA table_info(executions)")
                col_names = [c[1] for c in cols]
                exec_dict = dict(zip(col_names, exec_row))
                zf.writestr("execution.json", json.dumps(exec_dict, indent=2))
                print("  ✓ execution.json")
            
            # Export state
            state_rows = await db.query("SELECT key, value, updated_at FROM state")
            state_dict = {row[0]: {"value": row[1], "updated_at": row[2]} for row in state_rows}
            zf.writestr("state.json", json.dumps(state_dict, indent=2))
            print("  ✓ state.json")
            
            # Export transitions
            trans_rows = await db.query(
                """SELECT id, key, old_value, new_value, trigger, trigger_agent_id, created_at
                   FROM transitions WHERE execution_id = ? ORDER BY created_at""",
                (full_exec_id,)
            )
            trans_list = [
                {"id": r[0], "key": r[1], "old_value": r[2], "new_value": r[3],
                 "trigger": r[4], "trigger_agent_id": r[5], "created_at": r[6]}
                for r in trans_rows
            ]
            zf.writestr("transitions.json", json.dumps(trans_list, indent=2))
            print(f"  ✓ transitions.json ({len(trans_list)} records)")
            
            # Export agents
            agent_rows = await db.query(
                """SELECT id, model, prompt, status, result, error, started_at, completed_at,
                          tokens_input, tokens_output, tool_calls_count
                   FROM agents WHERE execution_id = ? ORDER BY created_at""",
                (full_exec_id,)
            )
            agents_list = [
                {"id": r[0], "model": r[1], "prompt": r[2], "status": r[3], "result": r[4],
                 "error": r[5], "started_at": r[6], "completed_at": r[7],
                 "tokens_input": r[8], "tokens_output": r[9], "tool_calls_count": r[10]}
                for r in agent_rows
            ]
            zf.writestr("agents.json", json.dumps(agents_list, indent=2))
            print(f"  ✓ agents.json ({len(agents_list)} records)")
            
            # Export tool calls
            tool_rows = await db.query(
                """SELECT id, agent_id, tool_name, input, output_inline, error, status,
                          started_at, completed_at, duration_ms
                   FROM tool_calls WHERE execution_id = ? ORDER BY created_at""",
                (full_exec_id,)
            )
            tools_list = [
                {"id": r[0], "agent_id": r[1], "tool_name": r[2], "input": r[3],
                 "output_inline": r[4], "error": r[5], "status": r[6],
                 "started_at": r[7], "completed_at": r[8], "duration_ms": r[9]}
                for r in tool_rows
            ]
            zf.writestr("tool_calls.json", json.dumps(tools_list, indent=2))
            print(f"  ✓ tool_calls.json ({len(tools_list)} records)")
            
            # Export frames
            frame_rows = await db.query(
                """SELECT id, sequence, status, phase_path, step_index, plan_tree, created_at
                   FROM frames WHERE execution_id = ? ORDER BY sequence""",
                (full_exec_id,)
            )
            frames_list = [
                {"id": r[0], "sequence": r[1], "status": r[2], "phase_path": r[3],
                 "step_index": r[4], "plan_tree": r[5], "created_at": r[6]}
                for r in frame_rows
            ]
            zf.writestr("frames.json", json.dumps(frames_list, indent=2))
            print(f"  ✓ frames.json ({len(frames_list)} records)")
            
            # Export render frames
            render_rows = await db.query(
                """SELECT id, sequence_number, ralph_count, xml_content, timestamp
                   FROM render_frames WHERE execution_id = ? ORDER BY sequence_number""",
                (full_exec_id,)
            )
            render_list = [
                {"id": r[0], "sequence_number": r[1], "ralph_count": r[2],
                 "xml_content": r[3], "timestamp": r[4]}
                for r in render_rows
            ]
            zf.writestr("render_frames.json", json.dumps(render_list, indent=2))
            print(f"  ✓ render_frames.json ({len(render_list)} records)")
            
            # Export events
            event_rows = await db.query(
                """SELECT id, source, node_id, event_type, payload, timestamp
                   FROM events WHERE execution_id = ? ORDER BY timestamp""",
                (full_exec_id,)
            )
            events_list = [
                {"id": r[0], "source": r[1], "node_id": r[2], "event_type": r[3],
                 "payload": r[4], "timestamp": r[5]}
                for r in event_rows
            ]
            zf.writestr("events.json", json.dumps(events_list, indent=2))
            print(f"  ✓ events.json ({len(events_list)} records)")
            
            # Include any log files
            log_dir = Path(f".smithers/executions/{full_exec_id}/logs")
            if log_dir.exists():
                for log_file in log_dir.iterdir():
                    if log_file.is_file():
                        zf.write(log_file, f"logs/{log_file.name}")
                        print(f"  ✓ logs/{log_file.name}")
        
        print(f"\n✅ Exported to: {output_path}")
        print(f"   Size: {Path(output_path).stat().st_size / 1024:.1f} KB\n")
        return 0
        
    finally:
        await db.close()


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
    list_parser.add_argument("--limit", "-n", type=int, default=20, help="Max executions to show (default: 20)")
    list_parser.add_argument("--db", help="Path to SQLite database (default: .smithers/db.sqlite)")

    # inspect command
    inspect_parser = subparsers.add_parser("inspect", help="Inspect execution details")
    inspect_parser.add_argument("execution_id", help="Execution ID (or prefix) to inspect")
    inspect_parser.add_argument("--db", help="Path to SQLite database (default: .smithers/db.sqlite)")

    # db command group
    db_parser = subparsers.add_parser("db", help="Database inspection commands")
    db_subparsers = db_parser.add_subparsers(dest="db_command", help="DB subcommands")
    
    # db state
    db_state_parser = db_subparsers.add_parser("state", help="Dump current state snapshot")
    db_state_parser.add_argument("execution_id", help="Execution ID")
    db_state_parser.add_argument("--db", help="Path to SQLite database")
    
    # db transitions
    db_trans_parser = db_subparsers.add_parser("transitions", help="Show state change history")
    db_trans_parser.add_argument("execution_id", help="Execution ID")
    db_trans_parser.add_argument("--last", "-n", type=int, default=20, help="Number of transitions to show (default: 20)")
    db_trans_parser.add_argument("--db", help="Path to SQLite database")
    
    # db frames
    db_frames_parser = db_subparsers.add_parser("frames", help="List frames with plan tree info")
    db_frames_parser.add_argument("execution_id", help="Execution ID")
    db_frames_parser.add_argument("--from", dest="from_seq", type=int, default=0, help="Start sequence number")
    db_frames_parser.add_argument("--to", dest="to_seq", type=int, default=999999, help="End sequence number")
    db_frames_parser.add_argument("--db", help="Path to SQLite database")

    # logs command
    logs_parser = subparsers.add_parser("logs", help="View execution logs")
    logs_parser.add_argument("execution_id", help="Execution ID")
    logs_parser.add_argument("--follow", "-f", action="store_true", help="Live tail logs")
    logs_parser.add_argument("--level", "-l", default="info", choices=["debug", "info", "warn", "error"], help="Minimum log level (default: info)")
    logs_parser.add_argument("--db", help="Path to SQLite database")

    # export command
    export_parser = subparsers.add_parser("export", help="Export execution for offline analysis")
    export_parser.add_argument("execution_id", help="Execution ID")
    export_parser.add_argument("--output", "-o", help="Output zip file path (default: <exec-id>_export.zip)")
    export_parser.add_argument("--db", help="Path to SQLite database")

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
        return asyncio.run(cmd_list(args))

    elif args.command == "inspect":
        return asyncio.run(cmd_inspect(args))

    elif args.command == "db":
        if args.db_command == "state":
            return asyncio.run(cmd_db_state(args))
        elif args.db_command == "transitions":
            return asyncio.run(cmd_db_transitions(args))
        elif args.db_command == "frames":
            return asyncio.run(cmd_db_frames(args))
        else:
            print("Usage: smithers_py db {state|transitions|frames} <execution_id>")
            return 1

    elif args.command == "logs":
        return asyncio.run(cmd_logs(args))

    elif args.command == "export":
        return asyncio.run(cmd_export(args))

    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
