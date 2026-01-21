"""
Database migrations for Smithers Python

Handles schema initialization and updates to ensure database compatibility.
"""

import sqlite3
import aiosqlite
from pathlib import Path
from typing import Union
import logging

logger = logging.getLogger(__name__)


async def run_migrations(connection: Union[sqlite3.Connection, aiosqlite.Connection]) -> None:
    """
    Run database migrations to initialize schema and handle updates.

    This function:
    1. Loads and executes the schema.sql file
    2. Applies any necessary migrations for existing databases
    3. Ensures compatibility with the TypeScript implementation
    """
    is_async = isinstance(connection, aiosqlite.Connection)

    # Get path to schema.sql
    schema_path = Path(__file__).parent / "schema.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    # Read and execute schema
    schema_sql = schema_path.read_text()

    if is_async:
        await connection.executescript(schema_sql)
        await connection.commit()
    else:
        connection.executescript(schema_sql)
        connection.commit()

    logger.info("Schema initialized successfully")

    # Apply any additional migrations
    await _apply_migrations(connection)


async def _apply_migrations(connection: Union[sqlite3.Connection, aiosqlite.Connection]) -> None:
    """Apply additional migrations for existing databases"""
    is_async = isinstance(connection, aiosqlite.Connection)

    # Migration: Ensure render_frames table uses correct column names
    await _migrate_render_frames_columns(connection)

    # Migration: Ensure tasks table has management fields
    await _migrate_tasks_management_fields(connection)

    # Migration: Ensure executions table uses source_file column
    await _migrate_executions_source_file(connection)

    logger.info("All migrations applied successfully")


async def _migrate_render_frames_columns(connection: Union[sqlite3.Connection, aiosqlite.Connection]) -> None:
    """Ensure render_frames table has correct column names matching Python API"""
    is_async = isinstance(connection, aiosqlite.Connection)

    try:
        if is_async:
            async with connection.execute("PRAGMA table_info(render_frames)") as cursor:
                columns = await cursor.fetchall()
        else:
            columns = connection.execute("PRAGMA table_info(render_frames)").fetchall()

        column_names = [col[1] for col in columns]

        # Check if we need to migrate from tree_xml to xml_content
        if 'tree_xml' in column_names and 'xml_content' not in column_names:
            logger.info("Migrating render_frames: tree_xml -> xml_content")
            if is_async:
                await connection.execute("ALTER TABLE render_frames ADD COLUMN xml_content TEXT")
                await connection.execute("UPDATE render_frames SET xml_content = tree_xml WHERE xml_content IS NULL")
                await connection.commit()
            else:
                connection.execute("ALTER TABLE render_frames ADD COLUMN xml_content TEXT")
                connection.execute("UPDATE render_frames SET xml_content = tree_xml WHERE xml_content IS NULL")
                connection.commit()

        # Check if we need to migrate from created_at to timestamp
        if 'created_at' in column_names and 'timestamp' not in column_names:
            logger.info("Migrating render_frames: created_at -> timestamp")
            if is_async:
                await connection.execute("ALTER TABLE render_frames ADD COLUMN timestamp TEXT")
                await connection.execute("UPDATE render_frames SET timestamp = created_at WHERE timestamp IS NULL")
                await connection.commit()
            else:
                connection.execute("ALTER TABLE render_frames ADD COLUMN timestamp TEXT")
                connection.execute("UPDATE render_frames SET timestamp = created_at WHERE timestamp IS NULL")
                connection.commit()

    except Exception as e:
        logger.warning(f"Error in render_frames migration: {e}")


async def _migrate_tasks_management_fields(connection: Union[sqlite3.Connection, aiosqlite.Connection]) -> None:
    """Ensure tasks table has task management fields"""
    is_async = isinstance(connection, aiosqlite.Connection)

    try:
        if is_async:
            async with connection.execute("PRAGMA table_info(tasks)") as cursor:
                columns = await cursor.fetchall()
        else:
            columns = connection.execute("PRAGMA table_info(tasks)").fetchall()

        column_names = [col[1] for col in columns]

        # Add missing task management columns
        missing_columns = []
        if 'name' not in column_names:
            missing_columns.append(('name', 'TEXT'))
        if 'lease_owner' not in column_names:
            missing_columns.append(('lease_owner', 'TEXT'))
        if 'lease_expires_at' not in column_names:
            missing_columns.append(('lease_expires_at', 'TEXT'))
        if 'heartbeat_at' not in column_names:
            missing_columns.append(('heartbeat_at', 'TEXT'))

        for column_name, column_type in missing_columns:
            logger.info(f"Adding column {column_name} to tasks table")
            if is_async:
                await connection.execute(f"ALTER TABLE tasks ADD COLUMN {column_name} {column_type}")
            else:
                connection.execute(f"ALTER TABLE tasks ADD COLUMN {column_name} {column_type}")

        if missing_columns:
            # Add index for lease management
            if is_async:
                await connection.execute("CREATE INDEX IF NOT EXISTS idx_tasks_lease ON tasks(lease_owner, lease_expires_at)")
                await connection.commit()
            else:
                connection.execute("CREATE INDEX IF NOT EXISTS idx_tasks_lease ON tasks(lease_owner, lease_expires_at)")
                connection.commit()

    except Exception as e:
        logger.warning(f"Error in tasks migration: {e}")


async def _migrate_executions_source_file(connection: Union[sqlite3.Connection, aiosqlite.Connection]) -> None:
    """Ensure executions table uses source_file instead of file_path"""
    is_async = isinstance(connection, aiosqlite.Connection)

    try:
        if is_async:
            async with connection.execute("PRAGMA table_info(executions)") as cursor:
                columns = await cursor.fetchall()
        else:
            columns = connection.execute("PRAGMA table_info(executions)").fetchall()

        column_names = [col[1] for col in columns]

        # Check if we need to migrate from file_path to source_file
        if 'file_path' in column_names and 'source_file' not in column_names:
            logger.info("Migrating executions: file_path -> source_file")
            if is_async:
                await connection.execute("ALTER TABLE executions ADD COLUMN source_file TEXT")
                await connection.execute("UPDATE executions SET source_file = file_path WHERE source_file IS NULL")
                await connection.commit()
            else:
                connection.execute("ALTER TABLE executions ADD COLUMN source_file TEXT")
                connection.execute("UPDATE executions SET source_file = file_path WHERE source_file IS NULL")
                connection.commit()

    except Exception as e:
        logger.warning(f"Error in executions migration: {e}")


async def create_fresh_database(connection: Union[sqlite3.Connection, aiosqlite.Connection]) -> None:
    """Create a fresh database with latest schema"""
    is_async = isinstance(connection, aiosqlite.Connection)

    # Get all table names
    if is_async:
        async with connection.execute("SELECT name FROM sqlite_master WHERE type='table'") as cursor:
            tables = await cursor.fetchall()
    else:
        tables = connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()

    # Drop all existing tables
    for table_row in tables:
        table_name = table_row[0]
        if table_name != 'sqlite_sequence':  # Keep SQLite internal table
            logger.info(f"Dropping table: {table_name}")
            if is_async:
                await connection.execute(f"DROP TABLE IF EXISTS {table_name}")
            else:
                connection.execute(f"DROP TABLE IF EXISTS {table_name}")

    if is_async:
        await connection.commit()
    else:
        connection.commit()

    # Run fresh migrations
    await run_migrations(connection)

    logger.info("Fresh database created successfully")