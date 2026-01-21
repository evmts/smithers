"""Frame Storm Guard.

Implements PRD section 8.7: Loop Detection and Frame Storm Prevention.

Detects when the system enters an infinite loop by tracking (plan_hash, state_hash)
signatures and detecting repeated patterns.
"""

import hashlib
import json
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Deque


class FrameStormError(Exception):
    """Raised when frame storm detected."""
    pass


@dataclass
class FrameStormGuard:
    """Guard against frame storms (infinite loops).
    
    Tracks frame rate and detects repeated (plan, state) patterns.
    
    Per PRD 8.7:
    - max_frames_per_second: Rate limit
    - max_frames_per_run: Total limit
    - max_frames_per_minute: Burst limit
    """
    
    max_frames_per_second: int = 10
    max_frames_per_run: int = 1000
    max_frames_per_minute: int = 200
    loop_detection_window: int = 5
    
    # Tracking state
    _frame_count: int = field(default=0, repr=False)
    _recent_signatures: Deque[tuple] = field(default_factory=lambda: deque(maxlen=20), repr=False)
    _frame_timestamps: Deque[float] = field(default_factory=lambda: deque(maxlen=60), repr=False)
    _start_time: float = field(default=0.0, repr=False)
    
    def __post_init__(self):
        self._start_time = datetime.now().timestamp()
    
    def check_frame(
        self,
        plan_hash: str,
        state_hash: str,
        now: Optional[float] = None
    ) -> None:
        """Check if this frame would violate limits.
        
        Raises FrameStormError if:
        - Total frames exceeded
        - Rate limit exceeded
        - Infinite loop detected
        
        Args:
            plan_hash: Hash of current plan tree
            state_hash: Hash of current state
            now: Current timestamp (for testing)
        """
        if now is None:
            now = datetime.now().timestamp()
        
        self._frame_count += 1
        self._frame_timestamps.append(now)
        
        # Check total frames
        if self._frame_count > self.max_frames_per_run:
            raise FrameStormError(
                f"Maximum frames exceeded: {self._frame_count} > {self.max_frames_per_run}"
            )
        
        # Check rate limits
        self._check_rate_limits(now)
        
        # Check for loops
        self._check_loop(plan_hash, state_hash)
    
    def _check_rate_limits(self, now: float) -> None:
        """Check frame rate limits."""
        if len(self._frame_timestamps) < 2:
            return
        
        # Frames per second
        recent_1s = sum(1 for t in self._frame_timestamps if now - t < 1.0)
        if recent_1s > self.max_frames_per_second:
            raise FrameStormError(
                f"Frame rate exceeded: {recent_1s}/s > {self.max_frames_per_second}/s"
            )
        
        # Frames per minute
        recent_60s = sum(1 for t in self._frame_timestamps if now - t < 60.0)
        if recent_60s > self.max_frames_per_minute:
            raise FrameStormError(
                f"Frame burst limit exceeded: {recent_60s}/min > {self.max_frames_per_minute}/min"
            )
    
    def _check_loop(self, plan_hash: str, state_hash: str) -> None:
        """Check for infinite loop pattern."""
        signature = (plan_hash, state_hash)
        
        # Count occurrences in recent history
        count = sum(1 for s in self._recent_signatures if s == signature)
        
        self._recent_signatures.append(signature)
        
        if count >= self.loop_detection_window:
            raise FrameStormError(
                f"Infinite loop detected: same (plan, state) repeated {count + 1} times. "
                "Execution paused."
            )
    
    def reset(self) -> None:
        """Reset guard state for new execution."""
        self._frame_count = 0
        self._recent_signatures.clear()
        self._frame_timestamps.clear()
        self._start_time = datetime.now().timestamp()
    
    @property
    def frame_count(self) -> int:
        """Current frame count."""
        return self._frame_count
    
    @property
    def elapsed_seconds(self) -> float:
        """Seconds since execution started."""
        return datetime.now().timestamp() - self._start_time


def compute_plan_hash(plan_tree: Any) -> str:
    """Compute deterministic hash of plan tree.
    
    Uses JSON serialization with sorted keys for determinism.
    """
    if hasattr(plan_tree, "model_dump"):
        data = plan_tree.model_dump(exclude={"meta", "handlers"})
    elif hasattr(plan_tree, "__dict__"):
        data = {k: v for k, v in plan_tree.__dict__.items() 
                if not k.startswith("_") and k not in ("meta", "handlers")}
    else:
        data = plan_tree
    
    try:
        json_str = json.dumps(data, sort_keys=True, default=str)
    except (TypeError, ValueError):
        json_str = str(data)
    
    return hashlib.sha256(json_str.encode()).hexdigest()[:12]


def compute_state_hash(state: Dict[str, Any]) -> str:
    """Compute deterministic hash of state snapshot.
    
    Uses JSON serialization with sorted keys for determinism.
    """
    try:
        json_str = json.dumps(state, sort_keys=True, default=str)
    except (TypeError, ValueError):
        json_str = str(sorted(state.items()))
    
    return hashlib.sha256(json_str.encode()).hexdigest()[:12]
