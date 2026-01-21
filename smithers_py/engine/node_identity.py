"""Deterministic node identity for stable reconciliation and resumability.

Per PRD sections 7.2 and 8.2:
- Python's hash() MUST NOT be used (salted per-process)
- Uses SHA256 for deterministic identity
- Supports explicit id props, keys, and path-based fallback
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple, Union

from ..nodes.base import NodeBase


def compute_node_id(
    parent_id: Optional[str],
    key_or_index: Union[str, int],
    node_type: str,
    explicit_id: Optional[str] = None,
) -> str:
    """Compute deterministic node ID.

    Priority:
    1. Explicit `id` prop on node (highest precedence)
    2. Deterministic path: parent_id + "/" + (key or index) + ":" + node_type

    Uses SHA256 truncated to 12 chars for path-based IDs.
    """
    if explicit_id:
        return explicit_id

    path = f"{parent_id or 'root'}/{key_or_index}:{node_type}"
    return hashlib.sha256(path.encode('utf-8')).hexdigest()[:12]


def compute_execution_signature(
    script_path: str,
    script_content: str,
    engine_version: str,
    schema_version: int,
    git_commit: Optional[str] = None,
    env_fingerprint: Optional[str] = None,
) -> str:
    """Compute deterministic execution signature for restart detection.

    Per PRD section 8.10: hash of key execution parameters.
    """
    components = [
        hashlib.sha256(script_content.encode('utf-8')).hexdigest(),
        engine_version,
        str(schema_version),
        git_commit or "",
        env_fingerprint or "",
    ]
    signature = hashlib.sha256("|".join(components).encode()).hexdigest()[:16]
    return signature


@dataclass
class ResumeContext:
    """Context for validating resume compatibility."""
    script_hash: str
    git_commit: Optional[str]
    engine_version: str
    schema_version: int


def validate_resume(saved: ResumeContext, current: ResumeContext) -> List[str]:
    """Validate resume compatibility. Returns list of warnings."""
    warnings = []

    if saved.script_hash != current.script_hash:
        warnings.append("Script changed since last run - identity may not match")

    if saved.engine_version != current.engine_version:
        warnings.append(
            f"Engine version mismatch: {saved.engine_version} vs {current.engine_version}"
        )

    if saved.schema_version != current.schema_version:
        warnings.append(
            f"Schema version mismatch: {saved.schema_version} vs {current.schema_version}"
        )

    return warnings


@dataclass
class NodeWithId:
    """A node annotated with its computed stable ID."""
    node: NodeBase
    node_id: str
    parent_id: Optional[str]
    child_index: int


def assign_node_ids(
    node: NodeBase,
    parent_id: Optional[str] = None,
    child_index: int = 0,
) -> Tuple[str, Dict[str, NodeWithId]]:
    """Recursively assign stable IDs to a node tree.

    Returns:
        Tuple of (root_node_id, dict mapping node_id -> NodeWithId)
    """
    id_map: Dict[str, NodeWithId] = {}

    def _assign(n: NodeBase, p_id: Optional[str], idx: int) -> str:
        # Check for explicit id in props
        explicit_id = n.props.get("id") if hasattr(n, "props") else None
        if explicit_id is None and hasattr(n, "key") and n.key:
            # Use key as the identifier component
            key_or_index = n.key
        else:
            key_or_index = idx

        node_id = compute_node_id(p_id, key_or_index, n.type, explicit_id)

        # Store in map
        id_map[node_id] = NodeWithId(
            node=n,
            node_id=node_id,
            parent_id=p_id,
            child_index=idx,
        )

        # Process children
        if hasattr(n, "children") and n.children:
            for i, child in enumerate(n.children):
                _assign(child, node_id, i)

        return node_id

    root_id = _assign(node, parent_id, child_index)
    return root_id, id_map


@dataclass
class ReconcileResult:
    """Result of reconciling current tree against previous frame."""
    newly_mounted: List[str]  # node_ids that should start execution
    still_running: List[str]  # node_ids that continue running
    unmounted: List[str]      # node_ids to cancel, ignore results
    stale_results: List[str]  # task_ids that completed but node is gone


def reconcile_trees(
    current_ids: Dict[str, NodeWithId],
    previous_ids: Dict[str, NodeWithId],
    running_task_node_ids: Set[str],
) -> ReconcileResult:
    """Reconcile current tree IDs against previous frame.

    Args:
        current_ids: Node ID map from current frame
        previous_ids: Node ID map from previous frame
        running_task_node_ids: Set of node_ids with running tasks

    Returns:
        ReconcileResult with categorized node_ids
    """
    current_set = set(current_ids.keys())
    previous_set = set(previous_ids.keys())

    # Categorize nodes
    newly_mounted = list(current_set - previous_set)
    unmounted = list(previous_set - current_set)

    # Still running = nodes in both trees that have running tasks
    still_running = [
        nid for nid in (current_set & previous_set)
        if nid in running_task_node_ids
    ]

    return ReconcileResult(
        newly_mounted=newly_mounted,
        still_running=still_running,
        unmounted=unmounted,
        stale_results=[],  # Populated separately when task results arrive
    )


class NodeIdentityTracker:
    """Tracks node identity across frames for reconciliation.

    Maintains previous frame's ID map and handles stale result detection.
    """

    def __init__(self):
        self.previous_ids: Dict[str, NodeWithId] = {}
        self.current_ids: Dict[str, NodeWithId] = {}
        self.running_node_ids: Set[str] = set()

    def update_for_frame(self, root_node: NodeBase) -> ReconcileResult:
        """Assign IDs to new tree and reconcile against previous frame.

        Args:
            root_node: Root of the rendered plan tree

        Returns:
            ReconcileResult with mount/unmount information
        """
        # Compute current frame IDs
        _, self.current_ids = assign_node_ids(root_node)

        # Reconcile
        result = reconcile_trees(
            self.current_ids,
            self.previous_ids,
            self.running_node_ids,
        )

        # Update running set
        # Remove unmounted nodes from running set
        for node_id in result.unmounted:
            self.running_node_ids.discard(node_id)

        # Previous becomes current for next frame
        self.previous_ids = self.current_ids.copy()

        return result

    def mark_running(self, node_id: str) -> None:
        """Mark a node as having a running task."""
        self.running_node_ids.add(node_id)

    def mark_completed(self, node_id: str) -> bool:
        """Mark a node's task as completed. Returns True if node still mounted."""
        self.running_node_ids.discard(node_id)
        return node_id in self.current_ids

    def is_mounted(self, node_id: str) -> bool:
        """Check if a node is currently mounted."""
        return node_id in self.current_ids

    def get_node(self, node_id: str) -> Optional[NodeWithId]:
        """Get NodeWithId by ID if mounted."""
        return self.current_ids.get(node_id)


