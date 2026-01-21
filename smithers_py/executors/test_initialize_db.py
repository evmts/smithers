"""Test the database initialization to see what's missing."""

import asyncio
from smithers_py.db.database import SmithersDB

async def test_db_init():
    """Test database initialization."""
    db = SmithersDB(":memory:")
    await db.connect()

    # Check what methods exist
    print("SmithersDB methods:")
    for attr in dir(db):
        if not attr.startswith('_'):
            print(f"  {attr}: {type(getattr(db, attr))}")

    # Check connection
    print(f"\nConnection type: {type(db.connection)}")
    print(f"Is async: {db.is_async}")

    # Try to query agents table
    try:
        result = await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'")
        print(f"\nAgents table exists: {bool(result)}")
    except Exception as e:
        print(f"\nError checking agents table: {e}")

    # List all tables
    tables = await db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    print(f"\nExisting tables: {[t[0] for t in tables]}")

    await db.close()

if __name__ == "__main__":
    asyncio.run(test_db_init())