#!/usr/bin/env python3
"""Quick test to validate JSX runtime imports."""

try:
    from smithers_py.jsx_runtime import jsx, Fragment, INTRINSICS, OBSERVABLE_NODES, EVENT_PROPS
    print("✓ JSX runtime imports successful")

    from smithers_py.nodes import (
        Node,
        TextNode,
        IfNode,
        PhaseNode,
        StepNode,
        RalphNode,
        ClaudeNode,
        WhileNode,
        FragmentNode,
        EachNode,
        StopNode,
        EndNode,
        SmithersNode,
        EffectNode,
    )
    print("✓ Node imports successful")

    from smithers_py.errors import EventValidationError
    print("✓ Error imports successful")

    print("\nINTRINSICS registry:")
    for name, node_class in INTRINSICS.items():
        print(f"  {name}: {node_class.__name__}")

    print("\nOBSERVABLE_NODES:")
    for node_class in OBSERVABLE_NODES:
        print(f"  {node_class.__name__}")

    print("\nEVENT_PROPS:")
    for prop in EVENT_PROPS:
        print(f"  {prop}")

    # Quick functionality test
    node = jsx("phase", {"name": "test"}, "Hello world")
    print(f"\n✓ Created node: {node.type} with name '{node.name}'")
    print(f"  Children: {[c.text for c in node.children]}")

except Exception as e:
    import traceback
    print(f"✗ Import failed: {e}")
    traceback.print_exc()