# List of node types that require explicit keys in loops
RUNNABLE_NODE_TYPES = {"claude", "smithers", "agent"}


class PlanLinter:
    """Lint plan trees for common issues.

    Per PRD section 7.9.3 rules.
    """

    @dataclass
    class LintWarning:
        rule: str
        message: str
        node_id: str
        severity: str  # "warning" or "info"

    def lint(self, id_map: Dict[str, NodeWithId]) -> List["PlanLinter.LintWarning"]:
        """Lint a plan tree and return warnings."""
        warnings = []

        for node_id, node_with_id in id_map.items():
            node = node_with_id.node

            # Rule: runnable-needs-id
            if node.type in RUNNABLE_NODE_TYPES:
                if not node.props.get("id") and not node.key:
                    warnings.append(self.LintWarning(
                        rule="runnable-needs-id",
                        message=f"Runnable node '{node.type}' at {node_id} lacks explicit id",
                        node_id=node_id,
                        severity="warning",
                    ))

            # Rule: loop-needs-max
            if node.type in ("while", "ralph"):
                if not node.props.get("max_iterations"):
                    warnings.append(self.LintWarning(
                        rule="loop-needs-max",
                        message=f"Loop at {node_id} lacks max_iterations",
                        node_id=node_id,
                        severity="warning",
                    ))

            # Rule: agent-needs-max-turns
            if node.type == "claude":
                if not node.props.get("max_turns"):
                    warnings.append(self.LintWarning(
                        rule="agent-needs-max-turns",
                        message=f"Agent at {node_id} using default max_turns",
                        node_id=node_id,
                        severity="info",
                    ))

        return warnings
