"""File System Watcher and Observable State.

Implements PRD sections 2.2.3 (ctx.fs) and 8.12 (File System Debouncing).

Provides an abstraction for file system operations that:
- Instruments read/write for logging
- Records file hashes/metadata for audit
- Can trigger re-render on file changes
- Debounces rapid file changes
"""

import asyncio
import fnmatch
import hashlib
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set


@dataclass
class FileRecord:
    """Record of a file operation for audit."""
    path: str
    operation: str  # "read", "write", "delete"
    size: int
    hash: Optional[str]
    timestamp: datetime = field(default_factory=datetime.now)
    frame_id: Optional[int] = None
    node_id: Optional[str] = None


class FileWatcher:
    """File system watcher with debouncing.
    
    Per PRD section 8.12:
    - Debounces file changes (300ms default)
    - Ignores common patterns (node_modules, .git, etc.)
    """
    
    def __init__(
        self,
        debounce_ms: int = 300,
        ignore_patterns: Optional[List[str]] = None
    ):
        self.debounce_ms = debounce_ms
        self.ignore_patterns = ignore_patterns or [
            "node_modules/**",
            ".git/**",
            "dist/**",
            "__pycache__/**",
            "*.pyc",
            ".smithers/**",
            "*.log",
        ]
        
        self._pending_tick: Optional[asyncio.Task] = None
        self._on_change: Optional[Callable[[], None]] = None
        self._watching = False
    
    def set_on_change(self, callback: Callable[[], None]) -> None:
        """Set callback to invoke when files change."""
        self._on_change = callback
    
    def on_file_change(self, path: str) -> None:
        """Handle a file change event.
        
        Debounces changes and invokes callback after quiet period.
        """
        if self._matches_ignore(path):
            return
        
        self._cancel_pending_tick()
        self._schedule_tick()
    
    def _matches_ignore(self, path: str) -> bool:
        """Check if path matches any ignore pattern."""
        for pattern in self.ignore_patterns:
            if fnmatch.fnmatch(path, pattern):
                return True
            # Also check relative to basename
            if fnmatch.fnmatch(os.path.basename(path), pattern):
                return True
        return False
    
    def _cancel_pending_tick(self) -> None:
        """Cancel any pending tick."""
        if self._pending_tick and not self._pending_tick.done():
            self._pending_tick.cancel()
            self._pending_tick = None
    
    def _schedule_tick(self) -> None:
        """Schedule a tick after debounce delay."""
        async def delayed_tick():
            await asyncio.sleep(self.debounce_ms / 1000)
            if self._on_change:
                self._on_change()
        
        try:
            loop = asyncio.get_running_loop()
            self._pending_tick = loop.create_task(delayed_tick())
        except RuntimeError:
            # No running loop - call synchronously
            if self._on_change:
                self._on_change()
    
    def start(self, path: str) -> None:
        """Start watching a directory (placeholder for actual watcher)."""
        self._watching = True
        # In a real implementation, this would use watchfiles or similar
    
    def stop(self) -> None:
        """Stop watching."""
        self._watching = False
        self._cancel_pending_tick()


