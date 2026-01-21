"""
Smithers Python Database Layer

A comprehensive SQLite-based database layer for state management,
execution tracking, and orchestration that matches the TypeScript schema.

Main exports:
- SmithersDB: Main database class
- create_smithers_db: Sync database factory
- create_async_smithers_db: Async database factory
- run_migrations: Schema initialization
"""

from .database import (
    SmithersDB,
    SqliteStore,
    ExecutionModule,
    TasksModule,
    RenderFramesModule,
    create_smithers_db,
    create_async_smithers_db,
)

from .migrations import (
    run_migrations,
    create_fresh_database,
)

__all__ = [
    # Main classes
    'SmithersDB',
    'SqliteStore',
    'ExecutionModule',
    'TasksModule',
    'RenderFramesModule',

    # Factory functions
    'create_smithers_db',
    'create_async_smithers_db',

    # Migration functions
    'run_migrations',
    'create_fresh_database',
]

__version__ = '1.0.0'