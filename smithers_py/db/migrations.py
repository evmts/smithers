"""
Database migrations for Smithers Python

Handles schema initialization and updates to ensure database compatibility.
"""

import sqlite3
try:
    import aiosqlite
except ImportError:
    aiosqlite = None  # type: ignore
from pathlib import Path
from typing import Union
import logging

logger = logging.getLogger(__name__)


def run_migrations_sync(connection: sqlite3.Connection) -> None:
    """
    Run database migrations synchronously for sync connections.

    This function:
    1. Loads and executes the schema.sql file
    2. Applies any necessary migrations for existing databases
    3. Ensures compatibility with the TypeScript implementation
    """
    # Get path to schema.sql
    schema_path = Path(__file__).parent / "schema.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    # Read and execute schema
    schema_sql = schema_path.read_text()

    connection.executescript(schema_sql)
    connection.commit()

    logger.info("Schema initialized successfully")

    # Apply any additional migrations
    _apply_migrations_sync(connection)


async def run_migrations(connection: Union[sqlite3.Connection, "aiosqlite.Connection"]) -> None:
    """
    Run database migrations to initialize schema and handle updates.

    This function:
    1. Loads and executes the schema.sql file
    2. Applies any necessary migrations for existing databases
    3. Ensures compatibility with the TypeScript implementation
    """
    # Check if this is a sync connection being used incorrectly
    if aiosqlite is None or not isinstance(connection, aiosqlite.Connection):
        # This is a sync connection - use sync version
        run_migrations_sync(connection)  # type: ignore
        return

    # Get path to schema.sql
    schema_path = Path(__file__).parent / "schema.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    # Read and execute schema
    schema_sql = schema_path.read_text()

    await connection.executescript(schema_sql)
    await connection.commit()

    logger.info("Schema initialized successfully")

    # Apply any additional migrations
    await _apply_migrations(connection)


def _apply_migrations_sync(connection: sqlite3.Connection) -> None:
    """Apply additional migrations for existing databases (sync)"""
    # Migration: Ensure render_frames table uses correct column names
    _migrate_render_frames_columns_sync(connection)

    # Migration: Ensure tasks table has management fields
    _migrate_tasks_management_fields_sync(connection)

    # Migration: Ensure executions table uses source_file column
    _migrate_executions_source_file_sync(connection)

    logger.info("All migrations applied successfully")


def _migrate_render_frames_columns_sync(connection: sqlite3.Connection) -> None:
    """Ensure render_frames table has correct column names matching Python API (sync)"""
    try:
        columns = connection.execute("PRAGMA table_info(render_frames)").fetchall()
        column_names = [col[1] for col in columns]

        if 'tree_xml' in column_names and 'xml_content' not in column_names:
            logger.info("Migrating render_frames: tree_xml -> xml_content")
            connection.execute("ALTER TABLE render_frames ADD COLUMN xml_content TEXT")
            connection.execute("UPDATE render_frames SET xml_content = tree_xml WHERE xml_content IS NULL")
            connection.commit()

        if 'created_at' in column_names and 'timestamp' not in column_names:
            logger.info("Migrating render_frames: created_at -> timestamp")
            connection.execute("ALTER TABLE render_frames ADD COLUMN timestamp TEXT")
            connection.execute("UPDATE render_frames SET timestamp = created_at WHERE timestamp IS NULL")
            connection.commit()

    except Exception as e:
        logger.warning(f"Error in render_frames migration: {e}")


def _migrate_tasks_management_fields_sync(connection: sqlite3.Connection) -> None:
    """Ensure tasks table has task management fields (sync)"""
    try:
        columns = connection.execute("PRAGMA table_info(tasks)").fetchall()
        column_names = [col[1] for col in columns]

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
            connection.execute(f"ALTER TABLE tasks ADD COLUMN {column_name} {column_type}")

        if missing_columns:
            connection.execute("CREATE INDEX IF NOT EXISTS idx_tasks_lease ON tasks(lease_owner, lease_expires_at)")
            connection.commit()

    except Exception as e:
        logger.warning(f"Error in tasks migration: {e}")


