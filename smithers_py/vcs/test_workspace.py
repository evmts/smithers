"""Tests for VCS workspace integration."""

import asyncio
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from smithers_py.vcs import (
    VCSType,
    Workspace,
    VCSOperations,
    detect_vcs_type,
    create_execution_worktree,
    cleanup_execution_worktree,
)


class TestVCSType:
    def test_enum_values(self):
        assert VCSType.GIT == "git"
        assert VCSType.JJ == "jj"
        assert VCSType.NONE == "none"


class TestDetectVCSType:
    def test_detect_git(self, tmp_path: Path):
        (tmp_path / ".git").mkdir()
        assert detect_vcs_type(tmp_path) == VCSType.GIT
    
    def test_detect_jj(self, tmp_path: Path):
        (tmp_path / ".jj").mkdir()
        assert detect_vcs_type(tmp_path) == VCSType.JJ
    
    def test_detect_jj_over_git(self, tmp_path: Path):
        (tmp_path / ".git").mkdir()
        (tmp_path / ".jj").mkdir()
        assert detect_vcs_type(tmp_path) == VCSType.JJ
    
    def test_detect_none(self, tmp_path: Path):
        assert detect_vcs_type(tmp_path) == VCSType.NONE
    
    def test_detect_parent_git(self, tmp_path: Path):
        (tmp_path / ".git").mkdir()
        subdir = tmp_path / "subdir"
        subdir.mkdir()
        assert detect_vcs_type(subdir) == VCSType.GIT
    
    def test_detect_parent_jj(self, tmp_path: Path):
        (tmp_path / ".jj").mkdir()
        subdir = tmp_path / "subdir"
        subdir.mkdir()
        assert detect_vcs_type(subdir) == VCSType.JJ


