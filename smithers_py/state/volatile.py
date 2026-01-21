"""Volatile (in-memory) state store implementation."""

import copy
from typing import Dict, Any, Optional, List
from .base import StateStore, WriteOp


class VolatileStore:
    """In-memory state store with version counter and batched writes."""

    def __init__(self) -> None:
        self._data: Dict[str, Any] = {}
        self._version: int = 0
        self._write_queue: List[WriteOp] = []

    def get(self, key: str) -> Any:
        """Get value for key from current state."""
        return self._data.get(key)

    def set(self, key: str, value: Any, trigger: Optional[str] = None) -> None:
        """Queue a write operation. Changes not applied until commit()."""
        self._write_queue.append(WriteOp(key=key, value=value, trigger=trigger))

    def snapshot(self) -> Dict[str, Any]:
        """Return frozen copy of current state for render."""
        return copy.deepcopy(self._data)

    def enqueue(self, ops: List[WriteOp]) -> None:
        """Queue multiple write operations."""
        self._write_queue.extend(ops)

    def commit(self) -> None:
        """Apply all queued write operations atomically."""
        if not self._write_queue:
            return

        # Apply all writes in order
        for op in self._write_queue:
            if op.value is None:
                # Delete operation
                self._data.pop(op.key, None)
            else:
                # Set operation
                self._data[op.key] = op.value

        # Increment version counter
        self._version += 1

        # Clear the queue
        self._write_queue.clear()

    def has_pending_writes(self) -> bool:
        """Check if there are pending writes to commit."""
        return bool(self._write_queue)

    def clear_queue(self) -> None:
        """Clear pending write queue without applying."""
        self._write_queue.clear()

    @property
    def version(self) -> int:
        """Get current version counter."""
        return self._version

    def __len__(self) -> int:
        """Return number of keys in store."""
        return len(self._data)

    def keys(self):
        """Return keys in store."""
        return self._data.keys()

    def items(self):
        """Return items in store."""
        return self._data.items()