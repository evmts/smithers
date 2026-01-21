"""
Global Stop Conditions for execution management.

Implements PRD section 7.6.4 - conditions that can halt execution.
"""

from dataclasses import dataclass, field
from typing import Optional, Callable, Any
from datetime import datetime, timedelta


@dataclass
class StopConditions:
    """
    Global stop conditions that apply to the entire execution.
    
    When any condition is met, the execution stops gracefully.
    """
    max_wall_clock_ms: Optional[int] = None
    max_total_tokens: Optional[int] = None
    max_tool_calls: Optional[int] = None
    max_retries_per_task: int = 3
    max_cost_usd: Optional[float] = None
    max_frames: Optional[int] = None
    max_iterations: Optional[int] = None
    stop_requested: bool = False  # UI can toggle
    
    # Callbacks for custom stop conditions
    custom_checks: list[Callable[["ExecutionStats"], Optional[str]]] = field(
        default_factory=list
    )


@dataclass
class ExecutionStats:
    """Current execution statistics for checking stop conditions."""
    started_at: datetime
    total_tokens: int = 0
    total_tool_calls: int = 0
    total_cost_usd: float = 0.0
    frame_count: int = 0
    iteration_count: int = 0
    retry_counts: dict[str, int] = field(default_factory=dict)
    
    def wall_clock_ms(self) -> int:
        """Calculate wall clock time in milliseconds."""
        elapsed = datetime.now() - self.started_at
        return int(elapsed.total_seconds() * 1000)
    
    def max_retry_count(self) -> int:
        """Get maximum retry count across all tasks."""
        if not self.retry_counts:
            return 0
        return max(self.retry_counts.values())


@dataclass
class StopResult:
    """Result of checking stop conditions."""
    should_stop: bool
    reason: Optional[str] = None
    condition_type: Optional[str] = None


def check_stop_conditions(
    conditions: StopConditions,
    stats: ExecutionStats
) -> StopResult:
    """
    Check if any stop condition is met.
    
    Returns StopResult with should_stop=True and reason if stopped.
    """
    # User-requested stop (highest priority)
    if conditions.stop_requested:
        return StopResult(
            should_stop=True,
            reason="Stop requested by user",
            condition_type="stop_requested"
        )
    
    # Wall clock time limit
    if conditions.max_wall_clock_ms is not None:
        elapsed = stats.wall_clock_ms()
        if elapsed >= conditions.max_wall_clock_ms:
            return StopResult(
                should_stop=True,
                reason=f"Wall clock limit reached ({elapsed}ms >= {conditions.max_wall_clock_ms}ms)",
                condition_type="wall_clock_limit"
            )
    
    # Token limit
    if conditions.max_total_tokens is not None:
        if stats.total_tokens >= conditions.max_total_tokens:
            return StopResult(
                should_stop=True,
                reason=f"Token limit reached ({stats.total_tokens} >= {conditions.max_total_tokens})",
                condition_type="token_limit"
            )
    
    # Tool call limit
    if conditions.max_tool_calls is not None:
        if stats.total_tool_calls >= conditions.max_tool_calls:
            return StopResult(
                should_stop=True,
                reason=f"Tool call limit reached ({stats.total_tool_calls} >= {conditions.max_tool_calls})",
                condition_type="tool_call_limit"
            )
    
    # Cost limit
    if conditions.max_cost_usd is not None:
        if stats.total_cost_usd >= conditions.max_cost_usd:
            return StopResult(
                should_stop=True,
                reason=f"Cost limit reached (${stats.total_cost_usd:.4f} >= ${conditions.max_cost_usd:.4f})",
                condition_type="cost_limit"
            )
    
    # Frame limit
    if conditions.max_frames is not None:
        if stats.frame_count >= conditions.max_frames:
            return StopResult(
                should_stop=True,
                reason=f"Frame limit reached ({stats.frame_count} >= {conditions.max_frames})",
                condition_type="frame_limit"
            )
    
    # Iteration limit (Ralph loops)
    if conditions.max_iterations is not None:
        if stats.iteration_count >= conditions.max_iterations:
            return StopResult(
                should_stop=True,
                reason=f"Iteration limit reached ({stats.iteration_count} >= {conditions.max_iterations})",
                condition_type="iteration_limit"
            )
    
    # Max retries per task
    if stats.max_retry_count() >= conditions.max_retries_per_task:
        return StopResult(
            should_stop=True,
            reason=f"Max retries exceeded ({stats.max_retry_count()} >= {conditions.max_retries_per_task})",
            condition_type="retry_limit"
        )
    
    # Custom checks
    for check in conditions.custom_checks:
        reason = check(stats)
        if reason:
            return StopResult(
                should_stop=True,
                reason=reason,
                condition_type="custom"
            )
    
    return StopResult(should_stop=False)


class FrameStormGuard:
    """
    Detect and prevent infinite loops in the render cycle.
    
    Per PRD section 8.7: Detects when the same plan+state signature
    repeats, indicating an infinite loop.
    """
    
    def __init__(
        self,
        max_frames_per_second: int = 10,
        max_frames_per_run: int = 1000,
        max_frames_per_minute: int = 200,
        signature_history_size: int = 10
    ):
        self.max_frames_per_second = max_frames_per_second
        self.max_frames_per_run = max_frames_per_run
        self.max_frames_per_minute = max_frames_per_minute
        
        self._recent_signatures: list[tuple[str, str]] = []
        self._signature_history_size = signature_history_size
        
        self._frame_times: list[datetime] = []
        self._total_frames = 0
    
    def record_frame(self, plan_hash: str, state_hash: str) -> None:
        """Record a frame for loop detection."""
        self._total_frames += 1
        self._frame_times.append(datetime.now())
        
        # Keep only recent frame times (last minute)
        cutoff = datetime.now() - timedelta(minutes=1)
        self._frame_times = [t for t in self._frame_times if t > cutoff]
        
        # Add signature
        signature = (plan_hash, state_hash)
        self._recent_signatures.append(signature)
        if len(self._recent_signatures) > self._signature_history_size:
            self._recent_signatures.pop(0)
    
    def check_loop(self, plan_hash: str, state_hash: str) -> bool:
        """
        Detect infinite loop: same plan + state repeating.
        
        Returns True if likely in an infinite loop.
        """
        signature = (plan_hash, state_hash)
        
        # Count occurrences in recent history
        count = sum(1 for s in self._recent_signatures if s == signature)
        
        # If same signature appears 3+ times, likely a loop
        return count >= 3
    
    def check_rate_limits(self) -> Optional[str]:
        """
        Check if frame rate is too high.
        
        Returns reason string if limit exceeded, None otherwise.
        """
        # Total frames per run
        if self._total_frames >= self.max_frames_per_run:
            return f"Max frames per run exceeded ({self._total_frames})"
        
        # Frames per minute
        if len(self._frame_times) >= self.max_frames_per_minute:
            return f"Max frames per minute exceeded ({len(self._frame_times)})"
        
        # Frames per second (check last second)
        one_second_ago = datetime.now() - timedelta(seconds=1)
        recent_count = sum(1 for t in self._frame_times if t > one_second_ago)
        if recent_count >= self.max_frames_per_second:
            return f"Max frames per second exceeded ({recent_count})"
        
        return None
    
    def reset(self) -> None:
        """Reset all counters."""
        self._recent_signatures.clear()
        self._frame_times.clear()
        self._total_frames = 0
