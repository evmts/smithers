"""Smithers engine module for tick loop, reconciliation, and task management."""

from .tick_loop import TickLoop, Context
from .events import EventSystem, EventRecord
from .handler_transaction import HandlerTransaction
from .task_lease import (
    TaskLeaseManager,
    CancellationHandler,
    OrphanPolicy,
    recover_orphans,
    RetryTask,
    MarkFailed,
)
from .stop_conditions import (
    StopConditions,
    ExecutionStats,
    StopResult,
    check_stop_conditions,
    FrameStormGuard,
)
from .effects import (
    EffectRegistry,
    EffectLoopDetector,
    EffectLoopError,
    run_effects_strict_mode,
)
from .node_identity import (
    compute_node_id,
    compute_execution_signature,
    assign_node_ids,
    reconcile_trees,
    ReconcileResult,
    NodeIdentityTracker,
    ResumeContext,
    validate_resume,
    PlanLinter,
    NodeWithId,
)
from .artifacts import (
    ArtifactSystem,
    ArtifactType,
    Artifact,
)
from .approvals import (
    ApprovalSystem,
    ApprovalKind,
    ApprovalStatus,
    ApprovalRequest,
    ApprovalResult,
    create_file_edit_approval,
    create_command_exec_approval,
)
from .loops import (
    LoopRegistry,
    LoopState,
    compute_iteration_node_id,
)
from .phases import (
    PhaseRegistry,
    PhaseProgress,
    StepProgress,
    PhaseStatus,
)
from .frame_storm import (
    FrameStormGuard as FrameStormGuardNew,
    FrameStormError,
    compute_plan_hash,
    compute_state_hash,
)
from .fs_watcher import (
    FileWatcher,
    FileSystemContext,
    FileRecord,
)
from .render_purity import (
    FramePhase,
    RenderPhaseWriteError,
    RenderPhaseTaskError,
    RenderPhaseDbWriteError,
    get_current_phase,
    set_current_phase,
    is_render_phase,
    phase_context,
    enforce_purity,
    check_write_allowed,
    check_task_allowed,
    PurityGuardedState,
    PurityAuditor,
)

__all__ = [
    # Core loop
    "TickLoop",
    "Context",
    # Events
    "EventSystem",
    "EventRecord",
    "HandlerTransaction",
    # Task management
    "TaskLeaseManager",
    "CancellationHandler",
    "OrphanPolicy",
    "recover_orphans",
    "RetryTask",
    "MarkFailed",
    # Stop conditions
    "StopConditions",
    "ExecutionStats",
    "StopResult",
    "check_stop_conditions",
    "FrameStormGuard",
    # Effects
    "EffectRegistry",
    "EffectLoopDetector",
    "EffectLoopError",
    "run_effects_strict_mode",
    # Node identity
    "compute_node_id",
    "compute_execution_signature",
    "assign_node_ids",
    "reconcile_trees",
    "ReconcileResult",
    "NodeIdentityTracker",
    "ResumeContext",
    "validate_resume",
    "PlanLinter",
    "NodeWithId",
    # Artifacts
    "ArtifactSystem",
    "ArtifactType",
    "Artifact",
    # Approvals
    "ApprovalSystem",
    "ApprovalKind",
    "ApprovalStatus",
    "ApprovalRequest",
    "ApprovalResult",
    "create_file_edit_approval",
    "create_command_exec_approval",
    # Loops
    "LoopRegistry",
    "LoopState",
    "compute_iteration_node_id",
    # Phases
    "PhaseRegistry",
    "PhaseProgress",
    "StepProgress",
    "PhaseStatus",
    # Frame storm guard
    "FrameStormGuardNew",
    "FrameStormError",
    "compute_plan_hash",
    "compute_state_hash",
    # File system watcher (PRD 2.2.3, 8.12)
    "FileWatcher",
    "FileSystemContext",
    "FileRecord",
    # Render purity (PRD 7.1.2)
    "FramePhase",
    "RenderPhaseWriteError",
    "RenderPhaseTaskError",
    "RenderPhaseDbWriteError",
    "get_current_phase",
    "set_current_phase",
    "is_render_phase",
    "phase_context",
    "enforce_purity",
    "check_write_allowed",
    "check_task_allowed",
    "PurityGuardedState",
    "PurityAuditor",
]