class TestWorkspace:
    @pytest.fixture
    def git_workspace(self, tmp_path: Path) -> Workspace:
        return Workspace(
            base_repo_path=tmp_path,
            execution_worktree=tmp_path,
            vcs_type=VCSType.GIT,
        )
    
    @pytest.fixture
    def jj_workspace(self, tmp_path: Path) -> Workspace:
        return Workspace(
            base_repo_path=tmp_path,
            execution_worktree=tmp_path,
            vcs_type=VCSType.JJ,
        )
    
    @pytest.fixture
    def none_workspace(self, tmp_path: Path) -> Workspace:
        return Workspace(
            base_repo_path=tmp_path,
            execution_worktree=tmp_path,
            vcs_type=VCSType.NONE,
        )
    
    @pytest.mark.asyncio
    async def test_snapshot_none_returns_none(self, none_workspace: Workspace):
        result = await none_workspace.snapshot("test")
        assert result is None
    
    @pytest.mark.asyncio
    async def test_rollback_none_returns_false(self, none_workspace: Workspace):
        result = await none_workspace.rollback("abc123")
        assert result is False
    
    @pytest.mark.asyncio
    async def test_diff_none_returns_empty(self, none_workspace: Workspace):
        result = await none_workspace.diff("a", "b")
        assert result == ""
    
    @pytest.mark.asyncio
    async def test_current_ref_none_returns_none(self, none_workspace: Workspace):
        result = await none_workspace.current_ref()
        assert result is None
    
    @pytest.mark.asyncio
    async def test_has_changes_none_returns_false(self, none_workspace: Workspace):
        result = await none_workspace.has_changes()
        assert result is False
    
    @pytest.mark.asyncio
    async def test_git_snapshot_calls_correct_commands(self, git_workspace: Workspace):
        with patch.object(git_workspace, '_run_cmd', new_callable=AsyncMock) as mock_cmd:
            mock_cmd.side_effect = [
                None,  # git add -A
                "M file.txt",  # git status --porcelain
                None,  # git commit
                "abc123",  # git rev-parse HEAD
            ]
            
            result = await git_workspace.snapshot("test message")
            
            assert result == "abc123"
            assert mock_cmd.call_count == 4
            mock_cmd.assert_any_call(["git", "add", "-A"])
            mock_cmd.assert_any_call(["git", "commit", "-m", "test message"])
    
    @pytest.mark.asyncio
    async def test_git_snapshot_no_changes(self, git_workspace: Workspace):
        with patch.object(git_workspace, '_run_cmd', new_callable=AsyncMock) as mock_cmd:
            mock_cmd.side_effect = [
                None,  # git add -A
                "",  # git status --porcelain (no changes)
                "abc123",  # git rev-parse HEAD
            ]
            
            result = await git_workspace.snapshot("test message")
            
            assert result == "abc123"
            assert mock_cmd.call_count == 3
    
    @pytest.mark.asyncio
    async def test_git_rollback_success(self, git_workspace: Workspace):
        with patch.object(git_workspace, '_run_cmd', new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = None
            
            result = await git_workspace.rollback("abc123")
            
            assert result is True
            mock_cmd.assert_called_once_with(["git", "reset", "--hard", "abc123"])
    
    @pytest.mark.asyncio
    async def test_git_diff(self, git_workspace: Workspace):
        with patch.object(git_workspace, '_run_cmd', new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = "diff --git a/file.txt..."
            
            result = await git_workspace.diff("abc", "def")
            
            assert result == "diff --git a/file.txt..."
            mock_cmd.assert_called_once_with(["git", "diff", "abc", "def"])
    
    @pytest.mark.asyncio
    async def test_jj_snapshot_calls_correct_commands(self, jj_workspace: Workspace):
        with patch.object(jj_workspace, '_run_cmd', new_callable=AsyncMock) as mock_cmd:
            mock_cmd.side_effect = [
                None,  # jj describe
                None,  # jj new
                "xyz789",  # jj log
            ]
            
            result = await jj_workspace.snapshot("test message")
            
            assert result == "xyz789"
            mock_cmd.assert_any_call(["jj", "describe", "-m", "test message"])
            mock_cmd.assert_any_call(["jj", "new"])
    
    @pytest.mark.asyncio
    async def test_jj_rollback(self, jj_workspace: Workspace):
        with patch.object(jj_workspace, '_run_cmd', new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = None
            
            result = await jj_workspace.rollback("xyz789")
            
            assert result is True
            mock_cmd.assert_called_once_with(["jj", "edit", "xyz789"])
    
    @pytest.mark.asyncio
    async def test_jj_diff(self, jj_workspace: Workspace):
        with patch.object(jj_workspace, '_run_cmd', new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = "Modified file.txt"
            
            result = await jj_workspace.diff("a", "b")
            
            assert result == "Modified file.txt"
            mock_cmd.assert_called_once_with(["jj", "diff", "--from", "a", "--to", "b"])
    
    @pytest.mark.asyncio
    async def test_git_has_changes_true(self, git_workspace: Workspace):
        with patch.object(git_workspace, '_run_cmd', new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = "M file.txt"
            
            result = await git_workspace.has_changes()
            
            assert result is True
    
    @pytest.mark.asyncio
    async def test_git_has_changes_false(self, git_workspace: Workspace):
        with patch.object(git_workspace, '_run_cmd', new_callable=AsyncMock) as mock_cmd:
            mock_cmd.return_value = ""
            
            result = await git_workspace.has_changes()
            
            assert result is False


class TestVCSOperations:
    @pytest.fixture
    def git_ops(self, tmp_path: Path) -> VCSOperations:
        workspace = Workspace(
            base_repo_path=tmp_path,
            execution_worktree=tmp_path,
            vcs_type=VCSType.GIT,
        )
        with patch('shutil.which', return_value="/usr/bin/git"):
            return VCSOperations(workspace)
    
    @pytest.fixture
    def unavailable_ops(self, tmp_path: Path) -> VCSOperations:
        workspace = Workspace(
            base_repo_path=tmp_path,
            execution_worktree=tmp_path,
            vcs_type=VCSType.GIT,
        )
        with patch('shutil.which', return_value=None):
            return VCSOperations(workspace)
    
    @pytest.fixture
    def none_ops(self, tmp_path: Path) -> VCSOperations:
        workspace = Workspace(
            base_repo_path=tmp_path,
            execution_worktree=tmp_path,
            vcs_type=VCSType.NONE,
        )
        return VCSOperations(workspace)
    
    def test_availability_check_git(self, tmp_path: Path):
        workspace = Workspace(tmp_path, tmp_path, VCSType.GIT)
        with patch('shutil.which', return_value="/usr/bin/git"):
            ops = VCSOperations(workspace)
            assert ops.available is True
    
    def test_availability_check_none(self, none_ops: VCSOperations):
        assert none_ops.available is False
    
    def test_availability_check_missing_binary(self, unavailable_ops: VCSOperations):
        assert unavailable_ops.available is False
    
    @pytest.mark.asyncio
    async def test_snapshot_graceful_degradation(self, unavailable_ops: VCSOperations):
        result = await unavailable_ops.snapshot("test")
        assert result is None
    
    @pytest.mark.asyncio
    async def test_rollback_graceful_degradation(self, unavailable_ops: VCSOperations):
        result = await unavailable_ops.rollback("abc123")
        assert result is False
    
    @pytest.mark.asyncio
    async def test_diff_graceful_degradation(self, unavailable_ops: VCSOperations):
        result = await unavailable_ops.diff("a", "b")
        assert result == ""
    
    @pytest.mark.asyncio
    async def test_current_ref_graceful_degradation(self, unavailable_ops: VCSOperations):
        result = await unavailable_ops.current_ref()
        assert result is None
    
    @pytest.mark.asyncio
    async def test_has_changes_graceful_degradation(self, unavailable_ops: VCSOperations):
        result = await unavailable_ops.has_changes()
        assert result is False
    
    @pytest.mark.asyncio
    async def test_snapshot_delegates_to_workspace(self, git_ops: VCSOperations):
        with patch.object(git_ops.workspace, 'snapshot', new_callable=AsyncMock) as mock:
            mock.return_value = "abc123"
            result = await git_ops.snapshot("test")
            assert result == "abc123"
            mock.assert_called_once_with("test")


class TestCreateExecutionWorktree:
    @pytest.mark.asyncio
    async def test_create_worktree_no_vcs(self, tmp_path: Path):
        workspace = await create_execution_worktree(tmp_path, "exec-123")
        
        assert workspace.base_repo_path == tmp_path
        assert workspace.execution_worktree == tmp_path
        assert workspace.vcs_type == VCSType.NONE
    
    @pytest.mark.asyncio
    async def test_create_worktree_git(self, tmp_path: Path):
        (tmp_path / ".git").mkdir()
        
        with patch('asyncio.create_subprocess_exec', new_callable=AsyncMock) as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.communicate = AsyncMock(return_value=(b"", b""))
            mock_exec.return_value = mock_proc
            
            workspace = await create_execution_worktree(tmp_path, "exec-123")
            
            assert workspace.base_repo_path == tmp_path
            assert workspace.vcs_type == VCSType.GIT
            assert "exec-123" in str(workspace.execution_worktree)
    
    @pytest.mark.asyncio
    async def test_create_worktree_jj(self, tmp_path: Path):
        (tmp_path / ".jj").mkdir()
        
        with patch('asyncio.create_subprocess_exec', new_callable=AsyncMock) as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.communicate = AsyncMock(return_value=(b"", b""))
            mock_exec.return_value = mock_proc
            
            workspace = await create_execution_worktree(tmp_path, "exec-456")
            
            assert workspace.vcs_type == VCSType.JJ
            assert "exec-456" in str(workspace.execution_worktree)
    
    @pytest.mark.asyncio
    async def test_custom_worktrees_dir(self, tmp_path: Path):
        custom_dir = tmp_path / "custom_worktrees"
        workspace = await create_execution_worktree(tmp_path, "exec-789", custom_dir)
        
        assert workspace.execution_worktree == tmp_path


class TestCleanupExecutionWorktree:
    @pytest.mark.asyncio
    async def test_cleanup_no_vcs(self, tmp_path: Path):
        workspace = Workspace(tmp_path, tmp_path, VCSType.NONE)
        await cleanup_execution_worktree(workspace)
    
    @pytest.mark.asyncio
    async def test_cleanup_same_path(self, tmp_path: Path):
        workspace = Workspace(tmp_path, tmp_path, VCSType.GIT)
        await cleanup_execution_worktree(workspace)
    
    @pytest.mark.asyncio
    async def test_cleanup_git_worktree(self, tmp_path: Path):
        worktree_path = tmp_path / "worktree"
        workspace = Workspace(tmp_path, worktree_path, VCSType.GIT)
        
        with patch('asyncio.create_subprocess_exec', new_callable=AsyncMock) as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.communicate = AsyncMock(return_value=(b"", b""))
            mock_exec.return_value = mock_proc
            
            await cleanup_execution_worktree(workspace)
            
            mock_exec.assert_called_once()
            call_args = mock_exec.call_args[0]
            assert "worktree" in call_args
            assert "remove" in call_args
    
    @pytest.mark.asyncio
    async def test_cleanup_jj_workspace(self, tmp_path: Path):
        worktree_path = tmp_path / "jj_workspace"
        worktree_path.mkdir()
        workspace = Workspace(tmp_path, worktree_path, VCSType.JJ)
        
        with patch('asyncio.create_subprocess_exec', new_callable=AsyncMock) as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.communicate = AsyncMock(return_value=(b"", b""))
            mock_exec.return_value = mock_proc
            
            with patch('shutil.rmtree') as mock_rmtree:
                await cleanup_execution_worktree(workspace)
                
                mock_exec.assert_called_once()
                call_args = mock_exec.call_args[0]
                assert "workspace" in call_args
                assert "forget" in call_args


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