def _migrate_executions_source_file_sync(connection: sqlite3.Connection) -> None:
    """Ensure executions table uses source_file instead of file_path (sync)"""
    try:
        columns = connection.execute("PRAGMA table_info(executions)").fetchall()
        column_names = [col[1] for col in columns]

        if 'file_path' in column_names and 'source_file' not in column_names:
            logger.info("Migrating executions: file_path -> source_file")
            connection.execute("ALTER TABLE executions ADD COLUMN source_file TEXT")
            connection.execute("UPDATE executions SET source_file = file_path WHERE source_file IS NULL")
            connection.commit()

    except Exception as e:
        logger.warning(f"Error in executions migration: {e}")


async def _apply_migrations(connection: "aiosqlite.Connection") -> None:
    """Apply additional migrations for existing databases (async)"""
    # Migration: Ensure render_frames table uses correct column names
    await _migrate_render_frames_columns(connection)

    # Migration: Ensure tasks table has management fields
    await _migrate_tasks_management_fields(connection)

    # Migration: Ensure executions table uses source_file column
    await _migrate_executions_source_file(connection)

    logger.info("All migrations applied successfully")


async def _migrate_render_frames_columns(connection: "aiosqlite.Connection") -> None:
    """Ensure render_frames table has correct column names matching Python API (async)"""
    try:
        async with connection.execute("PRAGMA table_info(render_frames)") as cursor:
            columns = await cursor.fetchall()

        column_names = [col[1] for col in columns]

        if 'tree_xml' in column_names and 'xml_content' not in column_names:
            logger.info("Migrating render_frames: tree_xml -> xml_content")
            await connection.execute("ALTER TABLE render_frames ADD COLUMN xml_content TEXT")
            await connection.execute("UPDATE render_frames SET xml_content = tree_xml WHERE xml_content IS NULL")
            await connection.commit()

        if 'created_at' in column_names and 'timestamp' not in column_names:
            logger.info("Migrating render_frames: created_at -> timestamp")
            await connection.execute("ALTER TABLE render_frames ADD COLUMN timestamp TEXT")
            await connection.execute("UPDATE render_frames SET timestamp = created_at WHERE timestamp IS NULL")
            await connection.commit()

    except Exception as e:
        logger.warning(f"Error in render_frames migration: {e}")


async def _migrate_tasks_management_fields(connection: "aiosqlite.Connection") -> None:
    """Ensure tasks table has task management fields (async)"""
    try:
        async with connection.execute("PRAGMA table_info(tasks)") as cursor:
            columns = await cursor.fetchall()

        column_names = [col[1] for col in columns]

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
            await connection.execute(f"ALTER TABLE tasks ADD COLUMN {column_name} {column_type}")

        if missing_columns:
            await connection.execute("CREATE INDEX IF NOT EXISTS idx_tasks_lease ON tasks(lease_owner, lease_expires_at)")
            await connection.commit()

    except Exception as e:
        logger.warning(f"Error in tasks migration: {e}")


async def _migrate_executions_source_file(connection: "aiosqlite.Connection") -> None:
    """Ensure executions table uses source_file instead of file_path (async)"""
    try:
        async with connection.execute("PRAGMA table_info(executions)") as cursor:
            columns = await cursor.fetchall()

        column_names = [col[1] for col in columns]

        if 'file_path' in column_names and 'source_file' not in column_names:
            logger.info("Migrating executions: file_path -> source_file")
            await connection.execute("ALTER TABLE executions ADD COLUMN source_file TEXT")
            await connection.execute("UPDATE executions SET source_file = file_path WHERE source_file IS NULL")
            await connection.commit()

    except Exception as e:
        logger.warning(f"Error in executions migration: {e}")


def create_fresh_database_sync(connection: sqlite3.Connection) -> None:
    """Create a fresh database with latest schema (sync)"""
    tables = connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()

    for table_row in tables:
        table_name = table_row[0]
        if table_name != 'sqlite_sequence':
            logger.info(f"Dropping table: {table_name}")
            connection.execute(f"DROP TABLE IF EXISTS {table_name}")

    connection.commit()
    run_migrations_sync(connection)
    logger.info("Fresh database created successfully")


async def create_fresh_database(connection: "aiosqlite.Connection") -> None:
    """Create a fresh database with latest schema (async)"""
    async with connection.execute("SELECT name FROM sqlite_master WHERE type='table'") as cursor:
        tables = await cursor.fetchall()

    for table_row in tables:
        table_name = table_row[0]
        if table_name != 'sqlite_sequence':
            logger.info(f"Dropping table: {table_name}")
            await connection.execute(f"DROP TABLE IF EXISTS {table_name}")

    await connection.commit()
    await run_migrations(connection)
    logger.info("Fresh database created successfully")