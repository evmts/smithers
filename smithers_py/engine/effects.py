"""
Effect Registry and Loop Detection.

Implements PRD sections 7.5.2 and 7.5.3:
- Track effect dependencies and determine when to run
- Detect infinite effect loops
- Manage cleanup functions
"""

import json
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Dict, List


class EffectLoopError(Exception):
    """Raised when an effect triggers too many times with the same deps."""
    pass


@dataclass
class EffectInfo:
    """Stored information about an effect."""
    effect_id: str
    previous_deps: Optional[list[Any]] = None
    cleanup: Optional[Callable[[], None]] = None
    run_count: int = 0


class EffectRegistry:
    """
    Manages effect execution and dependency tracking.
    
    Per PRD section 7.5.2:
    - Tracks previous deps for each effect by ID
    - Determines when effects should run based on dep changes
    - Manages cleanup functions
    - Enforces max runs per frame to prevent infinite loops
    """
    
    def __init__(self, max_runs_per_frame: int = 10):
        self._effects: Dict[str, EffectInfo] = {}
        self._run_count_this_frame: Dict[str, int] = {}
        self._max_runs_per_frame = max_runs_per_frame
        self._pending_cleanups: List[Callable[[], None]] = []
    
    def should_run(self, effect_id: str, current_deps: list[Any]) -> bool:
        """
        Determine if an effect should run this frame.
        
        Returns True if:
        - Effect has never run (first mount)
        - Dependencies have changed since last run
        """
        effect = self._effects.get(effect_id)
        
        if effect is None:
            # First time seeing this effect
            return True
        
        if effect.previous_deps is None:
            # Was registered but never had deps
            return True
        
        return not self._deps_equal(effect.previous_deps, current_deps)
    
    def _deps_equal(self, a: list[Any], b: list[Any]) -> bool:
        """
        Compare two dependency lists using stable JSON canonicalization.
        
        This ensures consistent comparison across frames.
        """
        try:
            return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
        except (TypeError, ValueError):
            # If serialization fails, compare directly
            return a == b
    
    def record_run(
        self, 
        effect_id: str, 
        deps: list[Any],
        cleanup: Optional[Callable[[], None]] = None
    ) -> None:
        """
        Record that an effect ran.
        
        Stores deps and optional cleanup for next comparison.
        """
        if effect_id not in self._effects:
            self._effects[effect_id] = EffectInfo(effect_id=effect_id)
        
        effect = self._effects[effect_id]
        
        # Schedule old cleanup if exists
        if effect.cleanup is not None:
            self._pending_cleanups.append(effect.cleanup)
        
        # Update effect info
        effect.previous_deps = deps
        effect.cleanup = cleanup
        effect.run_count += 1
        
        # Track runs this frame
        self._run_count_this_frame[effect_id] = (
            self._run_count_this_frame.get(effect_id, 0) + 1
        )
    
    def check_run_limit(self, effect_id: str) -> bool:
        """
        Check if effect has exceeded run limit for this frame.
        
        Returns True if effect can still run.
        """
        count = self._run_count_this_frame.get(effect_id, 0)
        return count < self._max_runs_per_frame
    
    def get_cleanup(self, effect_id: str) -> Optional[Callable[[], None]]:
        """Get the cleanup function for an effect."""
        effect = self._effects.get(effect_id)
        return effect.cleanup if effect else None
    
    def run_pending_cleanups(self) -> int:
        """
        Run all pending cleanup functions.
        
        Returns count of cleanups executed.
        """
        count = 0
        for cleanup in self._pending_cleanups:
            try:
                cleanup()
                count += 1
            except Exception:
                # Log but continue
                pass
        self._pending_cleanups.clear()
        return count
    
    def cleanup_unmounted(self, effect_ids: List[str]) -> int:
        """
        Clean up effects that are no longer in the tree.
        
        Returns count of cleanups executed.
        """
        count = 0
        for effect_id in effect_ids:
            effect = self._effects.pop(effect_id, None)
            if effect and effect.cleanup:
                try:
                    effect.cleanup()
                    count += 1
                except Exception:
                    pass
        return count
    
    def reset_frame_counts(self) -> None:
        """Reset per-frame run counts. Call at start of each frame."""
        self._run_count_this_frame.clear()


class EffectLoopDetector:
    """
    Detect infinite effect loops.
    
    Per PRD section 7.5.3:
    Watches for the same effect+deps pattern repeating too many times.
    """
    
    def __init__(self, threshold: int = 3, history_size: int = 10):
        self._history: deque[tuple[str, str]] = deque(maxlen=history_size)
        self._threshold = threshold
    
    def check(self, effect_id: str, deps: list[Any]) -> None:
        """
        Check if likely in an infinite loop.
        
        Raises EffectLoopError if pattern repeats >= threshold times.
        """
        try:
            deps_json = json.dumps(deps, sort_keys=True)
        except (TypeError, ValueError):
            deps_json = str(deps)
        
        signature = (effect_id, deps_json)
        
        # Count occurrences
        count = sum(1 for s in self._history if s == signature)
        
        # Add to history
        self._history.append(signature)
        
        if count >= self._threshold:
            raise EffectLoopError(
                f"Effect '{effect_id}' triggered {count + 1} times with same deps. "
                "Possible infinite loop."
            )
    
    def reset(self) -> None:
        """Reset history. Call between executions."""
        self._history.clear()


def run_effects_strict_mode(
    effect_run: Callable[[], None],
    effect_cleanup: Optional[Callable[[], None]] = None
) -> None:
    """
    Run effect in strict mode - double invokes to catch non-idempotent code.
    
    Per PRD section 7.5.4:
    Optional dev/test mode that calls setup twice to catch bugs.
    """
    # First run
    effect_run()
    
    # Run cleanup if provided
    if effect_cleanup:
        effect_cleanup()
    
    # Second run
    effect_run()
