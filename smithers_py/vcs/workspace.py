"""VCS and Worktree integration for Smithers.

Provides workspace abstraction for version control:
- Isolated worktrees per execution
- Snapshot/rollback for safe agent operations
- Git and Jujutsu (jj) support
- Graceful degradation when VCS unavailable
"""

from __future__ import annotations

import asyncio
import logging
import shutil
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional


logger = logging.getLogger(__name__)


class VCSType(str, Enum):
    GIT = "git"
    JJ = "jj"
    NONE = "none"


@dataclass
class Workspace:
    """Workspace abstraction for VCS operations.
    
    Per PRD 7.11.1:
    - base_repo_path: Original repository
    - execution_worktree: Isolated per-execution
    - vcs_type: git, jj, or none
    """
    base_repo_path: Path
    execution_worktree: Path
    vcs_type: VCSType
    
    async def snapshot(self, message: str) -> Optional[str]:
        """Create snapshot/commit. Returns ref."""
        if self.vcs_type == VCSType.GIT:
            return await self._git_snapshot(message)
        elif self.vcs_type == VCSType.JJ:
            return await self._jj_snapshot(message)
        return None
    
    async def rollback(self, ref: str) -> bool:
        """Rollback to snapshot."""
        if self.vcs_type == VCSType.GIT:
            return await self._git_rollback(ref)
        elif self.vcs_type == VCSType.JJ:
            return await self._jj_rollback(ref)
        return False
    
    async def diff(self, from_ref: str, to_ref: str) -> str:
        """Get diff between refs."""
        if self.vcs_type == VCSType.GIT:
            return await self._git_diff(from_ref, to_ref)
        elif self.vcs_type == VCSType.JJ:
            return await self._jj_diff(from_ref, to_ref)
        return ""
    
    async def current_ref(self) -> Optional[str]:
        """Get current ref/commit."""
        if self.vcs_type == VCSType.GIT:
            return await self._run_cmd(["git", "rev-parse", "HEAD"])
        elif self.vcs_type == VCSType.JJ:
            return await self._run_cmd(["jj", "log", "-r", "@", "--no-graph", "-T", "change_id"])
        return None
    
    async def has_changes(self) -> bool:
        """Check if there are uncommitted changes."""
        if self.vcs_type == VCSType.GIT:
            result = await self._run_cmd(["git", "status", "--porcelain"])
            return bool(result and result.strip())
        elif self.vcs_type == VCSType.JJ:
            result = await self._run_cmd(["jj", "diff", "--stat"])
            return bool(result and result.strip())
        return False
    
    async def _git_snapshot(self, message: str) -> Optional[str]:
        """Create git commit."""
        await self._run_cmd(["git", "add", "-A"])
        
        status = await self._run_cmd(["git", "status", "--porcelain"])
        if not status or not status.strip():
            return await self.current_ref()
        
        await self._run_cmd(["git", "commit", "-m", message])
        return await self.current_ref()
    
    async def _git_rollback(self, ref: str) -> bool:
        """Rollback to git ref."""
        try:
            await self._run_cmd(["git", "reset", "--hard", ref])
            return True
        except Exception as e:
            logger.error(f"Git rollback failed: {e}")
            return False
    
    async def _git_diff(self, from_ref: str, to_ref: str) -> str:
        """Get git diff."""
        result = await self._run_cmd(["git", "diff", from_ref, to_ref])
        return result or ""
    
    async def _jj_snapshot(self, message: str) -> Optional[str]:
        """Create jj commit."""
        await self._run_cmd(["jj", "describe", "-m", message])
        await self._run_cmd(["jj", "new"])
        return await self._run_cmd(["jj", "log", "-r", "@-", "--no-graph", "-T", "change_id"])
    
    async def _jj_rollback(self, ref: str) -> bool:
        """Rollback to jj ref."""
        try:
            await self._run_cmd(["jj", "edit", ref])
            return True
        except Exception as e:
            logger.error(f"JJ rollback failed: {e}")
            return False
    
    async def _jj_diff(self, from_ref: str, to_ref: str) -> str:
        """Get jj diff."""
        result = await self._run_cmd(["jj", "diff", "--from", from_ref, "--to", to_ref])
        return result or ""
    
    async def _run_cmd(self, cmd: list[str]) -> Optional[str]:
        """Run command in worktree directory."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=self.execution_worktree,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                logger.warning(f"Command {cmd} failed: {stderr.decode()}")
                return None
            return stdout.decode().strip()
        except Exception as e:
            logger.error(f"Command {cmd} error: {e}")
            return None


class VCSOperations:
    """VCS operations with graceful degradation.
    
    Per PRD 7.11.2: Return None/log warning if VCS unavailable.
    """
    
    def __init__(self, workspace: Workspace):
        self.workspace = workspace
        self.available = self._check_availability()
    
    def _check_availability(self) -> bool:
        """Check if VCS is available."""
        if self.workspace.vcs_type == VCSType.NONE:
            return False
        
        cmd = "git" if self.workspace.vcs_type == VCSType.GIT else "jj"
        return shutil.which(cmd) is not None
    
    async def snapshot(self, message: str) -> Optional[str]:
        """Create snapshot with graceful degradation."""
        if not self.available:
            logger.warning("VCS not available, skipping snapshot")
            return None
        return await self.workspace.snapshot(message)
    
    async def rollback(self, ref: str) -> bool:
        """Rollback with graceful degradation."""
        if not self.available:
            logger.warning("VCS not available, cannot rollback")
            return False
        return await self.workspace.rollback(ref)
    
    async def diff(self, from_ref: str, to_ref: str) -> str:
        """Get diff with graceful degradation."""
        if not self.available:
            return ""
        return await self.workspace.diff(from_ref, to_ref)
    
    async def current_ref(self) -> Optional[str]:
        """Get current ref with graceful degradation."""
        if not self.available:
            return None
        return await self.workspace.current_ref()
    
    async def has_changes(self) -> bool:
        """Check changes with graceful degradation."""
        if not self.available:
            return False
        return await self.workspace.has_changes()


def detect_vcs_type(path: Path) -> VCSType:
    """Detect VCS type from path."""
    if (path / ".jj").exists():
        return VCSType.JJ
    if (path / ".git").exists():
        return VCSType.GIT
    
    current = path
    while current != current.parent:
        if (current / ".jj").exists():
            return VCSType.JJ
        if (current / ".git").exists():
            return VCSType.GIT
        current = current.parent
    
    return VCSType.NONE


async def create_execution_worktree(
    base_repo: Path,
    execution_id: str,
    worktrees_dir: Optional[Path] = None,
) -> Workspace:
    """Create isolated worktree for execution.
    
    Args:
        base_repo: Original repository path
        execution_id: Unique execution identifier
        worktrees_dir: Directory for worktrees (default: .smithers/.worktrees)
    
    Returns:
        Workspace configured for the execution
    """
    vcs_type = detect_vcs_type(base_repo)
    
    if worktrees_dir is None:
        worktrees_dir = base_repo / ".smithers" / ".worktrees"
    
    worktree_path = worktrees_dir / execution_id
    
    if vcs_type == VCSType.GIT:
        worktrees_dir.mkdir(parents=True, exist_ok=True)
        
        proc = await asyncio.create_subprocess_exec(
            "git", "worktree", "add", str(worktree_path), "HEAD",
            cwd=base_repo,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        
    elif vcs_type == VCSType.JJ:
        worktrees_dir.mkdir(parents=True, exist_ok=True)
        if not worktree_path.exists():
            proc = await asyncio.create_subprocess_exec(
                "jj", "workspace", "add", str(worktree_path),
                cwd=base_repo,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
    else:
        worktree_path = base_repo
    
    return Workspace(
        base_repo_path=base_repo,
        execution_worktree=worktree_path,
        vcs_type=vcs_type,
    )


async def cleanup_execution_worktree(workspace: Workspace) -> None:
    """Remove execution worktree."""
    if workspace.vcs_type == VCSType.NONE:
        return
    
    if workspace.execution_worktree == workspace.base_repo_path:
        return
    
    if workspace.vcs_type == VCSType.GIT:
        proc = await asyncio.create_subprocess_exec(
            "git", "worktree", "remove", str(workspace.execution_worktree),
            cwd=workspace.base_repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
    elif workspace.vcs_type == VCSType.JJ:
        proc = await asyncio.create_subprocess_exec(
            "jj", "workspace", "forget", workspace.execution_worktree.name,
            cwd=workspace.base_repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        if workspace.execution_worktree.exists():
            shutil.rmtree(workspace.execution_worktree)
