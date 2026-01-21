#!/usr/bin/env python3
"""Simple test to check MCP resources work"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from smithers_py.mcp.resources import MCPResourceProvider, MCPResource
    print("✓ Import successful")

    # Test basic resource creation
    resource = MCPResource(uri="smithers://test", data={"key": "value"})
    print("✓ MCPResource creation successful")

    # Test resource provider creation
    provider = MCPResourceProvider("/tmp/test.db")
    print("✓ MCPResourceProvider creation successful")

    # Test unknown resource
    result = provider.resolve("smithers://unknown")
    if result and result.data.get("type") == "not_found":
        print("✓ Unknown resource handling works")

    print("\nAll basic tests passed!")

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)