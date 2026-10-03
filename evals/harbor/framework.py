"""Select the runner before importing its incompatible agent/context classes."""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path


def selected() -> str:
    """A runner executable wins over install order; embedded callers can pin it.

    Pier installs Harbor too. Preferring whichever package imports first gives
    Harbor a Pier AgentInfo/context and breaks trial admission before execution.
    """
    configured = os.environ.get("SMITHERS_BENCH_FRAMEWORK")
    executable = Path(sys.argv[0]).name
    requested = configured if configured is not None else executable if executable in ("harbor", "pier") else None
    if requested is not None:
        if requested not in ("harbor", "pier"):
            raise ValueError("SMITHERS_BENCH_FRAMEWORK must be harbor or pier")
        if importlib.util.find_spec(requested) is None:
            raise ImportError(f"benchmark runner {requested} is not installed")
        return requested
    for name in ("harbor", "pier"):
        if importlib.util.find_spec(name) is not None:
            return name
    return "none"
