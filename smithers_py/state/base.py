"""Base state store protocol and write operations."""

from typing import Protocol, Any, Optional, Dict, List
from dataclasses import dataclass
from datetime import datetime


@dataclass
class WriteOp:
    """Queued write operation for batched state updates."""
    key: str
    value: Any
    trigger: Optional[str] = None
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


class StateStore(Protocol):
    """Protocol for state storage backends with batched writes."""

    def get(self, key: str) -> Any:
        """Get value for key. Returns None if not found."""
        ...

    def set(self, key: str, value: Any, trigger: Optional[str] = None) -> None:
        """Queue a write operation. Changes not applied until commit()."""
        ...

    def snapshot(self) -> Dict[str, Any]:
        """Return frozen snapshot of current state for render."""
        ...

    def enqueue(self, ops: List[WriteOp]) -> None:
        """Queue multiple write operations."""
        ...

    def commit(self) -> None:
        """Apply all queued write operations atomically."""
        ...

    def has_pending_writes(self) -> bool:
        """Check if there are pending writes to commit."""
        ...

    def clear_queue(self) -> None:
        """Clear pending write queue without applying."""
        ...