#!/usr/bin/env python3
"""
Example usage of Smithers Python Database Layer

Demonstrates basic database operations for:
- Execution tracking
- State management
- Task management
- Render frame storage
"""

import asyncio
import json
from smithers_py import create_async_smithers_db, run_migrations


async def main():
    """Demonstrate Smithers Python DB usage"""
    print("🚀 Smithers Python Database Example")
    print("=" * 50)

    # Create async database instance
    db = await create_async_smithers_db(":memory:")
    print("✅ Database connected")

    # Initialize schema
    await run_migrations(db.connection)
    print("✅ Schema initialized")

    # Example 1: Execution tracking
    print("\n📋 Execution Tracking Demo")
    print("-" * 30)

    execution_id = await db.execution.start(
        name="Example Execution",
        source_file="/path/to/main.py",
        config={"mode": "test", "timeout": 300}
    )
    print(f"Started execution: {execution_id}")

    # Example 2: State management
    print("\n🔄 State Management Demo")
    print("-" * 30)

    await db.state.set("current_phase", "initialization")
    await db.state.set("task_count", 5)
    await db.state.set("config", {"debug": True, "workers": 3})

    phase = await db.state.get("current_phase")
    task_count = await db.state.get("task_count")
    config = await db.state.get("config")

    print(f"Current phase: {phase}")
    print(f"Task count: {task_count}")
    print(f"Config: {json.dumps(config, indent=2)}")

    # Example 3: Task management
    print("\n⚡ Task Management Demo")
    print("-" * 30)

    task_id = "task-001"
    await db.tasks.start(task_id, "Process Documents", execution_id, component_type="example", component_name="DocumentProcessor")
    print(f"Started task: {task_id}")

    await db.tasks.heartbeat(task_id, "worker-1")
    print(f"Updated heartbeat for task: {task_id}")

    await db.tasks.complete(task_id)
    print(f"Completed task: {task_id}")

    # Example 4: Render frame storage
    print("\n🎬 Render Frame Demo")
    print("-" * 30)

    xml_content = """<smithers>
    <phase name="initialization" status="running">
        <agent id="agent-001" model="sonnet" status="pending"/>
        <agent id="agent-002" model="haiku" status="running"/>
    </phase>
</smithers>"""

    frame_id = await db.frames.save(execution_id, xml_content)
    print(f"Saved render frame: {frame_id}")

    frames = await db.frames.list(execution_id)
    print(f"Total frames for execution: {len(frames)}")

    # Complete the execution
    await db.execution.complete(execution_id, {"status": "success", "tasks_completed": 1})
    print(f"✅ Completed execution: {execution_id}")

    # Example 5: Query raw data
    print("\n🔍 Raw Query Demo")
    print("-" * 30)

    executions = await db.query("SELECT id, name, status FROM executions ORDER BY created_at DESC LIMIT 5")
    for exec_row in executions:
        exec_id, name, status = exec_row
        print(f"  {exec_id[:8]}... | {name} | {status}")

    # Close database
    await db.close()
    print("\n✅ Database closed")
    print("\n🎉 Demo completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())