class FileSystemContext:
    """File system context providing instrumented operations.
    
    Per PRD section 2.2.3 (ctx.fs):
    - read/write operations are instrumented and logged
    - File changes can trigger re-render
    - Records file hashes/metadata for audit and diff
    """
    
    def __init__(
        self,
        base_path: Optional[str] = None,
        watcher: Optional[FileWatcher] = None,
        on_change: Optional[Callable[[], None]] = None
    ):
        self.base_path = Path(base_path) if base_path else Path.cwd()
        self.watcher = watcher or FileWatcher()
        self._records: List[FileRecord] = []
        self._current_frame_id: Optional[int] = None
        self._current_node_id: Optional[str] = None
        
        if on_change:
            self.watcher.set_on_change(on_change)
    
    def set_context(
        self,
        frame_id: Optional[int] = None,
        node_id: Optional[str] = None
    ) -> None:
        """Set context for subsequent operations."""
        self._current_frame_id = frame_id
        self._current_node_id = node_id
    
    def read(self, path: str) -> str:
        """Read a file with instrumentation.
        
        Args:
            path: Relative or absolute path
            
        Returns:
            File contents as string
        """
        abs_path = self._resolve_path(path)
        
        with open(abs_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        self._record(
            path=str(abs_path),
            operation="read",
            content=content
        )
        
        return content
    
    def read_bytes(self, path: str) -> bytes:
        """Read a file as bytes with instrumentation."""
        abs_path = self._resolve_path(path)
        
        with open(abs_path, 'rb') as f:
            content = f.read()
        
        self._record(
            path=str(abs_path),
            operation="read",
            content=content
        )
        
        return content
    
    def write(self, path: str, content: str) -> None:
        """Write a file with instrumentation.
        
        Args:
            path: Relative or absolute path
            content: Content to write
        """
        abs_path = self._resolve_path(path)
        
        # Ensure parent directory exists
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(abs_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        self._record(
            path=str(abs_path),
            operation="write",
            content=content
        )
        
        # Notify watcher
        self.watcher.on_file_change(str(abs_path))
    
    def write_bytes(self, path: str, content: bytes) -> None:
        """Write bytes to a file with instrumentation."""
        abs_path = self._resolve_path(path)
        
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(abs_path, 'wb') as f:
            f.write(content)
        
        self._record(
            path=str(abs_path),
            operation="write",
            content=content
        )
        
        self.watcher.on_file_change(str(abs_path))
    
    def delete(self, path: str) -> bool:
        """Delete a file with instrumentation.
        
        Returns:
            True if file was deleted, False if it didn't exist
        """
        abs_path = self._resolve_path(path)
        
        if not abs_path.exists():
            return False
        
        self._record(
            path=str(abs_path),
            operation="delete",
            content=None
        )
        
        abs_path.unlink()
        self.watcher.on_file_change(str(abs_path))
        
        return True
    
    def exists(self, path: str) -> bool:
        """Check if a file exists."""
        abs_path = self._resolve_path(path)
        return abs_path.exists()
    
    def stat(self, path: str) -> Optional[os.stat_result]:
        """Get file stats."""
        abs_path = self._resolve_path(path)
        if abs_path.exists():
            return abs_path.stat()
        return None
    
    def hash(self, path: str) -> Optional[str]:
        """Get SHA256 hash of a file."""
        abs_path = self._resolve_path(path)
        if not abs_path.exists():
            return None
        
        with open(abs_path, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
    
    def list_dir(self, path: str = ".") -> List[str]:
        """List directory contents."""
        abs_path = self._resolve_path(path)
        if not abs_path.is_dir():
            return []
        return [p.name for p in abs_path.iterdir()]
    
    def _resolve_path(self, path: str) -> Path:
        """Resolve path relative to base_path."""
        p = Path(path)
        if p.is_absolute():
            return p
        return self.base_path / p
    
    def _compute_hash(self, content: Any) -> str:
        """Compute hash of content."""
        if isinstance(content, str):
            data = content.encode('utf-8')
        elif isinstance(content, bytes):
            data = content
        else:
            return ""
        return hashlib.sha256(data).hexdigest()[:16]
    
    def _record(
        self,
        path: str,
        operation: str,
        content: Any
    ) -> None:
        """Record a file operation."""
        if isinstance(content, (str, bytes)):
            size = len(content)
            content_hash = self._compute_hash(content)
        else:
            size = 0
            content_hash = None
        
        record = FileRecord(
            path=path,
            operation=operation,
            size=size,
            hash=content_hash,
            frame_id=self._current_frame_id,
            node_id=self._current_node_id
        )
        self._records.append(record)
    
    def get_records(
        self,
        frame_id: Optional[int] = None
    ) -> List[FileRecord]:
        """Get file operation records, optionally filtered by frame."""
        if frame_id is None:
            return list(self._records)
        return [r for r in self._records if r.frame_id == frame_id]
    
    def clear_records(self) -> None:
        """Clear all records."""
        self._records.clear()
