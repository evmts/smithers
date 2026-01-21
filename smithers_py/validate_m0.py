#!/usr/bin/env python3
"""Final validation script for M0-Package-Structure."""

import sys

def validate_imports():
    """Validate all imports work correctly."""
    print("Validating imports...")

    try:
        # Import all node types
        from smithers_py.nodes import (
            Node, NodeBase, NodeHandlers, NodeMeta,
            TextNode, IfNode, PhaseNode, StepNode, RalphNode,
            WhileNode, FragmentNode, EachNode, StopNode, EndNode,
            ClaudeNode, ToolPolicy, EffectNode
        )
        print("✓ All node types imported successfully")

        # Test discriminated union
        from pydantic import TypeAdapter
        adapter = TypeAdapter(Node)
        print("✓ Discriminated union type adapter created")

        return True
    except Exception as e:
        print(f"✗ Import validation failed: {e}")
        return False

def validate_node_creation():
    """Validate node creation works."""
    print("\nValidating node creation...")

    try:
        from smithers_py.nodes import TextNode, ClaudeNode, PhaseNode, StepNode

        # Create a simple workflow
        workflow = PhaseNode(
            name="validation",
            children=[
                StepNode(
                    name="setup",
                    children=[
                        TextNode(text="Starting validation...")
                    ]
                ),
                StepNode(
                    name="execute",
                    children=[
                        ClaudeNode(model="haiku", prompt="Validate the system")
                    ]
                )
            ]
        )

        # Serialize it
        data = workflow.model_dump_json()
        print("✓ Complex workflow created and serialized")

        return True
    except Exception as e:
        print(f"✗ Node creation validation failed: {e}")
        return False

def validate_error_handling():
    """Validate error handling works."""
    print("\nValidating error handling...")

    try:
        from smithers_py.nodes import TextNode, ClaudeNode
        from pydantic import ValidationError

        # Test missing required field
        try:
            TextNode()
        except ValidationError:
            print("✓ Missing required field raises ValidationError")
        else:
            print("✗ Missing required field did not raise error")
            return False

        # Test extra fields rejected
        try:
            ClaudeNode(model="sonnet", prompt="test", extra_field="not allowed")
        except ValidationError:
            print("✓ Extra fields are rejected")
        else:
            print("✗ Extra fields were not rejected")
            return False

        return True
    except Exception as e:
        print(f"✗ Error handling validation failed: {e}")
        return False

def main():
    """Run all validations."""
    print("M0-Package-Structure Validation")
    print("=" * 50)

    results = []
    results.append(validate_imports())
    results.append(validate_node_creation())
    results.append(validate_error_handling())

    print("\n" + "=" * 50)
    if all(results):
        print("✅ All validations passed!")
        print("\nThe M0-Package-Structure implementation is ready.")
        print("Run 'python3 -m pytest smithers_py/nodes/test_nodes.py -v' for the full test suite.")
        return 0
    else:
        print("❌ Some validations failed.")
        print("\nPlease fix the issues before proceeding.")
        return 1

if __name__ == "__main__":
    sys.exit(main())