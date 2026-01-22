"""VCS and Worktree integration for Smithers."""

from .workspace import (
    VCSType,
    Workspace,
    VCSOperations,
    detect_vcs_type,
    create_execution_worktree,
    cleanup_execution_worktree,
)

__all__ = [
    "VCSType",
    "Workspace",
    "VCSOperations",
    "detect_vcs_type",
    "create_execution_worktree",
    "cleanup_execution_worktree",
]
