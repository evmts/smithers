"""
Smithers Python Implementation

A Python port of the Smithers orchestration framework for AI agent coordination.
"""

# Database
from .db import (
    SmithersDB,
    create_smithers_db,
    create_async_smithers_db,
    run_migrations,
)

# Nodes - all node types for building orchestrations
from .nodes import (
    Node,
    NodeBase,
    NodeHandlers,
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
    ToolPolicy,
)

# Engine - tick loop and context
from .engine import (
    TickLoop,
    Context,
    EventSystem,
)

# State stores
from .state import (
    StateStore,
    SqliteStore,
    VolatileStore,
)

# JSX runtime
from .jsx_runtime import jsx, Fragment

# Decorators
from .decorators import component

__all__ = [
    # Database
    'SmithersDB',
    'create_smithers_db',
    'create_async_smithers_db',
    'run_migrations',
    # Nodes
    'Node',
    'NodeBase',
    'NodeHandlers',
    'TextNode',
    'IfNode',
    'PhaseNode',
    'StepNode',
    'RalphNode',
    'ClaudeNode',
    'WhileNode',
    'FragmentNode',
    'EachNode',
    'StopNode',
    'EndNode',
    'SmithersNode',
    'EffectNode',
    'ToolPolicy',
    # Engine
    'TickLoop',
    'Context',
    'EventSystem',
    # State
    'StateStore',
    'SqliteStore',
    'VolatileStore',
    # JSX
    'jsx',
    'Fragment',
    # Decorators
    'component',
]

__version__ = '1.0.0'
