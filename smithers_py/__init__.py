"""
Smithers Python Implementation

A Python port of the Smithers orchestration framework for AI agent coordination.
Features React-like render loop with SQLite-backed durable state.
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
    ArtifactSystem,
    ApprovalSystem,
    LoopRegistry,
    PhaseRegistry,
    EffectRegistry,
    StopConditions,
)

# State stores and signals
from .state import (
    StateStore,
    SqliteStore,
    VolatileStore,
)

from .state.signals import (
    Signal,
    Computed,
    DependencyTracker,
    ActionQueue,
    SignalRegistry,
)

# Logging
from .logs import (
    NDJSONLogger,
    EventType,
    create_logger,
)

# VCS integration
from .vcs import (
    Workspace,
    VCSOperations,
    VCSType,
    create_execution_worktree,
    cleanup_execution_worktree,
    detect_vcs_type,
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
    'ArtifactSystem',
    'ApprovalSystem',
    'LoopRegistry',
    'PhaseRegistry',
    'EffectRegistry',
    'StopConditions',
    # State
    'StateStore',
    'SqliteStore',
    'VolatileStore',
    # Signals
    'Signal',
    'Computed',
    'DependencyTracker',
    'ActionQueue',
    'SignalRegistry',
    # Logging
    'NDJSONLogger',
    'EventType',
    'create_logger',
    # VCS
    'Workspace',
    'VCSOperations',
    'VCSType',
    'create_execution_worktree',
    'cleanup_execution_worktree',
    'detect_vcs_type',
    # JSX
    'jsx',
    'Fragment',
    # Decorators
    'component',
]

__version__ = '1.0.0'
